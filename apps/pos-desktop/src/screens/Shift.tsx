import type { Shift as ShiftRow, ShiftSummary, Tab } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useState } from 'react';
import { api } from '../api/client';
import { Keypad, keypadToKurus } from '../components/Keypad';
import { useAction, useApiData } from '../components/useApi';
import { formatDateTime, formatTime } from '../format';

export function OpenShiftPanel({ onOpened }: { onOpened(): void }) {
  const [text, setText] = useState('');
  const run = useAction();
  const cash = keypadToKurus(text);
  const open = () =>
    run(async () => {
      await api.openShift(cash ?? 0);
      onOpened();
    }, 'Vardiya açıldı.');
  return (
    <div className="content center">
      <div className="panel open-shift">
        <h2>Vardiyayı aç</h2>
        <p className="muted">Açık vardiya olmadan satış yapılamaz. Kasadaki açılış nakdini girin.</p>
        <div className="keypad-label">Açılış kasası (₺)</div>
        <div className="keypad-display" data-testid="opening-cash">
          {text ? formatTL(cash ?? 0) : '0,00 ₺'}
        </div>
        <Keypad value={text} onChange={setText} onEnter={() => void open()} allowComma enterLabel="Vardiyayı aç" />
      </div>
    </div>
  );
}

function SummaryTable({ summary, shift }: { summary: ShiftSummary; shift: ShiftRow }) {
  const rows: [string, string, string?][] = [
    ['Açılış', formatDateTime(shift.opened_at)],
    ['Kapanış', shift.closed_at ? formatDateTime(shift.closed_at) : 'Açık'],
    ['Açılış kasası', formatTL(summary.openingCash)],
    ['Nakit satışlar', formatTL(summary.cashSales)],
    ['Kart satışlar', formatTL(summary.cardSales)],
    ['Nakit iadeler', formatTL(summary.cashRefunds)],
    ['Kart iadeler', formatTL(summary.cardRefunds)],
    ['Beklenen nakit', formatTL(summary.expectedCash), 'strong'],
    ...(summary.countedCash !== null
      ? ([
          ['Sayılan nakit', formatTL(summary.countedCash), 'strong'],
          ['Fark', formatTL(summary.cashDifference ?? 0), (summary.cashDifference ?? 0) === 0 ? 'strong' : 'diff'],
        ] as [string, string, string][])
      : []),
    ['Satış adedi', String(summary.salesCount)],
    ['Satış toplamı', formatTL(summary.salesTotal)],
    ['İndirim toplamı', formatTL(summary.discountTotal)],
    ['İkram toplamı', formatTL(summary.compTotal)],
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

export function ShiftScreen({ shift, onShiftChange }: { shift: ShiftRow | null; onShiftChange(): void }) {
  const [summary, reloadSummary] = useApiData(
    () => (shift ? api.getShiftSummary(shift.id) : Promise.resolve(null)),
    [shift?.id],
  );
  const [history, reloadHistory] = useApiData(() => api.listShifts(60), [shift?.id]);
  const [closing, setClosing] = useState(false);
  const [report, setReport] = useState<{ shift: ShiftRow; summary: ShiftSummary; carried: number } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

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
        <div className="panel" style={{ maxWidth: 560 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 className="grow" style={{ margin: 0 }}>
              Açık vardiya · {formatTime(shift.opened_at)}
            </h2>
            <button className="btn" onClick={() => void reloadSummary()}>
              Yenile
            </button>
            <button className="btn primary" onClick={() => setClosing(true)}>
              Vardiyayı kapat
            </button>
          </div>
          {summary && <SummaryTable summary={summary} shift={shift} />}
        </div>
      ) : (
        <OpenShiftPanel onOpened={onShiftChange} />
      )}

      <h2 style={{ marginTop: 24 }}>Geçmiş vardiyalar</h2>
      <table className="grid" aria-label="Geçmiş vardiyalar">
        <thead>
          <tr>
            <th>Açılış</th>
            <th>Kapanış</th>
            <th className="right">Açılış kasası</th>
            <th className="right">Beklenen</th>
            <th className="right">Sayılan</th>
            <th className="right">Fark</th>
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
                <td className="num">{formatTL(s.opening_cash)}</td>
                <td className="num">{formatTL(s.expected_cash ?? 0)}</td>
                <td className="num">{formatTL(s.counted_cash ?? 0)}</td>
                <td className={`num${s.cash_difference ? ' diff' : ''}`}>{formatTL(s.cash_difference ?? 0)}</td>
                <td className="right">
                  <button className="btn small" onClick={() => setViewing(s.id)}>
                    Özet
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {closing && shift && (
        <CloseShiftDialog
          onClose={() => setClosing(false)}
          onClosed={(result) => {
            setClosing(false);
            setReport(result);
            onShiftChange();
            void reloadHistory();
          }}
        />
      )}
      {viewing && <PastShift shiftId={viewing} shifts={history ?? []} onClose={() => setViewing(null)} />}
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

function CloseShiftDialog({
  onClose,
  onClosed,
}: {
  onClose(): void;
  onClosed(result: { shift: ShiftRow; summary: ShiftSummary; carried: number }): void;
}) {
  const [openTabs] = useApiData(() => api.listOpenTabs());
  const [confirmedCarry, setConfirmedCarry] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const run = useAction();
  const counted = keypadToKurus(text);

  if (!openTabs) return null;

  const needsCarryDecision = openTabs.length > 0 && !confirmedCarry;

  const close = () =>
    run(async () => {
      if (counted === null) throw new Error('Sayılan nakdi girin.');
      const result = await api.closeShift(counted, notes);
      onClosed({ shift: result.shift, summary: result.summary, carried: result.carriedOverTabs });
    });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Vardiyayı kapat" onClick={(e) => e.stopPropagation()}>
        <h3>Vardiyayı kapat</h3>
        {needsCarryDecision ? (
          <>
            <p>
              <strong>{openTabs.length} açık hesap var.</strong> Kapatmadan önce ödemelerini alabilir ya da sonraki vardiyaya
              devredebilirsiniz. Devredilen hesabın ödemesi, ödendiği vardiyaya yazılır.
            </p>
            <OpenTabList tabs={openTabs} />
            <div className="actions">
              <button className="btn" onClick={onClose}>
                Hesaplara dön
              </button>
              <button className="btn primary" onClick={() => setConfirmedCarry(true)}>
                Sonraki vardiyaya devret
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="keypad-label">Sayılan nakit (₺)</div>
            <div className="keypad-display" data-testid="counted-cash">
              {counted === null ? '—' : formatTL(counted)}
            </div>
            <Keypad value={text} onChange={setText} allowComma />
            <input
              className="input"
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Not (isteğe bağlı)"
              aria-label="Vardiya notu"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="actions">
              <button className="btn" onClick={onClose}>
                Vazgeç
              </button>
              <button className="btn primary" disabled={counted === null} onClick={() => void close()}>
                Kapat ve özeti göster
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OpenTabList({ tabs }: { tabs: Tab[] }) {
  return (
    <ul className="open-tabs">
      {tabs.map((t) => (
        <li key={t.id}>
          {t.customer_name ?? (t.kind === 'quick' ? 'Yarım kalan hızlı satış' : 'Masa hesabı')} · {formatTime(t.opened_at)}
        </li>
      ))}
    </ul>
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
    <div className="print-area end-of-day" style={{ maxWidth: 520 }}>
      <h2>Gün sonu özeti</h2>
      <SummaryTable summary={summary} shift={shift} />
      {shift.notes && <p>Not: {shift.notes}</p>}
      {carried > 0 && <p className="muted">{carried} açık hesap sonraki vardiyaya devredildi.</p>}
      <div className="actions no-print">
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
