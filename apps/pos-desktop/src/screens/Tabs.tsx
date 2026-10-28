import { formatTL } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PromptDialog } from '../components/PromptDialog';
import { useApiData } from '../components/useApi';
import { formatTime } from '../format';
import { TabScreen, type TabTarget } from './TabScreen';

/** Open table/named tabs (Hesaplar). `newTabRequest` changes when F3 is pressed. */
export function Tabs({ newTabRequest }: { newTabRequest: number }) {
  const [open, reload] = useApiData(() => api.listOpenTabSummaries());
  const [target, setTarget] = useState<TabTarget | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (newTabRequest > 0) {
      setTarget(null);
      setAsking(true);
    }
  }, [newTabRequest]);

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

  return (
    <div className="content">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 className="grow" style={{ margin: 0 }}>
          Açık hesaplar
        </h2>
        <button className="btn primary" onClick={() => setAsking(true)}>
          İsimle hesap aç (F3)
        </button>
      </div>
      <div className="tab-cards" aria-label="Açık hesaplar">
        {(open ?? []).map((o) => (
          <button key={o.tab.id} className="tab-card" data-tab={o.tab.customer_name ?? o.tableLabel} onClick={() => setTarget({ tabId: o.tab.id })}>
            <strong>
              {[o.tableLabel && `Masa ${o.tableLabel}`, o.tab.customer_name].filter(Boolean).join(' · ')}
            </strong>
            <span className="amount">{formatTL(o.remaining)}</span>
            <span className="muted">
              {o.itemCount} ürün · {formatTime(o.tab.opened_at)}
              {o.remaining !== o.total && ` · toplam ${formatTL(o.total)}`}
            </span>
          </button>
        ))}
      </div>
      {open?.length === 0 && <div className="empty">Açık hesap yok.</div>}
      {asking && (
        <PromptDialog
          title="İsimle hesap aç"
          label="İsim soyisim"
          confirmLabel="Hesap aç"
          onClose={() => setAsking(false)}
          onConfirm={(name) => {
            setAsking(false);
            setTarget({ customerName: name });
          }}
        />
      )}
    </div>
  );
}
