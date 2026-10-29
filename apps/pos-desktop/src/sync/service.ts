// Runs the outbox push in the background (main process): shortly after every
// write and on a timer, with growing back-off while offline. Never blocks a
// sale: all writes go to SQLite first (plan §3 offline-first).
import type { Context } from '../db/database';
import { pendingCount, pruneSent, pushPending } from './engine';
import { pullCatalog } from './pull';
import type { CatalogPuller, SyncTransport } from './transport';

export type SyncState = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Goes up when products changed by the phone were pulled in (screens reload the menu). */
  catalogVersion: number;
}

const MIN_DELAY = 10_000;
const MAX_DELAY = 5 * 60_000;
const NUDGE_DELAY = 1_500;
const HEARTBEAT_EVERY = 60_000;
/** Idle round: push leftovers and pull the phone's menu changes. */
const IDLE_DELAY = 20_000;

export class SyncService {
  private transport: (SyncTransport & Partial<CatalogPuller>) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private failures = 0;
  private lastHeartbeat = 0;
  private status: SyncStatus;

  constructor(
    private readonly ctx: Context,
    private readonly onStatus: (status: SyncStatus) => void = () => {},
  ) {
    this.status = { state: 'disabled', pending: pendingCount(ctx), lastSyncAt: null, lastError: null, catalogVersion: 0 };
  }

  getStatus(): SyncStatus {
    return { ...this.status, pending: pendingCount(this.ctx) };
  }

  /** Starts (or stops, with null) syncing to the given transport. */
  setTransport(transport: (SyncTransport & Partial<CatalogPuller>) | null): void {
    this.transport = transport;
    this.failures = 0;
    this.update({ state: transport ? 'idle' : 'disabled', lastError: null });
    this.schedule(transport ? 0 : null);
  }

  /** Call after a local write: pushes soon. */
  nudge(): void {
    if (!this.transport) return;
    this.update({});
    if (this.failures === 0) this.schedule(NUDGE_DELAY);
  }

  /** Push now (Şimdi senkronla), regardless of back-off. */
  async syncNow(): Promise<SyncStatus> {
    this.failures = 0;
    await this.run();
    return this.getStatus();
  }

  stop(): void {
    this.schedule(null);
    this.transport = null;
  }

  private schedule(delay: number | null): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = delay === null ? null : setTimeout(() => void this.run(), delay);
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch, pending: pendingCount(this.ctx) };
    this.onStatus(this.getStatus());
  }

  private async run(): Promise<void> {
    const transport = this.transport;
    if (!transport || this.running) return;
    this.running = true;
    this.update({ state: 'syncing' });
    try {
      const result = await pushPending(this.ctx, transport);
      if (result.error) {
        this.failures++;
        this.update({ state: result.error.offline ? 'offline' : 'error', lastError: result.error.message });
      } else {
        this.failures = 0;
        const now = this.ctx.clock.now();
        if (result.sent > 0 || Date.now() - this.lastHeartbeat > HEARTBEAT_EVERY) {
          try {
            await transport.heartbeat({ last_sync_at: now, pending: 0 });
            this.lastHeartbeat = Date.now();
          } catch {
            // The data is in; a missed heartbeat only delays "son senkron" on the phone.
          }
        }
        pruneSent(this.ctx);
        let catalogVersion = this.status.catalogVersion;
        if (transport.pullProducts && transport.pullMobileChanges) {
          try {
            const pulled = await pullCatalog(this.ctx, transport as CatalogPuller);
            if (pulled.products > 0) catalogVersion++;
          } catch {
            // Pulling is best effort; the next round tries again.
          }
        }
        this.update({ state: 'idle', lastSyncAt: now, lastError: null, catalogVersion });
      }
    } finally {
      this.running = false;
    }
    const delay = this.failures === 0 ? IDLE_DELAY : Math.min(MAX_DELAY, MIN_DELAY * 2 ** (this.failures - 1));
    if (this.transport === transport) this.schedule(delay);
  }
}
