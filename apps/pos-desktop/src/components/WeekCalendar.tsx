import { addDays, type Day, istanbulDay, WEEKDAYS_SHORT, weekdayIndex } from '@crumble/shared';
import { useState } from 'react';
import { api } from '../api/client';
import { useApiData } from './useApi';

const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const mondayOf = (day: Day): Day => addDays(day, -weekdayIndex(day));
const firstOfMonth = (day: Day, delta: number): Day => {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
};

/**
 * Gün sonu takvimi (2026-11-02, display only): one week of days; days with a
 * shift carry a green tick, today is outlined. Arrows move a week; the arrows
 * by the month name move a month. Days are the shift's opening day (Istanbul).
 */
export function WeekCalendar({ refreshKey }: { refreshKey?: unknown }) {
  const today = istanbulDay(new Date().toISOString());
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [shifts] = useApiData(() => api.listShifts(400), [refreshKey]);
  const worked = new Set((shifts ?? []).map((s) => istanbulDay(s.opened_at)));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // The month a week belongs to is the month of its Thursday.
  const shownMonth = days[3]!;
  const label = monthName.format(new Date(`${shownMonth}T00:00:00.000Z`));

  return (
    <div className="week-cal" aria-label="Takvim">
      <div className="week-cal-head">
        <button className="cal-arrow" aria-label="Önceki ay" onClick={() => setMonday(mondayOf(firstOfMonth(shownMonth, -1)))}>
          ‹
        </button>
        <span className="cal-month">{label.charAt(0).toLocaleUpperCase('tr') + label.slice(1)}</span>
        <button className="cal-arrow" aria-label="Sonraki ay" onClick={() => setMonday(mondayOf(firstOfMonth(shownMonth, 1)))}>
          ›
        </button>
        {monday !== mondayOf(today) && (
          <button className="btn small ghost" onClick={() => setMonday(mondayOf(today))}>
            Bugün
          </button>
        )}
      </div>
      <div className="week-cal-row">
        <button className="cal-arrow" aria-label="Önceki hafta" onClick={() => setMonday(addDays(monday, -7))}>
          ‹
        </button>
        {days.map((day, i) => {
          const has = worked.has(day);
          return (
            <div
              key={day}
              className={`cal-day${day === today ? ' today' : ''}${day > today ? ' future' : ''}${has ? ' worked' : ''}`}
              data-day={day}
              title={has ? 'Vardiya açıldı' : undefined}
            >
              <span className="wd">{WEEKDAYS_SHORT[i]}</span>
              <span className="dn">{Number(day.slice(8))}</span>
              <span className="tick" aria-label={has ? 'vardiya var' : undefined}>
                {has ? '✓' : ''}
              </span>
            </div>
          );
        })}
        <button className="cal-arrow" aria-label="Sonraki hafta" onClick={() => setMonday(addDays(monday, 7))}>
          ›
        </button>
      </div>
    </div>
  );
}
