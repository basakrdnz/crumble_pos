// Restores the local database from the cloud on a new install (plan §4: pull
// only for a new install or a restore). Rows are written directly, without
// outbox entries, in an order that satisfies the foreign keys and the
// immutability triggers: tabs go in as open, their lines and money after, and
// only then do they get their final (paid/void) state.
import type { Context, SyncedTable } from '../db/database';
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
    ctx.db.prepare(`insert into ${table} (${cols.join(', ')}) values (${cols.map((c) => `@${c}`).join(', ')})`).run(data);
  }
}

export function isLocalEmpty(ctx: Context): boolean {
  for (const table of ['categories', 'products', 'shifts', 'tabs', 'floor_plans']) {
    if (ctx.db.prepare(`select 1 from ${table} limit 1`).get()) return false;
  }
  return true;
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
