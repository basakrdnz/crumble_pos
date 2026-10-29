import type { FloorTable } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/Toast';
import { useAction, useApiData, useCatalogVersion } from '../components/useApi';
import { formatTime } from '../format';
import type { TabDetail } from '../db/sales';
import { TabWorkspace } from './sale/TabWorkspace';

export type TabTarget = { tabId: string } | { tableId: string } | { customerName: string };

/**
 * One table/named tab: same workspace as a quick sale, plus partial payment,
 * moving to another table, attaching a name and cancelling (plan §5.2).
 */
export function TabScreen({ target, onBack }: { target: TabTarget; onBack(): void }) {
  const catalogVersion = useCatalogVersion();
  const [categories] = useApiData(() => api.listCategories());
  const [products] = useApiData(() => api.listProducts(), [catalogVersion]);
  const [tables] = useApiData(() => api.listTables());
  const [detail, setDetail] = useState<TabDetail | null>(null);
  const [dialog, setDialog] = useState<'move' | 'name' | null>(null);
  const opening = useRef<Promise<TabDetail> | null>(null);
  const started = useRef(false);
  const run = useAction();
  const toast = useToast();

  useEffect(() => {
    // Guard: StrictMode runs effects twice in development; open the tab once.
    if (started.current) return;
    started.current = true;
    if ('tabId' in target) void run(async () => setDetail(await api.getTab(target.tabId)));
    if ('customerName' in target) {
      void run(async () => {
        const tab = await api.openTab({ kind: 'named', customer_name: target.customerName });
        setDetail(await api.getTab(tab.id));
      });
    }
  }, []);

  const tableId = detail?.tab.table_id ?? ('tableId' in target ? target.tableId : null);
  const table = tables?.find((t) => t.id === tableId);
  const title = [table && tableTitle(table.label), detail?.tab.customer_name].filter(Boolean).join(' · ') || 'Hesap';

  if (!categories || !products || !tables) return null;

  return (
    <>
      <TabWorkspace
        title={title}
        detail={detail}
        setDetail={setDetail}
        ensureTab={() => {
          if (detail) return Promise.resolve(detail);
          if (!('tableId' in target)) return Promise.reject(new Error('Hesap henüz açılmadı.'));
          opening.current ??= api.openTab({ kind: 'table', table_id: target.tableId }).then((t) => api.getTab(t.id));
          opening.current.catch(() => {
            opening.current = null;
          });
          return opening.current;
        }}
        categories={categories}
        products={products}
        allowPartial
        subtitle={
          detail
            ? `Açılış ${formatTime(detail.tab.opened_at)} · ${detail.totals.itemCount} ürün`
            : 'İlk ürünle hesap açılır'
        }
        cancelLabel="Hesabı iptal et"
        onClosed={(result, method) => {
          toast.info(`Hesap kapandı: ${formatTL(result.detail.totals.total)} · ${method === 'cash' ? 'nakit' : 'kart'}`);
          onBack();
        }}
        onCancelTab={() => {
          if (!detail) return;
          const question =
            detail.paid > 0
              ? `Alınan ${formatTL(detail.paid)} iade edilip hesap iptal edilsin mi?`
              : 'Hesap iptal edilsin mi? İptal kaydı tutulur.';
          if (!window.confirm(question)) return;
          void run(async () => {
            await api.refundAndVoid(detail.tab.id, null);
            onBack();
          }, 'Hesap iptal edildi.');
        }}
        tools={
          <div className="tab-tools">
            <button className="btn small pill" onClick={onBack}>
              ← Geri
            </button>
            <button className="btn small pill" disabled={!detail} onClick={() => setDialog('move')}>
              Taşı
            </button>
            <button className="btn small pill" disabled={!detail} onClick={() => setDialog('name')}>
              İsim
            </button>
          </div>
        }
      />
      {dialog === 'name' && detail && (
        <PromptDialog
          title="Hesap ismi"
          label="İsim soyisim"
          initial={detail.tab.customer_name ?? ''}
          allowEmpty={detail.tab.kind !== 'named'}
          onClose={() => setDialog(null)}
          onConfirm={(name) =>
            void run(async () => {
              setDetail(await api.setCustomerName(detail.tab.id, name || null));
              setDialog(null);
            })
          }
        />
      )}
      {dialog === 'move' && detail && (
        <MoveDialog
          currentTableId={detail.tab.table_id}
          tables={tables}
          onClose={() => setDialog(null)}
          onMove={(id) =>
            void run(async () => {
              setDetail(await api.moveTab(detail.tab.id, id));
              setDialog(null);
            }, 'Hesap taşındı.')
          }
        />
      )}
    </>
  );
}

/** "5" -> "Masa 5"; labels that already name the seat ("Kanepe 1", "Bar") stay as they are. */
export function tableTitle(label: string): string {
  return /^\d+$/.test(label) ? `Masa ${label}` : label;
}

function MoveDialog({
  currentTableId,
  tables,
  onMove,
  onClose,
}: {
  currentTableId: string | null;
  tables: FloorTable[];
  onMove(tableId: string): void;
  onClose(): void;
}) {
  const [plans] = useApiData(() => api.listFloorPlans());
  const [open] = useApiData(() => api.listOpenTabSummaries());
  const busy = new Set(open?.map((o) => o.tab.table_id).filter(Boolean));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Masa değiştir" onClick={(e) => e.stopPropagation()}>
        <h3>Hangi masaya taşınsın?</h3>
        {(plans ?? []).map((plan) => (
          <div key={plan.id} style={{ marginBottom: 10 }}>
            <div className="muted">{plan.name}</div>
            <div className="row wrap">
              {tables
                .filter((t) => t.floor_plan_id === plan.id)
                .map((t) => (
                  <button
                    key={t.id}
                    className="btn"
                    disabled={t.id === currentTableId || busy.has(t.id)}
                    onClick={() => onMove(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {tables.length === 0 && <p className="muted">Krokide masa yok. Ayarlar → Kroki düzenle.</p>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
