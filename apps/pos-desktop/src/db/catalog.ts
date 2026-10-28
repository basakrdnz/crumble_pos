import type { CatalogAction, CatalogChange, CatalogEntityType, Category, Product } from '@crumble/shared';
import { type Context, fromDb, getRow, insertRow, stamps, tx, updateRow } from './database';

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function logChange(
  ctx: Context,
  entity_type: CatalogEntityType,
  entity_id: string,
  action: CatalogAction,
  field: string | null = null,
  old_value: unknown = null,
  new_value: unknown = null,
): void {
  insertRow<CatalogChange>(ctx, 'catalog_changes', {
    ...stamps(ctx),
    entity_type,
    entity_id,
    action,
    field,
    old_value: asText(old_value),
    new_value: asText(new_value),
    changed_at: ctx.clock.now(),
  });
}

/** Applies a patch to a catalog row and logs one catalog_changes row per changed field. */
export function updateWithHistory<T extends { id: string }>(
  ctx: Context,
  table: 'categories' | 'products' | 'floor_plans' | 'tables',
  entityType: CatalogEntityType,
  current: T,
  patch: Partial<T>,
  silent: Record<string, unknown> = {},
): T {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const before = (current as Record<string, unknown>)[key];
    if (before !== value) changed[key] = value;
  }
  const silentChanged = Object.fromEntries(
    Object.entries(silent).filter(([key, value]) => (current as Record<string, unknown>)[key] !== value),
  );
  if (Object.keys(changed).length === 0 && Object.keys(silentChanged).length === 0) return current;
  const updated = updateRow<T>(ctx, table, current.id, { ...changed, ...silentChanged });
  for (const [field, value] of Object.entries(changed)) {
    logChange(ctx, entityType, current.id, 'update', field, (current as Record<string, unknown>)[field], value);
  }
  return updated;
}

function requireRow<T>(ctx: Context, table: 'categories' | 'products', id: string): T {
  const row = getRow<T & { deleted_at: string | null }>(ctx, table, id);
  if (!row || row.deleted_at) throw new Error('Kayıt bulunamadı.');
  return row;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Ad boş olamaz.');
  return trimmed;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function listCategories(ctx: Context): Category[] {
  return ctx.db
    .prepare('select * from categories where deleted_at is null order by sort_order, name')
    .all() as Category[];
}

function nextSortOrder(ctx: Context, sql: string, ...params: unknown[]): number {
  const row = ctx.db.prepare(sql).get(...params) as { max: number | null };
  return (row.max ?? -10) + 10;
}

export function createCategory(ctx: Context, name: string): Category {
  return tx(ctx, () => {
    const category = insertRow<Category>(ctx, 'categories', {
      ...stamps(ctx),
      name: cleanName(name),
      sort_order: nextSortOrder(ctx, 'select max(sort_order) as max from categories where deleted_at is null'),
      deleted_at: null,
    });
    logChange(ctx, 'category', category.id, 'create', null, null, category.name);
    return category;
  });
}

export function renameCategory(ctx: Context, id: string, name: string): Category {
  return tx(ctx, () => {
    const current = requireRow<Category>(ctx, 'categories', id);
    return updateWithHistory(ctx, 'categories', 'category', current, { name: cleanName(name) });
  });
}

export function reorderCategories(ctx: Context, orderedIds: readonly string[]): void {
  tx(ctx, () => {
    orderedIds.forEach((id, index) => {
      const current = requireRow<Category>(ctx, 'categories', id);
      updateWithHistory(ctx, 'categories', 'category', current, { sort_order: index * 10 });
    });
  });
}

export function deleteCategory(ctx: Context, id: string): void {
  tx(ctx, () => {
    const current = requireRow<Category>(ctx, 'categories', id);
    const products = ctx.db
      .prepare('select count(*) as n from products where category_id = ? and deleted_at is null')
      .get(id) as { n: number };
    if (products.n > 0) {
      throw new Error('Kategoride ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.');
    }
    updateRow<Category>(ctx, 'categories', id, { deleted_at: ctx.clock.now() });
    logChange(ctx, 'category', id, 'delete', null, current.name, null);
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function listProducts(ctx: Context): Product[] {
  return ctx.db
    .prepare(
      `select p.* from products p join categories c on c.id = p.category_id
       where p.deleted_at is null and c.deleted_at is null
       order by c.sort_order, p.sort_order, p.name`,
    )
    .all()
    .map((row) => fromDb<Product>('products', row));
}

export interface NewProduct {
  category_id: string;
  name: string;
  price: number;
  description?: string | null;
  is_active?: boolean;
  needs_price_check?: boolean;
}

function checkPrice(price: number): number {
  if (!Number.isSafeInteger(price) || price < 0) throw new Error('Fiyat geçersiz.');
  return price;
}

export function createProduct(ctx: Context, input: NewProduct): Product {
  return tx(ctx, () => {
    requireRow<Category>(ctx, 'categories', input.category_id);
    const product = insertRow<Product>(ctx, 'products', {
      ...stamps(ctx),
      category_id: input.category_id,
      name: cleanName(input.name),
      description: input.description?.trim() || null,
      price: checkPrice(input.price),
      is_active: input.is_active ?? true,
      needs_price_check: input.needs_price_check ?? false,
      sort_order: nextSortOrder(
        ctx,
        'select max(sort_order) as max from products where category_id = ? and deleted_at is null',
        input.category_id,
      ),
      deleted_at: null,
    });
    logChange(ctx, 'product', product.id, 'create', null, null, product.name);
    return product;
  });
}

export interface ProductPatch {
  name?: string;
  category_id?: string;
  price?: number;
  description?: string | null;
  is_active?: boolean;
}

/**
 * Updates a product and logs each changed field. Saving a price (even the same
 * value) confirms it and clears the "teyit edilecek" badge; a product that was
 * imported without a price (inactive, 0) becomes active once it gets one.
 */
export function updateProduct(ctx: Context, id: string, patch: ProductPatch): Product {
  return tx(ctx, () => {
    const current = requireRow<Product>(ctx, 'products', id);
    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = cleanName(patch.name);
    if (patch.description !== undefined) changes.description = patch.description?.trim() || null;
    if (patch.is_active !== undefined) changes.is_active = patch.is_active;
    if (patch.category_id !== undefined) {
      requireRow<Category>(ctx, 'categories', patch.category_id);
      changes.category_id = patch.category_id;
    }
    if (patch.price !== undefined) {
      changes.price = checkPrice(patch.price);
      if (current.price === 0 && changes.price > 0 && !current.is_active && patch.is_active === undefined) {
        changes.is_active = true;
      }
    }
    // The badge is not catalog content, so clearing it is not logged as a change.
    const silent = patch.price !== undefined ? { needs_price_check: false } : {};
    return updateWithHistory(ctx, 'products', 'product', current, changes, silent);
  });
}

export function reorderProducts(ctx: Context, orderedIds: readonly string[]): void {
  tx(ctx, () => {
    orderedIds.forEach((id, index) => {
      const current = requireRow<Product>(ctx, 'products', id);
      updateWithHistory(ctx, 'products', 'product', current, { sort_order: index * 10 });
    });
  });
}

export function deleteProduct(ctx: Context, id: string): void {
  tx(ctx, () => {
    const current = requireRow<Product>(ctx, 'products', id);
    updateRow<Product>(ctx, 'products', id, { deleted_at: ctx.clock.now() });
    logChange(ctx, 'product', id, 'delete', null, current.name, null);
  });
}

export function listCatalogChanges(ctx: Context, limit = 200): CatalogChange[] {
  return ctx.db
    .prepare('select * from catalog_changes order by changed_at desc, created_at desc limit ?')
    .all(limit) as CatalogChange[];
}
