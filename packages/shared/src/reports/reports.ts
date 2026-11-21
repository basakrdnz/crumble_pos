// Reports for the manager app (plan §6), computed from synced rows. A "day"
// is the opening day of a shift (plan §4). Ciro counts each line in the shift
// it was added in, paid or not (2026-11-21, sold.ts); money taken (nakit/kart)
// and refunds count in the shift they happened in (payments.shift_id / refunds.shift_id).
import { shiftSummary, type ShiftSummary } from '../calc/shiftSummary';
import { linesInShift, type SoldLine, soldLines } from '../calc/sold';
import { sumKurus, type Kurus } from '../money';
import type { Category, Payment, Product, Refund, Shift, Tab, TabItem } from '../types';
import { type Day, istanbulDay, istanbulHour, monthStart, weekStart } from './dates';

export interface ReportData {
  shifts: readonly Shift[];
  /** Tabs closed in these shifts and tabs with lines added in them (open ones too). */
  tabs: readonly Tab[];
  /** All lines of those tabs. */
  items: readonly TabItem[];
  payments: readonly Payment[];
  refunds: readonly Refund[];
}

function itemsByTab(items: readonly TabItem[]): Map<string, TabItem[]> {
  const map = new Map<string, TabItem[]>();
  for (const item of items) {
    const list = map.get(item.tab_id);
    if (list) list.push(item);
    else map.set(item.tab_id, [item]);
  }
  return map;
}

const soldCache = new WeakMap<object, SoldLine[]>();

/** Sold lines of the data (computed once per data object). */
export function reportLines(data: Pick<ReportData, 'tabs' | 'items'>): SoldLine[] {
  let lines = soldCache.get(data);
  if (!lines) {
    lines = soldLines(data.tabs, data.items);
    soldCache.set(data, lines);
  }
  return lines;
}

/** Sold lines added in the data's shifts. */
export function periodLines(data: Pick<ReportData, 'tabs' | 'items' | 'shifts'>): SoldLine[] {
  const lines = reportLines(data);
  return data.shifts.flatMap((shift) => linesInShift(lines, shift));
}

/** One shift's summary from the synced rows (same rules as the POS close screen). */
export function summarizeShift(shift: Shift, data: ReportData): ShiftSummary {
  const byTab = itemsByTab(data.items);
  return shiftSummary({
    openingCash: shift.opening_cash,
    countedCash: shift.counted_cash,
    payments: data.payments.filter((p) => p.shift_id === shift.id),
    refunds: data.refunds.filter((r) => r.shift_id === shift.id),
    closedTabs: data.tabs
      .filter((t) => t.closed_shift_id === shift.id && t.status !== 'open')
      .map((t) => ({ status: t.status, kind: t.kind, discount_percent: t.discount_percent, items: byTab.get(t.id) ?? [] })),
    sold: linesInShift(reportLines(data), shift),
  });
}

export interface PeriodTotals {
  /** Ciro: what was taken in the period (paid or still on open tabs) − refunds. */
  revenue: Kurus;
  /** The part of the ciro still on open tabs. */
  open: Kurus;
  /** Money taken in the period, net of refunds (cash + card). */
  collected: Kurus;
  cash: Kurus;
  card: Kurus;
  refunds: Kurus;
  /** Tabs with something taken in the period (counted per day). */
  salesCount: number;
  discount: Kurus;
  comp: Kurus;
  void: Kurus;
  priceChange: Kurus;
}

export function emptyTotals(): PeriodTotals {
  return { revenue: 0, open: 0, collected: 0, cash: 0, card: 0, refunds: 0, salesCount: 0, discount: 0, comp: 0, void: 0, priceChange: 0 };
}

function addSummary(total: PeriodTotals, s: ShiftSummary): PeriodTotals {
  const refunds = s.cashRefunds + s.cardRefunds;
  return {
    revenue: total.revenue + s.revenue - refunds,
    open: total.open + s.openRevenue,
    collected: total.collected + s.cashSales + s.cardSales - refunds,
    cash: total.cash + s.cashSales - s.cashRefunds,
    card: total.card + s.cardSales - s.cardRefunds,
    refunds: total.refunds + refunds,
    salesCount: total.salesCount + s.revenueTabCount,
    discount: total.discount + s.discountTotal,
    comp: total.comp + s.compTotal,
    void: total.void + s.voidTotal,
    priceChange: total.priceChange + s.priceChangeTotal,
  };
}

/** Totals over all shifts in the data. */
export function periodTotals(data: ReportData): PeriodTotals {
  return data.shifts.reduce((acc, shift) => addSummary(acc, summarizeShift(shift, data)), emptyTotals());
}

export type Granularity = 'day' | 'week' | 'month';

export interface SeriesPoint {
  /** First day of the bucket. */
  key: Day;
  totals: PeriodTotals;
}

/** Revenue per day / week / month, by shift opening day. */
export function revenueSeries(data: ReportData, granularity: Granularity): SeriesPoint[] {
  const bucket = (day: Day) => (granularity === 'day' ? day : granularity === 'week' ? weekStart(day) : monthStart(day));
  const map = new Map<Day, PeriodTotals>();
  for (const shift of data.shifts) {
    const key = bucket(istanbulDay(shift.opened_at));
    map.set(key, addSummary(map.get(key) ?? emptyTotals(), summarizeShift(shift, data)));
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, totals]) => ({ key, totals }));
}

export interface HourBucket {
  hour: number;
  sales: number;
  revenue: Kurus;
}

/** Ciro per hour the lines were added (saatlik yoğunluk); sales = tabs served in that hour. */
export function hourlyActivity(data: ReportData): HourBucket[] {
  const hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, revenue: 0 }));
  const seen = new Set<string>();
  for (const line of periodLines(data)) {
    const hour = istanbulHour(line.at);
    const bucket = hours[hour]!;
    bucket.revenue += line.amount;
    const key = `${line.tabId}|${istanbulDay(line.at)}|${hour}`;
    if (!seen.has(key)) {
      seen.add(key);
      bucket.sales++;
    }
  }
  return hours;
}

export interface ProductRow {
  productId: string;
  name: string;
  categoryId: string | null;
  quantity: number;
  /** Σ line totals (after line discounts; cart discounts are reported separately). */
  revenue: Kurus;
  compQuantity: number;
}

export interface CategoryRow {
  categoryId: string | null;
  name: string;
  quantity: number;
  revenue: Kurus;
}

export interface ProductReport {
  products: ProductRow[];
  categories: CategoryRow[];
  cartDiscount: Kurus;
  totalRevenue: Kurus;
}

/**
 * Units and revenue per product and category (plan §6 Ürün raporu): lines
 * added in the data's shifts on tabs that count as sold, paid or still open.
 */
export function productReport(
  data: Pick<ReportData, 'tabs' | 'items' | 'shifts'>,
  products: readonly Pick<Product, 'id' | 'name' | 'category_id'>[],
  categories: readonly Pick<Category, 'id' | 'name' | 'sort_order'>[],
  lines: readonly SoldLine[] = periodLines(data),
): ProductReport {
  const productById = new Map(products.map((p) => [p.id, p]));
  const rows = new Map<string, ProductRow>();
  let cartDiscount = 0;
  for (const line of lines) {
    const item = line.item as TabItem;
    cartDiscount += line.lineTotal - line.amount;
    const product = productById.get(item.product_id);
    let row = rows.get(item.product_id);
    if (!row) {
      row = {
        productId: item.product_id,
        name: product?.name ?? item.name_snapshot,
        categoryId: product?.category_id ?? null,
        quantity: 0,
        revenue: 0,
        compQuantity: 0,
      };
      rows.set(item.product_id, row);
    }
    if (item.is_comp) row.compQuantity += item.quantity;
    else {
      row.quantity += item.quantity;
      row.revenue += line.lineTotal;
    }
  }

  const order = new Map(categories.map((c) => [c.id, c.sort_order]));
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const catRows = new Map<string | null, CategoryRow>();
  for (const row of rows.values()) {
    const cat = catRows.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      name: (row.categoryId && names.get(row.categoryId)) || 'Diğer',
      quantity: 0,
      revenue: 0,
    };
    cat.quantity += row.quantity;
    cat.revenue += row.revenue;
    catRows.set(row.categoryId, cat);
  }
  const productList = [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);
  return {
    products: productList,
    categories: [...catRows.values()].sort(
      (a, b) => (order.get(a.categoryId ?? '') ?? 1e9) - (order.get(b.categoryId ?? '') ?? 1e9),
    ),
    cartDiscount,
    totalRevenue: sumKurus(productList.map((p) => p.revenue)) - cartDiscount,
  };
}
