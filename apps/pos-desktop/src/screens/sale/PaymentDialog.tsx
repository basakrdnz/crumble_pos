import { changeDue, formatTL, type PaymentMethod } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { Keypad, keypadToKurus } from '../../components/Keypad';
import type { PaymentPart } from '../../db/sales';

type Mode = PaymentMethod | 'mixed';

/**
 * Payment (F12): cash with change, card (taken on the separate POS device) or
 * mixed. With allowPartial the amount can be lower than what is due.
 */
export function PaymentDialog({
  due,
  allowPartial = false,
  onPay,
  onClose,
}: {
  due: number;
  allowPartial?: boolean;
  onPay(parts: PaymentPart[], change: number): Promise<boolean>;
  onClose(): void;
}) {
  const [mode, setMode] = useState<Mode>('cash');
  const [amountText, setAmountText] = useState('');
  const [cashText, setCashText] = useState('');
  const [field, setField] = useState<'amount' | 'cash'>('cash');
  const [busy, setBusy] = useState(false);

  const amount = allowPartial ? (keypadToKurus(amountText) ?? due) : due;
  const cash = keypadToKurus(cashText);

  let parts: PaymentPart[] | null = null;
  let change = 0;
  let problem = '';
  if (amount <= 0 && due > 0) problem = 'Tutar girin.';
  else if (amount > due) problem = 'Tutar, kalandan fazla olamaz.';
  else if (mode === 'card') parts = [{ method: 'card', amount }];
  else if (mode === 'cash') {
    const received = cash ?? amount;
    if (received < amount) problem = 'Alınan nakit yetersiz.';
    else {
      change = changeDue(received, amount);
      parts = [{ method: 'cash', amount }];
    }
  } else {
    const cashPart = cash ?? 0;
    if (cashPart <= 0 || cashPart >= amount) problem = 'Nakit kısmını girin (toplamdan az).';
    else
      parts = [
        { method: 'cash', amount: cashPart },
        { method: 'card', amount: amount - cashPart },
      ];
  }

  const confirm = async () => {
    if (!parts || busy) return;
    setBusy(true);
    const done = await onPay(parts, change);
    setBusy(false);
    if (!done) return;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'F12') {
        e.preventDefault();
        void confirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const editing = field === 'amount' && allowPartial ? amountText : cashText;
  const setEditing = field === 'amount' && allowPartial ? setAmountText : setCashText;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog payment" role="dialog" aria-label="Ödeme" onClick={(e) => e.stopPropagation()}>
        <h3>Ödeme</h3>
        <div className="pay-due">
          <span className="muted">{allowPartial ? 'Kalan' : 'Tutar'}</span>
          <strong data-testid="pay-due">{formatTL(due)}</strong>
        </div>
        <div className="row">
          {(
            [
              ['cash', 'Nakit'],
              ['card', 'Kart'],
              ['mixed', 'Karma'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              className={`btn big grow${mode === m ? ' active' : ''}`}
              onClick={() => {
                setMode(m);
                setCashText('');
                setField('cash');
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pay-fields">
          {allowPartial && (
            <button className={`pay-field${field === 'amount' ? ' focus' : ''}`} onClick={() => setField('amount')}>
              <span className="muted">Bu ödeme</span>
              <span className="num">{formatTL(amount)}</span>
            </button>
          )}
          {mode !== 'card' && (
            <button className={`pay-field${field === 'cash' ? ' focus' : ''}`} onClick={() => setField('cash')}>
              <span className="muted">{mode === 'cash' ? 'Alınan nakit' : 'Nakit kısmı'}</span>
              <span className="num" data-testid="pay-cash">
                {cash === null ? (mode === 'cash' ? formatTL(amount) : '—') : formatTL(cash)}
              </span>
            </button>
          )}
          {mode === 'cash' && (
            <div className="pay-field">
              <span className="muted">Para üstü</span>
              <strong className="num" data-testid="pay-change">
                {formatTL(change)}
              </strong>
            </div>
          )}
          {mode === 'mixed' && parts && (
            <div className="pay-field">
              <span className="muted">Kart kısmı</span>
              <strong className="num">{formatTL(parts[1]!.amount)}</strong>
            </div>
          )}
          {mode === 'card' && <p className="muted">Tutarı POS cihazından çekin, sonra onaylayın.</p>}
        </div>

        {mode !== 'card' || allowPartial ? (
          <>
            {mode === 'cash' && field === 'cash' && (
              <div className="row wrap quick-cash">
                {[10000, 20000, 50000, 100000].filter((v) => v >= amount).slice(0, 3).map((v) => (
                  <button key={v} className="btn" onClick={() => setCashText(String(v / 100))}>
                    {formatTL(v)}
                  </button>
                ))}
              </div>
            )}
            <Keypad value={editing} onChange={setEditing} allowComma />
          </>
        ) : null}

        {problem && <div className="pay-problem">{problem}</div>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Vazgeç (Esc)
          </button>
          <button className="btn primary big" disabled={!parts || busy} onClick={() => void confirm()}>
            Ödemeyi al (F12)
          </button>
        </div>
      </div>
    </div>
  );
}
