// Ciro by the day things were taken (kullanıcı 2026-11-21): a tab that stays
// open for a week and is paid on Friday is not Friday's revenue; every line
// counts in the shift it was added in, at once, paid or not. The money itself
// (nakit/kart, kasadaki nakit) still counts where it was taken (payments.shift_id).
//
// The cart discount is a percent of the whole tab; it is shared out over the
// lines in the order they were added so that the parts add up exactly to the
// tab total: after line k the discount so far is floor(Σ line totals × % / 100).
import type { Kurus } from '../money';
import type { TabKind, TabStatus } from '../types';
import { type CalcItem, lineTotals } from './tab';

export interface SoldTab {
  id: string;
  status: TabStatus;
  kind: TabKind;
  discount_percent: number | null;
}

export interface SoldItem extends CalcItem {
  id: string;
  tab_id: string;
  created_at: string;
}

export interface SoldLine {
  tabId: string;
  itemId: string;
  item: SoldItem;
  /** When the line was added (the sale moment). */
  at: string;
  /** The line's share of the tab total (line total − its part of the cart discount). */
  amount: Kurus;
  /** Line total before the cart discount (product reports). */
  lineTotal: Kurus;
  /** The tab is still open: sold but not (fully) paid yet. */
  open: boolean;
}

/** Whether a tab's lines count as sold: not cancelled, and not a quick sale still in the cart. */
export function countsAsSold(tab: Pick<SoldTab, 'status' | 'kind'>): boolean {
  return tab.status === 'paid' || (tab.status === 'open' && tab.kind !== 'quick');
}

// Timestamps are compared as instants: Postgres and the POS write them in different ISO shapes.
// Same order as private.day_revenue (supabase 0015): time, then id.
const byTime = (a: SoldItem, b: SoldItem) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every sold line with its share of its tab total. */
export function soldLines(tabs: readonly SoldTab[], items: readonly SoldItem[]): SoldLine[] {
  const byTab = new Map<string, SoldItem[]>();
  for (const item of items) {
    if (item.voided_at) continue;
    const list = byTab.get(item.tab_id);
    if (list) list.push(item);
    else byTab.set(item.tab_id, [item]);
  }
  const out: SoldLine[] = [];
  for (const tab of tabs) {
    if (!countsAsSold(tab)) continue;
    const lines = byTab.get(tab.id);
    if (!lines) continue;
    lines.sort(byTime);
    const percent = tab.discount_percent;
    let subtotal = 0;
    let discountSoFar = 0;
    for (const item of lines) {
      const total = lineTotals(item).total;
      subtotal += total;
      const discount = percent ? Math.floor((subtotal * percent) / 100) : 0;
      out.push({
        tabId: tab.id,
        itemId: item.id,
        item,
        at: item.created_at,
        amount: total - (discount - discountSoFar),
        lineTotal: total,
        open: tab.status === 'open',
      });
      discountSoFar = discount;
    }
  }
  return out;
}

/** Lines added while a shift was open: [opened_at, closed_at), an open shift has no end. */
export function linesInShift(lines: readonly SoldLine[], shift: { opened_at: string; closed_at: string | null }): SoldLine[] {
  const start = Date.parse(shift.opened_at);
  const end = shift.closed_at === null ? Infinity : Date.parse(shift.closed_at);
  return lines.filter((l) => {
    const t = Date.parse(l.at);
    return t >= start && t < end;
  });
}
