import type { PaymentMethod, Shift } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { useAction, useApiData, useCatalogVersion } from '../components/useApi';
import type { TabDetail } from '../db/sales';
import { OpenShiftPanel } from './Shift';
import { TabWorkspace } from './sale/TabWorkspace';

export function Sale({ shift, onShiftChange }: { shift: Shift | null; onShiftChange(): void }) {
  const catalogVersion = useCatalogVersion();
  const [categories] = useApiData(() => api.listCategories());
  const [products] = useApiData(() => api.listProducts(), [catalogVersion]);
  const [detail, setDetail] = useState<TabDetail | null>(null);
  const [lastSale, setLastSale] = useState<{ total: number; method: PaymentMethod } | null>(null);
  const run = useAction();
  const toast = useToast();
  // The quick tab being filled. Opening it is async, so rapid clicks must all
  // land in the same tab: keep the promise until the sale is closed or cancelled.
  const current = useRef<Promise<TabDetail> | null>(null);
  const finish = () => {
    current.current = null;
    setDetail(null);
  };

  // Resume an unfinished quick sale (e.g. after a restart).
  useEffect(() => {
    if (!shift) return;
    void run(async () => {
      const open = await api.getOpenQuickTab();
      setDetail(open ? await api.getTab(open.id) : null);
    });
  }, [shift?.id]);

  if (!shift) return <OpenShiftPanel onOpened={onShiftChange} />;
  if (!categories || !products) return null;

  return (
    <TabWorkspace
      title="Hızlı satış"
      detail={detail}
      setDetail={(d) => {
        setDetail(d);
        if (d) setLastSale(null);
      }}
      ensureTab={() => {
        if (detail) return Promise.resolve(detail);
        current.current ??= api.openTab({ kind: 'quick' }).then((tab) => api.getTab(tab.id));
        current.current.catch(() => {
          current.current = null;
        });
        return current.current;
      }}
      categories={categories}
      products={products}
      onClosed={(result, method) => {
        finish();
        setLastSale({ total: result.detail.totals.total, method });
        toast.info(`Satış tamamlandı: ${formatTL(result.detail.totals.total)} · ${method === 'cash' ? 'nakit' : 'kart'}`);
      }}
      onCancelTab={() => {
        if (!detail || !window.confirm('Satış iptal edilsin mi? İptal kaydı tutulur.')) return;
        void run(async () => {
          await api.voidTab(detail.tab.id);
          finish();
        }, 'Satış iptal edildi.');
      }}
      extraActions={
        lastSale && (
          <div className="last-sale" data-testid="last-sale">
            Son satış {formatTL(lastSale.total)} · {lastSale.method === 'cash' ? 'nakit' : 'kart'}
          </div>
        )
      }
    />
  );
}
