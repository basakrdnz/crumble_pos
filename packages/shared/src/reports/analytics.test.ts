import { describe, expect, it } from 'vitest';
import type { Shift, Tab, TabItem } from '../types';
import {
  compareSoFar,
  daypartTops,
  heatmap,
  hourlyRevenue,
  istanbulMinute,
  openHoursByDay,
  percentChange,
  periodKpis,
  productTrends,
  weekdayIndex,
} from './analytics';

const base = { created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z' };
// Istanbul is UTC+3: "10:30" local on a day = 07:30Z.
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + ((h! - 3) * 60 + m!) * 60_000).toISOString();
};
let n = 0;
const sale = (day: string, hhmm: string, total: number, extra: Partial<Tab> = {}): Tab => ({
  ...base, id: `t${++n}`, opened_shift_id: 's', closed_shift_id: 's', kind: 'quick', table_id: null, customer_name: null,
  status: 'paid', discount_percent: null, total, opened_at: at(day, hhmm), closed_at: at(day, hhmm), ...extra,
});
const shift = (day: string, open: string, close: string | null): Shift => ({
  ...base, id: `s-${day}`, opened_at: at(day, open), closed_at: close ? at(day, close) : null, opening_cash: 0,
  counted_cash: null, expected_cash: 0, cash_difference: null, notes: null,
});
const item = (tab: Tab, productId: string, qty: number, price: number): TabItem => ({
  ...base, id: `${tab.id}-${productId}`, tab_id: tab.id, product_id: productId, name_snapshot: productId, list_price: price,
  unit_price: price, quantity: qty, discount_percent: null, is_comp: false, note: null, voided_at: null, void_reason: null,
});

describe('analytics basics', () => {
  it('weeks start on Monday and minutes are Istanbul time', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0); // Pazartesi
    expect(weekdayIndex('2026-11-08')).toBe(6); // Pazar
    expect(istanbulMinute(at('2026-11-02', '14:32'))).toBe(14 * 60 + 32);
    expect(percentChange(115, 100)).toBe(15);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe('Bugün: so far vs yesterday and last week', () => {
  it('compares up to the same time of day', () => {
    const tabs = [
      sale('2026-11-04', '09:00', 10000), // today
      sale('2026-11-04', '14:00', 5000),
      sale('2026-11-03', '10:00', 12000), // yesterday, before 14:32
      sale('2026-11-03', '18:00', 90000), // yesterday, later: not counted
      sale('2026-10-28', '11:00', 20000), // last Wednesday
      sale('2026-11-04', '13:00', 7000, { status: 'void' }),
    ];
    const c = compareSoFar(tabs, at('2026-11-04', '14:32'));
    expect(c.today).toEqual({ revenue: 15000, sales: 2 });
    expect(c.yesterday).toEqual({ revenue: 12000, sales: 1 });
    expect(c.vsYesterday).toBe(25);
    expect(c.vsLastWeek).toBe(-25);
    expect(hourlyRevenue(tabs, '2026-11-04')[9]).toBe(10000);
  });
});

describe('Saatler: heatmap from shift hours', () => {
  it('averages only over days the cafe was open in that hour', () => {
    // Two Mondays: open 09–12 and 09–17; Tuesday open 10–11.
    const shifts = [shift('2026-11-02', '09:00', '12:00'), shift('2026-11-09', '09:00', '17:00'), shift('2026-11-03', '10:00', '11:30')];
    expect([...openHoursByDay(shifts, at('2026-11-10', '00:00')).get('2026-11-02')!].sort((a, b) => a - b)).toEqual([9, 10, 11]);
    const tabs = [
      sale('2026-11-02', '09:10', 10000),
      sale('2026-11-09', '09:20', 30000),
      sale('2026-11-09', '16:30', 4000),
      sale('2026-11-03', '10:15', 2000),
    ];
    const h = heatmap(tabs, shifts, '2026-11-02', '2026-11-09', at('2026-11-10', '00:00'));
    expect(h.cells[0]![9]).toEqual({ revenue: 20000, sales: 1, days: 2 }); // (10000 + 30000) / 2 Mondays
    expect(h.cells[0]![16]).toEqual({ revenue: 4000, sales: 1, days: 1 }); // open only on one Monday
    expect(h.cells[0]![8]).toBeNull(); // never open
    expect(h.cells[1]![10]).toEqual({ revenue: 2000, sales: 1, days: 1 });
    expect([h.fromHour, h.toHour]).toEqual([9, 16]);
    expect(h.busiest).toMatchObject({ weekday: 0, hour: 9 });
    expect(h.quietest!.revenue).toBe(0);
  });
});

describe('Kıyas and Ürünler', () => {
  it('computes basket, discount rate and seated time', () => {
    const tabs = [
      sale('2026-11-02', '12:00', 20000),
      sale('2026-11-02', '13:00', 10000, { kind: 'table', opened_at: at('2026-11-02', '12:20') }),
    ];
    expect(periodKpis({ tabs }, { discount: 1000, void: 500 })).toEqual({
      revenue: 30000, sales: 2, avgBasket: 15000, discountPermille: 32, void: 500, avgTabMinutes: 40,
    });
  });

  it('shows product change vs the previous period and daypart best sellers', () => {
    const now1 = sale('2026-11-09', '09:00', 0);
    const now2 = sale('2026-11-09', '19:00', 0);
    const old = sale('2026-11-02', '09:00', 0);
    const catalog = {
      products: [
        { id: 'latte', name: 'Cafe Latte', category_id: 'c' },
        { id: 'tost', name: 'Kaşarlı Tost', category_id: 'c' },
      ],
      categories: [{ id: 'c', name: 'Kahve', sort_order: 0 }],
    };
    const current = { tabs: [now1, now2], items: [item(now1, 'latte', 2, 21500), item(now2, 'tost', 1, 25000)] };
    const previous = { tabs: [old], items: [item(old, 'latte', 1, 21500)] };
    const trends = productTrends(current, previous, catalog);
    expect(trends.find((t) => t.productId === 'latte')).toMatchObject({ revenue: 43000, change: 100 });
    expect(trends.find((t) => t.productId === 'tost')!.change).toBeNull(); // new
    const parts = daypartTops(current, catalog);
    expect(parts.find((p) => p.id === 'morning')!.top).toEqual([{ name: 'Cafe Latte', quantity: 2 }]);
    expect(parts.find((p) => p.id === 'evening')!.top).toEqual([{ name: 'Kaşarlı Tost', quantity: 1 }]);
  });
});
