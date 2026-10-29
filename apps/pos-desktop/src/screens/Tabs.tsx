import { formatTL } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PromptDialog } from '../components/PromptDialog';
import { useApiData } from '../components/useApi';
import { formatTime } from '../format';
import { TabScreen, type TabTarget } from './TabScreen';

/** Open table/named tabs (Hesaplar) as cards. `newTabRequest` changes when F3 is pressed. */
export function Tabs({ newTabRequest }: { newTabRequest: number }) {
  const [open, reload] = useApiData(() => api.listOpenTabSummaries());
  const [target, setTarget] = useState<TabTarget | null>(null);
  const [asking, setAsking] = useState(false);
  const [search, setSearch] = useState('');

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

  const query = search.trim().toLocaleLowerCase('tr');
  const shown = (open ?? []).filter((o) => !query || o.title.toLocaleLowerCase('tr').includes(query));

  return (
    <div className="content">
      <div className="page-head">
        <h2>Açık hesaplar</h2>
        <span className="count-chip">{open?.length ?? 0}</span>
        <span className="grow" />
        <input
          className="input"
          style={{ width: 260, height: 44 }}
          placeholder="Ara: isim veya masa"
          aria-label="Hesap ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn apply" style={{ height: 44 }} onClick={() => setAsking(true)}>
          + İsimle hesap aç (F3)
        </button>
      </div>
      <div className="tab-cards" aria-label="Açık hesaplar">
        {shown.map((o) => (
          <button
            key={o.tab.id}
            className="tab-card"
            data-tab={o.tab.customer_name ?? o.tableLabel}
            onClick={() => setTarget({ tabId: o.tab.id })}
          >
            <span className="kind">
              <span className={`badge ${o.tab.table_id ? 'ok' : 'info'}`}>{o.tab.table_id ? 'Masa' : 'İsimle'}</span>
              {formatTime(o.tab.opened_at)}
            </span>
            <span className="title">{o.title}</span>
            <span className="items">{o.itemsText || 'Henüz ürün yok'}</span>
            <span className="foot">
              <span className={o.carriedOver ? 'paid' : o.remaining !== o.total ? 'paid' : 'muted'}>
                {o.carriedOver
                  ? 'Önceki vardiyadan'
                  : o.remaining !== o.total
                    ? `${formatTL(o.total - o.remaining)} ödendi`
                    : `${o.itemCount} ürün`}
              </span>
              <span className="amount">{formatTL(o.remaining)}</span>
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
