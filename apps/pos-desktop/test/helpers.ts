import Database from 'better-sqlite3';
import { type Context, createContext, migrate } from '../src/db/database';

/** In-memory database with a deterministic clock (+1s per call) and ids. */
export function testContext(start = '2026-11-01T08:00:00.000Z', uuid?: () => string): Context {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  let t = Date.parse(start);
  let n = 0;
  return createContext(
    db,
    { now: () => new Date((t += 1000)).toISOString() },
    uuid ?? (() => `00000000-0000-4000-8000-${(++n).toString().padStart(12, '0')}`),
  );
}

export function outbox(ctx: Context): { table_name: string; row_id: string; payload: Record<string, unknown> }[] {
  return (ctx.db.prepare('select * from outbox order by seq').all() as { table_name: string; row_id: string; payload: string }[]).map(
    (r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }),
  );
}
