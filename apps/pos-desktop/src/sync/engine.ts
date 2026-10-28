// Pushes the outbox to the cloud in seq order (plan §4: one-way, idempotent).
// Consecutive rows of the same table go in one request; if the same row was
// written several times in a row only its latest state is sent. On the first
// failure everything after it waits, so the cloud never sees writes out of
// order.
import type { Context, SyncedTable } from '../db/database';
import { pushMode, SyncError, type SyncTransport } from './transport';

interface OutboxRow {
  seq: number;
  table_name: SyncedTable;
  row_id: string;
  payload: string;
}

export interface PushResult {
  sent: number;
  pending: number;
  error: SyncError | null;
}

export function pendingCount(ctx: Context): number {
  return ctx.db.prepare('select count(*) as n from outbox where sent_at is null').pluck().get() as number;
}

function groups(rows: OutboxRow[]): OutboxRow[][] {
  const out: OutboxRow[][] = [];
  for (const row of rows) {
    const last = out.at(-1);
    if (last && last[0]!.table_name === row.table_name) last.push(row);
    else out.push([row]);
  }
  return out;
}

/** Latest payload per row id, in first-seen order. */
function latestPayloads(group: OutboxRow[]): Record<string, unknown>[] {
  const byId = new Map<string, string>();
  for (const row of group) byId.set(row.row_id, row.payload);
  return [...byId.values()].map((p) => JSON.parse(p) as Record<string, unknown>);
}

export async function pushPending(ctx: Context, transport: SyncTransport, limit = 500): Promise<PushResult> {
  let sent = 0;
  for (;;) {
    const rows = ctx.db
      .prepare('select seq, table_name, row_id, payload from outbox where sent_at is null order by seq limit ?')
      .all(limit) as OutboxRow[];
    if (rows.length === 0) break;
    for (const group of groups(rows)) {
      const table = group[0]!.table_name;
      try {
        await transport.push(table, latestPayloads(group), pushMode(table));
      } catch (e) {
        const error = e instanceof SyncError ? e : new SyncError(e instanceof Error ? e.message : String(e), true);
        ctx.db
          .prepare('update outbox set attempts = attempts + 1, last_error = ? where seq = ?')
          .run(error.message, group[0]!.seq);
        return { sent, pending: pendingCount(ctx), error };
      }
      const now = ctx.clock.now();
      const mark = ctx.db.prepare('update outbox set sent_at = ?, last_error = null where seq = ?');
      ctx.db.transaction(() => group.forEach((row) => mark.run(now, row.seq)))();
      sent += group.length;
    }
  }
  return { sent, pending: 0, error: null };
}

/** Drops rows that were sent long ago; the outbox is a queue, not an archive. */
export function pruneSent(ctx: Context, olderThanDays = 14): number {
  const cutoff = new Date(Date.parse(ctx.clock.now()) - olderThanDays * 86_400_000).toISOString();
  return ctx.db.prepare('delete from outbox where sent_at is not null and sent_at < ?').run(cutoff).changes;
}
