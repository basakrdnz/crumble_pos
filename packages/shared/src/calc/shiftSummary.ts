import type { Kurus } from '../money';
import { sumKurus } from '../money';
import type { PaymentMethod, TabKind, TabStatus } from '../types';
import { cashDifference, expectedCash } from './shift';
import type { SoldLine } from './sold';
import { type CalcItem, tabTotals } from './tab';

export interface SummaryTab {
  status: TabStatus;
  /** Quick sales (2026-11-04): lines taken out and a cleared cart are not "iptal". */
  kind?: TabKind;
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
  /**
   * Lines added in this shift on tabs that count as sold (open or paid), see
   * sold.ts. Ciro comes from these; left out, ciro falls back to the tabs
   * paid in the shift.
   */
  sold?: readonly Pick<SoldLine, 'tabId' | 'amount' | 'open'>[];
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
  /**
   * Ciro (2026-11-21): everything taken in this shift, whether paid yet or
   * not, before refunds. A tab spanning days counts on each day for its lines.
   */
  revenue: Kurus;
  /** The part of `revenue` still on open tabs. */
  openRevenue: Kurus;
  /** Tabs with lines in `revenue`. */
  revenueTabCount: number;
  /** Number and value of tabs paid (closed) in this shift. */
  salesCount: number;
  salesTotal: Kurus;
  /** Line + cart discounts on paid tabs. */
  discountTotal: Kurus;
  compTotal: Kurus;
  /**
   * Voided lines on closed table/named tabs plus everything on voided
   * table/named tabs. A quick sale's removed lines or cleared cart do not
   * count (kullanıcı 2026-11-04: "vazgeçilen bir şey").
   */
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
    const quick = tab.kind === 'quick';
    if (tab.status === 'void' && quick) continue;
    if (tab.status === 'void') {
      voidedTabCount++;
      voidTotal += totals.voided + sumKurus(tab.items.filter((i) => !i.voided_at).map((i) => i.unit_price * i.quantity));
      continue;
    }
    salesCount++;
    salesTotal += totals.total;
    discountTotal += totals.lineDiscount + totals.cartDiscount;
    compTotal += totals.comp;
    if (!quick) voidTotal += totals.voided;
    priceChangeTotal += totals.priceChange;
  }
  const expected = expectedCash(input.openingCash, input.payments, input.refunds);
  const counted = input.countedCash ?? null;
  const sold = input.sold;
  return {
    revenue: sold ? sumKurus(sold.map((l) => l.amount)) : salesTotal,
    openRevenue: sold ? sumKurus(sold.filter((l) => l.open).map((l) => l.amount)) : 0,
    revenueTabCount: sold ? new Set(sold.map((l) => l.tabId)).size : salesCount,
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
