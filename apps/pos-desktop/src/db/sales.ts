// Shifts, tabs (hesap) and payments. A quick sale is a tab of kind "quick"
// that is opened with the first product and closed by payment (plan §8), so
// a sale survives a crash and removed lines are kept as void records.
import {
  assertKurus,
  assertPercent,
  type Payment,
  type PaymentMethod,
  type Product,
  type Refund,
  type Shift,
  type ShiftSummary,
  shiftSummary,
  sumKurus,
  type Tab,
  type TabItem,
  type TabKind,
  tabTotals,
  type TabTotals,
} from '@crumble/shared';
import { type Context, fromDb, getRow, insertRow, stamps, tx, updateRow } from './database';
import { emitSaleCompleted } from './events';
import { getTable } from './floor';

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export function getOpenShift(ctx: Context): Shift | null {
  return (ctx.db.prepare('select * from shifts where closed_at is null').get() as Shift | undefined) ?? null;
}

function requireOpenShift(ctx: Context): Shift {
  const shift = getOpenShift(ctx);
  if (!shift) throw new Error('Açık vardiya yok. Önce vardiyayı açın.');
  return shift;
}

/** Opens a shift. The cash drawer is not counted (2026-10-29), so the opening cash is 0 by default. */
export function openShift(ctx: Context, openingCash = 0): Shift {
  assertKurus(openingCash);
  if (openingCash < 0) throw new Error('Açılış kasası negatif olamaz.');
  return tx(ctx, () => {
    if (getOpenShift(ctx)) throw new Error('Zaten açık bir vardiya var.');
    const s = stamps(ctx);
    return insertRow<Shift>(ctx, 'shifts', {
      ...s,
      opened_at: s.created_at,
      closed_at: null,
      opening_cash: openingCash,
      counted_cash: null,
      expected_cash: null,
      cash_difference: null,
      notes: null,
    });
  });
}

/** Summary of a shift so far (or final, if closed). */
export function getShiftSummary(ctx: Context, shiftId: string): ShiftSummary {
  const shift = getRow<Shift>(ctx, 'shifts', shiftId);
  if (!shift) throw new Error('Vardiya bulunamadı.');
  const payments = ctx.db.prepare('select method, amount from payments where shift_id = ?').all(shiftId) as Pick<
    Payment,
    'method' | 'amount'
  >[];
  const refunds = ctx.db.prepare('select method, amount from refunds where shift_id = ?').all(shiftId) as Pick<
    Refund,
    'method' | 'amount'
  >[];
  const closedTabs = (
    ctx.db.prepare("select * from tabs where closed_shift_id = ? and status <> 'open'").all(shiftId) as Tab[]
  ).map((tab) => ({ ...tab, items: listItems(ctx, tab.id) }));
  return shiftSummary({ openingCash: shift.opening_cash, countedCash: shift.counted_cash, payments, refunds, closedTabs });
}

export interface CloseShiftResult {
  shift: Shift;
  summary: ShiftSummary;
  /** Open tabs carried over to the next shift. */
  carriedOverTabs: number;
}

export interface CloseShiftInput {
  /**
   * Open tabs the cashier decided to carry over (devret). Every tab still
   * open must be listed: the day cannot end before each open tab is paid,
   * voided or carried over (2026-10-29).
   */
  carryOverTabIds?: readonly string[];
  notes?: string | null;
}

/**
 * Closes the open shift (gün sonu). There is no cash count: expected cash is
 * stored for information, counted cash and difference stay empty. Carried
 * over tabs stay open and are paid in a later shift (payments count in the
 * shift they are taken in).
 */
export function closeShift(ctx: Context, input: CloseShiftInput = {}): CloseShiftResult {
  return tx(ctx, () => {
    const shift = requireOpenShift(ctx);
    const carry = new Set(input.carryOverTabIds ?? []);
    const undecided = listOpenTabs(ctx).filter((t) => !carry.has(t.id));
    if (undecided.length > 0) {
      throw new Error(`Gün sonu için önce açık hesaplara karar verin: ${undecided.map((t) => tabTitle(ctx, t)).join(', ')}.`);
    }
    const summary = getShiftSummary(ctx, shift.id);
    const closed = updateRow<Shift>(ctx, 'shifts', shift.id, {
      closed_at: ctx.clock.now(),
      counted_cash: null,
      expected_cash: summary.expectedCash,
      cash_difference: null,
      notes: input.notes?.trim() || null,
    });
    return { shift: closed, summary, carriedOverTabs: carry.size };
  });
}

export function listShifts(ctx: Context, limit = 60): Shift[] {
  return ctx.db.prepare('select * from shifts order by opened_at desc limit ?').all(limit) as Shift[];
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export interface TabDetail {
  tab: Tab;
  items: TabItem[];
  payments: Payment[];
  totals: TabTotals;
  paid: number;
  remaining: number;
}

function listItems(ctx: Context, tabId: string): TabItem[] {
  return ctx.db
    .prepare('select * from tab_items where tab_id = ? order by created_at, rowid')
    .all(tabId)
    .map((row) => fromDb<TabItem>('tab_items', row));
}

function paidAmount(ctx: Context, tabId: string): number {
  const paid = (ctx.db.prepare('select coalesce(sum(amount), 0) as s from payments where tab_id = ?').get(tabId) as { s: number }).s;
  const refunded = (ctx.db.prepare('select coalesce(sum(amount), 0) as s from refunds where tab_id = ?').get(tabId) as { s: number }).s;
  return paid - refunded;
}

export function getTab(ctx: Context, tabId: string): TabDetail {
  const tab = getRow<Tab>(ctx, 'tabs', tabId);
  if (!tab) throw new Error('Hesap bulunamadı.');
  const items = listItems(ctx, tabId);
  const payments = ctx.db.prepare('select * from payments where tab_id = ? order by paid_at').all(tabId) as Payment[];
  const totals = tabTotals(items, tab.discount_percent);
  const paid = paidAmount(ctx, tabId);
  return { tab, items, payments, totals, paid, remaining: totals.total - paid };
}

function requireOpenTab(ctx: Context, tabId: string): Tab {
  const tab = getRow<Tab>(ctx, 'tabs', tabId);
  if (!tab) throw new Error('Hesap bulunamadı.');
  if (tab.status !== 'open') throw new Error('Hesap kapanmış.');
  return tab;
}

export interface NewTab {
  kind: TabKind;
  table_id?: string | null;
  customer_name?: string | null;
}

function requireFreeTable(ctx: Context, tableId: string, exceptTabId?: string): void {
  const table = getTable(ctx, tableId);
  const busy = ctx.db
    .prepare("select id from tabs where table_id = ? and status = 'open' and id <> ?")
    .get(tableId, exceptTabId ?? '') as { id: string } | undefined;
  if (busy) throw new Error(`Masa ${table.label} üzerinde zaten açık hesap var.`);
}

export function openTab(ctx: Context, input: NewTab): Tab {
  return tx(ctx, () => {
    const shift = requireOpenShift(ctx);
    if (input.kind === 'table') {
      if (!input.table_id) throw new Error('Masa seçilmedi.');
      requireFreeTable(ctx, input.table_id);
    } else if (input.kind === 'named') {
      if (!input.customer_name?.trim()) throw new Error('İsim girin.');
    }
    if (input.table_id && input.kind !== 'table') requireFreeTable(ctx, input.table_id);
    const s = stamps(ctx);
    return insertRow<Tab>(ctx, 'tabs', {
      ...s,
      opened_shift_id: shift.id,
      closed_shift_id: null,
      kind: input.kind,
      table_id: input.table_id ?? null,
      customer_name: input.customer_name?.trim() || null,
      status: 'open',
      discount_percent: null,
      total: null,
      opened_at: s.created_at,
      closed_at: null,
    });
  });
}

/** Moves a tab to another table (or gives a named tab a table). */
export function moveTab(ctx: Context, tabId: string, tableId: string): Tab {
  return tx(ctx, () => {
    requireOpenTab(ctx, tabId);
    requireFreeTable(ctx, tableId, tabId);
    return updateRow<Tab>(ctx, 'tabs', tabId, { table_id: tableId });
  });
}

/** Sets or clears the customer name; a named tab must keep one. */
export function setCustomerName(ctx: Context, tabId: string, name: string | null): Tab {
  return tx(ctx, () => {
    const tab = requireOpenTab(ctx, tabId);
    const clean = name?.trim() || null;
    if (!clean && tab.kind === 'named') throw new Error('İsimle açılan hesabın ismi silinemez.');
    return updateRow<Tab>(ctx, 'tabs', tabId, { customer_name: clean });
  });
}

export interface OpenTabSummary {
  tab: Tab;
  title: string;
  tableLabel: string | null;
  total: number;
  remaining: number;
  itemCount: number;
  /** "2 Cafe Latte, Su" for the tab cards. */
  itemsText: string;
  /** Opened in an earlier shift and carried over (devredildi). */
  carriedOver: boolean;
}

/** Open tabs with their running totals (tabs list, floor map). */
function itemsText(items: readonly TabItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.voided_at) counts.set(item.name_snapshot, (counts.get(item.name_snapshot) ?? 0) + item.quantity);
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${n} ${name}` : name)).join(', ');
}

/** Short name of a tab for lists and messages: table label, customer name or "Hızlı satış". */
export function tabTitle(ctx: Context, tab: Tab): string {
  const label = tab.table_id
    ? (ctx.db.prepare('select label from tables where id = ?').pluck().get(tab.table_id) as string | undefined)
    : undefined;
  const place = label === undefined ? undefined : /^\d+$/.test(label) ? `Masa ${label}` : label;
  if (place && tab.customer_name) return `${place} · ${tab.customer_name}`;
  return place ?? tab.customer_name ?? 'Hızlı satış';
}

/** Open table and named tabs; with includeQuick also an unfinished quick sale (for the day end). */
export function listOpenTabSummaries(ctx: Context, includeQuick = false): OpenTabSummary[] {
  const shiftId = getOpenShift(ctx)?.id;
  return listOpenTabs(ctx)
    .filter((tab) => includeQuick || tab.kind !== 'quick')
    .map((tab) => {
      const detail = getTab(ctx, tab.id);
      const label = tab.table_id
        ? (ctx.db.prepare('select label from tables where id = ?').pluck().get(tab.table_id) as string)
        : null;
      return {
        tab,
        title: tabTitle(ctx, tab),
        tableLabel: label,
        total: detail.totals.total,
        remaining: detail.remaining,
        itemCount: detail.totals.itemCount,
        itemsText: itemsText(detail.items),
        carriedOver: !!shiftId && tab.opened_shift_id !== shiftId,
      };
    });
}

export function listOpenTabs(ctx: Context): Tab[] {
  return ctx.db.prepare("select * from tabs where status = 'open' order by opened_at").all() as Tab[];
}

/** The unfinished quick sale, if any (e.g. after a restart). */
export function getOpenQuickTab(ctx: Context): Tab | null {
  return (
    (ctx.db.prepare("select * from tabs where status = 'open' and kind = 'quick' order by opened_at desc limit 1").get() as
      | Tab
      | undefined) ?? null
  );
}

/**
 * Adds one of a product. Clicking the same product again raises the quantity
 * of its plain line (same price, no discount, not comp, no note).
 */
export function addProduct(ctx: Context, tabId: string, productId: string): TabItem {
  return tx(ctx, () => {
    requireOpenTab(ctx, tabId);
    const product = getRow<Product>(ctx, 'products', productId);
    if (!product || product.deleted_at) throw new Error('Ürün bulunamadı.');
    if (!product.is_active) throw new Error('Ürün pasif.');
    const plain = ctx.db
      .prepare(
        `select * from tab_items where tab_id = ? and product_id = ? and voided_at is null
         and unit_price = ? and list_price = ? and discount_percent is null and is_comp = 0 and note is null
         order by created_at desc limit 1`,
      )
      .get(tabId, productId, product.price, product.price) as TabItem | undefined;
    if (plain) {
      return updateRow<TabItem>(ctx, 'tab_items', plain.id, { quantity: plain.quantity + 1 });
    }
    return insertRow<TabItem>(ctx, 'tab_items', {
      ...stamps(ctx),
      tab_id: tabId,
      product_id: product.id,
      name_snapshot: product.name,
      list_price: product.price,
      unit_price: product.price,
      quantity: 1,
      discount_percent: null,
      is_comp: false,
      note: null,
      voided_at: null,
      void_reason: null,
    });
  });
}

/** After a change: the tab must not drop below what was already paid. */
function assertNotBelowPaid(ctx: Context, tabId: string): void {
  if (getTab(ctx, tabId).remaining < 0) {
    throw new Error('Hesap, alınmış ödemenin altına düşürülemez.');
  }
}

function requireEditableItem(ctx: Context, itemId: string): TabItem {
  const item = getRow<TabItem>(ctx, 'tab_items', itemId);
  if (!item) throw new Error('Kalem bulunamadı.');
  requireOpenTab(ctx, item.tab_id);
  if (item.voided_at) throw new Error('Kalem iptal edilmiş.');
  return item;
}

/**
 * What the line actions panel can change. Line discount and ikram are not
 * used (2026-10-29: discount only on the cart, no ikram); their columns stay
 * for older records and reports.
 */
export interface ItemPatch {
  quantity?: number;
  unit_price?: number;
  note?: string | null;
}

export function updateItem(ctx: Context, itemId: string, patch: ItemPatch): TabItem {
  return tx(ctx, () => {
    requireEditableItem(ctx, itemId);
    const changes: Record<string, unknown> = {};
    if (patch.quantity !== undefined) {
      if (!Number.isInteger(patch.quantity) || patch.quantity < 1 || patch.quantity > 999) {
        throw new Error('Adet 1 ile 999 arasında olmalı.');
      }
      changes.quantity = patch.quantity;
    }
    if (patch.unit_price !== undefined) {
      assertKurus(patch.unit_price);
      if (patch.unit_price < 0) throw new Error('Fiyat negatif olamaz.');
      changes.unit_price = patch.unit_price;
    }
    if (patch.note !== undefined) changes.note = patch.note?.trim() || null;
    const updated = updateRow<TabItem>(ctx, 'tab_items', itemId, changes);
    assertNotBelowPaid(ctx, updated.tab_id);
    return updated;
  });
}

/** Removes a line from an open tab; it stays as a void record (plan §5.2). */
export function voidItem(ctx: Context, itemId: string, reason?: string | null): TabItem {
  return tx(ctx, () => {
    requireEditableItem(ctx, itemId);
    const updated = updateRow<TabItem>(ctx, 'tab_items', itemId, {
      voided_at: ctx.clock.now(),
      void_reason: reason?.trim() || null,
    });
    assertNotBelowPaid(ctx, updated.tab_id);
    return updated;
  });
}

export function setTabDiscount(ctx: Context, tabId: string, percent: number | null): Tab {
  return tx(ctx, () => {
    requireOpenTab(ctx, tabId);
    if (percent !== null) assertPercent(percent);
    const updated = updateRow<Tab>(ctx, 'tabs', tabId, { discount_percent: percent });
    assertNotBelowPaid(ctx, tabId);
    return updated;
  });
}

export interface PaymentPart {
  method: PaymentMethod;
  amount: number;
}

export interface PayResult {
  detail: TabDetail;
  closed: boolean;
}

/**
 * Takes payments for a tab in the current shift. Mixed payment = one row per
 * method. Paying the full remaining amount closes the tab (status paid, total
 * frozen) and fires onSaleCompleted; less keeps it open (partial payment).
 */
export function pay(ctx: Context, tabId: string, parts: readonly PaymentPart[]): PayResult {
  const result = tx(ctx, () => {
    const shift = requireOpenShift(ctx);
    requireOpenTab(ctx, tabId);
    const before = getTab(ctx, tabId);
    const nonZero = parts.filter((p) => p.amount !== 0);
    for (const part of nonZero) {
      assertKurus(part.amount);
      if (part.amount < 0) throw new Error('Ödeme tutarı negatif olamaz.');
      if (part.method !== 'cash' && part.method !== 'card') throw new Error('Geçersiz ödeme yöntemi.');
    }
    const amount = sumKurus(nonZero.map((p) => p.amount));
    if (before.totals.itemCount === 0) throw new Error('Hesapta ürün yok.');
    if (amount > before.remaining) throw new Error('Ödeme, kalan tutardan fazla olamaz.');
    if (amount === 0 && before.remaining > 0) throw new Error('Ödeme tutarı girin.');

    const now = ctx.clock.now();
    for (const part of nonZero) {
      insertRow<Payment>(ctx, 'payments', {
        ...stamps(ctx),
        tab_id: tabId,
        shift_id: shift.id,
        method: part.method,
        amount: part.amount,
        paid_at: now,
      });
    }
    const closed = amount === before.remaining;
    if (closed) {
      updateRow<Tab>(ctx, 'tabs', tabId, {
        status: 'paid',
        closed_at: now,
        closed_shift_id: shift.id,
        total: before.totals.total,
      });
    }
    return { detail: getTab(ctx, tabId), closed };
  });
  if (result.closed) emitSaleCompleted({ tabId, total: result.detail.totals.total });
  return result;
}

/**
 * Cancels a tab that never took money (plan §5.5). A tab with payments must
 * be refunded first (Faz 4).
 */
export function voidTab(ctx: Context, tabId: string): Tab {
  return tx(ctx, () => {
    const shift = requireOpenShift(ctx);
    requireOpenTab(ctx, tabId);
    if (paidAmount(ctx, tabId) !== 0) {
      throw new Error('Ödemesi alınmış hesap iptal edilemez. Önce iade yapın.');
    }
    return updateRow<Tab>(ctx, 'tabs', tabId, {
      status: 'void',
      closed_at: ctx.clock.now(),
      closed_shift_id: shift.id,
    });
  });
}

/** Closed tabs of a shift, newest first (for the sales list). */
export function listClosedTabs(ctx: Context, shiftId: string): Tab[] {
  return ctx.db
    .prepare("select * from tabs where closed_shift_id = ? and status <> 'open' order by closed_at desc")
    .all(shiftId) as Tab[];
}
