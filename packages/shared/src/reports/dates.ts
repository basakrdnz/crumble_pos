// Report days are Europe/Istanbul calendar days (plan §4). Türkiye has used
// a fixed UTC+3 offset with no daylight saving since 2016, so day boundaries
// are computed with that offset; display formatting still uses Intl.

const OFFSET_MS = 3 * 60 * 60 * 1000;

/** A calendar day as "YYYY-MM-DD". */
export type Day = string;

/** UTC timestamp -> Istanbul calendar day. */
export function istanbulDay(iso: string): Day {
  return new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC timestamp -> Istanbul hour 0..23. */
export function istanbulHour(iso: string): number {
  return new Date(Date.parse(iso) + OFFSET_MS).getUTCHours();
}

/** [start, end) of an Istanbul day as UTC ISO timestamps. */
export function dayBounds(day: Day): { start: string; end: string } {
  const start = Date.parse(`${day}T00:00:00.000Z`) - OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() };
}

export function addDays(day: Day, n: number): Day {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function weekStart(day: Day): Day {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

export function monthStart(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

/** Inclusive list of days from..to. */
export function daysBetween(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayIstanbul(now: Date = new Date()): Day {
  return istanbulDay(now.toISOString());
}
