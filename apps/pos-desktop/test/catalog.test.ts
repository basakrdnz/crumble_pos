import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCatalogChanges,
  listCategories,
  listProducts,
  renameCategory,
  reorderCategories,
  updateProduct,
} from '../src/db/catalog';
import { applyMenuImport, previewMenuImport } from '../src/db/menuImport';
import { outbox, testContext } from './helpers';

const seed = readFileSync(resolve(__dirname, '../../../crumble_menu_seed.csv'), 'utf8');

describe('categories', () => {
  it('creates, renames, reorders and soft-deletes with history', () => {
    const ctx = testContext();
    const kahve = createCategory(ctx, '  Kahve ');
    const tatli = createCategory(ctx, 'Tatlı');
    expect(kahve.name).toBe('Kahve');
    expect([kahve.sort_order, tatli.sort_order]).toEqual([0, 10]);

    renameCategory(ctx, kahve.id, 'Kahveler');
    reorderCategories(ctx, [tatli.id, kahve.id]);
    expect(listCategories(ctx).map((c) => c.name)).toEqual(['Tatlı', 'Kahveler']);

    deleteCategory(ctx, tatli.id);
    expect(listCategories(ctx).map((c) => c.name)).toEqual(['Kahveler']);
    // Still in the table: soft delete only.
    expect(ctx.db.prepare('select count(*) as n from categories').get()).toEqual({ n: 2 });

    const changes = listCatalogChanges(ctx).reverse();
    expect(changes.map((c) => [c.action, c.field, c.old_value, c.new_value])).toEqual([
      ['create', null, null, 'Kahve'],
      ['create', null, null, 'Tatlı'],
      ['update', 'name', 'Kahve', 'Kahveler'],
      ['update', 'sort_order', '10', '0'],
      ['update', 'sort_order', '0', '10'],
      ['delete', null, 'Tatlı', null],
    ]);
  });

  it('refuses to delete a category that still has products', () => {
    const ctx = testContext();
    const kahve = createCategory(ctx, 'Kahve');
    createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 21500 });
    expect(() => deleteCategory(ctx, kahve.id)).toThrow(/ürün var/);
  });

  it('rejects empty names', () => {
    const ctx = testContext();
    expect(() => createCategory(ctx, '   ')).toThrow();
  });
});

describe('products', () => {
  it('logs every changed field, old -> new', () => {
    const ctx = testContext();
    const kahve = createCategory(ctx, 'Kahve');
    const latte = createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 21500 });
    updateProduct(ctx, latte.id, { price: 22500, name: 'Cafe Latte' });
    updateProduct(ctx, latte.id, { price: 22500 }); // unchanged: no history row

    const changes = listCatalogChanges(ctx).filter((c) => c.entity_id === latte.id).reverse();
    expect(changes.map((c) => [c.action, c.field, c.old_value, c.new_value])).toEqual([
      ['create', null, null, 'Latte'],
      ['update', 'name', 'Latte', 'Cafe Latte'],
      ['update', 'price', '21500', '22500'],
    ]);
  });

  it('saving a price clears the "teyit edilecek" badge', () => {
    const ctx = testContext();
    const kap = createCategory(ctx, 'Vitrin');
    const borek = createProduct(ctx, { category_id: kap.id, name: 'Börek', price: 13000, needs_price_check: true });
    expect(updateProduct(ctx, borek.id, { price: 13000 }).needs_price_check).toBe(false);
  });

  it('activates an unpriced product once it gets a price', () => {
    const ctx = testContext();
    const kap = createCategory(ctx, 'Vitrin');
    const cookie = createProduct(ctx, { category_id: kap.id, name: 'Çıtır', price: 0, is_active: false });
    const priced = updateProduct(ctx, cookie.id, { price: 9000 });
    expect(priced.is_active).toBe(true);
    const fields = listCatalogChanges(ctx).filter((c) => c.action === 'update').map((c) => c.field);
    expect(fields.sort()).toEqual(['is_active', 'price']);
  });

  it('soft-deletes and hides deleted products', () => {
    const ctx = testContext();
    const kahve = createCategory(ctx, 'Kahve');
    const latte = createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 100 });
    deleteProduct(ctx, latte.id);
    expect(listProducts(ctx)).toEqual([]);
    expect(() => updateProduct(ctx, latte.id, { price: 1 })).toThrow();
  });

  it('rejects fractional or negative prices', () => {
    const ctx = testContext();
    const kahve = createCategory(ctx, 'Kahve');
    expect(() => createProduct(ctx, { category_id: kahve.id, name: 'X', price: 1.5 })).toThrow();
    expect(() => createProduct(ctx, { category_id: kahve.id, name: 'X', price: -1 })).toThrow();
  });
});

describe('outbox', () => {
  it('queues a full row snapshot for every write, booleans as booleans', () => {
    const ctx = testContext();
    const kahve = createCategory(ctx, 'Kahve');
    const latte = createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 100 });
    updateProduct(ctx, latte.id, { price: 200 });

    const rows = outbox(ctx);
    expect(rows.map((r) => r.table_name)).toEqual([
      'categories',
      'catalog_changes',
      'products',
      'catalog_changes',
      'products',
      'catalog_changes',
    ]);
    const last = rows.filter((r) => r.table_name === 'products').at(-1)!;
    expect(last.payload).toMatchObject({ id: latte.id, price: 200, is_active: true, needs_price_check: false });
  });

  it('does not queue anything when a write fails', () => {
    const ctx = testContext();
    expect(() => createProduct(ctx, { category_id: 'missing', name: 'X', price: 1 })).toThrow();
    expect(outbox(ctx)).toEqual([]);
  });
});

describe('menu import (Faz 1 kabul)', () => {
  it('imports the seed CSV, then a price change creates a history row', () => {
    const ctx = testContext();
    const preview = previewMenuImport(ctx, seed);
    expect(preview.errors).toEqual([]);

    expect(applyMenuImport(ctx, seed)).toEqual({ categoriesCreated: 8, productsCreated: 84, productsSkipped: 0 });
    const products = listProducts(ctx);
    expect(products).toHaveLength(84);
    expect(listCategories(ctx)).toHaveLength(8);
    expect(products.filter((p) => !p.is_active).map((p) => p.name)).toEqual([
      'Çıtır Kurabiye',
      'Vişneli Parmak Kurabiye',
    ]);
    expect(products.filter((p) => p.needs_price_check)).toHaveLength(4);
    expect(products.find((p) => p.name === 'Termos Çay')!.price).toBe(55000);
    // Order follows the CSV.
    expect(products.slice(0, 3).map((p) => p.name)).toEqual(['Espresso', 'Double Espresso', 'Americano']);

    const mocha = products.find((p) => p.name === 'Mocha')!;
    updateProduct(ctx, mocha.id, { price: 25000 });
    const history = listCatalogChanges(ctx).filter((c) => c.entity_id === mocha.id && c.action === 'update');
    expect(history).toMatchObject([{ field: 'price', old_value: '24000', new_value: '25000' }]);
  });

  it('is idempotent: a second import creates nothing', () => {
    const ctx = testContext();
    applyMenuImport(ctx, seed);
    expect(applyMenuImport(ctx, seed)).toEqual({ categoriesCreated: 0, productsCreated: 0, productsSkipped: 84 });
    expect(listProducts(ctx)).toHaveLength(84);
  });

  it('refuses a CSV with errors and writes nothing', () => {
    const ctx = testContext();
    expect(() => applyMenuImport(ctx, 'kategori,urun,fiyat_tl,durum,not\nKahve,X,abc,tamam,\n')).toThrow(/hata/);
    expect(listCategories(ctx)).toEqual([]);
    expect(outbox(ctx)).toEqual([]);
  });
});
