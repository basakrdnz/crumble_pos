// Restores the local database from the cloud on a new install (plan §4: pull
// only for a new install or a restore). Rows are written directly, without
// outbox entries, in an order that satisfies the foreign keys and the
// immutability triggers: tabs go in as open, their lines and money after, and
// only then do they get their final (paid/void) state.
import type { Context, SyncedTable } from '../db/database';
import { CRUMBLE_FLOOR_IDS } from '../floor/crumble';
import type { CloudReader } from './transport';

const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  products: ['is_active', 'needs_price_check'],
  tab_items: ['is_comp'],
};

function toLocal(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (BOOLEAN_COLUMNS[table]?.includes(key)) out[key] = value ? 1 : 0;
    else if (value instanceof Date) out[key] = value.toISOString();
    // Postgres returns "…+00:00"; locally timestamps are always toISOString().
    else if (key.endsWith('_at') && typeof value === 'string') out[key] = new Date(value).toISOString();
    else out[key] = value;
  }
  return out;
}

function insertAll(ctx: Context, table: string, rows: Record<string, unknown>[]) {
  for (const row of rows) {
    const data = toLocal(table, row);
    const cols = Object.keys(data);
    // The Crumble floor plan a new POS starts with has fixed ids: the cloud's
    // copy (possibly edited) replaces it.
    const replace = CRUMBLE_FLOOR_IDS.has(String(data.id))
      ? ` on conflict (id) do update set ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
      : '';
    ctx.db.prepare(`insert into ${table} (${cols.join(', ')}) values (${cols.map((c) => `@${c}`).join(', ')})${replace}`).run(data);
  }
}

/** Empty = a new install: nothing but (possibly) the Crumble floor plan it starts with. */
export function isLocalEmpty(ctx: Context): boolean {
  for (const table of ['categories', 'products', 'shifts', 'tabs']) {
    if (ctx.db.prepare(`select 1 from ${table} limit 1`).get()) return false;
  }
  const plans = ctx.db.prepare('select id from floor_plans').pluck().all() as string[];
  const tables = ctx.db.prepare('select id from tables').pluck().all() as string[];
  return [...plans, ...tables].every((id) => CRUMBLE_FLOOR_IDS.has(id));
}

export interface RestoreResult {
  counts: Partial<Record<SyncedTable, number>>;
}

export async function restoreFromCloud(ctx: Context, reader: CloudReader): Promise<RestoreResult> {
  if (!isLocalEmpty(ctx)) throw new Error('Geri yükleme sadece boş (yeni kurulum) bir kasada yapılabilir.');
  const order: SyncedTable[] = [
    'categories',
    'products',
    'floor_plans',
    'tables',
    'shifts',
    'tabs',
    'tab_items',
    'payments',
    'refunds',
    'catalog_changes',
  ];
  const data = new Map<SyncedTable, Record<string, unknown>[]>();
  for (const table of order) data.set(table, await reader.readAll(table));

  const counts: Partial<Record<SyncedTable, number>> = {};
  ctx.db.transaction(() => {
    // Starting floor plan rows the cloud already has need not be pushed any
    // more: the cloud's state wins. Ones it lacks stay queued.
    const known = [...data.get('floor_plans')!, ...data.get('tables')!].map((r) => String(r.id)).filter((id) => CRUMBLE_FLOOR_IDS.has(id));
    if (known.length) ctx.db.prepare(`delete from outbox where sent_at is null and row_id in (${known.map(() => '?').join(', ')})`).run(...known);
    for (const table of order) {
      const rows = data.get(table)!;
      counts[table] = rows.length;
      if (table === 'tabs') {
        insertAll(
          ctx,
          'tabs',
          rows.map((r) => ({ ...r, status: 'open', closed_at: null, closed_shift_id: null, total: null })),
        );
      } else {
        insertAll(ctx, table, rows);
      }
    }
    const finish = ctx.db.prepare(
      'update tabs set status = @status, closed_at = @closed_at, closed_shift_id = @closed_shift_id, total = @total where id = @id',
    );
    for (const tab of data.get('tabs')!) {
      if (tab.status !== 'open') finish.run(toLocal('tabs', tab));
    }
  })();
  return { counts };
}
