// Brings the phone's menu changes into the POS (telefondan menü, 2026-10-30).
// Products are the one table that flows both ways: a product row from the
// cloud replaces the local one only if it is newer (last writer wins on
// updated_at); an older local change still waiting in the outbox is then
// ignored by the cloud as well (products_last_writer_wins trigger). Pulled
// rows are written without outbox entries: the cloud already has them.
import type { Context } from '../db/database';
import type { CatalogPuller } from './transport';

const PRODUCTS_CURSOR = 'pull_products_since';
const CHANGES_CURSOR = 'pull_changes_since';
const EPOCH = '1970-01-01T00:00:00.000Z';

const PRODUCT_COLUMNS = [
  'id', 'category_id', 'name', 'description', 'price', 'is_active', 'needs_price_check', 'sort_order',
  'created_at', 'updated_at', 'deleted_at',
] as const;
const CHANGE_COLUMNS = [
  'id', 'entity_type', 'entity_id', 'action', 'field', 'old_value', 'new_value', 'changed_at', 'source', 'created_at', 'updated_at',
] as const;

function iso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toISOString();
  return value;
}

function pick(row: Record<string, unknown>, columns: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of columns) {
    const v = row[c] ?? null;
    out[c] = typeof v === 'boolean' ? (v ? 1 : 0) : c.endsWith('_at') ? iso(v) : v;
  }
  return out;
}

function cursor(ctx: Context, key: string): string {
  return (ctx.db.prepare('select value from settings where key = ?').pluck().get(key) as string | undefined) ?? EPOCH;
}

function setCursor(ctx: Context, key: string, value: string): void {
  ctx.db
    .prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value')
    .run(key, value);
}

let skipped = false;

export interface PullResult {
  /** Local products inserted or replaced. */
  products: number;
  changes: number;
}

/** Applies pulled product rows; returns how many changed the local catalog. */
export function applyPulledProducts(ctx: Context, rows: readonly Record<string, unknown>[]): number {
  let applied = 0;
  skipped = false;
  const local = ctx.db.prepare('select updated_at from products where id = ?').pluck();
  const hasCategory = ctx.db.prepare('select 1 from categories where id = ?').pluck();
  const insert = ctx.db.prepare(
    `insert into products (${PRODUCT_COLUMNS.join(', ')}) values (${PRODUCT_COLUMNS.map((c) => `@${c}`).join(', ')})`,
  );
  const update = ctx.db.prepare(
    `update products set ${PRODUCT_COLUMNS.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')} where id = @id`,
  );
  ctx.db.transaction(() => {
    for (const raw of rows) {
      const row = pick(raw, PRODUCT_COLUMNS);
      if (!hasCategory.get(row.category_id)) {
        skipped = true; // categories are made on the POS; try again next round
        continue;
      }
      const mine = local.get(row.id) as string | undefined;
      if (mine === undefined) insert.run(row);
      else if ((row.updated_at as string) > mine) update.run(row);
      else continue;
      applied++;
    }
  })();
  return applied;
}

export function applyPulledChanges(ctx: Context, rows: readonly Record<string, unknown>[]): number {
  const insert = ctx.db.prepare(
    `insert into catalog_changes (${CHANGE_COLUMNS.join(', ')}) values (${CHANGE_COLUMNS.map((c) => `@${c}`).join(', ')})
     on conflict (id) do nothing`,
  );
  let applied = 0;
  ctx.db.transaction(() => {
    for (const raw of rows) applied += insert.run(pick(raw, CHANGE_COLUMNS)).changes;
  })();
  return applied;
}

/** One pull round: newer products and the phone's history rows since the last round. */
export async function pullCatalog(ctx: Context, puller: CatalogPuller): Promise<PullResult> {
  const since = cursor(ctx, PRODUCTS_CURSOR);
  const products = await puller.pullProducts(since);
  const changeSince = cursor(ctx, CHANGES_CURSOR);
  const changes = await puller.pullMobileChanges(changeSince);
  const result = { products: applyPulledProducts(ctx, products), changes: applyPulledChanges(ctx, changes) };
  const latest = (rows: readonly Record<string, unknown>[], column: string, from: string) =>
    rows.reduce((max, r) => {
      const v = iso(r[column]) as string;
      return v > max ? v : max;
    }, from);
  if (!skipped) setCursor(ctx, PRODUCTS_CURSOR, latest(products, 'updated_at', since));
  setCursor(ctx, CHANGES_CURSOR, latest(changes, 'created_at', changeSince));
  return result;
}
