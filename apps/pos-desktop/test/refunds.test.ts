import { describe, expect, it } from 'vitest';
import { createCategory, createProduct } from '../src/db/catalog';
import type { Context } from '../src/db/database';
import { getRefundInfo, listSales, refundAll, refundPart } from '../src/db/refunds';
import {
  addProduct,
  closeShift,
  getShiftSummary,
  getTab,
  openShift,
  openTab,
  pay,
  setTabDiscount,
  voidTab,
} from '../src/db/sales';
import { testContext } from './helpers';

function sale(ctx: Context) {
  const kahve = createCategory(ctx, 'Kahve');
  const latte = createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 21500 });
  const tost = createProduct(ctx, { category_id: kahve.id, name: 'Tost', price: 25000 });
  const shift = openShift(ctx, 50000);
  const tab = openTab(ctx, { kind: 'quick' });
  const l = addProduct(ctx, tab.id, latte.id);
  const t = addProduct(ctx, tab.id, tost.id);
  return { shift, tab, latteItem: l, tostItem: t, latte };
}

describe('refunds (iade)', () => {
  it('refunds a whole sale per payment method without changing the sale', () => {
    const ctx = testContext();
    const { shift, tab } = sale(ctx);
    pay(ctx, tab.id, [
      { method: 'cash', amount: 16500 },
      { method: 'card', amount: 30000 },
    ]);
    const rows = refundAll(ctx, tab.id, 'müşteri vazgeçti');
    expect(rows.map((r) => [r.method, r.amount, r.reason])).toEqual([
      ['cash', 16500, 'müşteri vazgeçti'],
      ['card', 30000, 'müşteri vazgeçti'],
    ]);
    // The sale itself is untouched.
    expect(getTab(ctx, tab.id).tab).toMatchObject({ status: 'paid', total: 46500 });
    expect(() => refundAll(ctx, tab.id)).toThrow(/ödeme yok/);

    const summary = getShiftSummary(ctx, shift.id);
    expect(summary).toMatchObject({ cashRefunds: 16500, cardRefunds: 30000, expectedCash: 50000 });
  });

  it('refunds one line by the method it was paid with', () => {
    const ctx = testContext();
    const { tab, tostItem } = sale(ctx);
    pay(ctx, tab.id, [{ method: 'cash', amount: 46500 }]);
    const info = getRefundInfo(ctx, tab.id);
    expect(info.items.map((i) => [i.name, i.refundable])).toEqual([
      ['Latte', 21500],
      ['Tost', 25000],
    ]);
    expect(() => refundPart(ctx, tab.id, { amount: 25000, method: 'card', itemId: tostItem.id })).toThrow(/kart/);
    expect(() => refundPart(ctx, tab.id, { amount: 25001, method: 'cash', itemId: tostItem.id })).toThrow(/fazla/);
    refundPart(ctx, tab.id, { amount: 25000, method: 'cash', itemId: tostItem.id, reason: 'soğuk geldi' });
    const after = getRefundInfo(ctx, tab.id);
    expect(after.items.find((i) => i.name === 'Tost')!.refundable).toBe(0);
    expect(after.totalRefundable).toBe(21500);
  });

  it('suggests a line refund net of the cart discount share', () => {
    const ctx = testContext();
    const { tab } = sale(ctx);
    setTabDiscount(ctx, tab.id, 10);
    // 46500 - 4650 = 41850
    pay(ctx, tab.id, [{ method: 'card', amount: 41850 }]);
    expect(getRefundInfo(ctx, tab.id).items.map((i) => i.net)).toEqual([21500 - 2150, 25000 - 2500]);
  });

  it('puts the refund in the shift it is given in', () => {
    const ctx = testContext();
    const { shift, tab } = sale(ctx);
    pay(ctx, tab.id, [{ method: 'cash', amount: 46500 }]);
    closeShift(ctx, 96500);
    expect(() => refundAll(ctx, tab.id)).toThrow(/vardiya/);
    const next = openShift(ctx, 96500);
    refundPart(ctx, tab.id, { amount: 10000, method: 'cash' });
    expect(getShiftSummary(ctx, shift.id).cashRefunds).toBe(0);
    expect(getShiftSummary(ctx, next.id)).toMatchObject({ cashRefunds: 10000, expectedCash: 86500 });
  });

  it('a tab with a partial payment is voided only after the money is refunded', () => {
    const ctx = testContext();
    const { tab } = sale(ctx);
    pay(ctx, tab.id, [{ method: 'cash', amount: 10000 }]);
    expect(() => voidTab(ctx, tab.id)).toThrow(/iade/);
    refundAll(ctx, tab.id);
    expect(voidTab(ctx, tab.id).status).toBe('void');
  });

  it('lists the sales of a shift with payments and refunds', () => {
    const ctx = testContext();
    const { shift, tab, latte } = sale(ctx);
    pay(ctx, tab.id, [{ method: 'card', amount: 46500 }]);
    refundPart(ctx, tab.id, { amount: 5000, method: 'card' });
    const cancelled = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, cancelled.id, latte.id);
    voidTab(ctx, cancelled.id);
    expect(listSales(ctx, shift.id).map((s) => [s.label, s.status, s.total, s.card, s.refunded])).toEqual([
      ['Hızlı satış', 'void', 21500, 0, 0],
      ['Hızlı satış', 'paid', 46500, 46500, 5000],
    ]);
  });
});

describe('refundAndVoid', () => {
  it('refunds what was taken and voids the tab in one step', async () => {
    const { refundAndVoid } = await import('../src/db/refunds');
    const ctx = testContext();
    const { shift, tab } = sale(ctx);
    pay(ctx, tab.id, [{ method: 'cash', amount: 10000 }]);
    refundAndVoid(ctx, tab.id, 'vazgeçti');
    expect(getTab(ctx, tab.id).tab.status).toBe('void');
    expect(getShiftSummary(ctx, shift.id)).toMatchObject({ cashSales: 10000, cashRefunds: 10000, expectedCash: 50000 });
  });
});
