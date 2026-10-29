import { describe, expect, it } from 'vitest';
import { changePassword, checkPassword, isPasswordSet, setInitialPassword } from '../src/db/auth';
import { createCategory, createProduct } from '../src/db/catalog';
import type { Context } from '../src/db/database';
import { onSaleCompleted } from '../src/db/events';
import {
  addProduct,
  closeShift,
  getOpenQuickTab,
  getOpenShift,
  getShiftSummary,
  getTab,
  listOpenTabs,
  openShift,
  openTab,
  pay,
  setTabDiscount,
  updateItem,
  voidItem,
  voidTab,
} from '../src/db/sales';
import { outbox, testContext } from './helpers';

function menu(ctx: Context) {
  const kahve = createCategory(ctx, 'Kahve');
  const yemek = createCategory(ctx, 'Yemek');
  return {
    latte: createProduct(ctx, { category_id: kahve.id, name: 'Cafe Latte', price: 21500 }),
    americano: createProduct(ctx, { category_id: kahve.id, name: 'Americano', price: 21500 }),
    cay: createProduct(ctx, { category_id: kahve.id, name: 'Bardak Çay', price: 6500 }),
    tost: createProduct(ctx, { category_id: yemek.id, name: 'Kaşarlı Tost', price: 25000 }),
    pasif: createProduct(ctx, { category_id: yemek.id, name: 'Çıtır', price: 0, is_active: false }),
  };
}

describe('shifts', () => {
  it('opens one shift at a time and refuses sales without one', () => {
    const ctx = testContext();
    expect(() => openTab(ctx, { kind: 'quick' })).toThrow(/Açık vardiya yok/);
    openShift(ctx);
    expect(() => openShift(ctx)).toThrow(/Zaten açık/);
    // No cash count (2026-10-29): the opening cash is always 0.
    expect(getOpenShift(ctx)?.opening_cash).toBe(0);
  });
});

describe('quick sale', () => {
  it('adds products, raises quantity on repeat clicks and pays in cash', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, tab.id, m.latte.id);
    addProduct(ctx, tab.id, m.latte.id);
    addProduct(ctx, tab.id, m.cay.id);
    const detail = getTab(ctx, tab.id);
    expect(detail.items.map((i) => [i.name_snapshot, i.quantity])).toEqual([
      ['Cafe Latte', 2],
      ['Bardak Çay', 1],
    ]);
    expect(detail.totals.total).toBe(49500);

    const completed: string[] = [];
    const off = onSaleCompleted((e) => completed.push(e.tabId));
    const result = pay(ctx, tab.id, [{ method: 'cash', amount: 49500 }]);
    off();
    expect(result.closed).toBe(true);
    expect(result.detail.tab).toMatchObject({ status: 'paid', total: 49500 });
    expect(completed).toEqual([tab.id]);
    expect(getOpenQuickTab(ctx)).toBeNull();
  });

  it('starts a new line once the existing one was changed', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    const first = addProduct(ctx, tab.id, m.latte.id);
    updateItem(ctx, first.id, { unit_price: 20000 });
    addProduct(ctx, tab.id, m.latte.id);
    expect(getTab(ctx, tab.id).items.map((i) => [i.unit_price, i.quantity])).toEqual([
      [20000, 1],
      [21500, 1],
    ]);
  });

  it('changes a line price without touching the menu price', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    const line = addProduct(ctx, tab.id, m.tost.id);
    const changed = updateItem(ctx, line.id, { unit_price: 20000 });
    expect(changed).toMatchObject({ list_price: 25000, unit_price: 20000 });
    expect(getTab(ctx, tab.id).totals.priceChange).toBe(5000);
  });

  it('applies %10 / %15 / typed discounts on the cart (no line discount)', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    const line = addProduct(ctx, tab.id, m.latte.id);
    addProduct(ctx, tab.id, m.cay.id);
    setTabDiscount(ctx, tab.id, 15);
    // latte 21500 + çay 6500 = 28000; cart 15% = 4200
    expect(getTab(ctx, tab.id).totals).toMatchObject({ lineDiscount: 0, cartDiscount: 4200, total: 23800 });
    setTabDiscount(ctx, tab.id, 7);
    // 7% of 28000 = 1960
    expect(getTab(ctx, tab.id).totals.cartDiscount).toBe(1960);
    expect(() => setTabDiscount(ctx, tab.id, 0)).toThrow();
    expect(() => setTabDiscount(ctx, tab.id, 12.5)).toThrow();
    // The line panel cannot set a line discount or ikram any more.
    updateItem(ctx, line.id, { discount_percent: 10, is_comp: true } as never);
    expect(getTab(ctx, tab.id).items[0]).toMatchObject({ discount_percent: null, is_comp: false });
  });

  it('keeps a removed line as a void record', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    const line = addProduct(ctx, tab.id, m.tost.id);
    addProduct(ctx, tab.id, m.cay.id);
    voidItem(ctx, line.id, 'yanlış ürün');
    const detail = getTab(ctx, tab.id);
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toMatchObject({ void_reason: 'yanlış ürün' });
    expect(detail.totals).toMatchObject({ total: 6500, voided: 25000 });
    expect(() => updateItem(ctx, line.id, { quantity: 2 })).toThrow(/iptal/);
  });

  it('takes a mixed payment as two rows and rejects over- or under-payment', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, tab.id, m.tost.id);
    expect(() => pay(ctx, tab.id, [{ method: 'cash', amount: 30000 }])).toThrow(/fazla/);
    expect(() => pay(ctx, tab.id, [])).toThrow(/tutar/);
    const result = pay(ctx, tab.id, [
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 15000 },
    ]);
    expect(result.closed).toBe(true);
    expect(result.detail.payments.map((p) => [p.method, p.amount])).toEqual([
      ['cash', 10000],
      ['card', 15000],
    ]);
    expect(() => addProduct(ctx, tab.id, m.cay.id)).toThrow(/kapanmış/);
  });

  it('closes a zero-total tab without a payment', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    const line = addProduct(ctx, tab.id, m.cay.id);
    updateItem(ctx, line.id, { unit_price: 0 });
    expect(pay(ctx, tab.id, []).detail.tab).toMatchObject({ status: 'paid', total: 0 });
  });

  it('refuses an empty tab and inactive products', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    expect(() => pay(ctx, tab.id, [])).toThrow(/ürün yok/);
    expect(() => addProduct(ctx, tab.id, m.pasif.id)).toThrow(/pasif/);
  });

  it('voids a tab that never took money, not one that did', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const a = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, a.id, m.cay.id);
    expect(voidTab(ctx, a.id)).toMatchObject({ status: 'void' });

    const b = openTab(ctx, { kind: 'named', customer_name: 'Ayşe' });
    addProduct(ctx, b.id, m.tost.id);
    pay(ctx, b.id, [{ method: 'cash', amount: 10000 }]);
    expect(() => voidTab(ctx, b.id)).toThrow(/iade/);
  });

  it('does not let a discount push the tab below what was paid', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'named', customer_name: 'Ayşe' });
    addProduct(ctx, tab.id, m.tost.id);
    pay(ctx, tab.id, [{ method: 'cash', amount: 24000 }]);
    expect(() => setTabDiscount(ctx, tab.id, 10)).toThrow(/altına/);
    expect(getTab(ctx, tab.id).tab.discount_percent).toBeNull();
  });

  it('queues every sale write for sync', () => {
    const ctx = testContext();
    const m = menu(ctx);
    ctx.db.exec('delete from outbox');
    openShift(ctx);
    const tab = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, tab.id, m.cay.id);
    pay(ctx, tab.id, [{ method: 'card', amount: 6500 }]);
    expect(outbox(ctx).map((r) => r.table_name)).toEqual(['shifts', 'tabs', 'tab_items', 'payments', 'tabs']);
    expect(outbox(ctx).at(-1)!.payload).toMatchObject({ status: 'paid', total: 6500 });
  });
});

// Faz 2 kabul (2026-10-29 güncellemesi: kasa sayımı, açılış kasası, ikram ve
// satır indirimi yok): örnek bir gün simüle edilir, gün sonundaki beklenen
// nakit elle hesapla aynıdır.
describe('örnek gün (vardiya kapanışı entegrasyon testi)', () => {
  it('closes the day with the hand-calculated expected cash', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);

    // 1) 2 latte, nakit 430 ₺
    const s1 = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, s1.id, m.latte.id);
    addProduct(ctx, s1.id, m.latte.id);
    pay(ctx, s1.id, [{ method: 'cash', amount: 43000 }]);

    // 2) tost + çay, kart 315 ₺
    const s2 = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, s2.id, m.tost.id);
    addProduct(ctx, s2.id, m.cay.id);
    pay(ctx, s2.id, [{ method: 'card', amount: 31500 }]);

    // 3) americano + çay, sepete %10 (280 -> 252 ₺), nakit
    const s3 = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, s3.id, m.americano.id);
    addProduct(ctx, s3.id, m.cay.id);
    setTabDiscount(ctx, s3.id, 10);
    pay(ctx, s3.id, [{ method: 'cash', amount: 25200 }]);

    // 4) tost fiyatı 200 ₺'ye çekildi, sepete %15 -> 170 ₺, kart
    const s4 = openTab(ctx, { kind: 'quick' });
    const t = addProduct(ctx, s4.id, m.tost.id);
    updateItem(ctx, t.id, { unit_price: 20000 });
    setTabDiscount(ctx, s4.id, 15);
    pay(ctx, s4.id, [{ method: 'card', amount: 17000 }]);

    // 5) yanlış açılan satış iptal edildi
    const s5 = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, s5.id, m.latte.id);
    voidTab(ctx, s5.id);

    // 6) satırdan ürün çıkarıldı, sonra nakit
    const s6 = openTab(ctx, { kind: 'quick' });
    const wrong = addProduct(ctx, s6.id, m.tost.id);
    addProduct(ctx, s6.id, m.cay.id);
    voidItem(ctx, wrong.id);
    pay(ctx, s6.id, [{ method: 'cash', amount: 6500 }]);

    // 7) isimli hesap açık kalır, gün sonunda devredilir
    const open = openTab(ctx, { kind: 'named', customer_name: 'Mehmet' });
    addProduct(ctx, open.id, m.cay.id);

    // Elle hesap: 430 + 252 + 65 = 747 ₺ (açılış kasası yok)
    const handExpected = 43000 + 25200 + 6500;
    const summary = getShiftSummary(ctx, getOpenShift(ctx)!.id);
    expect(summary.expectedCash).toBe(handExpected);
    expect(summary).toMatchObject({
      openingCash: 0,
      cashSales: 43000 + 25200 + 6500,
      cardSales: 31500 + 17000,
      salesCount: 5,
      salesTotal: 43000 + 31500 + 25200 + 17000 + 6500,
      discountTotal: 2800 + 3000,
      compTotal: 0,
      voidTotal: 21500 + 25000,
      voidedTabCount: 1,
      priceChangeTotal: 5000,
    });

    // Gün sonu: every open tab needs a decision first.
    expect(() => closeShift(ctx)).toThrow(/karar verin: Mehmet/);
    const closed = closeShift(ctx, { carryOverTabIds: [open.id] });
    expect(closed.shift).toMatchObject({ expected_cash: handExpected, counted_cash: null, cash_difference: null });
    expect(closed.carriedOverTabs).toBe(1);

    // The open tab carries over and is paid in the next shift.
    const next = openShift(ctx);
    expect(listOpenTabs(ctx).map((tab) => tab.customer_name)).toEqual(['Mehmet']);
    pay(ctx, open.id, [{ method: 'cash', amount: 6500 }]);
    expect(getShiftSummary(ctx, next.id).cashSales).toBe(6500);
    expect(getTab(ctx, open.id).tab).toMatchObject({
      opened_shift_id: closed.shift.id,
      closed_shift_id: next.id,
    });
  });

  it('blocks the day end while a quick sale is unfinished', () => {
    const ctx = testContext();
    const m = menu(ctx);
    openShift(ctx);
    const quick = openTab(ctx, { kind: 'quick' });
    addProduct(ctx, quick.id, m.cay.id);
    expect(() => closeShift(ctx)).toThrow(/Hızlı satış/);
    voidTab(ctx, quick.id);
    expect(closeShift(ctx).shift.closed_at).not.toBeNull();
  });
});
