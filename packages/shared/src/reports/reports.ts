// Reports for the manager app (plan §6), computed from synced rows. A "day"
// is the opening day of a shift (plan §4); money is counted in the shift it
// was taken in (payments.shift_id / refunds.shift_id).
import { shiftSummary, type ShiftSummary } from '../calc/shiftSummary';
import { lineTotals, tabTotals } from '../calc/tab';
import { sumKurus, type Kurus } from '../money';
import type { Category, Payment, Product, Refund, Shift, Tab, TabItem } from '../types';
import { type Day, istanbulDay, istanbulHour, monthStart, weekStart } from './dates';

export interface ReportData {
  shifts: readonly Shift[];
  /** Tabs closed in these shifts (and any open ones, for counts). */
  tabs: readonly Tab[];
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
      .map((t) => ({ status: t.status, discount_percent: t.discount_percent, items: byTab.get(t.id) ?? [] })),
  });
}

export interface PeriodTotals {
  /** Net takings: payments − refunds. */
  revenue: Kurus;
  cash: Kurus;
  card: Kurus;
  refunds: Kurus;
  salesCount: number;
  discount: Kurus;
  comp: Kurus;
  void: Kurus;
  priceChange: Kurus;
}

export function emptyTotals(): PeriodTotals {
  return { revenue: 0, cash: 0, card: 0, refunds: 0, salesCount: 0, discount: 0, comp: 0, void: 0, priceChange: 0 };
}

function addSummary(total: PeriodTotals, s: ShiftSummary): PeriodTotals {
  const refunds = s.cashRefunds + s.cardRefunds;
  return {
    revenue: total.revenue + s.cashSales + s.cardSales - refunds,
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

/** Paid tabs per closing hour (saatlik yoğunluk). */
export function hourlyActivity(data: ReportData): HourBucket[] {
  const hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, revenue: 0 }));
  for (const tab of data.tabs) {
    if (tab.status !== 'paid' || !tab.closed_at) continue;
    const bucket = hours[istanbulHour(tab.closed_at)]!;
    bucket.sales++;
    bucket.revenue += tab.total ?? 0;
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

/** Units and revenue per product and category over paid tabs (plan §6 Ürün raporu). */
export function productReport(
  data: Pick<ReportData, 'tabs' | 'items'>,
  products: readonly Pick<Product, 'id' | 'name' | 'category_id'>[],
  categories: readonly Pick<Category, 'id' | 'name' | 'sort_order'>[],
): ProductReport {
  const paid = new Map(data.tabs.filter((t) => t.status === 'paid').map((t) => [t.id, t]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const rows = new Map<string, ProductRow>();
  for (const item of data.items) {
    if (!paid.has(item.tab_id) || item.voided_at) continue;
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
      row.revenue += lineTotals(item).total;
    }
  }
  const byTab = itemsByTab(data.items);
  const cartDiscount = sumKurus(
    [...paid.values()].map((t) => tabTotals(byTab.get(t.id) ?? [], t.discount_percent).cartDiscount),
  );

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
