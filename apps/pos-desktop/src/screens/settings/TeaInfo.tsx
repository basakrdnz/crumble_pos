import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useApiData } from '../../components/useApi';
import type { HerbalTea } from '../../db/teaInfo';

/** Ayarlar → Bitki çayı bilgisi: what the "i" window on the Bitki Çayı tiles shows. */
export function TeaInfo() {
  const [saved, reload] = useApiData(() => api.getHerbalTeas());
  const [rows, setRows] = useState<HerbalTea[]>([]);
  const run = useAction();
  useEffect(() => {
    if (saved) setRows(saved);
  }, [saved]);

  const set = (i: number, patch: Partial<HerbalTea>) => setRows((r) => r.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const changed = JSON.stringify(rows) !== JSON.stringify(saved);

  return (
    <>
      <h2>Bitki çayı bilgisi</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Satış ekranında "Bitki Çayı" kutularındaki <b>i</b> butonu bu listeyi gösterir. Sadece bilgi içindir, satışı değiştirmez.
      </p>
      <div className="panel" style={{ maxWidth: 900 }}>
        {rows.map((t, i) => (
          <div key={i} className="tea-row">
            <input className="input" aria-label={`Çay ${i + 1} adı`} value={t.name} onChange={(e) => set(i, { name: e.target.value })} />
            <input
              className="input"
              aria-label={`Çay ${i + 1} içeriği`}
              placeholder="İçerik"
              value={t.ingredients}
              onChange={(e) => set(i, { ingredients: e.target.value })}
            />
            <button className="btn small danger" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              Sil
            </button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn small" onClick={() => setRows((r) => [...r, { name: '', ingredients: '' }])}>
            + Çay ekle
          </button>
          <span className="grow" />
          <button
            className="btn primary"
            disabled={!changed}
            onClick={() =>
              void run(async () => {
                await api.setHerbalTeas(rows);
                await reload();
              }, 'Bitki çayı bilgisi kaydedildi.')
            }
          >
            Kaydet
          </button>
        </div>
      </div>
    </>
  );
}
