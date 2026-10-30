import { useEffect } from 'react';
import { api } from '../api/client';
import { useApiData } from './useApi';

/** "i" on the Bitki Çayı tiles: the teas and their ingredients. Information only. */
export function TeaInfoDialog({ onClose }: { onClose(): void }) {
  const [teas] = useApiData(() => api.getHerbalTeas());
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog tea-info" role="dialog" aria-label="Bitki çayları" onClick={(e) => e.stopPropagation()}>
        <h3>Bitki çaylarımız</h3>
        <p className="muted" style={{ margin: '-6px 0 14px' }}>
          Küçük veya büyük boy, müşterinin seçtiği çeşitle hazırlanır.
        </p>
        <ul className="tea-list">
          {(teas ?? []).map((t) => (
            <li key={t.name}>
              <strong>{t.name}</strong>
              <span>{t.ingredients || 'İçerik bilgisi girilmedi.'}</span>
            </li>
          ))}
        </ul>
        {teas?.length === 0 && <p className="muted">Ayarlar → Bitki çayı bilgisi bölümünden çeşit ekleyin.</p>}
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
