import { formatTL } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { FloorCanvas, type TableStatus } from '../components/FloorCanvas';
import { useApiData } from '../components/useApi';
import { formatTime } from '../format';
import { TabScreen, type TabTarget } from './TabScreen';

/** Floor map (plan §5.3): click a table to open or continue its tab. */
export function FloorPlan() {
  const [plans] = useApiData(() => api.listFloorPlans());
  const [tables] = useApiData(() => api.listTables());
  const [open, reload] = useApiData(() => api.listOpenTabSummaries());
  const [planId, setPlanId] = useState<string>();
  const [target, setTarget] = useState<TabTarget | null>(null);

  useEffect(() => {
    if (plans && !plans.some((p) => p.id === planId)) setPlanId(plans[0]?.id);
  }, [plans, planId]);

  if (target) {
    return (
      <TabScreen
        key={JSON.stringify(target)}
        target={target}
        onBack={() => {
          setTarget(null);
          void reload();
        }}
      />
    );
  }
  if (!plans || !tables || !open) return null;

  const status = new Map<string, TableStatus>();
  for (const o of open) {
    if (o.tab.table_id) status.set(o.tab.table_id, { total: o.remaining, name: o.tab.customer_name });
  }

  const tables_ = tables.filter((t) => t.floor_plan_id === planId);
  const busyHere = tables_.filter((t) => status.has(t.id)).length;

  return (
    <div className="floor-page">
      <div className="floor-main">
        {plans.length === 0 ? (
          <div className="empty">Kroki boş. Ayarlar → Kroki düzenle bölümünden bölüm ve masa ekleyin.</div>
        ) : (
          <>
            <div className="section-tabs" role="tablist" aria-label="Bölümler">
              <h2 style={{ margin: '0 10px 0 0' }}>Kroki</h2>
              {plans.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={p.id === planId}
                  className={`btn${p.id === planId ? ' active' : ''}`}
                  onClick={() => setPlanId(p.id)}
                >
                  {p.name}
                </button>
              ))}
              <span className="grow" />
              <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
                {busyHere} dolu · {tables_.length - busyHere} boş
              </span>
            </div>
            <FloorCanvas
              tables={tables_}
              status={status}
              onSelect={(table) => {
                if (!table) return;
                const tab = open.find((o) => o.tab.table_id === table.id);
                setTarget(tab ? { tabId: tab.tab.id } : { tableId: table.id });
              }}
            />
            <div className="floor-legend">
              <span>
                <i style={{ background: 'var(--empty)', border: '1px solid var(--empty-line)' }} />
                Boş
              </span>
              <span>
                <i style={{ background: 'var(--primary)' }} />
                Dolu
              </span>
              <span className="muted" style={{ fontWeight: 600 }}>
                Masaya tıkla: hesap açılır veya devam eder.
              </span>
            </div>
          </>
        )}
      </div>
      <aside className="side-panel" aria-label="Açık hesaplar">
        <div className="panel-head">
          <strong>Açık hesaplar</strong>
          <span className="muted">{open.length}</span>
        </div>
        <div className="panel-body">
          {open.map((o) => (
            <button key={o.tab.id} className="open-tab-row" onClick={() => setTarget({ tabId: o.tab.id })}>
              <strong>{o.title}</strong>
              <span className="amount">{formatTL(o.remaining)}</span>
              <span className="muted">
                {o.itemCount} ürün · {formatTime(o.tab.opened_at)}
                {o.tab.table_id ? '' : ' · masasız'}
              </span>
              <span className="paid">
                {o.carriedOver ? 'devir' : o.remaining !== o.total ? `${formatTL(o.total - o.remaining)} ödendi` : ''}
              </span>
            </button>
          ))}
          {open.length === 0 && <div className="empty">Açık hesap yok.</div>}
        </div>
      </aside>
    </div>
  );
}
