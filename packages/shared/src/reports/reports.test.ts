import { describe, expect, it } from 'vitest';
import type { Payment, Refund, Shift, Tab, TabItem } from '../types';
import { addDays, dayBounds, daysBetween, istanbulDay, istanbulHour, monthStart, weekStart } from './dates';
import { hourlyActivity, periodTotals, productReport, revenueSeries, summarizeShift } from './reports';

describe('dates (Europe/Istanbul, UTC+3)', () => {
  it('maps UTC timestamps to Istanbul days and hours', () => {
    expect(istanbulDay('2026-11-01T20:59:59Z')).toBe('2026-11-01');
    expect(istanbulDay('2026-11-01T21:00:00Z')).toBe('2026-11-02'); // 00:00 in Istanbul
    expect(istanbulHour('2026-11-01T05:30:00Z')).toBe(8);
  });

  it('gives day bounds in UTC', () => {
    expect(dayBounds('2026-11-02')).toEqual({ start: '2026-11-01T21:00:00.000Z', end: '2026-11-02T21:00:00.000Z' });
  });

  it('does week/month/day arithmetic', () => {
    expect(weekStart('2026-11-05')).toBe('2026-11-02'); // Thursday -> Monday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday -> Monday
    expect(monthStart('2026-11-18')).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-29', '2026-12-01')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });
});

const T = '2026-11-02T06:00:00.000Z';
const base = { created_at: T, updated_at: T };
const shift = (id: string, opened_at: string, extra: Partial<Shift> = {}): Shift => ({
  ...base, id, opened_at, closed_at: null, opening_cash: 50000, counted_cash: null, expected_cash: null, cash_difference: null, notes: null, ...extra,
});
const tab = (id: string, shiftId: string, extra: Partial<Tab> = {}): Tab => ({
  ...base, id, opened_shift_id: shiftId, closed_shift_id: shiftId, kind: 'quick', table_id: null, customer_name: null,
  status: 'paid', discount_percent: null, total: 0, opened_at: T, closed_at: T, ...extra,
});
const item = (id: string, tabId: string, productId: string, price: number, extra: Partial<TabItem> = {}): TabItem => ({
  ...base, id, tab_id: tabId, product_id: productId, name_snapshot: productId, list_price: price, unit_price: price, quantity: 1,
  discount_percent: null, is_comp: false, note: null, voided_at: null, void_reason: null, ...extra,
});
const payment = (id: string, tabId: string, shiftId: string, method: 'cash' | 'card', amount: number): Payment => ({
  ...base, id, tab_id: tabId, shift_id: shiftId, method, amount, paid_at: T,
});

function data() {
  const s1 = shift('s1', '2026-11-02T05:00:00.000Z');
  const s2 = shift('s2', '2026-11-03T05:00:00.000Z');
  const tabs = [
    tab('t1', 's1', { total: 43000, closed_at: '2026-11-02T06:10:00.000Z' }), // 09:10
    tab('t2', 's1', { total: 19350, closed_at: '2026-11-02T06:40:00.000Z' }), // 09:40
    tab('t3', 's2', { total: 30600, discount_percent: 10, closed_at: '2026-11-03T09:05:00.000Z' }), // 12:05
    tab('t4', 's2', { status: 'void', total: null }),
  ];
  const items = [
    item('i1', 't1', 'latte', 21500, { quantity: 2 }),
    item('i2', 't2', 'latte', 21500, { discount_percent: 10 }),
    item('i3', 't2', 'cay', 6500, { is_comp: true }),
    item('i4', 't3', 'tost', 25000),
    item('i5', 't3', 'latte', 9000, { list_price: 21500 }),
    item('i6', 't3', 'cay', 6500, { voided_at: T }),
    item('i7', 't4', 'latte', 21500),
  ];
  const payments = [
    payment('p1', 't1', 's1', 'cash', 43000),
    payment('p2', 't2', 's1', 'card', 19350),
    payment('p3', 't3', 's2', 'card', 30600),
  ];
  const refunds: Refund[] = [{ ...base, id: 'r1', tab_id: 't1', tab_item_id: null, shift_id: 's2', amount: 1000, method: 'cash', reason: null }];
  return { shifts: [s1, s2], tabs, items, payments, refunds };
}

describe('reports', () => {
  it('summarizes a shift like the POS does', () => {
    const d = data();
    expect(summarizeShift(d.shifts[1]!, d)).toMatchObject({ cardSales: 30600, cashRefunds: 1000, salesCount: 1, voidTotal: 6500 + 21500 });
  });

  it('totals a period (revenue = payments − refunds)', () => {
    expect(periodTotals(data())).toEqual({
      revenue: 43000 + 19350 + 30600 - 1000,
      cash: 42000,
      card: 49950,
      refunds: 1000,
      salesCount: 3,
      discount: 2150 + 3400,
      comp: 6500,
      void: 28000,
      priceChange: 12500,
    });
  });

  it('builds day / week series by shift opening day', () => {
    const days = revenueSeries(data(), 'day');
    expect(days.map((p) => [p.key, p.totals.revenue])).toEqual([
      ['2026-11-02', 62350],
      ['2026-11-03', 29600],
    ]);
    expect(revenueSeries(data(), 'week').map((p) => [p.key, p.totals.revenue])).toEqual([['2026-11-02', 91950]]);
    expect(revenueSeries(data(), 'month')[0]!.key).toBe('2026-11-01');
  });

  it('counts sales per Istanbul hour', () => {
    const hours = hourlyActivity(data());
    expect(hours[9]).toEqual({ hour: 9, sales: 2, revenue: 62350 });
    expect(hours[12]).toEqual({ hour: 12, sales: 1, revenue: 30600 });
    expect(hours.reduce((n, h) => n + h.sales, 0)).toBe(3);
  });

  it('reports units and revenue per product and category', () => {
    const report = productReport(
      data(),
      [
        { id: 'latte', name: 'Cafe Latte', category_id: 'kahve' },
        { id: 'cay', name: 'Bardak Çay', category_id: 'kahve' },
        { id: 'tost', name: 'Kaşarlı Tost', category_id: 'yemek' },
      ],
      [
        { id: 'yemek', name: 'Yemek', sort_order: 10 },
        { id: 'kahve', name: 'Kahve', sort_order: 0 },
      ],
    );
    expect(report.products.map((p) => [p.name, p.quantity, p.revenue, p.compQuantity])).toEqual([
      ['Cafe Latte', 4, 43000 + 19350 + 9000, 0],
      ['Kaşarlı Tost', 1, 25000, 0],
      ['Bardak Çay', 0, 0, 1],
    ]);
    expect(report.categories.map((c) => [c.name, c.quantity, c.revenue])).toEqual([
      ['Kahve', 4, 71350],
      ['Yemek', 1, 25000],
    ]);
    expect(report.cartDiscount).toBe(3400);
    expect(report.totalRevenue).toBe(71350 + 25000 - 3400);
  });
});
