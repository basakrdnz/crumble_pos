import { describe, expect, it } from 'vitest';
import { createCategory, createProduct, listCatalogChanges } from '../src/db/catalog';
import type { Context } from '../src/db/database';
import {
  createFloorPlan,
  createTable,
  deleteFloorPlan,
  deleteTable,
  getFloorBackground,
  listTables,
  setFloorBackground,
  updateTable,
} from '../src/db/floor';
import {
  addProduct,
  closeShift,
  getShiftSummary,
  getTab,
  listOpenTabSummaries,
  moveTab,
  openShift,
  openTab,
  pay,
  setCustomerName,
} from '../src/db/sales';
import { testContext } from './helpers';

function setup(ctx: Context) {
  const kahve = createCategory(ctx, 'Kahve');
  const latte = createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 21500 });
  const cay = createProduct(ctx, { category_id: kahve.id, name: 'Çay', price: 6500 });
  const ic = createFloorPlan(ctx, 'İç mekan');
  const dis = createFloorPlan(ctx, 'Dış mekan');
  const t1 = createTable(ctx, ic.id, 'square');
  const t2 = createTable(ctx, ic.id, 'circle');
  const kanepe = createTable(ctx, dis.id, 'rounded_rectangle');
  return { latte, cay, ic, dis, t1, t2, kanepe };
}

describe('floor plan', () => {
  it('creates sections and shapes with labels and defaults', () => {
    const ctx = testContext();
    const { ic, t1, t2, kanepe } = setup(ctx);
    expect([t1.label, t2.label, kanepe.label]).toEqual(['1', '2', 'Kanepe 3']);
    expect(t2).toMatchObject({ shape: 'circle', width: 80, height: 80, rotation: 0 });
    // New shapes do not land on top of each other.
    expect([t1.x, t1.y]).toEqual([40, 40]);
    expect(t2.x).toBeGreaterThanOrEqual(t1.x + t1.width + 30);
    expect(listTables(ctx, ic.id)).toHaveLength(2);
    expect(listTables(ctx)).toHaveLength(3);
  });

  it('moves, resizes, rotates and recolours a shape and logs it', () => {
    const ctx = testContext();
    const { t1 } = setup(ctx);
    const moved = updateTable(ctx, t1.id, { x: 100.04, y: 50, rotation: 370, color: '#aabbcc', label: '5' });
    expect(moved).toMatchObject({ x: 100, y: 50, rotation: 10, color: '#aabbcc', label: '5' });
    expect(() => updateTable(ctx, t1.id, { color: 'red' })).toThrow();
    const fields = listCatalogChanges(ctx)
      .filter((c) => c.entity_id === t1.id && c.action === 'update')
      .map((c) => c.field)
      .sort();
    expect(fields).toEqual(['color', 'label', 'rotation', 'x', 'y']);
  });

  it('keeps a guide image locally only', () => {
    const ctx = testContext();
    const { ic } = setup(ctx);
    setFloorBackground(ctx, ic.id, 'data:image/png;base64,AAAA');
    expect(getFloorBackground(ctx, ic.id)).toBe('data:image/png;base64,AAAA');
    expect(() => setFloorBackground(ctx, ic.id, 'http://x/y.png')).toThrow();
    setFloorBackground(ctx, ic.id, null);
    expect(getFloorBackground(ctx, ic.id)).toBeNull();
  });

  it('does not delete a table or section with an open tab', () => {
    const ctx = testContext();
    const { ic, t1, t2, latte } = setup(ctx);
    openShift(ctx, 0);
    const tab = openTab(ctx, { kind: 'table', table_id: t1.id });
    addProduct(ctx, tab.id, latte.id);
    expect(() => deleteTable(ctx, t1.id)).toThrow(/açık hesap/);
    expect(() => deleteFloorPlan(ctx, ic.id)).toThrow(/açık hesab/);
    deleteTable(ctx, t2.id);
    expect(listTables(ctx, ic.id).map((t) => t.label)).toEqual(['1']);
  });
});

describe('tabs (hesap)', () => {
  it('opens one tab per table and requires a name for named tabs', () => {
    const ctx = testContext();
    const { t1 } = setup(ctx);
    openShift(ctx, 0);
    openTab(ctx, { kind: 'table', table_id: t1.id });
    expect(() => openTab(ctx, { kind: 'table', table_id: t1.id })).toThrow(/zaten açık/);
    expect(() => openTab(ctx, { kind: 'named', customer_name: '  ' })).toThrow(/İsim/);
    expect(openTab(ctx, { kind: 'named', customer_name: ' Ali Veli ' }).customer_name).toBe('Ali Veli');
  });

  it('moves a tab to a free table and attaches a name', () => {
    const ctx = testContext();
    const { t1, t2, kanepe, latte } = setup(ctx);
    openShift(ctx, 0);
    const a = openTab(ctx, { kind: 'table', table_id: t1.id });
    addProduct(ctx, a.id, latte.id);
    openTab(ctx, { kind: 'table', table_id: t2.id });
    expect(() => moveTab(ctx, a.id, t2.id)).toThrow(/zaten açık/);
    expect(moveTab(ctx, a.id, kanepe.id).table_id).toBe(kanepe.id);
    expect(setCustomerName(ctx, a.id, 'Zeynep').customer_name).toBe('Zeynep');
    expect(setCustomerName(ctx, a.id, null).customer_name).toBeNull();

    const named = openTab(ctx, { kind: 'named', customer_name: 'Can' });
    expect(() => setCustomerName(ctx, named.id, '')).toThrow();
    expect(moveTab(ctx, named.id, t1.id)).toMatchObject({ kind: 'named', table_id: t1.id });
  });

  // Faz 3 kabul: masaya tıkla hesap aç, ürün ekle, kısmi ödeme al, kapat.
  it('table tab: add products, partial payments, close', () => {
    const ctx = testContext();
    const { t1, latte, cay } = setup(ctx);
    openShift(ctx, 10000);
    const tab = openTab(ctx, { kind: 'table', table_id: t1.id });
    addProduct(ctx, tab.id, latte.id);
    addProduct(ctx, tab.id, latte.id);
    addProduct(ctx, tab.id, cay.id);

    const first = pay(ctx, tab.id, [{ method: 'cash', amount: 20000 }]);
    expect(first.closed).toBe(false);
    expect(first.detail.remaining).toBe(29500);
    expect(listOpenTabSummaries(ctx)).toMatchObject([{ tableLabel: '1', total: 49500, remaining: 29500 }]);

    // More can be ordered after a partial payment.
    addProduct(ctx, tab.id, cay.id);
    const second = pay(ctx, tab.id, [{ method: 'card', amount: 16000 }]);
    expect(second.closed).toBe(false);
    const last = pay(ctx, tab.id, [
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 10000 },
    ]);
    expect(last.closed).toBe(true);
    expect(getTab(ctx, tab.id).tab).toMatchObject({ status: 'paid', total: 56000 });
    expect(listOpenTabSummaries(ctx)).toEqual([]);

    const summary = getShiftSummary(ctx, tab.opened_shift_id);
    expect(summary).toMatchObject({ cashSales: 30000, cardSales: 26000, salesCount: 1, expectedCash: 40000 });
  });

  it('payments of a carried-over tab count in the shift they are taken in', () => {
    const ctx = testContext();
    const { t1, latte } = setup(ctx);
    const s1 = openShift(ctx, 0);
    const tab = openTab(ctx, { kind: 'table', table_id: t1.id });
    addProduct(ctx, tab.id, latte.id);
    pay(ctx, tab.id, [{ method: 'cash', amount: 1500 }]);
    closeShift(ctx, 1500);
    const s2 = openShift(ctx, 0);
    pay(ctx, tab.id, [{ method: 'cash', amount: 20000 }]);
    expect(getShiftSummary(ctx, s1.id)).toMatchObject({ cashSales: 1500, salesCount: 0 });
    expect(getShiftSummary(ctx, s2.id)).toMatchObject({ cashSales: 20000, salesCount: 1, salesTotal: 21500 });
  });
});
