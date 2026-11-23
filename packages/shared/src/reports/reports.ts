// Reports for the manager app (plan §6), computed from synced rows. A "day"
// is the opening day of a shift (plan §4). Ciro is the money taken in the
// shift (payments − refunds, by payments.shift_id / refunds.shift_id): a tab
// counts on the day it is paid, an unpaid open tab in no day yet (kullanıcı
// 2026-11-23). Products count with their tab, in the shift it was paid.
import { shiftSummary, type ShiftSummary } from '../calc/shiftSummary';
import { type SoldLine, soldLines } from '../calc/sold';
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

/** Lines of the tabs paid (closed) in the data's shifts, whenever they were taken. */
export function periodLines(data: Pick<ReportData, 'tabs' | 'items' | 'shifts'>): SoldLine[] {
  const ids = new Set(data.shifts.map((s) => s.id));
  const paid = new Set(data.tabs.filter((t) => t.status === 'paid' && t.closed_shift_id && ids.has(t.closed_shift_id)).map((t) => t.id));
  return reportLines(data).filter((l) => paid.has(l.tabId));
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
  });
}

export interface PeriodTotals {
  /** Ciro: money taken in the period (nakit + kart) − refunds. */
  revenue: Kurus;
  /** Same as revenue (kept for the screens that name it so). */
  collected: Kurus;
  cash: Kurus;
  card: Kurus;
  refunds: Kurus;
  /** Tabs paid (closed) in the period. */
  salesCount: number;
  discount: Kurus;
  comp: Kurus;
  void: Kurus;
  priceChange: Kurus;
}

export function emptyTotals(): PeriodTotals {
  return { revenue: 0, collected: 0, cash: 0, card: 0, refunds: 0, salesCount: 0, discount: 0, comp: 0, void: 0, priceChange: 0 };
}

function addSummary(total: PeriodTotals, s: ShiftSummary): PeriodTotals {
  const refunds = s.cashRefunds + s.cardRefunds;
  return {
    revenue: total.revenue + s.revenue,
    collected: total.collected + s.cashSales + s.cardSales - refunds,
    cash: total.cash + s.cashSales - s.cashRefunds,
    card: total.card + s.cardSales - s.cardRefunds,
    refunds: total.refunds + refunds,
    salesCount: total.salesCount + s.salesCount,
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

export interface PeriodSales {
  /** Ciro (payments − refunds), as in periodTotals. */
  revenue: Kurus;
  /** Tabs paid, as periodTotals.salesCount. */
  sales: number;
}

/**
 * Ciro and sales of the data's shifts up to an instant (Raporlar kıyası,
 * 2026-11-22): an unfinished period is compared with the same stretch of the
 * one before ("geçen Cumartesi aynı saate kadar"). No cutoff = the whole period,
 * equal to periodTotals' revenue and salesCount.
 */
export function periodSales(data: ReportData, cutoff?: string): PeriodSales {
  const end = cutoff ? Date.parse(cutoff) : Infinity;
  const ids = new Set(data.shifts.map((s) => s.id));
  const before = (iso: string | null) => iso !== null && Date.parse(iso) < end;
  const revenue =
    sumKurus(data.payments.filter((p) => ids.has(p.shift_id) && before(p.paid_at)).map((p) => p.amount)) -
    sumKurus(data.refunds.filter((r) => ids.has(r.shift_id) && before(r.created_at)).map((r) => r.amount));
  const sales = data.tabs.filter((t) => t.status === 'paid' && t.closed_shift_id && ids.has(t.closed_shift_id) && before(t.closed_at)).length;
  return { revenue, sales };
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
