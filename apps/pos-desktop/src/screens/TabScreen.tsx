import type { FloorTable } from '@crumble/shared';
import { formatTL, istanbulDay } from '@crumble/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/Toast';
import { useAction, useApiData, useCatalogVersion, useTabsVersion } from '../components/useApi';
import { formatDateTime, formatTime } from '../format';
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
  const [dialog, setDialog] = useState<'move' | 'name' | 'cancel' | 'cancel-sure' | null>(null);
  // Lines already on the tab when it is opened again: this round counts from 0 (2026-11-04).
  const [frozen, setFrozen] = useState<ReadonlySet<string>>(new Set());
  const opening = useRef<Promise<TabDetail> | null>(null);
  const started = useRef(false);
  const run = useAction();
  const toast = useToast();

  useEffect(() => {
    // Guard: StrictMode runs effects twice in development; open the tab once.
    if (started.current) return;
    started.current = true;
    if ('tabId' in target) {
      void run(async () => {
        const loaded = await api.getTab(target.tabId);
        setFrozen(new Set(loaded.items.map((i) => i.id)));
        setDetail(loaded);
      });
    }
    if ('customerName' in target) {
      void run(async () => {
        const tab = await api.openTab({ kind: 'named', customer_name: target.customerName });
        setDetail(await api.getTab(tab.id));
      });
    }
  }, []);

  // A payment, rename or cancel from the phone: show the tab as it is now.
  const tabsVersion = useTabsVersion();
  const tabId = detail?.tab.id;
  useEffect(() => {
    if (tabsVersion === 0 || !tabId) return;
    void api
      .getTab(tabId)
      .then((fresh) => {
        if (fresh.tab.status === 'open') return setDetail(fresh);
        toast.info(fresh.tab.status === 'paid' ? 'Hesap telefondan kapatıldı (ödendi).' : 'Hesap telefondan iptal edildi.');
        onBack();
      })
      .catch(() => {});
  }, [tabsVersion, tabId]);

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
        subtitle={detail ? `${detail.totals.itemCount} ürün` : 'İlk ürünle hesap açılır'}
        frozenLineIds={frozen}
        banner={<TabBanner title={title} detail={detail} />}
        cancelLabel="Hesabı iptal et"
        onClosed={(result, method) => {
          toast.info(`Hesap kapandı: ${formatTL(result.detail.totals.total)} · ${method === 'cash' ? 'nakit' : 'kart'}`);
          onBack();
        }}
        // Two questions before a table/named tab is cancelled (2026-11-04).
        onCancelTab={() => detail && setDialog('cancel')}
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
      {dialog === 'cancel' && detail && (
        <ConfirmDialog
          title="Hesap iptal edilsin mi?"
          text={
            detail.paid > 0
              ? `Alınan ${formatTL(detail.paid)} iade edilir, hesap iptal edilir.`
              : 'Hesaptaki ürünler iptal olarak kaydedilir.'
          }
          confirmLabel="İptal et"
          onClose={() => setDialog(null)}
          onConfirm={() => setDialog('cancel-sure')}
        />
      )}
      {dialog === 'cancel-sure' && detail && (
        <ConfirmDialog
          title="Emin misin?"
          text={`${title} hesabı iptal edilecek. Bu geri alınamaz.`}
          confirmLabel="Evet, iptal et"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void run(async () => {
              await api.refundAndVoid(detail.tab.id, null);
              onBack();
            }, 'Hesap iptal edildi.');
          }}
        />
      )}
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

/** "45 dk", "3 sa 10 dk", or "2 gündür açık" once the tab spans days. */
export function openFor(openedAt: string, now = new Date().toISOString()): string {
  const minutes = Math.max(0, Math.round((Date.parse(now) - Date.parse(openedAt)) / 60_000));
  const days = Math.round((Date.parse(istanbulDay(now)) - Date.parse(istanbulDay(openedAt))) / 86_400_000);
  if (days >= 1) return `${days} gündür açık`;
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

/** Green bar on a table/named tab so it is clear this is an open tab (2026-11-04). */
function TabBanner({ title, detail }: { title: string; detail: TabDetail | null }) {
  const name = title.toLocaleUpperCase('tr');
  if (!detail) {
    return (
      <div className="tab-banner new" data-testid="tab-banner">
        <span className="t">{name} · YENİ HESAP</span>
        <span className="s">İlk ürünle hesap açılır</span>
      </div>
    );
  }
  const opened = detail.tab.opened_at;
  const sameDay = istanbulDay(opened) === istanbulDay(new Date().toISOString());
  return (
    <div className="tab-banner" data-testid="tab-banner">
      <span className="t">{name} · AÇIK HESAP</span>
      <span className="s">
        açılış {sameDay ? formatTime(opened) : formatDateTime(opened)} · {openFor(opened)}
      </span>
      {detail.paid > 0 && (
        <span className="s">
          alınan {formatTL(detail.paid)} · kalan {formatTL(detail.remaining)}
        </span>
      )}
    </div>
  );
}

/** "5" -> "Masa 5"; labels that already name the seat ("Kanepe 1", "Bar") stay as they are. */
export function tableTitle(label: string): string {
  return /^\d+$/.test(label) ? `Masa ${label}` : label;
}

export function MoveDialog({
  title = 'Hangi masaya taşınsın?',
  currentTableId,
  tables,
  onMove,
  onClose,
}: {
  title?: string;
  currentTableId: string | null;
  tables: FloorTable[];
  onMove(tableId: string): void;
  onClose(): void;
}) {
  const [plans] = useApiData(() => api.listFloorPlans());
  const [open] = useApiData(() => api.listOpenTabSummaries());
  const busy = new Map(open?.filter((o) => o.tab.table_id).map((o) => [o.tab.table_id!, o.title]));
  // 2026-11-12: no table is offered before we know which ones are taken; a
  // taken one is filled green (like on the floor plan) and cannot be clicked.
  const ready = plans !== undefined && open !== undefined;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {!ready && <p className="muted">Masalar yükleniyor…</p>}
        {ready &&
          plans.map((plan) => (
            <div key={plan.id} style={{ marginBottom: 10 }}>
              <div className="muted">{plan.name}</div>
              <div className="row wrap">
                {tables
                  .filter((t) => t.floor_plan_id === plan.id)
                  .map((t) => {
                    const taken = t.id === currentTableId || busy.has(t.id);
                    return (
                      <button
                        key={t.id}
                        className={`btn table-pick${taken ? ' taken' : ''}`}
                        disabled={taken}
                        title={taken ? `Dolu${busy.get(t.id) ? `: ${busy.get(t.id)}` : ''}` : undefined}
                        onClick={() => onMove(t.id)}
                      >
                        {t.label}
                      </button>
                    );
                  })}
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
