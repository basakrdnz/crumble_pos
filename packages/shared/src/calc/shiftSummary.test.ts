import { describe, expect, it } from 'vitest';
import { shiftSummary } from './shiftSummary';
import type { CalcItem } from './tab';

const item = (unit: number, over: Partial<CalcItem> = {}): CalcItem => ({
  list_price: unit,
  unit_price: unit,
  quantity: 1,
  discount_percent: null,
  is_comp: false,
  voided_at: null,
  ...over,
});

describe('shiftSummary', () => {
  it('summarises an example day', () => {
    const summary = shiftSummary({
      openingCash: 50000,
      countedCash: 74000,
      payments: [
        { method: 'cash', amount: 21500 },
        { method: 'card', amount: 46000 },
        { method: 'cash', amount: 3000 },
        { method: 'card', amount: 10000 },
      ],
      refunds: [{ method: 'cash', amount: 1000 }],
      closedTabs: [
        { status: 'paid', discount_percent: null, items: [item(21500)] },
        { status: 'paid', discount_percent: 10, items: [item(23000, { quantity: 2 }), item(11000, { is_comp: true })] },
        { status: 'paid', discount_percent: null, items: [item(15000, { unit_price: 13000 }), item(9000, { voided_at: 'x' })] },
        { status: 'void', discount_percent: null, items: [item(5000), item(2000, { voided_at: 'x' })] },
      ],
    });
    expect(summary).toEqual({
      openingCash: 50000,
      cashSales: 24500,
      cardSales: 56000,
      cashRefunds: 1000,
      cardRefunds: 0,
      expectedCash: 50000 + 24500 - 1000,
      countedCash: 74000,
      cashDifference: 74000 - 73500,
      salesCount: 3,
      salesTotal: 21500 + (46000 - 4600) + 13000,
      discountTotal: 4600,
      compTotal: 11000,
      voidTotal: 9000 + 5000 + 2000,
      voidedTabCount: 1,
      priceChangeTotal: 2000,
    });
  });

  it('has no difference before the drawer is counted', () => {
    const summary = shiftSummary({ openingCash: 100, payments: [], refunds: [], closedTabs: [] });
    expect(summary.expectedCash).toBe(100);
    expect(summary.cashDifference).toBeNull();
  });
});
