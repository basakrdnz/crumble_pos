// Tab (hesap) money rules, plan §4:
// - line gross = unit_price × quantity; comp (ikram) lines count as 0
// - percent discounts are whole numbers and the discount is rounded DOWN to kuruş
// - line discount comes off the line; the cart discount applies to the sum of
//   line totals and is NOT spread over the lines
// - total = Σ line totals − cart discount; voided lines are ignored
import type { Kurus } from '../money';
import { assertKurus } from '../money';

export interface CalcItem {
  list_price: Kurus;
  unit_price: Kurus;
  quantity: number;
  discount_percent: number | null;
  is_comp: boolean;
  voided_at: string | null;
}

export interface LineTotals {
  gross: Kurus;
  discount: Kurus;
  total: Kurus;
  /** Value given away as ikram (at the charged price). */
  comp: Kurus;
  /** (list_price − unit_price) × quantity; positive = sold below menu price. */
  priceChange: Kurus;
}

export function assertPercent(percent: number): void {
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new Error('İndirim 1 ile 100 arasında tam sayı yüzde olmalı.');
  }
}

/** Percent of an amount, rounded down to kuruş. */
export function percentOf(amount: Kurus, percent: number): Kurus {
  assertKurus(amount);
  assertPercent(percent);
  return Math.floor((amount * percent) / 100);
}

export function lineTotals(item: CalcItem): LineTotals {
  const gross = item.unit_price * item.quantity;
  assertKurus(gross);
  const priceChange = (item.list_price - item.unit_price) * item.quantity;
  if (item.is_comp) return { gross, discount: 0, total: 0, comp: gross, priceChange };
  const discount = item.discount_percent ? percentOf(gross, item.discount_percent) : 0;
  return { gross, discount, total: gross - discount, comp: 0, priceChange };
}

export interface TabTotals {
  /** Σ line totals (after line discounts and comps). */
  subtotal: Kurus;
  lineDiscount: Kurus;
  cartDiscount: Kurus;
  total: Kurus;
  comp: Kurus;
  priceChange: Kurus;
  /** Value of voided lines (at the charged price). */
  voided: Kurus;
  itemCount: number;
}

export function tabTotals(items: readonly CalcItem[], cartDiscountPercent: number | null): TabTotals {
  let subtotal = 0;
  let lineDiscount = 0;
  let comp = 0;
  let priceChange = 0;
  let voided = 0;
  let itemCount = 0;
  for (const item of items) {
    if (item.voided_at) {
      voided += item.unit_price * item.quantity;
      continue;
    }
    const line = lineTotals(item);
    subtotal += line.total;
    lineDiscount += line.discount;
    comp += line.comp;
    priceChange += line.priceChange;
    itemCount += item.quantity;
  }
  const cartDiscount = cartDiscountPercent ? percentOf(subtotal, cartDiscountPercent) : 0;
  return {
    subtotal,
    lineDiscount,
    cartDiscount,
    total: subtotal - cartDiscount,
    comp,
    priceChange,
    voided,
    itemCount,
  };
}

/** Change to give back for a cash payment. */
export function changeDue(received: Kurus, due: Kurus): Kurus {
  assertKurus(received);
  assertKurus(due);
  if (received < due) throw new Error('Alınan tutar yetersiz.');
  return received - due;
}
