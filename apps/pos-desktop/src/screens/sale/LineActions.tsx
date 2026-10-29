import type { TabItem } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { Keypad, keypadToInt, keypadToKurus } from '../../components/Keypad';
import type { ItemPatch } from '../../db/sales';

/** What the number pad is typing when no line is selected. */
export type PadEntry =
  | { kind: 'cartDiscount' }
  | { kind: 'payAmount'; max: number };

export interface LineActionHandlers {
  updateItem(itemId: string, patch: ItemPatch): Promise<void>;
  voidItem(itemId: string, reason: string | null): Promise<void>;
  setCartDiscount(percent: number | null): Promise<void>;
  setPayAmount(kurus: number | null): void;
}

type Field = 'quantity' | 'price';

/**
 * The side column (plan §5.1, S2): opens when a cart line is selected and
 * offers Adet / Fiyat with the number pad, a note and "Satırı çıkar". With no
 * line selected it types the cart discount (Elle) or a partial payment.
 */
export function LineActions({
  item,
  entry,
  handlers,
  onClose,
}: {
  item: TabItem | null;
  entry: PadEntry | null;
  handlers: LineActionHandlers;
  onClose(): void;
}) {
  const [field, setField] = useState<Field>('quantity');
  const [buffer, setBuffer] = useState('');
  const [note, setNote] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setField('quantity');
    setBuffer('');
    setVoiding(false);
    setReason('');
    setNote(item?.note ?? '');
  }, [item?.id]);
  useEffect(() => setBuffer(''), [entry?.kind]);

  if (!item && !entry) {
    return (
      <aside className="actions-col" aria-label="İşlemler">
        <div className="actions-hint">
          <strong>Satır işlemleri</strong>
          <span>Sepetteki bir satıra tıklayınca adet, fiyat ve not burada açılır.</span>
        </div>
      </aside>
    );
  }

  const commit = async () => {
    if (item) {
      if (field === 'price') {
        const kurus = keypadToKurus(buffer);
        if (kurus === null) return;
        await handlers.updateItem(item.id, { unit_price: kurus });
      } else {
        const n = keypadToInt(buffer);
        if (n === null) return;
        await handlers.updateItem(item.id, { quantity: n });
      }
      setBuffer('');
      return;
    }
    if (entry?.kind === 'cartDiscount') {
      const n = keypadToInt(buffer);
      if (n === null) return;
      await handlers.setCartDiscount(n);
      onClose();
    }
    if (entry?.kind === 'payAmount') {
      const kurus = keypadToKurus(buffer);
      handlers.setPayAmount(kurus === null || kurus >= entry.max ? null : kurus);
      onClose();
    }
  };

  const money = item ? field === 'price' : entry?.kind === 'payAmount';
  const label = item
    ? field === 'price'
      ? 'Yeni fiyat'
      : 'Adet'
    : entry?.kind === 'cartDiscount'
      ? 'Sepet indirimi %'
      : 'Alınacak tutar';
  const current = item
    ? field === 'price'
      ? formatTL(item.unit_price)
      : String(item.quantity)
    : entry?.kind === 'payAmount'
      ? formatTL(entry.max)
      : '—';
  const shown = buffer ? (money ? formatTL(keypadToKurus(buffer) ?? 0) : buffer) : current;

  return (
    <aside className="actions-col" aria-label="İşlemler">
      <div className="actions-head">
        <div className="grow">
          <div className="eyebrow">{item ? 'Seçili satır' : 'Tuş takımı'}</div>
          <strong>{item ? item.name_snapshot : entry?.kind === 'cartDiscount' ? 'Sepet indirimi' : 'Kısmi ödeme'}</strong>
          <div className="muted">
            {item
              ? `Menü fiyatı ${formatTL(item.list_price)}`
              : entry?.kind === 'cartDiscount'
                ? 'Tam sayı yüzde, 1–100'
                : `Kalan ${formatTL(entry!.max)}; boş bırakırsan tamamı`}
          </div>
        </div>
        <button className="close-x" aria-label="Paneli kapat (Esc)" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {item && (
        <div className="seg" role="tablist" aria-label="Tuş takımı neyi değiştirsin">
          {(
            [
              ['quantity', 'Adet'],
              ['price', 'Fiyat'],
            ] as const
          ).map(([f, text]) => (
            <button
              key={f}
              role="tab"
              aria-selected={field === f}
              className={field === f ? 'on' : ''}
              onClick={() => {
                setField(f);
                setBuffer('');
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <div className="keypad-display" data-testid="keypad-display">
        <span className="label">
          {label}
          {item && field === 'price' && item.unit_price !== item.list_price && (
            <>
              <br />
              menü {formatTL(item.list_price)}
            </>
          )}
        </span>
        <span className="value">{shown}</span>
      </div>
      <Keypad
        value={buffer}
        onChange={setBuffer}
        onEnter={() => void commit()}
        enterLabel="Uygula (Enter)"
        allowComma={!!money}
        maxLength={money ? 9 : 3}
      />

      {item && (
        <>
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
              className="input grow note-input"
              placeholder="Not ekle: az şekerli, yulaf sütü…"
              aria-label="Not"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {note !== (item.note ?? '') && <button className="btn small apply">Kaydet</button>}
          </form>
          <div className="grow" />
          {voiding ? (
            <form
              className="void-box"
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
          ) : (
            <button className="btn danger" onClick={() => setVoiding(true)}>
              Satırı çıkar
            </button>
          )}
        </>
      )}
    </aside>
  );
}
