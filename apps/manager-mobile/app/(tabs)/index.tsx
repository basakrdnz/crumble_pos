import {
  addDays,
  busyness,
  BUSY_WINDOW_MINUTES,
  compareSoFar,
  formatTL,
  heatmap,
  hourlyRevenue,
  monthStart,
  periodTotals,
  type ReportData,
  sumKurus,
  todayIstanbul,
  weekdayIndex,
  WEEKDAYS_SHORT,
} from '@crumble/shared';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../components/theme';
import { BusyMeter, Card, Columns, Delta, Fact, Label, LastSync, Screen, ShiftLight } from '../../components/ui';
import { loadCatalog, loadItemsSince, loadOpenShift, loadOpenTabTotals, loadReportData } from '../../lib/data';
import { formatDay, formatTime, tabLabel } from '../../lib/format';
import { useLive } from '../../lib/useLive';

const WEEKDAY_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

function onlyDay(data: ReportData, day: string): ReportData {
  const shifts = data.shifts.filter((s) => s.opened_at && formatDayKey(s.opened_at) === day);
  const ids = new Set(shifts.map((s) => s.id));
  return {
    shifts,
    tabs: data.tabs.filter((t) => t.closed_shift_id && ids.has(t.closed_shift_id)),
    items: data.items,
    payments: data.payments.filter((p) => ids.has(p.shift_id)),
    refunds: data.refunds.filter((r) => ids.has(r.shift_id)),
  };
}
const formatDayKey = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

/** Bugün (B1, 2026-10-30): live takings with "so far" comparisons and the hour chart. */
export default function Today() {
  const insets = useSafeAreaInsets();
  // The forest-green hero needs white status bar text; the other tabs are light.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );
  const { data, error, refreshing, reload } = useLive(async () => {
    const today = todayIstanbul();
    const from = [addDays(today, -7), monthStart(today)].sort()[0]!;
    const now = new Date().toISOString();
    const since = new Date(Date.parse(now) - BUSY_WINDOW_MINUTES * 60_000).toISOString();
    const [report, open, catalog, openShift, recent] = await Promise.all([
      loadReportData(from, today),
      loadOpenTabTotals(),
      loadCatalog(),
      loadOpenShift(),
      loadItemsSince(since),
    ]);
    return { today, report, open, catalog, openShift, recent, now };
  });

  if (!data) return <Screen title="Bugün" refreshing={refreshing} onRefresh={() => void reload()} error={error}>{null}</Screen>;

  const { today, report, open, catalog, now } = data;
  const todayData = onlyDay(report, today);
  const totals = periodTotals(todayData);
  const cmp = compareSoFar(report.tabs, now);
  const weekday = weekdayIndex(today);
  const currentHour = Number(formatTime(now).slice(0, 2));

  // Today's hours against this month's average for the same weekday (before today).
  const avg = today > monthStart(today) ? heatmap(report.tabs, report.shifts, monthStart(today), addDays(today, -1), now).cells[weekday]! : [];
  const hours = hourlyRevenue(report.tabs, today);
  const openHours = [...hours.keys()].filter((h) => hours[h]! > 0 || avg[h]);
  const from = Math.min(...(openHours.length ? openHours : [8]), currentHour);
  const to = Math.max(...(openHours.length ? openHours : [20]), currentHour);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const peak = range.reduce((best, h) => (hours[h]! > (hours[best] ?? 0) ? h : best), range[0]!);
  const hasAvg = avg.some((c) => c);

  const seated = open.filter((o) => o.tab.kind !== 'quick');
  const oldest = [...seated].sort((a, b) => a.tab.opened_at.localeCompare(b.tab.opened_at))[0]?.tab;
  const openTotal = sumKurus(seated.map((o) => o.total));
  const busy = busyness(data.recent, catalog, [...report.tabs, ...open.map((o) => o.tab)], now);
  const minutes = oldest ? Math.round((Date.parse(now) - Date.parse(oldest.opened_at)) / 60_000) : 0;

  const hero = (
    <View style={[s.hero, { paddingTop: insets.top + 16 }]}>
      <View style={s.heroTop}>
        <Text style={s.brand}>CRUMBLE</Text>
        <LastSync onDark />
      </View>
      <View style={s.chips}>
        <ShiftLight open={!!data.openShift} since={data.openShift ? `açılış ${formatTime(data.openShift.opened_at)}` : undefined} />
        {data.openShift && <BusyMeter busy={busy} />}
      </View>
      <Text style={s.heroLabel}>
        Bugün · {formatDay(today)} · {formatTime(now)}
      </Text>
      <Text style={s.heroBig} testID="today-revenue">
        {formatTL(totals.revenue)}
      </Text>
      <View style={s.pills}>
        <View style={s.pill}>
          <Text style={s.pillText}>Dün bu saatte {formatTL(cmp.yesterday.revenue)} · </Text>
          <Delta value={cmp.vsYesterday} onDark />
        </View>
        <View style={s.pill}>
          <Text style={s.pillText}>
            Geçen {WEEKDAY_LONG[weekday]} {formatTL(cmp.lastWeek.revenue)} ·{' '}
          </Text>
          <Delta value={cmp.vsLastWeek} onDark />
        </View>
      </View>
      <View style={s.heroGrid}>
        <View style={s.heroCell}>
          <Text style={s.heroCellLabel}>Nakit</Text>
          <Text style={s.heroCellValue} testID="today-cash">
            {formatTL(totals.cash)}
          </Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroCellLabel}>Kart</Text>
          <Text style={s.heroCellValue} testID="today-card">
            {formatTL(totals.card)}
          </Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroCellLabel}>Satış</Text>
          <Text style={s.heroCellValue} testID="today-count">
            {totals.salesCount}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Screen hero={hero} refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <Card>
        <Label>
          Saat saat · bugün{hasAvg ? ` ve bu ayın ${WEEKDAY_LONG[weekday]} ortalaması` : ''}
        </Label>
        <View style={{ marginTop: 10 }}>
          <Columns
            values={range.map((h) => hours[h]!)}
            compare={hasAvg ? range.map((h) => avg[h]?.revenue ?? null) : undefined}
            labels={range.map((h, i) => (i % 3 === 0 ? String(h).padStart(2, '0') : ''))}
            highlight={hours[peak]! > 0 ? range.indexOf(peak) : undefined}
          />
        </View>
        <View style={s.legend}>
          <Text style={s.legendText}>■ Bugün</Text>
          {hasAvg && <Text style={s.legendText}>- - Ortalama</Text>}
        </View>
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        {hours[peak]! > 0 && (
          <Fact tone="up">
            En yoğun saat {String(peak).padStart(2, '0')}:00–{String(peak + 1).padStart(2, '0')}:00 · {formatTL(hours[peak]!)}
          </Fact>
        )}
        <Pressable onPress={() => router.push('/open-tabs')} accessibilityRole="button" testID="today-open-tabs">
          <Fact tone="info">
            Açık hesap {seated.length} · {formatTL(openTotal)}
            {oldest ? ` · en eskisi ${tabLabel(oldest, catalog.tables)}, ${Math.floor(minutes / 60)} sa ${minutes % 60} dk` : ''}  ›
          </Fact>
        </Pressable>
        <Fact tone="down">
          İndirim {formatTL(totals.discount)} · İptal {formatTL(totals.void)} · İade {formatTL(totals.refunds)}
        </Fact>
      </Card>
      <Text style={s.foot} testID="today-basket">
        {WEEKDAYS_SHORT[weekday]} · ortalama sepet {formatTL(totals.salesCount ? Math.round(totals.revenue / totals.salesCount) : 0)}
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.forest, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 },
  brand: { fontFamily: fonts.brand, color: '#fff', fontSize: 14, letterSpacing: 2.5 },
  heroLabel: { marginTop: 16, fontSize: 13, fontFamily: fonts.bold, color: colors.forestMuted },
  heroBig: { fontSize: 42, fontFamily: fonts.heavy, color: '#fff', marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.forestChip, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontFamily: fonts.heavy, color: '#fff' },
  heroGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroCell: { flex: 1, backgroundColor: colors.forestChip, borderRadius: 14, padding: 10 },
  heroCellLabel: { fontSize: 11, fontFamily: fonts.bold, color: colors.forestMuted },
  heroCellValue: { fontSize: 16, fontFamily: fonts.heavy, color: '#fff', marginTop: 2 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 8 },
  legendText: { fontSize: 11, fontFamily: fonts.bold, color: colors.muted },
  foot: { fontSize: 12, fontFamily: fonts.semibold, color: colors.muted, textAlign: 'center' },
});
