import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { FloorCanvas, type TableStatus } from '../components/FloorCanvas';
import { useApiData } from '../components/useApi';
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

  return (
    <div className="content">
      {plans.length === 0 ? (
        <div className="empty">Kroki boş. Ayarlar → Kroki düzenle bölümünden bölüm ve masa ekleyin.</div>
      ) : (
        <>
          <div className="section-tabs" role="tablist" aria-label="Bölümler">
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
            <span className="muted" style={{ marginLeft: 'auto' }}>
              Dolu masalar renkli ve açık hesap tutarıyla görünür.
            </span>
          </div>
          <FloorCanvas
            tables={tables.filter((t) => t.floor_plan_id === planId)}
            status={status}
            onSelect={(table) => {
              if (!table) return;
              const tab = open.find((o) => o.tab.table_id === table.id);
              setTarget(tab ? { tabId: tab.tab.id } : { tableId: table.id });
            }}
          />
        </>
      )}
    </div>
  );
}
