// Refunds (iade, plan §5.5). A completed sale is never changed: a refund row
// linked to the tab (and optionally one line) is added in the current shift,
// cash or card according to how the sale was paid. A tab that took money
// cannot be voided; refund it first.
import {
  assertKurus,
  lineNetAfterCartDiscount,
  type Payment,
  type PaymentMethod,
  PAYMENT_METHODS,
  type Refund,
  sumKurus,
  type Tab,
} from '@crumble/shared';
import { type Context, getRow, insertRow, stamps, tx } from './database';
import { getOpenShift, getTab, voidTab } from './sales';

export interface RefundableItem {
  itemId: string;
  name: string;
  quantity: number;
  /** What was effectively paid for the line (after its share of the cart discount). */
  net: number;
  refunded: number;
  refundable: number;
}

export interface RefundInfo {
  paid: Record<PaymentMethod, number>;
  refunded: Record<PaymentMethod, number>;
  refundable: Record<PaymentMethod, number>;
  totalRefundable: number;
  items: RefundableItem[];
  refunds: Refund[];
}

export function listRefunds(ctx: Context, tabId: string): Refund[] {
  return ctx.db.prepare('select * from refunds where tab_id = ? order by created_at').all(tabId) as Refund[];
}

export function getRefundInfo(ctx: Context, tabId: string): RefundInfo {
  const detail = getTab(ctx, tabId);
  const refunds = listRefunds(ctx, tabId);
  const byMethod = (rows: readonly (Payment | Refund)[], method: PaymentMethod) =>
    sumKurus(rows.filter((r) => r.method === method).map((r) => r.amount));
  const paid = { cash: byMethod(detail.payments, 'cash'), card: byMethod(detail.payments, 'card') };
  const refunded = { cash: byMethod(refunds, 'cash'), card: byMethod(refunds, 'card') };
  const refundable = { cash: paid.cash - refunded.cash, card: paid.card - refunded.card };
  const totalRefundable = refundable.cash + refundable.card;
  const items = detail.items
    .filter((item) => !item.voided_at)
    .map((item) => {
      const net = lineNetAfterCartDiscount(item, detail.tab.discount_percent);
      const itemRefunded = sumKurus(refunds.filter((r) => r.tab_item_id === item.id).map((r) => r.amount));
      return {
        itemId: item.id,
        name: item.name_snapshot,
        quantity: item.quantity,
        net,
        refunded: itemRefunded,
        refundable: Math.max(0, Math.min(net - itemRefunded, totalRefundable)),
      };
    });
  return { paid, refunded, refundable, totalRefundable, items, refunds };
}

function requireShift(ctx: Context) {
  const shift = getOpenShift(ctx);
  if (!shift) throw new Error('İade için açık vardiya gerekli.');
  return shift;
}

function insertRefund(
  ctx: Context,
  tabId: string,
  shiftId: string,
  method: PaymentMethod,
  amount: number,
  itemId: string | null,
  reason: string | null,
): Refund {
  return insertRow<Refund>(ctx, 'refunds', {
    ...stamps(ctx),
    tab_id: tabId,
    tab_item_id: itemId,
    shift_id: shiftId,
    amount,
    method,
    reason,
  });
}

/** Refunds everything still refundable, one row per payment method. */
export function refundAll(ctx: Context, tabId: string, reason?: string | null): Refund[] {
  return tx(ctx, () => {
    const shift = requireShift(ctx);
    const info = getRefundInfo(ctx, tabId);
    if (info.totalRefundable === 0) throw new Error('İade edilecek ödeme yok.');
    return PAYMENT_METHODS.filter((m) => info.refundable[m] > 0).map((m) =>
      insertRefund(ctx, tabId, shift.id, m, info.refundable[m], null, reason?.trim() || null),
    );
  });
}

export interface PartialRefund {
  amount: number;
  method: PaymentMethod;
  itemId?: string | null;
  reason?: string | null;
}

/** Refunds part of a sale, optionally tied to one line. */
export function refundPart(ctx: Context, tabId: string, input: PartialRefund): Refund {
  return tx(ctx, () => {
    const shift = requireShift(ctx);
    assertKurus(input.amount);
    if (input.amount <= 0) throw new Error('İade tutarı girin.');
    if (!PAYMENT_METHODS.includes(input.method)) throw new Error('Geçersiz yöntem.');
    if (!getRow(ctx, 'tabs', tabId)) throw new Error('Hesap bulunamadı.');
    const info = getRefundInfo(ctx, tabId);
    if (input.amount > info.refundable[input.method]) {
      const label = input.method === 'cash' ? 'nakit' : 'kart';
      throw new Error(`En fazla ${label} ile ödenen kadar iade edilebilir.`);
    }
    if (input.itemId) {
      const item = info.items.find((i) => i.itemId === input.itemId);
      if (!item) throw new Error('Kalem bu hesaba ait değil veya iptal edilmiş.');
      if (input.amount > item.net - item.refunded) throw new Error('Tutar, kalemin iade edilebilir tutarından fazla.');
    }
    return insertRefund(ctx, tabId, shift.id, input.method, input.amount, input.itemId ?? null, input.reason?.trim() || null);
  });
}

export interface SaleRow {
  tabId: string;
  kind: string;
  status: 'paid' | 'void';
  label: string;
  closedAt: string;
  total: number;
  cash: number;
  card: number;
  refunded: number;
  itemCount: number;
}

/** Closed tabs (sales and voided tabs) of a shift, newest first, for the Satışlar screen. */
export function listSales(ctx: Context, shiftId: string): SaleRow[] {
  const tabs = ctx.db
    .prepare(
      `select t.*, tb.label as table_label from tabs t left join tables tb on tb.id = t.table_id
       where t.closed_shift_id = ? and t.status <> 'open' order by t.closed_at desc`,
    )
    .all(shiftId) as (Tab & { table_label: string | null })[];
  return tabs.map((tab) => {
    const detail = getTab(ctx, tab.id);
    const refunds = listRefunds(ctx, tab.id);
    const sum = (method: PaymentMethod) =>
      sumKurus(detail.payments.filter((p) => p.method === method).map((p) => p.amount));
    const label =
      [tab.table_label && `Masa ${tab.table_label}`, tab.customer_name].filter(Boolean).join(' · ') ||
      (tab.kind === 'quick' ? 'Hızlı satış' : 'Hesap');
    return {
      tabId: tab.id,
      kind: tab.kind,
      status: tab.status as 'paid' | 'void',
      label,
      closedAt: tab.closed_at!,
      total: tab.status === 'paid' ? tab.total! : detail.totals.total,
      cash: sum('cash'),
      card: sum('card'),
      refunded: sumKurus(refunds.map((r) => r.amount)),
      itemCount: detail.totals.itemCount,
    };
  });
}

/** Cancels an open tab that already took money: refunds it, then voids it, atomically. */
export function refundAndVoid(ctx: Context, tabId: string, reason?: string | null): void {
  tx(ctx, () => {
    if (getRefundInfo(ctx, tabId).totalRefundable > 0) refundAll(ctx, tabId, reason);
    voidTab(ctx, tabId);
  });
}
