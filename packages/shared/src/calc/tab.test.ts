import { describe, expect, it } from 'vitest';
import { type CalcItem, changeDue, lineTotals, percentOf, tabTotals } from './tab';

const item = (over: Partial<CalcItem> = {}): CalcItem => ({
  list_price: 21500,
  unit_price: 21500,
  quantity: 1,
  discount_percent: null,
  is_comp: false,
  voided_at: null,
  ...over,
});

describe('percentOf', () => {
  it('rounds the discount down to kuruş', () => {
    expect(percentOf(999, 10)).toBe(99); // 99,9 -> 99
    expect(percentOf(21500, 15)).toBe(3225);
    expect(percentOf(333, 15)).toBe(49); // 49,95 -> 49
  });

  it('accepts only whole percentages 1..100', () => {
    expect(() => percentOf(100, 0)).toThrow();
    expect(() => percentOf(100, 101)).toThrow();
    expect(() => percentOf(100, 12.5)).toThrow();
    expect(percentOf(100, 100)).toBe(100);
  });
});

describe('lineTotals', () => {
  it('multiplies by quantity and applies the line discount', () => {
    expect(lineTotals(item({ quantity: 3, discount_percent: 10 }))).toEqual({
      gross: 64500,
      discount: 6450,
      total: 58050,
      comp: 0,
      priceChange: 0,
    });
  });

  it('counts a comp line as 0 but reports its value', () => {
    expect(lineTotals(item({ quantity: 2, is_comp: true, discount_percent: 10 }))).toMatchObject({
      total: 0,
      discount: 0,
      comp: 43000,
    });
  });

  it('reports a changed price against the menu price', () => {
    expect(lineTotals(item({ unit_price: 20000, quantity: 2 })).priceChange).toBe(3000);
  });
});

describe('tabTotals', () => {
  it('applies the cart discount after line discounts, without spreading it', () => {
    const totals = tabTotals(
      [item({ discount_percent: 10 }), item({ unit_price: 11000, list_price: 11000, quantity: 2 })],
      15,
    );
    // lines: 21500-2150 = 19350, 22000 -> subtotal 41350; cart 15% = 6202,5 -> 6202
    expect(totals).toEqual({
      subtotal: 41350,
      lineDiscount: 2150,
      cartDiscount: 6202,
      total: 35148,
      comp: 0,
      priceChange: 0,
      voided: 0,
      itemCount: 3,
    });
  });

  it('ignores voided lines but reports their value', () => {
    const totals = tabTotals([item(), item({ voided_at: '2026-11-01T10:00:00Z', quantity: 2 })], null);
    expect(totals.total).toBe(21500);
    expect(totals.voided).toBe(43000);
    expect(totals.itemCount).toBe(1);
  });

  it('is 0 for an empty or all-comp tab', () => {
    expect(tabTotals([], 10).total).toBe(0);
    expect(tabTotals([item({ is_comp: true })], null).total).toBe(0);
  });
});

describe('changeDue', () => {
  it('returns the change and refuses too little cash', () => {
    expect(changeDue(50000, 35148)).toBe(14852);
    expect(() => changeDue(100, 200)).toThrow();
  });
});
