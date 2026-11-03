import { describe, expect, it } from 'vitest';
import { listShifts } from '../src/db/sales';
import { restoreFromCloud } from '../src/sync/restore';
import { type CloudShift, openConflict, reopenConflict, restoreConflict } from '../src/sync/shiftGuard';
import { testContext } from './helpers';

// The cafe PC case (2026-11-03): the old POS still had the day open.
const yesterday: CloudShift = { id: 'a', opened_at: '2026-11-02T16:00:00.000Z', closed_at: '2026-11-02T22:00:00.000Z' };
const todayOpen: CloudShift = { id: 'b', opened_at: '2026-11-03T13:17:00.000Z', closed_at: null };
const todayClosed: CloudShift = { ...todayOpen, closed_at: '2026-11-03T13:58:00.000Z' };
const later: CloudShift = { id: 'c', opened_at: '2026-11-03T13:59:00.000Z', closed_at: '2026-11-03T14:02:00.000Z' };

describe('two POS computers on one cloud', () => {
  it('restore is refused while the cloud has an open shift', () => {
    expect(restoreConflict([yesterday, todayOpen])).toMatch(/Bulutta açık bir vardiya var \(açılış 03\.11 16:17\)/);
    expect(restoreConflict([yesterday, todayClosed])).toBeNull();
  });

  it('opening a shift is refused while another POS has one open', () => {
    expect(openConflict([todayOpen], new Set())).toMatch(/Başka bir kasada açık vardiya var/);
    // Its own shift, closed here but not yet synced, is not another POS's.
    expect(openConflict([todayOpen], new Set(['b']))).toBeNull();
    expect(openConflict([yesterday, todayClosed], new Set())).toBeNull();
  });

  it('continuing today is refused once a later shift exists in the cloud', () => {
    expect(reopenConflict([todayClosed, later], todayClosed, new Set(['b']))).toMatch(/sonra başka bir kasada vardiya açılmış/);
    expect(reopenConflict([yesterday, todayClosed], todayClosed, new Set(['a', 'b']))).toBeNull();
    expect(reopenConflict([todayClosed, { ...later, closed_at: null }], todayClosed, new Set(['b']))).toMatch(/açık vardiya var/);
  });

  it('restoreFromCloud stops before writing anything', async () => {
    const ctx = testContext();
    const cloud: Record<string, unknown[]> = {
      shifts: [{ ...todayOpen, opening_cash: 0, counted_cash: null, expected_cash: null, cash_difference: null, notes: null, created_at: todayOpen.opened_at, updated_at: todayOpen.opened_at }],
    };
    const reader = { readAll: async (t: string) => (cloud[t] ?? []) as Record<string, unknown>[] };
    await expect(restoreFromCloud(ctx, reader)).rejects.toThrow(/açık bir vardiya/);
    expect(listShifts(ctx, 10)).toHaveLength(0);
    // The old POS broke mid-day: the partner confirms and the day continues here.
    await restoreFromCloud(ctx, reader, { allowOpenShift: true });
    expect(listShifts(ctx, 10).map((s) => s.closed_at)).toEqual([null]);
  });
});
