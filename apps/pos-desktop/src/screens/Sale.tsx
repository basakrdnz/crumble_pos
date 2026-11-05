import type { PaymentMethod, Shift } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/Toast';
import { useAction, useApiData, useCatalogVersion, useTabsVersion } from '../components/useApi';
import type { OpenTabSummary, TabDetail } from '../db/sales';
import { OpenShiftPanel } from './Shift';
import { MoveDialog, openFor, TabScreen, type TabTarget } from './TabScreen';
import { TabWorkspace } from './sale/TabWorkspace';

export function Sale({ shift, onShiftChange }: { shift: Shift | null; onShiftChange(): void }) {
  const catalogVersion = useCatalogVersion();
  const tabsVersion = useTabsVersion();
  const [categories] = useApiData(() => api.listCategories());
  const [products] = useApiData(() => api.listProducts(), [catalogVersion]);
  const [tables] = useApiData(() => api.listTables());
  const [detail, setDetail] = useState<TabDetail | null>(null);
  const [lastSale, setLastSale] = useState<{ total: number; method: PaymentMethod } | null>(null);
  const [dialog, setDialog] = useState<'table' | 'name' | 'clear' | null>(null);
  // An open table/named tab picked from the list (2026-11-04): shown here, back returns to the quick sale.
  const [openTarget, setOpenTarget] = useState<TabTarget | null>(null);
  const [openTabs, reloadOpenTabs] = useApiData(() => api.listOpenTabSummaries(), [tabsVersion, openTarget]);
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
  if (!categories || !products || !tables) return null;
  if (openTarget) {
    return <TabScreen key={JSON.stringify(openTarget)} target={openTarget} onBack={() => setOpenTarget(null)} />;
  }

  const hasItems = !!detail && detail.totals.itemCount > 0;
  // "Kartını unutmuş": the quick sale moves to a table or a name and stays open there (2026-11-04).
  const convert = (to: { tableId: string } | { customerName: string }, label: string) =>
    run(async () => {
      if (!detail) return;
      await api.convertQuickTab(detail.tab.id, to);
      setDialog(null);
      finish();
      await reloadOpenTabs();
      toast.info(`Sipariş ${label} hesabına aktarıldı.`);
    });

  return (
    <>
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
        // Not "iptal" (2026-11-04): the cart is just emptied; reports leave quick sales out.
        cancelLabel="Sepeti boşalt"
        onCancelTab={() => detail && setDialog('clear')}
        idle={<OpenTabsList tabs={openTabs ?? []} onOpen={(o) => setOpenTarget({ tabId: o.tab.id })} />}
        extraActions={
          <>
            {hasItems && (
              <div className="transfer-row">
                <button className="btn small" onClick={() => setDialog('table')}>
                  Masaya aktar
                </button>
                <button className="btn small" onClick={() => setDialog('name')}>
                  İsme aktar
                </button>
              </div>
            )}
            {lastSale && (
              <div className="last-sale" data-testid="last-sale">
                Son satış {formatTL(lastSale.total)} · {lastSale.method === 'cash' ? 'nakit' : 'kart'}
              </div>
            )}
          </>
        }
      />
      {dialog === 'clear' && detail && (
        <ConfirmDialog
          title="Sepet boşaltılsın mı?"
          confirmLabel="Boşalt"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void run(async () => {
              await api.voidTab(detail.tab.id);
              finish();
            }, 'Sepet boşaltıldı.');
          }}
        />
      )}
      {dialog === 'table' && detail && (
        <MoveDialog
          title="Hangi masaya aktarılsın?"
          currentTableId={null}
          tables={tables}
          onClose={() => setDialog(null)}
          onMove={(id) => {
            const label = tables.find((t) => t.id === id)?.label ?? '';
            void convert({ tableId: id }, /^\d+$/.test(label) ? `Masa ${label}` : label);
          }}
        />
      )}
      {dialog === 'name' && detail && (
        <PromptDialog
          title="Hangi isme aktarılsın?"
          label="İsim soyisim"
          confirmLabel="Aktar"
          onClose={() => setDialog(null)}
          onConfirm={(name) => void convert({ customerName: name }, name.trim())}
        />
      )}
    </>
  );
}

/** Quick sale's middle column while no line is selected: the open tabs, by name (2026-11-04). */
function OpenTabsList({ tabs, onOpen }: { tabs: OpenTabSummary[]; onOpen(tab: OpenTabSummary): void }) {
  return (
    <div className="open-tabs" data-testid="open-tabs">
      <strong>Açık hesaplar</strong>
      {tabs.length === 0 && <span className="muted">Açık masa ya da hesap yok.</span>}
      {tabs.map((o) => (
        <button key={o.tab.id} className="open-tab" onClick={() => onOpen(o)} data-open-tab={o.title}>
          <span className="name">{o.title}</span>
          <span className="num">{formatTL(o.remaining)}</span>
          <span className="sub">
            {o.itemCount} ürün · {openFor(o.tab.opened_at)}
          </span>
        </button>
      ))}
    </div>
  );
}
