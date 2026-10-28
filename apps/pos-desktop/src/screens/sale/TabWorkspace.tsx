import type { Category, Product, TabItem } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useAction } from '../../components/useApi';
import type { PayResult, TabDetail } from '../../db/sales';
import { Cart } from './Cart';
import { LineActions } from './LineActions';
import { PaymentDialog } from './PaymentDialog';
import { ProductPicker } from './ProductPicker';

/**
 * Product grid + line actions/keypad + cart + payment for one tab. Used for
 * quick sales and for table/named tabs.
 */
export function TabWorkspace({
  title,
  detail,
  setDetail,
  ensureTab,
  categories,
  products,
  allowPartial = false,
  onClosed,
  onCancelTab,
  extraActions,
}: {
  title: string;
  detail: TabDetail | null;
  setDetail(detail: TabDetail | null): void;
  /** Returns the tab to add to, opening it if needed. */
  ensureTab(): Promise<TabDetail>;
  categories: Category[];
  products: Product[];
  allowPartial?: boolean;
  onClosed(result: PayResult, change: number): void;
  onCancelTab?(): void;
  extraActions?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const run = useAction();
  const toast = useToast();

  const selected: TabItem | null =
    detail?.items.find((i) => i.id === selectedId && !i.voided_at) ?? null;

  const canPay = !!detail && detail.totals.itemCount > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (paying) return;
      if (e.key === 'F12') {
        e.preventDefault();
        if (canPay) setPaying(true);
      } else if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (onCancelTab && detail && detail.totals.itemCount > 0) onCancelTab();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const pick = (product: Product) =>
    run(async () => {
      const tab = await ensureTab();
      setDetail(await api.addProduct(tab.tab.id, product.id));
    });

  return (
    <div className="sale">
      <ProductPicker categories={categories} products={products} onPick={(p) => void pick(p)} />
      <LineActions
        detail={detail}
        item={selected}
        inactive={paying}
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
          setCartDiscount: async (percent) => {
            if (!detail) return;
            const next = await run(() => api.setTabDiscount(detail.tab.id, percent));
            if (next) setDetail(next);
          },
          cancelTab: onCancelTab,
        }}
      />
      <Cart
        title={title}
        detail={detail}
        selectedItemId={selectedId}
        onSelect={(item) => setSelectedId(item?.id ?? null)}
        footer={
          <>
            {extraActions}
            <button className="btn primary big pay-btn" disabled={!canPay} onClick={() => setPaying(true)}>
              Ödeme (F12)
            </button>
          </>
        }
      />
      {paying && detail && (
        <PaymentDialog
          due={detail.remaining}
          allowPartial={allowPartial}
          onClose={() => setPaying(false)}
          onPay={async (parts, change) => {
            const result = await run(() => api.pay(detail.tab.id, parts));
            if (!result) return false;
            setPaying(false);
            setSelectedId(null);
            if (result.closed) {
              onClosed(result, change);
            } else {
              setDetail(result.detail);
              toast.info(`Ödeme alındı. Kalan: ${formatTL(result.detail.remaining)}`);
            }
            return true;
          }}
        />
      )}
    </div>
  );
}
