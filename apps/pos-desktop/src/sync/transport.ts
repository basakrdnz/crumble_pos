import type { SyncedTable } from '../db/database';

/**
 * insert-ignore: ON CONFLICT (id) DO NOTHING — for insert-only tables.
 * upsert: ON CONFLICT (id) DO UPDATE — the row state from the POS wins.
 */
export type PushMode = 'insert-ignore' | 'upsert';

export const INSERT_ONLY: readonly SyncedTable[] = ['payments', 'refunds', 'catalog_changes'];

export function pushMode(table: SyncedTable): PushMode {
  return INSERT_ONLY.includes(table) ? 'insert-ignore' : 'upsert';
}

export class SyncError extends Error {
  constructor(
    message: string,
    /** True when the cloud could not be reached (retry later); false when it refused the data. */
    readonly offline: boolean,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface DeviceHeartbeat {
  last_sync_at: string;
  pending: number;
}

/** Where the outbox goes. Supabase in the app, a real Postgres in tests. */
export interface SyncTransport {
  push(table: SyncedTable, rows: Record<string, unknown>[], mode: PushMode): Promise<void>;
  heartbeat(status: DeviceHeartbeat): Promise<void>;
}

/** Reads the cloud copy back (new install / restore). */
export interface CloudReader {
  readAll(table: SyncedTable): Promise<Record<string, unknown>[]>;
}
