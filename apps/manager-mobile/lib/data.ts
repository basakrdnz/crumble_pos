// Read-only queries for the manager app. Reports are computed on the phone
// with @crumble/shared (same rules as the POS); a "day" is the opening day of
// a shift (plan §4).
import {
  type CatalogChange,
  type Category,
  type Day,
  dayBounds,
  type FloorPlan,
  type FloorTable,
  type Payment,
  type Product,
  type Refund,
  type ReportData,
  type Shift,
  type Tab,
  type TabItem,
  tabTotals,
} from '@crumble/shared';
import { supabase } from './supabase';

const PAGE = 1000;
const CHUNK = 100;

async function all<T>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function byIds<T>(table: string, column: string, ids: readonly string[], order = 'created_at'): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    out.push(...(await all<T>(() => supabase.from(table).select('*').in(column, chunk).order(order).order('id'))));
  }
  return out;
}

/** Everything needed for reports of shifts opened between two Istanbul days (inclusive). */
export async function loadReportData(from: Day, to: Day): Promise<ReportData> {
  const shifts = await all<Shift>(() =>
    supabase
      .from('shifts')
      .select('*')
      .gte('opened_at', dayBounds(from).start)
      .lt('opened_at', dayBounds(to).end)
      .order('opened_at')
      .order('id'),
  );
  const ids = shifts.map((s) => s.id);
  if (ids.length === 0) return { shifts, tabs: [], items: [], payments: [], refunds: [] };
  const [tabs, payments, refunds] = await Promise.all([
    byIds<Tab>('tabs', 'closed_shift_id', ids),
    byIds<Payment>('payments', 'shift_id', ids),
    byIds<Refund>('refunds', 'shift_id', ids),
  ]);
  const items = await byIds<TabItem>('tab_items', 'tab_id', tabs.map((t) => t.id));
  return { shifts, tabs, items, payments, refunds };
}

export async function loadOpenTabs(): Promise<Tab[]> {
  return all<Tab>(() => supabase.from('tabs').select('*').eq('status', 'open').order('opened_at').order('id'));
}

/** Open tabs with their running total (tabs.total is only set at close). */
export async function loadOpenTabTotals(): Promise<{ tab: Tab; total: number }[]> {
  const tabs = await loadOpenTabs();
  const items = await byIds<TabItem>('tab_items', 'tab_id', tabs.map((t) => t.id));
  return tabs.map((tab) => ({ tab, total: tabTotals(items.filter((i) => i.tab_id === tab.id), tab.discount_percent).total }));
}

export interface DeviceStatus {
  last_sync_at: string;
  pending: number;
}

export async function loadDeviceStatus(): Promise<DeviceStatus | null> {
  const { data, error } = await supabase.from('device_status').select('last_sync_at, pending').eq('id', 'pos').limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as DeviceStatus | undefined) ?? null;
}

export interface Catalog {
  products: Product[];
  categories: Category[];
  tables: FloorTable[];
  floorPlans: FloorPlan[];
}

export async function loadCatalog(): Promise<Catalog> {
  const [products, categories, tables, floorPlans] = await Promise.all([
    all<Product>(() => supabase.from('products').select('*').order('sort_order').order('id')),
    all<Category>(() => supabase.from('categories').select('*').order('sort_order').order('id')),
    all<FloorTable>(() => supabase.from('tables').select('*').order('label').order('id')),
    all<FloorPlan>(() => supabase.from('floor_plans').select('*').order('sort_order').order('id')),
  ]);
  return { products, categories, tables, floorPlans };
}

export async function loadShifts(limit = 60): Promise<Shift[]> {
  const { data, error } = await supabase.from('shifts').select('*').order('opened_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as Shift[];
}

export async function loadChanges(limit = 300): Promise<CatalogChange[]> {
  const { data, error } = await supabase
    .from('catalog_changes')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as CatalogChange[];
}

export interface SaleDetail {
  tab: Tab;
  items: TabItem[];
  payments: Payment[];
  refunds: Refund[];
}

export async function loadSale(tabId: string): Promise<SaleDetail | null> {
  const { data, error } = await supabase.from('tabs').select('*').eq('id', tabId).limit(1);
  if (error) throw new Error(error.message);
  const tab = data?.[0] as Tab | undefined;
  if (!tab) return null;
  const [items, payments, refunds] = await Promise.all([
    byIds<TabItem>('tab_items', 'tab_id', [tabId]),
    byIds<Payment>('payments', 'tab_id', [tabId]),
    byIds<Refund>('refunds', 'tab_id', [tabId]),
  ]);
  return { tab, items, payments, refunds };
}

// ---------------------------------------------------------------------------
// Telefondan menü (2026-10-30): the only writes. They go through the menu_*
// database functions (partners only), which also log the change as "mobile".
// The POS pulls them within about 20 seconds when it is online.
// ---------------------------------------------------------------------------

async function rpc(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
}

export const setProductPrice = (productId: string, price: number) =>
  rpc('menu_set_price', { p_product: productId, p_price: price });

export const addMenuProduct = (id: string, categoryId: string, name: string, price: number) =>
  rpc('menu_add_product', { p_id: id, p_category: categoryId, p_name: name, p_price: price });

export const deleteMenuProduct = (productId: string) => rpc('menu_delete_product', { p_product: productId });
