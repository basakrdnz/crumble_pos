// Analysis for the manager app (Raporlar · Saatler / Ürünler / Kıyas and the
// Bugün comparisons, 2026-10-30). Hour-based views follow the money (kullanıcı
// 2026-11-23: ciro is what was paid): a "sale" is what one tab paid in one
// hour of one day, in Istanbul time.
// Opening hours change from day to day, so the hours that count as "open"
// come from the shifts themselves (vardiya açılışı → gün sonu).
import { sumKurus, type Kurus } from '../money';
import type { Category, Product, Shift } from '../types';
import { addDays, type Day, daysBetween, istanbulDay, istanbulHour } from './dates';
import { periodLines, productReport, type ReportData } from './reports';

type SalesData = Pick<ReportData, 'payments'>;

const OFFSET_MS = 3 * 60 * 60 * 1000;

/** Minutes since Istanbul midnight. */
export function istanbulMinute(iso: string): number {
  const d = new Date(Date.parse(iso) + OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 0 = Pazartesi … 6 = Pazar (the week starts on Monday). */
export function weekdayIndex(day: Day): number {
  return (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

interface SaleEvent {
  day: Day;
  minute: number;
  hour: number;
  total: Kurus;
}
const eventCache = new WeakMap<object, SaleEvent[]>();

/** What each tab paid per Istanbul day and hour, at the first payment's minute. */
function salesEvents(data: SalesData): SaleEvent[] {
  const cached = eventCache.get(data);
  if (cached) return cached;
  const map = new Map<string, SaleEvent>();
  for (const p of data.payments) {
    const day = istanbulDay(p.paid_at);
    const hour = istanbulHour(p.paid_at);
    const minute = istanbulMinute(p.paid_at);
    const key = `${p.tab_id}|${day}|${hour}`;
    const event = map.get(key);
    if (event) {
      event.total += p.amount;
      event.minute = Math.min(event.minute, minute);
    } else map.set(key, { day, hour, minute, total: p.amount });
  }
  const events = [...map.values()];
  eventCache.set(data, events);
  return events;
}

export interface SoFar {
  revenue: Kurus;
  sales: number;
}

/** What was paid on `day` up to `minute` (exclusive) in Istanbul time. */
export function salesSoFar(data: SalesData, day: Day, minute: number): SoFar {
  const paid = data.payments.filter((p) => istanbulDay(p.paid_at) === day && istanbulMinute(p.paid_at) < minute);
  return { revenue: sumKurus(paid.map((p) => p.amount)), sales: new Set(paid.map((p) => p.tab_id)).size };
}

/** Whole-number percent change, null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface SoFarComparison {
  today: SoFar;
  yesterday: SoFar;
  lastWeek: SoFar;
  vsYesterday: number | null;
  vsLastWeek: number | null;
}

/** Bugün: today so far vs yesterday and the same weekday last week, up to the same time. */
export function compareSoFar(data: SalesData, now: string): SoFarComparison {
  const day = istanbulDay(now);
  const minute = istanbulMinute(now);
  const today = salesSoFar(data, day, minute + 1);
  const yesterday = salesSoFar(data, addDays(day, -1), minute + 1);
  const lastWeek = salesSoFar(data, addDays(day, -7), minute + 1);
  return {
    today,
    yesterday,
    lastWeek,
    vsYesterday: percentChange(today.revenue, yesterday.revenue),
    vsLastWeek: percentChange(today.revenue, lastWeek.revenue),
  };
}

/** Revenue per Istanbul hour for one day (24 entries). */
export function hourlyRevenue(data: SalesData, day: Day): Kurus[] {
  const hours = Array<Kurus>(24).fill(0);
  for (const s of salesEvents(data)) if (s.day === day) hours[s.hour]! += s.total;
  return hours;
}

/**
 * For each day, the hours the cafe was open: every hour touched by a shift
 * between its opening and its close (an open shift counts up to `now`).
 */
export function openHoursByDay(shifts: readonly Shift[], now: string): Map<Day, Set<number>> {
  const map = new Map<Day, Set<number>>();
  for (const shift of shifts) {
    const end = Date.parse(shift.closed_at ?? now);
    for (let t = Date.parse(shift.opened_at); t < end; t += 3_600_000) {
      const iso = new Date(t).toISOString();
      const set = map.get(istanbulDay(iso)) ?? new Set<number>();
      set.add(istanbulHour(iso));
      map.set(istanbulDay(iso), set);
    }
    const last = new Date(end - 1).toISOString();
    const set = map.get(istanbulDay(last)) ?? new Set<number>();
    set.add(istanbulHour(last));
    map.set(istanbulDay(last), set);
  }
  return map;
}

/**
 * Average revenue per hour on the given weekday over [from, to], counting only
 * days on which the cafe was open in that hour. null = never open then.
 */
export function weekdayHourAverage(
  data: SalesData,
  shifts: readonly Shift[],
  weekday: number,
  from: Day,
  to: Day,
  now: string,
): (Kurus | null)[] {
  return heatmap(data, shifts, from, to, now).cells[weekday]!.map((c) => (c ? c.revenue : null));
}

export interface HeatCell {
  /** Average revenue in this hour on the days it was open. */
  revenue: Kurus;
  /** Average number of sales. */
  sales: number;
  /** Days of this weekday the cafe was open in this hour. */
  days: number;
}

export interface Slot {
  weekday: number;
  /** First hour of a two-hour window. */
  hour: number;
  revenue: Kurus;
  sales: number;
}

export interface Heatmap {
  /** First and last hour shown (union of all open hours in the period). */
  fromHour: number;
  toHour: number;
  /** [weekday 0..6][hour 0..23]; null = closed in that hour every time. */
  cells: (HeatCell | null)[][];
  busiest: Slot | null;
  quietest: Slot | null;
}

/** Raporlar · Saatler: weekday × hour averages, busiest and quietest two-hour windows. */
export function heatmap(data: SalesData, shifts: readonly Shift[], from: Day, to: Day, now: string): Heatmap {
  const open = openHoursByDay(shifts, now);
  const sums = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ revenue: 0, sales: 0, days: 0 })));
  for (const day of daysBetween(from, to)) {
    const hours = open.get(day);
    if (!hours) continue;
    for (const h of hours) sums[weekdayIndex(day)]![h]!.days++;
  }
  for (const s of salesEvents(data)) {
    if (s.day < from || s.day > to) continue;
    const cell = sums[weekdayIndex(s.day)]![s.hour]!;
    cell.revenue += s.total;
    cell.sales++;
  }
  let fromHour = 24;
  let toHour = -1;
  const cells = sums.map((row) =>
    row.map((c, hour) => {
      if (c.days === 0) return null;
      fromHour = Math.min(fromHour, hour);
      toHour = Math.max(toHour, hour);
      return { revenue: Math.round(c.revenue / c.days), sales: Math.round((c.sales / c.days) * 10) / 10, days: c.days };
    }),
  );

  // Two-hour windows inside open hours; ties go to the earlier slot.
  let busiest: Slot | null = null;
  let quietest: Slot | null = null;
  cells.forEach((row, weekday) => {
    for (let hour = 0; hour < 23; hour++) {
      const a = row[hour];
      const b = row[hour + 1];
      if (!a || !b) continue;
      const slot = { weekday, hour, revenue: a.revenue + b.revenue, sales: Math.round((a.sales + b.sales) * 10) / 10 };
      if (!busiest || slot.revenue > busiest.revenue) busiest = slot;
      if (!quietest || slot.revenue < quietest.revenue) quietest = slot;
    }
  });
  return { fromHour: fromHour > toHour ? 0 : fromHour, toHour: toHour < 0 ? 0 : toHour, cells, busiest, quietest };
}

export interface Kpis {
  revenue: Kurus;
  sales: number;
  avgBasket: Kurus;
  /** Discount as a share of sales before discount, in tenths of a percent (31 = %3,1). */
  discountPermille: number;
  void: Kurus;
}

/** Raporlar · Kıyas indicators for one period (ciro by the time things were taken). */
export function periodKpis(totals: { revenue: Kurus; discount: Kurus; void: Kurus; salesCount: number }): Kpis {
  const revenue = totals.revenue;
  const sales = totals.salesCount;
  return {
    revenue,
    sales,
    avgBasket: sales ? Math.round(revenue / sales) : 0,
    discountPermille: revenue + totals.discount > 0 ? Math.round((totals.discount / (revenue + totals.discount)) * 1000) : 0,
    void: totals.void,
  };
}

export interface ProductTrend {
  productId: string;
  name: string;
  quantity: number;
  revenue: Kurus;
  /** Percent change of revenue vs the previous period; null = new this period. */
  change: number | null;
}

type Catalog = {
  products: readonly Pick<Product, 'id' | 'name' | 'category_id'>[];
  categories: readonly Pick<Category, 'id' | 'name' | 'sort_order'>[];
};

/** Best sellers of `current` with their change against `previous`. */
export function productTrends(
  current: Pick<ReportData, 'tabs' | 'items' | 'shifts'>,
  previous: Pick<ReportData, 'tabs' | 'items' | 'shifts'>,
  catalog: Catalog,
): ProductTrend[] {
  const before = new Map(productReport(previous, catalog.products, catalog.categories).products.map((p) => [p.productId, p.revenue]));
  return productReport(current, catalog.products, catalog.categories).products.map((p) => ({
    productId: p.productId,
    name: p.name,
    quantity: p.quantity,
    revenue: p.revenue,
    change: before.has(p.productId) ? percentChange(p.revenue, before.get(p.productId)!) : null,
  }));
}

export const DAYPARTS = [
  { id: 'morning', label: 'Sabah', from: 0, to: 11 },
  { id: 'noon', label: 'Öğle', from: 11, to: 15 },
  { id: 'afternoon', label: 'İkindi', from: 15, to: 18 },
  { id: 'evening', label: 'Akşam', from: 18, to: 24 },
] as const;

export interface DaypartTop {
  id: (typeof DAYPARTS)[number]['id'];
  label: string;
  from: number;
  to: number;
  sales: number;
  top: { name: string; quantity: number }[];
}

/** Most sold products per part of the day (by the time they were taken), top `n` each. */
export function daypartTops(data: Pick<ReportData, 'tabs' | 'items' | 'shifts'>, catalog: Catalog, n = 3): DaypartTop[] {
  const lines = periodLines(data);
  return DAYPARTS.map((part) => {
    const inPart = lines.filter((l) => {
      const h = istanbulHour(l.at);
      return h >= part.from && h < part.to;
    });
    const report = productReport(data, catalog.products, catalog.categories, inPart);
    return {
      ...part,
      sales: new Set(inPart.map((l) => `${l.tabId}|${istanbulDay(l.at)}`)).size,
      top: [...report.products]
        .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
        .slice(0, n)
        .map((p) => ({ name: p.name, quantity: p.quantity })),
    };
  });
}
