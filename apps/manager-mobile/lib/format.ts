export { formatTL } from '@crumble/shared';

const time = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const longDay = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long' });
const shortDay = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'short' });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
/** "YYYY-MM-DD" (already an Istanbul day) -> "2 Kasım Pazartesi". */
export const formatDay = (day: string) => longDay.format(new Date(`${day}T12:00:00Z`));
export const formatShortDay = (day: string) => shortDay.format(new Date(`${day}T12:00:00Z`));
