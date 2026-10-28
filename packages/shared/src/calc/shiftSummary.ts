import type { Kurus } from '../money';
import { sumKurus } from '../money';
import type { PaymentMethod, TabStatus } from '../types';
import { cashDifference, expectedCash } from './shift';
import { type CalcItem, tabTotals } from './tab';

export interface SummaryTab {
  status: TabStatus;
  discount_percent: number | null;
  items: readonly CalcItem[];
}

export interface ShiftSummaryInput {
  openingCash: Kurus;
  countedCash?: Kurus | null;
  /** Payments taken in this shift (payments.shift_id). */
  payments: readonly { method: PaymentMethod; amount: Kurus }[];
  /** Refunds given in this shift (refunds.shift_id). */
  refunds: readonly { method: PaymentMethod; amount: Kurus }[];
  /** Tabs closed (paid or void) in this shift (tabs.closed_shift_id). */
  closedTabs: readonly SummaryTab[];
}

export interface ShiftSummary {
  openingCash: Kurus;
  cashSales: Kurus;
  cardSales: Kurus;
  cashRefunds: Kurus;
  cardRefunds: Kurus;
  expectedCash: Kurus;
  countedCash: Kurus | null;
  cashDifference: Kurus | null;
  /** Number and value of tabs paid in this shift. */
  salesCount: number;
  salesTotal: Kurus;
  /** Line + cart discounts on paid tabs. */
  discountTotal: Kurus;
  compTotal: Kurus;
  /** Voided lines on closed tabs plus everything on voided tabs. */
  voidTotal: Kurus;
  voidedTabCount: number;
  /** Σ (menu price − charged price) on paid tabs. */
  priceChangeTotal: Kurus;
}

const byMethod = (rows: ShiftSummaryInput['payments'], method: PaymentMethod) =>
  sumKurus(rows.filter((r) => r.method === method).map((r) => r.amount));

export function shiftSummary(input: ShiftSummaryInput): ShiftSummary {
  let salesCount = 0;
  let salesTotal = 0;
  let discountTotal = 0;
  let compTotal = 0;
  let voidTotal = 0;
  let voidedTabCount = 0;
  let priceChangeTotal = 0;
  for (const tab of input.closedTabs) {
    const totals = tabTotals(tab.items, tab.discount_percent);
    if (tab.status === 'void') {
      voidedTabCount++;
      voidTotal += totals.voided + sumKurus(tab.items.filter((i) => !i.voided_at).map((i) => i.unit_price * i.quantity));
      continue;
    }
    salesCount++;
    salesTotal += totals.total;
    discountTotal += totals.lineDiscount + totals.cartDiscount;
    compTotal += totals.comp;
    voidTotal += totals.voided;
    priceChangeTotal += totals.priceChange;
  }
  const expected = expectedCash(input.openingCash, input.payments, input.refunds);
  const counted = input.countedCash ?? null;
  return {
    openingCash: input.openingCash,
    cashSales: byMethod(input.payments, 'cash'),
    cardSales: byMethod(input.payments, 'card'),
    cashRefunds: byMethod(input.refunds, 'cash'),
    cardRefunds: byMethod(input.refunds, 'card'),
    expectedCash: expected,
    countedCash: counted,
    cashDifference: counted === null ? null : cashDifference(counted, expected),
    salesCount,
    salesTotal,
    discountTotal,
    compTotal,
    voidTotal,
    voidedTabCount,
    priceChangeTotal,
  };
}
