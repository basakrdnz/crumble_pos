import { type FloorTable, istanbulDay, type Tab, todayIstanbul } from '@crumble/shared';

export { formatTL } from '@crumble/shared';

/** "Masa 5" / "Kanepe 1" / customer name / "Hızlı satış" (same as the POS). */
export function tabLabel(tab: Pick<Tab, 'table_id' | 'customer_name' | 'kind'>, tables: readonly FloorTable[]): string {
  const label = tables.find((t) => t.id === tab.table_id)?.label;
  const place = label === undefined ? undefined : /^\d+$/.test(label) ? `Masa ${label}` : label;
  return [place, tab.customer_name].filter(Boolean).join(' · ') || (tab.kind === 'quick' ? 'Hızlı satış' : 'Hesap');
}

// Dates are formatted by hand with the fixed Istanbul offset (UTC+3, no DST
// since 2016), not Intl: Android's engine may ignore the time zone or the
// Turkish names, and the phone's own zone must not matter (2026-11-23).
const OFFSET = 3 * 3_600_000;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const two = (n: number) => String(n).padStart(2, '0');
const ist = (iso: string) => new Date(Date.parse(iso) + OFFSET);

/** "14:05" in Istanbul. */
export const formatTime = (iso: string) => {
  const d = ist(iso);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};
/** "03.11 18:05" in Istanbul. */
export const formatDateTime = (iso: string) => {
  const d = ist(iso);
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};
/** "YYYY-MM-DD" (already an Istanbul day) -> "2 Kasım Pazartesi". */
export const formatDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${WEEKDAYS[d.getUTCDay()]}`;
};
/** "YYYY-MM-DD" -> "2 Kas". */
export const formatShortDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
};
/** Istanbul hour 0–23 now. */
export const istanbulHourNow = () => ist(new Date().toISOString()).getUTCHours();

/** "bugün açıldı" / "dünden beri açık" / "5 gündür açık" (Istanbul days). */
export function openFor(openedAt: string): string {
  const days = Math.round((Date.parse(todayIstanbul()) - Date.parse(istanbulDay(openedAt))) / 86_400_000);
  return days <= 0 ? 'bugün açıldı' : days === 1 ? 'dünden beri açık' : `${days} gündür açık`;
}
