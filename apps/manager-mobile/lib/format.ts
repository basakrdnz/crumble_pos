import type { FloorTable, Tab } from '@crumble/shared';

export { formatTL } from '@crumble/shared';

/** "Masa 5" / "Kanepe 1" / customer name / "Hızlı satış" (same as the POS). */
export function tabLabel(tab: Pick<Tab, 'table_id' | 'customer_name' | 'kind'>, tables: readonly FloorTable[]): string {
  const label = tables.find((t) => t.id === tab.table_id)?.label;
  const place = label === undefined ? undefined : /^\d+$/.test(label) ? `Masa ${label}` : label;
  return [place, tab.customer_name].filter(Boolean).join(' · ') || (tab.kind === 'quick' ? 'Hızlı satış' : 'Hesap');
}

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
