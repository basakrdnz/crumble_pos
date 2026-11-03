// Two POS computers on one cloud (2026-11-03): moving to the cafe PC, the new
// POS restored while the old one still had the day open, both worked on the
// same shift and the cloud refused the new one's writes ("Kapanmış vardiya
// değiştirilemez"), which stopped its sync. These checks stop that before it
// happens. They only run when the cloud answers; offline the POS works as
// before (offline-first).

export interface CloudShift {
  id: string;
  opened_at: string;
  closed_at: string | null;
}

// "03.11 16:17" in Istanbul (fixed UTC+3, like the reports); built by hand so
// it does not depend on the ICU data of the Node/Electron build.
function when(iso: string): string {
  const d = new Date(Date.parse(iso) + 3 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const OTHER_POS = 'Önce o kasada gün sonunu alın ve sol rayda "Senkron ✓" görünene kadar bekleyin. Aynı anda iki kasa kullanılmamalı.';

/** Marks the restore refusal, so the screen can ask "devam edilsin mi?" and retry with allowOpenShift. */
export const OPEN_SHIFT_IN_CLOUD = 'Bulutta açık bir vardiya var';

/**
 * Restore with an open shift in the cloud continues that day here. Right when
 * the old POS broke mid-day, wrong while it is still in use (2026-11-03), so
 * it needs an explicit yes.
 */
export function restoreConflict(cloudShifts: CloudShift[]): string | null {
  const open = cloudShifts.find((s) => s.closed_at === null);
  if (!open) return null;
  return `${OPEN_SHIFT_IN_CLOUD} (açılış ${when(open.opened_at)}). Eski kasa hâlâ kullanılıyorsa önce orada gün sonunu alın ve "Senkron ✓" görünene kadar bekleyin. Eski kasa bozulduysa ya da bir daha açılmayacaksa bu açık vardiyaya burada devam edebilirsiniz.`;
}

/** Opening a shift: no open shift in the cloud that this POS does not know (another POS's day). */
export function openConflict(cloudShifts: CloudShift[], localIds: ReadonlySet<string>): string | null {
  const open = cloudShifts.find((s) => s.closed_at === null && !localIds.has(s.id));
  if (!open) return null;
  return `Başka bir kasada açık vardiya var (açılış ${when(open.opened_at)}). ${OTHER_POS}`;
}

/** Continuing today's shift: the cloud refuses it once a later shift exists or another one is open. */
export function reopenConflict(cloudShifts: CloudShift[], shift: { id: string; opened_at: string }, localIds: ReadonlySet<string>): string | null {
  const open = cloudShifts.find((s) => s.closed_at === null && s.id !== shift.id && !localIds.has(s.id));
  if (open) return `Başka bir kasada açık vardiya var (açılış ${when(open.opened_at)}). ${OTHER_POS}`;
  const later = cloudShifts.find((s) => s.id !== shift.id && s.opened_at > shift.opened_at && !localIds.has(s.id));
  if (later) {
    return `Bu vardiyadan sonra başka bir kasada vardiya açılmış (açılış ${when(later.opened_at)}), bu vardiyaya devam edilemez. Bulut bilgisi için yöneticiye danışın.`;
  }
  return null;
}
