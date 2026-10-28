import type { PaymentMethod, Shift } from '@crumble/shared';
import { formatTL, lineTotals } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Keypad, keypadToKurus } from '../components/Keypad';
import { PromptDialog } from '../components/PromptDialog';
import { useAction, useApiData } from '../components/useApi';
import { formatDateTime, formatTime } from '../format';

const METHOD: Record<PaymentMethod, string> = { cash: 'Nakit', card: 'Kart' };

/** Completed sales of a shift, with refunds (plan §5.5). */
export function Sales({ shift }: { shift: Shift | null }) {
  const [shifts] = useApiData(() => api.listShifts(60));
  const [shiftId, setShiftId] = useState<string | undefined>(shift?.id);
  const [sales, reload] = useApiData(() => (shiftId ? api.listSales(shiftId) : Promise.resolve([])), [shiftId]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!shiftId && shifts?.[0]) setShiftId(shifts[0].id);
  }, [shifts, shiftId]);

  return (
    <div className="content">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 className="grow" style={{ margin: 0 }}>
          Satışlar
        </h2>
        <label className="muted" htmlFor="sales-shift">
          Vardiya
        </label>
        <select id="sales-shift" className="input" value={shiftId ?? ''} onChange={(e) => setShiftId(e.target.value)}>
          {(shifts ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {formatDateTime(s.opened_at)}
              {s.closed_at ? '' : ' (açık)'}
            </option>
          ))}
        </select>
      </div>
      <table className="grid" aria-label="Satışlar">
        <thead>
          <tr>
            <th>Saat</th>
            <th>Satış</th>
            <th className="right">Tutar</th>
            <th className="right">Nakit</th>
            <th className="right">Kart</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {(sales ?? []).map((s) => (
            <tr key={s.tabId} className={s.status === 'void' ? 'inactive' : ''} data-sale={s.label} onClick={() => setOpenId(s.tabId)} style={{ cursor: 'pointer' }}>
              <td>{formatTime(s.closedAt)}</td>
              <td>
                {s.label} <span className="muted">· {s.itemCount} ürün</span>
              </td>
              <td className="num">{formatTL(s.total)}</td>
              <td className="num">{s.cash ? formatTL(s.cash) : ''}</td>
              <td className="num">{s.card ? formatTL(s.card) : ''}</td>
              <td>
                {s.status === 'void' && <span className="badge muted">İptal</span>}
                {s.refunded > 0 && (
                  <span className={`badge ${s.refunded >= s.cash + s.card ? 'danger' : 'warn'}`}>
                    {s.refunded >= s.cash + s.card ? 'İade edildi' : `İade ${formatTL(s.refunded)}`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sales?.length === 0 && <div className="empty">Bu vardiyada satış yok.</div>}
      {openId && (
        <SaleDetail
          tabId={openId}
          canRefund={!!shift}
          onClose={() => setOpenId(null)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}

function SaleDetail({
  tabId,
  canRefund,
  onClose,
  onChanged,
}: {
  tabId: string;
  canRefund: boolean;
  onClose(): void;
  onChanged(): void;
}) {
  const [detail] = useApiData(() => api.getTab(tabId), [tabId]);
  const [info, reloadInfo] = useApiData(() => api.getRefundInfo(tabId), [tabId]);
  const [refunding, setRefunding] = useState<{ itemId: string | null; max: number; name: string } | null>(null);
  const [askAll, setAskAll] = useState(false);
  const run = useAction();

  if (!detail || !info) return null;
  const refreshed = async () => {
    await reloadInfo();
    onChanged();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog sale-detail" role="dialog" aria-label="Satış detayı" onClick={(e) => e.stopPropagation()}>
        <h3>
          Satış · {formatDateTime(detail.tab.closed_at ?? detail.tab.opened_at)}
          {detail.tab.status === 'void' && <span className="badge muted"> İptal</span>}
        </h3>
        <table className="grid">
          <tbody>
            {detail.items.map((item) => {
              const refundable = info.items.find((i) => i.itemId === item.id);
              return (
                <tr key={item.id} className={item.voided_at ? 'inactive' : ''}>
                  <td>
                    {item.voided_at ? <s>{item.name_snapshot}</s> : item.name_snapshot}
                    {item.voided_at && <span className="badge muted"> çıkarıldı</span>}
                    {item.is_comp && <span className="badge ok"> ikram</span>}
                    {item.discount_percent && <span className="badge warn"> %{item.discount_percent}</span>}
                  </td>
                  <td className="num">
                    {item.quantity} × {formatTL(item.unit_price)}
                  </td>
                  <td className="num">{formatTL(lineTotals(item).total)}</td>
                  <td className="right">
                    {canRefund && refundable && refundable.refundable > 0 && (
                      <button
                        className="btn small"
                        onClick={() => setRefunding({ itemId: item.id, max: refundable.refundable, name: item.name_snapshot })}
                      >
                        İade
                      </button>
                    )}
                    {refundable && refundable.refunded > 0 && <span className="badge danger">iade {formatTL(refundable.refunded)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="grow">
            Toplam <strong>{formatTL(detail.tab.total ?? detail.totals.total)}</strong>
            {detail.totals.cartDiscount > 0 && <span className="muted"> (sepet indirimi %{detail.tab.discount_percent})</span>}
          </span>
          {detail.payments.map((p) => (
            <span key={p.id} className="badge muted">
              {METHOD[p.method]} {formatTL(p.amount)}
            </span>
          ))}
        </div>
        {info.refunds.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <strong>İadeler</strong>
            <ul>
              {info.refunds.map((r) => (
                <li key={r.id}>
                  {formatDateTime(r.created_at)} · {METHOD[r.method]} {formatTL(r.amount)}
                  {r.reason && ` · ${r.reason}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!canRefund && info.totalRefundable > 0 && <p className="muted">İade için açık vardiya gerekli.</p>}
        <div className="actions">
          {canRefund && info.totalRefundable > 0 && (
            <>
              <button
                className="btn"
                onClick={() => setRefunding({ itemId: null, max: info.totalRefundable, name: 'Tutar' })}
              >
                Tutar iade et
              </button>
              <button className="btn danger" onClick={() => setAskAll(true)}>
                Tamamını iade et ({formatTL(info.totalRefundable)})
              </button>
            </>
          )}
          <button className="btn primary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
      {askAll && (
        <PromptDialog
          title="Tamamını iade et"
          label="Neden (isteğe bağlı)"
          confirmLabel="İade et"
          allowEmpty
          onClose={() => setAskAll(false)}
          onConfirm={(reason) =>
            void run(async () => {
              await api.refundAll(tabId, reason || null);
              setAskAll(false);
              await refreshed();
            }, 'İade kaydedildi.')
          }
        />
      )}
      {refunding && (
        <RefundDialog
          title={refunding.name}
          max={refunding.max}
          refundable={info.refundable}
          onClose={() => setRefunding(null)}
          onConfirm={(amount, method, reason) =>
            void run(async () => {
              await api.refundPart(tabId, { amount, method, itemId: refunding.itemId, reason });
              setRefunding(null);
              await refreshed();
            }, 'İade kaydedildi.')
          }
        />
      )}
    </div>
  );
}

function RefundDialog({
  title,
  max,
  refundable,
  onConfirm,
  onClose,
}: {
  title: string;
  max: number;
  refundable: Record<PaymentMethod, number>;
  onConfirm(amount: number, method: PaymentMethod, reason: string | null): void;
  onClose(): void;
}) {
  const methods = (['cash', 'card'] as const).filter((m) => refundable[m] > 0);
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? 'cash');
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const limit = Math.min(max, refundable[method]);
  const amount = keypadToKurus(text) ?? limit;
  return (
    <div className="overlay" onClick={(e) => (e.stopPropagation(), onClose())}>
      <div className="dialog payment" role="dialog" aria-label="İade" onClick={(e) => e.stopPropagation()}>
        <h3>İade · {title}</h3>
        <div className="row">
          {methods.map((m) => (
            <button key={m} className={`btn big grow${method === m ? ' active' : ''}`} onClick={() => setMethod(m)}>
              {METHOD[m]} (en fazla {formatTL(Math.min(max, refundable[m]))})
            </button>
          ))}
        </div>
        <div className="pay-field focus">
          <span className="muted">İade tutarı</span>
          <strong className="num" data-testid="refund-amount">
            {formatTL(amount)}
          </strong>
        </div>
        <Keypad value={text} onChange={setText} allowComma />
        <input
          className="input"
          placeholder="Neden (isteğe bağlı)"
          aria-label="İade nedeni"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {amount > limit && <div className="pay-problem">En fazla {formatTL(limit)} iade edilebilir.</div>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn danger solid"
            disabled={amount <= 0 || amount > limit}
            onClick={() => onConfirm(amount, method, reason || null)}
          >
            İade et
          </button>
        </div>
      </div>
    </div>
  );
}
