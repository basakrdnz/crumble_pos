import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { MIGRATIONS } from './schema';

export type Db = Database.Database;

/** Synced tables, i.e. everything that is pushed to the cloud through the outbox. */
export type SyncedTable =
  | 'categories'
  | 'products'
  | 'floor_plans'
  | 'tables'
  | 'shifts'
  | 'tabs'
  | 'tab_items'
  | 'payments'
  | 'refunds'
  | 'catalog_changes';

/** Columns stored as 0/1 in SQLite but booleans everywhere else. */
const BOOLEAN_COLUMNS: Partial<Record<SyncedTable, readonly string[]>> = {
  products: ['is_active', 'needs_price_check'],
  tab_items: ['is_comp'],
};

export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface Context {
  db: Db;
  clock: Clock;
  uuid: () => string;
}

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

export function createContext(db: Db, clock: Clock = systemClock, uuid: () => string = randomUUID): Context {
  return { db, clock, uuid };
}

/** Converts a raw SQLite row into its typed shape (0/1 -> boolean). */
export function fromDb<T>(table: SyncedTable, row: unknown): T {
  const out = { ...(row as Record<string, unknown>) };
  for (const column of BOOLEAN_COLUMNS[table] ?? []) {
    out[column] = out[column] === 1;
  }
  return out as T;
}

function toDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  return out;
}

export function getRow<T>(ctx: Context, table: SyncedTable, id: string): T | undefined {
  const row = ctx.db.prepare(`select * from ${table} where id = ?`).get(id);
  return row === undefined ? undefined : fromDb<T>(table, row);
}

function enqueue(ctx: Context, table: SyncedTable, id: string): void {
  const row = getRow<Record<string, unknown>>(ctx, table, id);
  ctx.db
    .prepare('insert into outbox (table_name, row_id, payload, created_at) values (?, ?, ?, ?)')
    .run(table, id, JSON.stringify(row), ctx.clock.now());
}

/**
 * Inserts a row and queues it for sync. Call inside a transaction together
 * with any related writes so the outbox never holds half an operation.
 */
export function insertRow<T extends { id: string }>(ctx: Context, table: SyncedTable, row: T): T {
  const data = toDb(row as unknown as Record<string, unknown>);
  const columns = Object.keys(data);
  ctx.db
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map((c) => `@${c}`).join(', ')})`,
    )
    .run(data);
  enqueue(ctx, table, row.id);
  return getRow<T>(ctx, table, row.id)!;
}

/** Updates the given columns (plus updated_at) and queues the new row state for sync. */
export function updateRow<T>(
  ctx: Context,
  table: SyncedTable,
  id: string,
  patch: Record<string, unknown>,
): T {
  const data = toDb({ ...patch, updated_at: ctx.clock.now() });
  const sets = Object.keys(data).map((c) => `${c} = @${c}`);
  const result = ctx.db.prepare(`update ${table} set ${sets.join(', ')} where id = @id`).run({ ...data, id });
  if (result.changes !== 1) {
    throw new Error(`Kayıt bulunamadı (${table} ${id}).`);
  }
  enqueue(ctx, table, id);
  return getRow<T>(ctx, table, id)!;
}

/** Runs fn in a transaction (nested calls reuse the outer one). */
export function tx<T>(ctx: Context, fn: () => T): T {
  return ctx.db.inTransaction ? fn() : ctx.db.transaction(fn)();
}

/** Fields every synced row carries. */
export function stamps(ctx: Context): { id: string; created_at: string; updated_at: string } {
  const now = ctx.clock.now();
  return { id: ctx.uuid(), created_at: now, updated_at: now };
}
