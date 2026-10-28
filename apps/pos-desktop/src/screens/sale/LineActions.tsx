import type { TabItem } from '@crumble/shared';
import { formatTL, lineTotals } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { Keypad, keypadToInt, keypadToKurus } from '../../components/Keypad';
import type { TabDetail } from '../../db/sales';

export const DISCOUNT_PRESETS = [10, 15] as const;

type Mode = 'quantity' | 'price' | 'itemDiscount' | 'cartDiscount';

const MODE_LABEL: Record<Mode, string> = {
  quantity: 'Adet',
  price: 'Yeni fiyat (₺)',
  itemDiscount: 'Satır indirimi (%)',
  cartDiscount: 'Sepet indirimi (%)',
};

export interface LineActionHandlers {
  updateItem(itemId: string, patch: { quantity?: number; unit_price?: number; discount_percent?: number | null; is_comp?: boolean; note?: string | null }): Promise<void>;
  voidItem(itemId: string, reason: string | null): Promise<void>;
  setCartDiscount(percent: number | null): Promise<void>;
  cancelTab?(): void;
}

/**
 * The side column (plan §5.1): actions for the selected cart line, or for the
 * whole cart when no line is selected, plus the number pad.
 */
export function LineActions({
  detail,
  item,
  handlers,
  inactive = false,
}: {
  detail: TabDetail | null;
  item: TabItem | null;
  handlers: LineActionHandlers;
  /** True while a dialog is open, so its keypad gets the keyboard. */
  inactive?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [buffer, setBuffer] = useState('');
  const [note, setNote] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setMode(null);
    setBuffer('');
    setVoiding(false);
    setReason('');
    setNote(item?.note ?? '');
  }, [item?.id]);

  const start = (next: Mode) => {
    setMode(next);
    setBuffer('');
  };

  const commit = async () => {
    if (!mode) return;
    if (mode === 'price') {
      const kurus = keypadToKurus(buffer);
      if (kurus === null || !item) return;
      await handlers.updateItem(item.id, { unit_price: kurus });
    } else {
      const n = keypadToInt(buffer);
      if (n === null) return;
      if (mode === 'quantity' && item) await handlers.updateItem(item.id, { quantity: n });
      if (mode === 'itemDiscount' && item) await handlers.updateItem(item.id, { discount_percent: n });
      if (mode === 'cartDiscount') await handlers.setCartDiscount(n);
    }
    setMode(null);
    setBuffer('');
  };

  const hasItems = (detail?.totals.itemCount ?? 0) > 0;

  return (
    <aside className="actions-col" aria-label="İşlemler">
      {item ? (
        <>
          <div className="actions-title">
            <strong>{item.name_snapshot}</strong>
            <div className="muted">
              {item.quantity} × {formatTL(item.unit_price)} = {formatTL(lineTotals(item).total)}
            </div>
          </div>
          <div className="action-grid">
            <button className="btn" onClick={() => void handlers.updateItem(item.id, { quantity: item.quantity + 1 })}>
              Adet +1
            </button>
            <button
              className="btn"
              disabled={item.quantity <= 1}
              onClick={() => void handlers.updateItem(item.id, { quantity: item.quantity - 1 })}
            >
              Adet −1
            </button>
            <button className={`btn${mode === 'quantity' ? ' active' : ''}`} onClick={() => start('quantity')}>
              Adet gir
            </button>
            <button className={`btn${mode === 'price' ? ' active' : ''}`} onClick={() => start('price')}>
              Fiyatı değiştir
            </button>
            {DISCOUNT_PRESETS.map((p) => (
              <button
                key={p}
                className={`btn${item.discount_percent === p ? ' active' : ''}`}
                onClick={() => void handlers.updateItem(item.id, { discount_percent: item.discount_percent === p ? null : p })}
              >
                İndirim %{p}
              </button>
            ))}
            <button className={`btn${mode === 'itemDiscount' ? ' active' : ''}`} onClick={() => start('itemDiscount')}>
              İndirim (elle)
            </button>
            <button
              className="btn"
              disabled={!item.discount_percent}
              onClick={() => void handlers.updateItem(item.id, { discount_percent: null })}
            >
              İndirimi kaldır
            </button>
            <button
              className={`btn${item.is_comp ? ' active' : ''}`}
              onClick={() => void handlers.updateItem(item.id, { is_comp: !item.is_comp })}
            >
              {item.is_comp ? 'İkramı kaldır' : 'İkram'}
            </button>
            <button className="btn danger" onClick={() => setVoiding(true)}>
              İptal (çıkar)
            </button>
          </div>
          {item.unit_price !== item.list_price && (
            <button className="btn small" onClick={() => void handlers.updateItem(item.id, { unit_price: item.list_price })}>
              Menü fiyatına dön ({formatTL(item.list_price)})
            </button>
          )}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void handlers.updateItem(item.id, { note });
            }}
          >
            <input
              className="input grow"
              placeholder="Not (ör. az şekerli)"
              aria-label="Not"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn small" disabled={note === (item.note ?? '')}>
              Kaydet
            </button>
          </form>
          {voiding && (
            <form
              className="panel void-box"
              onSubmit={(e) => {
                e.preventDefault();
                void handlers.voidItem(item.id, reason || null);
              }}
            >
              <div>Satır sepetten çıkarılsın mı? İptal kaydı tutulur.</div>
              <input
                className="input"
                autoFocus
                placeholder="Neden (isteğe bağlı)"
                aria-label="İptal nedeni"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="row">
                <button type="button" className="btn grow" onClick={() => setVoiding(false)}>
                  Vazgeç
                </button>
                <button className="btn danger solid grow">Çıkar</button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <div className="actions-title">
            <strong>Sepet</strong>
            <div className="muted">Bir satıra tıklayınca satır işlemleri açılır.</div>
          </div>
          <div className="action-grid">
            {DISCOUNT_PRESETS.map((p) => (
              <button
                key={p}
                className={`btn${detail?.tab.discount_percent === p ? ' active' : ''}`}
                disabled={!hasItems}
                onClick={() => void handlers.setCartDiscount(detail?.tab.discount_percent === p ? null : p)}
              >
                Sepet %{p}
              </button>
            ))}
            <button
              className={`btn${mode === 'cartDiscount' ? ' active' : ''}`}
              disabled={!hasItems}
              onClick={() => start('cartDiscount')}
            >
              Sepet indirimi (elle)
            </button>
            <button
              className="btn"
              disabled={!detail?.tab.discount_percent}
              onClick={() => void handlers.setCartDiscount(null)}
            >
              İndirimi kaldır
            </button>
            {handlers.cancelTab && (
              <button className="btn danger" disabled={!detail} onClick={handlers.cancelTab}>
                Satışı iptal et
              </button>
            )}
          </div>
        </>
      )}

      <div className="keypad-area">
        <div className="keypad-label">{mode ? MODE_LABEL[mode] : 'Tuş takımı: önce bir işlem seçin'}</div>
        <div className="keypad-display" data-testid="keypad-display">
          {buffer || (mode ? '' : '—')}
        </div>
        <Keypad
          value={buffer}
          onChange={(v) => mode && setBuffer(v)}
          onEnter={() => void commit()}
          allowComma={mode === 'price'}
          maxLength={mode === 'price' ? 9 : 3}
          captureKeyboard={mode !== null && !inactive}
        />
      </div>
    </aside>
  );
}
