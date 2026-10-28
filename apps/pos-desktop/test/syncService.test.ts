import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCategory } from '../src/db/catalog';
import { pendingCount, pruneSent, pushPending } from '../src/sync/engine';
import { SyncService, type SyncStatus } from '../src/sync/service';
import { SyncError, type SyncTransport } from '../src/sync/transport';
import { testContext } from './helpers';

function fakeTransport() {
  const pushed: { table: string; ids: string[]; mode: string }[] = [];
  const t = {
    online: true,
    refuse: false,
    pushed,
    heartbeats: 0,
    async push(table: string, rows: Record<string, unknown>[], mode: string) {
      if (!t.online) throw new SyncError('fetch failed', true);
      if (t.refuse) throw new SyncError('new row violates row-level security policy', false);
      pushed.push({ table, ids: rows.map((r) => r.id as string), mode });
    },
    async heartbeat() {
      if (!t.online) throw new SyncError('fetch failed', true);
      t.heartbeats++;
    },
  };
  return t as typeof t & SyncTransport;
}

describe('pushPending', () => {
  it('groups consecutive rows per table, keeps the latest state of a row, uses insert-ignore for history', async () => {
    const ctx = testContext();
    const c = createCategory(ctx, 'Kahve');
    ctx.db.prepare("update categories set name = 'x' where id = ?").run(c.id);
    // Two consecutive snapshots of the same category:
    const snap = ctx.db.prepare('select * from categories where id = ?').get(c.id);
    ctx.db.prepare('insert into outbox (table_name, row_id, payload, created_at) values (?, ?, ?, ?)').run('categories', c.id, JSON.stringify(snap), 'x');
    ctx.db.prepare('insert into outbox (table_name, row_id, payload, created_at) values (?, ?, ?, ?)').run('categories', c.id, JSON.stringify({ ...(snap as object), name: 'son' }), 'x');
    const t = fakeTransport();
    const result = await pushPending(ctx, t);
    expect(result).toMatchObject({ sent: 4, pending: 0, error: null });
    expect(t.pushed.map((p) => [p.table, p.ids.length, p.mode])).toEqual([
      ['categories', 1, 'upsert'],
      ['catalog_changes', 1, 'insert-ignore'],
      ['categories', 1, 'upsert'],
    ]);
  });

  it('records the error on the first unsent row and stops', async () => {
    const ctx = testContext();
    createCategory(ctx, 'Kahve');
    const t = fakeTransport();
    t.refuse = true;
    const result = await pushPending(ctx, t);
    expect(result.error?.offline).toBe(false);
    expect(result.pending).toBe(2);
    expect(ctx.db.prepare('select attempts, last_error from outbox order by seq limit 1').get()).toEqual({
      attempts: 1,
      last_error: 'new row violates row-level security policy',
    });
  });

  it('prunes rows sent long ago', async () => {
    const ctx = testContext('2026-11-01T08:00:00.000Z');
    createCategory(ctx, 'Kahve');
    await pushPending(ctx, fakeTransport());
    ctx.db.exec("update outbox set sent_at = '2026-10-01T00:00:00.000Z'");
    expect(pruneSent(ctx)).toBe(2);
  });
});

describe('SyncService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pushes after a nudge, backs off while offline and recovers', async () => {
    const ctx = testContext();
    const statuses: SyncStatus[] = [];
    const service = new SyncService(ctx, (s) => statuses.push(s));
    expect(service.getStatus().state).toBe('disabled');

    const t = fakeTransport();
    t.online = false;
    service.setTransport(t);
    await vi.advanceTimersByTimeAsync(0);
    createCategory(ctx, 'Kahve');
    service.nudge();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(service.getStatus()).toMatchObject({ state: 'offline', pending: 2 });

    t.online = true;
    await vi.advanceTimersByTimeAsync(10_000); // first retry after 10 s
    expect(service.getStatus()).toMatchObject({ state: 'idle', pending: 0, lastError: null });
    expect(t.heartbeats).toBe(1);
    expect(statuses.some((s) => s.state === 'syncing')).toBe(true);
    service.stop();
  });

  it('shows a refused row as an error', async () => {
    const ctx = testContext();
    const service = new SyncService(ctx);
    const t = fakeTransport();
    t.refuse = true;
    createCategory(ctx, 'Kahve');
    service.setTransport(t);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getStatus()).toMatchObject({ state: 'error', pending: 2 });
    expect(service.getStatus().lastError).toMatch(/row-level security/);
    service.stop();
  });

  it('syncNow ignores the back-off', async () => {
    const ctx = testContext();
    const service = new SyncService(ctx);
    const t = fakeTransport();
    t.online = false;
    createCategory(ctx, 'Kahve');
    service.setTransport(t);
    await vi.advanceTimersByTimeAsync(0);
    t.online = true;
    expect((await service.syncNow()).state).toBe('idle');
    expect(pendingCount(ctx)).toBe(0);
    service.stop();
  });
});
