const dateTime = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const longDate = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
});
const time = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

/** UTC ISO timestamp -> "01.11.2026 11:00" in Europe/Istanbul (plan §4). */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

/** UTC ISO timestamp -> "2 Kasım 2026 Pazartesi" in Europe/Istanbul. */
export function formatLongDate(iso: string): string {
  return longDate.format(new Date(iso));
}
