import type { PaymentMethod, Shift as ShiftRow, ShiftSummary } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction, useApiData } from '../components/useApi';
import type { OpenTabSummary } from '../db/sales';
import { formatDateTime, formatTime } from '../format';

/** No cash count (2026-10-29): opening a shift is one click. */
export function OpenShiftPanel({ onOpened }: { onOpened(): void }) {
  const run = useAction();
  const open = () =>
    run(async () => {
      await api.openShift();
      onOpened();
    }, 'Vardiya açıldı.');
  return (
    <div className="content center">
      <div className="panel open-shift">
        <h2>Vardiyayı aç</h2>
        <p className="muted">Açık vardiya olmadan satış yapılamaz. Açılış saati otomatik kaydedilir.</p>
        <button className="btn primary big" autoFocus onClick={() => void open()}>
          Vardiyayı aç
        </button>
      </div>
    </div>
  );
}

function Stats({ summary }: { summary: ShiftSummary }) {
  const refunds = summary.cashRefunds + summary.cardRefunds;
  const stats: [string, string, string][] = [
    ['Ciro', formatTL(summary.salesTotal), `${summary.salesCount} satış`],
    ['Nakit', formatTL(summary.cashSales), summary.cashRefunds ? `iade −${formatTL(summary.cashRefunds)}` : 'nakit ödemeler'],
    ['Kart', formatTL(summary.cardSales), summary.cardRefunds ? `iade −${formatTL(summary.cardRefunds)}` : 'kart ödemeler'],
    ['İndirim', formatTL(summary.discountTotal), 'sepet indirimleri'],
    ['İade', formatTL(refunds), 'nakit + kart'],
    ['İptal', formatTL(summary.voidTotal), summary.voidedTabCount ? `${summary.voidedTabCount} hesap iptal` : 'çıkarılan satırlar'],
  ];
  return (
    <div className="stats">
      {stats.map(([label, value, sub]) => (
        <div key={label} className="stat">
          <div className="label">{label}</div>
          <div className="value" data-stat={label}>
            {value}
          </div>
          <div className="sub">{sub}</div>
        </div>
      ))}
    </div>
  );
}

function SummaryTable({ summary, shift }: { summary: ShiftSummary; shift: ShiftRow }) {
  const rows: [string, string, string?][] = [
    ['Açılış', formatDateTime(shift.opened_at)],
    ['Kapanış', shift.closed_at ? formatDateTime(shift.closed_at) : 'Açık'],
    ['Satış adedi', String(summary.salesCount)],
    ['Satış toplamı', formatTL(summary.salesTotal), 'strong'],
    ['Nakit satışlar', formatTL(summary.cashSales)],
    ['Kart satışlar', formatTL(summary.cardSales)],
    ['Nakit iadeler', formatTL(summary.cashRefunds)],
    ['Kart iadeler', formatTL(summary.cardRefunds)],
    // Older shifts were opened with a cash amount and counted at close.
    ...(summary.openingCash > 0 ? ([['Açılış kasası', formatTL(summary.openingCash)]] as [string, string][]) : []),
    ['Beklenen nakit', formatTL(summary.expectedCash), 'strong'],
    ...(summary.countedCash !== null
      ? ([
          ['Sayılan nakit', formatTL(summary.countedCash)],
          ['Fark', formatTL(summary.cashDifference ?? 0), (summary.cashDifference ?? 0) === 0 ? '' : 'diff'],
        ] as [string, string, string][])
      : []),
    ['İndirim toplamı', formatTL(summary.discountTotal)],
    ...(summary.compTotal > 0 ? ([['İkram toplamı', formatTL(summary.compTotal)]] as [string, string][]) : []),
    ['İptal toplamı', `${formatTL(summary.voidTotal)}${summary.voidedTabCount ? ` (${summary.voidedTabCount} hesap)` : ''}`],
    ['Fiyat değişikliği farkı', formatTL(summary.priceChangeTotal)],
  ];
  return (
    <table className="grid summary" aria-label="Vardiya özeti">
      <tbody>
        {rows.map(([label, value, style]) => (
          <tr key={label} className={style ?? ''}>
            <td>{label}</td>
            <td className="num" data-summary={label}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Report = { shift: ShiftRow; summary: ShiftSummary; carried: number };

export function ShiftScreen({ shift, onShiftChange }: { shift: ShiftRow | null; onShiftChange(): void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [history, reloadHistory] = useApiData(() => api.listShifts(60), [shift?.id]);

  if (report) {
    return (
      <div className="content">
        <EndOfDay shift={report.shift} summary={report.summary} carried={report.carried} onDone={() => setReport(null)} />
      </div>
    );
  }

  return (
    <div className="content">
      {shift ? (
        <DayEnd
          shift={shift}
          onClosed={(r) => {
            setReport(r);
            onShiftChange();
            void reloadHistory();
          }}
        />
      ) : (
        <OpenShiftPanel onOpened={onShiftChange} />
      )}

      <h2 style={{ marginTop: 32 }}>Geçmiş vardiyalar</h2>
      <table className="grid" aria-label="Geçmiş vardiyalar">
        <thead>
          <tr>
            <th>Açılış</th>
            <th>Kapanış</th>
            <th className="right">Beklenen nakit</th>
            <th>Not</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(history ?? [])
            .filter((s) => s.closed_at)
            .map((s) => (
              <tr key={s.id}>
                <td>{formatDateTime(s.opened_at)}</td>
                <td>{formatDateTime(s.closed_at!)}</td>
                <td className="num">{formatTL(s.expected_cash ?? 0)}</td>
                <td className="muted">{s.notes ?? ''}</td>
                <td className="right">
                  <button className="btn small" onClick={() => setViewing(s.id)}>
                    Özet
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {viewing && <PastShift shiftId={viewing} shifts={history ?? []} onClose={() => setViewing(null)} />}
    </div>
  );
}

type Decision = { kind: 'paid'; method: PaymentMethod } | { kind: 'void' } | { kind: 'carry' };

/**
 * Gün sonu (2026-10-29): today's totals and every open tab. Each open tab
 * needs a decision (nakit / kart / devret / iptal) before the day can end.
 * Paying and cancelling happen at once; carrying over is only noted here and
 * passed to closeShift.
 */
function DayEnd({ shift, onClosed }: { shift: ShiftRow; onClosed(report: Report): void }) {
  const [summary, reloadSummary] = useApiData(() => api.getShiftSummary(shift.id), [shift.id]);
  const [open, reloadOpen] = useApiData(() => api.listOpenTabSummaries(true), [shift.id]);
  const [decided, setDecided] = useState<Map<string, { title: string; amount: number; decision: Decision }>>(new Map());
  const [notes, setNotes] = useState('');
  const run = useAction();

  if (!summary || !open) return null;

  const rows: (OpenTabSummary | { tab: { id: string }; title: string; remaining: number; done: true })[] = [
    ...open,
    ...[...decided].filter(([id, d]) => d.decision.kind !== 'carry' && !open.some((o) => o.tab.id === id)).map(([id, d]) => ({
      tab: { id },
      title: d.title,
      remaining: d.amount,
      done: true as const,
    })),
  ];
  const pending = open.filter((o) => decided.get(o.tab.id)?.decision.kind !== 'carry');
  const carry = open.filter((o) => decided.get(o.tab.id)?.decision.kind === 'carry').map((o) => o.tab.id);

  const note = (o: OpenTabSummary, decision: Decision) =>
    setDecided((m) => new Map(m).set(o.tab.id, { title: o.title, amount: o.remaining, decision }));
  const refresh = async () => {
    await Promise.all([reloadOpen(), reloadSummary()]);
  };

  const payTab = (o: OpenTabSummary, method: PaymentMethod) =>
    run(async () => {
      await api.pay(o.tab.id, o.remaining > 0 ? [{ method, amount: o.remaining }] : []);
      note(o, { kind: 'paid', method });
      await refresh();
    });
  const voidTab = (o: OpenTabSummary) => {
    const question =
      o.total !== o.remaining
        ? `${o.title}: alınan ${formatTL(o.total - o.remaining)} iade edilip hesap iptal edilsin mi?`
        : `${o.title} iptal edilsin mi? İptal kaydı tutulur.`;
    if (!window.confirm(question)) return;
    void run(async () => {
      await api.refundAndVoid(o.tab.id, 'gün sonu');
      note(o, { kind: 'void' });
      await refresh();
    });
  };
  const close = () =>
    run(async () => {
      const result = await api.closeShift({ carryOverTabIds: carry, notes });
      onClosed({ shift: result.shift, summary: result.summary, carried: result.carriedOverTabs });
    });

  return (
    <div className="day-end">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Gün sonu</h2>
          <div className="muted" style={{ fontWeight: 600, marginTop: 4 }}>
            Vardiya {formatTime(shift.opened_at)}'de açıldı
          </div>
        </div>
        <Stats summary={summary} />
        <div className="panel muted" style={{ fontSize: 14, lineHeight: '22px' }}>
          Ürün bazlı rapor ve en çok satanlar <b style={{ color: 'var(--ink)' }}>yönetim uygulamasında</b>. Kasadaki gün sonu
          sadece özeti gösterir.
        </div>
      </div>
      <div className="panel decision-col" aria-label="Açık hesaplar">
        <div>
          <h3 style={{ margin: 0 }}>Açık hesaplar</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: '19px', marginTop: 4 }}>
            Her açık hesap için karar ver: ödet, sonraki vardiyaya devret veya iptal et. Hepsine karar verilmeden gün sonu
            alınamaz.
          </div>
        </div>
        {rows.length === 0 && <div className="muted">Açık hesap yok.</div>}
        {rows.map((o) => {
          const d = decided.get(o.tab.id)?.decision;
          const done = 'done' in o;
          return (
            <div
              key={o.tab.id}
              className={`decision${done ? ' done' : d?.kind === 'carry' ? ' carry' : ''}`}
              data-decision={o.title}
            >
              <div className="head">
                <span>{o.title}</span>
                <span className="num">{formatTL(o.remaining)}</span>
              </div>
              {done ? (
                <div className="result">
                  ✓ {d?.kind === 'void' ? 'İptal edildi' : d?.kind === 'paid' && d.method === 'card' ? 'Kartla ödendi' : 'Nakit ödendi'}
                </div>
              ) : d?.kind === 'carry' ? (
                <div className="result">
                  <span>✓ Sonraki vardiyaya devredilecek</span>
                  <button
                    className="btn small ghost"
                    onClick={() =>
                      setDecided((m) => {
                        const next = new Map(m);
                        next.delete(o.tab.id);
                        return next;
                      })
                    }
                  >
                    Geri al
                  </button>
                </div>
              ) : (
                <div className="choices">
                  <button className="btn primary" onClick={() => void payTab(o as OpenTabSummary, 'cash')}>
                    Nakit
                  </button>
                  <button className="btn card" onClick={() => void payTab(o as OpenTabSummary, 'card')}>
                    Kart
                  </button>
                  <button className="btn apply" onClick={() => note(o as OpenTabSummary, { kind: 'carry' })}>
                    Devret
                  </button>
                  <button className="btn danger" onClick={() => voidTab(o as OpenTabSummary)}>
                    İptal
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div className="grow" />
        <input
          className="input"
          placeholder="Not (isteğe bağlı)"
          aria-label="Vardiya notu"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {pending.length > 0 && <div className="blocker">{pending.length} hesap karar bekliyor</div>}
        <button className="btn dark big" disabled={pending.length > 0} onClick={() => void close()}>
          Gün sonunu al
        </button>
      </div>
    </div>
  );
}

function PastShift({ shiftId, shifts, onClose }: { shiftId: string; shifts: ShiftRow[]; onClose(): void }) {
  const [summary] = useApiData(() => api.getShiftSummary(shiftId), [shiftId]);
  const shift = shifts.find((s) => s.id === shiftId);
  if (!shift || !summary) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <EndOfDay shift={shift} summary={summary} carried={0} onDone={onClose} doneLabel="Kapat" />
      </div>
    </div>
  );
}

function EndOfDay({
  shift,
  summary,
  carried,
  onDone,
  doneLabel = 'Tamam',
}: {
  shift: ShiftRow;
  summary: ShiftSummary;
  carried: number;
  onDone(): void;
  doneLabel?: string;
}) {
  return (
    <div className="print-area end-of-day" style={{ maxWidth: 560 }}>
      <h2>Gün sonu özeti</h2>
      <SummaryTable summary={summary} shift={shift} />
      {shift.notes && <p>Not: {shift.notes}</p>}
      {carried > 0 && <p className="muted">{carried} açık hesap sonraki vardiyaya devredildi.</p>}
      <div className="actions no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={() => window.print()}>
          Yazdır
        </button>
        <button className="btn primary" onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
