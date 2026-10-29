import type { Category, PaymentMethod, Product, TabItem } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useAction } from '../../components/useApi';
import type { PayResult, TabDetail } from '../../db/sales';
import { Cart } from './Cart';
import { LineActions, type PadEntry } from './LineActions';
import { ProductPicker } from './ProductPicker';

const CASH_ICON = 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4';
const CARD_ICON = 'M3 6h18v12H3zM3 10h18M7 15h4';

function PayIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/**
 * Products | line panel | cart for one tab (S2 layout). Used for quick sales
 * and for table/named tabs. Payment has no dialog (2026-10-29): "Nakit
 * ödendi" (F11) and "Kartla ödendi" (F12) take the remaining amount, or the
 * typed partial amount when `allowPartial`.
 */
export function TabWorkspace({
  title,
  subtitle,
  tools,
  detail,
  setDetail,
  ensureTab,
  categories,
  products,
  allowPartial = false,
  onClosed,
  onCancelTab,
  cancelLabel = 'Satışı iptal et',
  extraActions,
}: {
  title: string;
  subtitle?: string;
  tools?: ReactNode;
  detail: TabDetail | null;
  setDetail(detail: TabDetail | null): void;
  /** Returns the tab to add to, opening it if needed. */
  ensureTab(): Promise<TabDetail>;
  categories: Category[];
  products: Product[];
  allowPartial?: boolean;
  onClosed(result: PayResult, method: PaymentMethod): void;
  onCancelTab?(): void;
  cancelLabel?: string;
  extraActions?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entry, setEntry] = useState<PadEntry | null>(null);
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useAction();
  const toast = useToast();

  const selected: TabItem | null = detail?.items.find((i) => i.id === selectedId && !i.voided_at) ?? null;
  const remaining = detail?.remaining ?? 0;
  const amount = payAmount !== null && payAmount < remaining ? payAmount : remaining;
  const canPay = !!detail && detail.totals.itemCount > 0 && !busy;

  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of detail?.items ?? []) {
      if (!item.voided_at) map.set(item.product_id, (map.get(item.product_id) ?? 0) + item.quantity);
    }
    return map;
  }, [detail]);

  // A changed total makes a typed partial amount stale.
  useEffect(() => setPayAmount(null), [detail?.tab.id, remaining]);

  const pay = async (method: PaymentMethod) => {
    if (!detail || !canPay) return;
    setBusy(true);
    const result = await run(() => api.pay(detail.tab.id, amount > 0 ? [{ method, amount }] : []));
    setBusy(false);
    if (!result) return;
    setSelectedId(null);
    setEntry(null);
    setPayAmount(null);
    if (result.closed) {
      onClosed(result, method);
    } else {
      setDetail(result.detail);
      toast.info(`${method === 'cash' ? 'Nakit' : 'Kart'} ödeme alındı. Kalan: ${formatTL(result.detail.remaining)}`);
    }
  };

  // Keys act on the latest render: a passive effect would re-register the
  // handler only after paint, so an F12 right after a discount change could
  // still pay the old amount.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.key === 'F11' || e.key === 'F12') {
      e.preventDefault();
      void pay(e.key === 'F11' ? 'cash' : 'card');
    } else if (e.key === 'Escape') {
      if (entry) setEntry(null);
      else if (selectedId) setSelectedId(null);
      else if (onCancelTab && detail && detail.totals.itemCount > 0) onCancelTab();
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const pick = (product: Product) =>
    run(async () => {
      const tab = await ensureTab();
      setDetail(await api.addProduct(tab.tab.id, product.id));
    });

  const setCartDiscount = async (percent: number | null) => {
    if (!detail) return;
    const next = await run(() => api.setTabDiscount(detail.tab.id, percent));
    if (next) setDetail(next);
  };

  return (
    <div className="sale">
      <ProductPicker categories={categories} products={products} inCart={inCart} onPick={(p) => void pick(p)} />
      <LineActions
        item={selected}
        entry={selected ? null : entry}
        onClose={() => {
          setSelectedId(null);
          setEntry(null);
        }}
        handlers={{
          updateItem: async (itemId, patch) => {
            const next = await run(() => api.updateItem(itemId, patch));
            if (next) setDetail(next);
          },
          voidItem: async (itemId, reason) => {
            const next = await run(() => api.voidItem(itemId, reason));
            if (next) {
              setDetail(next);
              setSelectedId(null);
            }
          },
          setCartDiscount,
          setPayAmount,
        }}
      />
      <Cart
        title={title}
        subtitle={subtitle}
        tools={tools}
        detail={detail}
        selectedItemId={selectedId}
        onSelect={(item) => {
          setSelectedId(item?.id ?? null);
          setEntry(null);
        }}
        onDiscount={(p) => {
          setEntry(null);
          void setCartDiscount(p);
        }}
        onTypeDiscount={() => {
          setSelectedId(null);
          setEntry({ kind: 'cartDiscount' });
        }}
        typingDiscount={entry?.kind === 'cartDiscount'}
        footer={
          <>
            {extraActions}
            {allowPartial && detail && detail.totals.itemCount > 0 && (
              <button
                className={`pay-amount${entry?.kind === 'payAmount' ? ' focus' : ''}`}
                onClick={() => {
                  setSelectedId(null);
                  setEntry({ kind: 'payAmount', max: remaining });
                }}
              >
                <span className="label">Alınacak tutar</span>
                <span className="value" data-testid="pay-amount">
                  {formatTL(amount)}
                  {amount === remaining && <span className="muted"> · kısmi için tıkla</span>}
                </span>
              </button>
            )}
            <button className="pay-btn cash" disabled={!canPay} onClick={() => void pay('cash')}>
              <PayIcon path={CASH_ICON} />
              Nakit ödendi
              <kbd>F11</kbd>
            </button>
            <button className="pay-btn card" disabled={!canPay} onClick={() => void pay('card')}>
              <PayIcon path={CARD_ICON} />
              Kartla ödendi
              <kbd>F12</kbd>
            </button>
            {onCancelTab && (
              <button className="btn small danger" disabled={!detail} onClick={onCancelTab}>
                {cancelLabel} (Esc)
              </button>
            )}
          </>
        }
      />
    </div>
  );
}
