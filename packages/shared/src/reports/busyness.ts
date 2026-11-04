// Kafe yoğunluğu (2026-11-04, kullanıcı isteği): "Sakin / Hafif yoğun / Yoğun /
// Çok yoğun", from the orders that came in during the last 30 minutes. Each
// line adds quantity × weight points: a tea 1, a coffee or a cake 2, a meal 3
// (it keeps the kitchen busy longest); soup (2) and waffle (1) are ready to
// serve. Lines added and then removed (voided) and cancelled tabs do not
// count. A quantity raised later on the same line counts at the line's first
// time (approximation).
import type { Category, Product, Tab, TabItem } from '../types';

export type BusyLevel = 0 | 1 | 2 | 3;
export const BUSY_LABELS = ['Sakin', 'Hafif yoğun', 'Yoğun', 'Çok yoğun'] as const;
export const BUSY_WINDOW_MINUTES = 30;
/** Points in the window at which Hafif yoğun, Yoğun and Çok yoğun start. */
export const BUSY_THRESHOLDS = [12, 30, 50] as const;

const lower = (s: string) => s.toLocaleLowerCase('tr');

/** Meals: 3. Coffee-bar drinks, cakes, soup: 2. Tea, waffle, bottled drinks, packaged snacks: 1. */
export function busyWeight(productName: string, categoryName: string | undefined): number {
  const name = lower(productName);
  const category = lower(categoryName ?? '');
  // Ready to serve (2026-11-04, kullanıcı): waffle 1, soup 2.
  if (/waffle/.test(name)) return 1;
  if (/çorba/.test(name)) return 2;
  if (/tost|baget|makarna|kase|granola/.test(name) || /tost|baget|makarna/.test(category)) return 3;
  if (/latte|mocha|matcha|frappe|americano|espresso|cappuccino|flat white|macchiato|filtre|kahve|çikolata|salep/.test(name)) return 2;
  if (/çay/.test(name)) return 1;
  if (/kahve|matcha|detox|kış|teşhir|vitrin/.test(category)) return 2;
  return 1;
}

export interface Busyness {
  level: BusyLevel;
  label: (typeof BUSY_LABELS)[number];
  points: number;
  /** Tabs that ordered something in the window. */
  orders: number;
}

export function busyLevel(points: number): BusyLevel {
  return BUSY_THRESHOLDS.filter((t) => points >= t).length as BusyLevel;
}

export function busyness(
  items: TabItem[],
  catalog: { products: Product[]; categories: Category[] },
  tabs: Pick<Tab, 'id' | 'status'>[],
  now: string,
): Busyness {
  const since = Date.parse(now) - BUSY_WINDOW_MINUTES * 60_000;
  const categoryOf = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const productCategory = new Map(catalog.products.map((p) => [p.id, categoryOf.get(p.category_id)]));
  const voidTabs = new Set(tabs.filter((t) => t.status === 'void').map((t) => t.id));
  let points = 0;
  const orders = new Set<string>();
  for (const item of items) {
    const at = Date.parse(item.created_at);
    if (item.voided_at || voidTabs.has(item.tab_id) || at < since || at > Date.parse(now)) continue;
    points += item.quantity * busyWeight(item.name_snapshot, productCategory.get(item.product_id));
    orders.add(item.tab_id);
  }
  const level = busyLevel(points);
  return { level, label: BUSY_LABELS[level], points, orders: orders.size };
}
