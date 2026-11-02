import Database from 'better-sqlite3';
import { type Context, createContext, migrate } from '../src/db/database';

/** In-memory database with a deterministic clock (+1s per call) and ids. */
export function testContext(start = '2026-11-01T08:00:00.000Z', uuid?: () => string): Context {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  let t = Date.parse(start);
  let n = 0;
  const clock = {
    now: () => new Date((t += 1000)).toISOString(),
    /** Moves the clock forward (tests that need another day). */
    advance: (ms: number) => void (t += ms),
  };
  return createContext(db, clock, uuid ?? (() => `00000000-0000-4000-8000-${(++n).toString().padStart(12, '0')}`));
}

/** One shift per day (2026-11-02): jump to the next day before opening another. */
export function nextDay(ctx: Context): void {
  (ctx.clock as unknown as { advance(ms: number): void }).advance(24 * 3600 * 1000);
}

export function outbox(ctx: Context): { table_name: string; row_id: string; payload: Record<string, unknown> }[] {
  return (ctx.db.prepare('select * from outbox order by seq').all() as { table_name: string; row_id: string; payload: string }[]).map(
    (r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }),
  );
}
