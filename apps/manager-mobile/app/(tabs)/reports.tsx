// Raporlar (yeniden tasarım 2026-11-22, Design artifact "Raporlar yeniden
// tasarım"): one page with Gün / Hafta / Ay, arrows to any period, and every
// comparison saying what it compares with, by date. Fixed rule: a day against
// the same weekday last week, a week against last week, a month against last
// month; an unfinished period against the same stretch of the one before.
import {
  addDays,
  type Day,
  dayBounds,
  daysBetween,
  formatTL,
  heatmap,
  hourlyRevenue,
  istanbulDay,
  type Kurus,
  monthStart,
  percentChange,
  periodSales,
  periodTotals,
  productReport,
  type ReportData,
  revenueSeries,
  todayIstanbul,
  weekdayIndex,
  WEEKDAYS_SHORT,
  weekStart,
} from '@crumble/shared';
import { useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, heat } from '../../components/theme';
import { Card, Columns, Empty, HeatGrid, Label, Row, Screen, Section, Segmented, styles } from '../../components/ui';
import { type DayRange, presetRanges, RangeSheet } from '../../components/RangePicker';
import { type Catalog, loadCatalog, loadReportData, loadShifts } from '../../lib/data';
import { useLive } from '../../lib/useLive';

type Grain = 'day' | 'week' | 'month' | 'range';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const dayNum = (d: Day) => Number(d.slice(8, 10));
const monthName = (d: Day) => MONTHS[Number(d.slice(5, 7)) - 1]!;
const shortDate = (d: Day) => `${dayNum(d)} ${monthName(d)}`;
const longDate = (d: Day) => `${shortDate(d)} ${WEEKDAYS[weekdayIndex(d)]}`;
const monthTitle = (d: Day) => `${monthName(d)} ${d.slice(0, 4)}`;
const monthEnd = (m: Day) => addDays(monthStart(addDays(m, 32)), -1);
const minDay = (a: Day, b: Day) => (a < b ? a : b);
function rangeText(from: Day, to: Day): string {
  if (from === to) return shortDate(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${dayNum(from)} – ${shortDate(to)}` : `${shortDate(from)} – ${shortDate(to)}`;
}
const hh = (h: number) => String(h).padStart(2, '0');

interface Period {
  grain: Grain;
  from: Day;
  /** Last day with data so far (today for a running period). */
  to: Day;
  /** Last day of the whole period. */
  end: Day;
  prev: { from: Day; to: Day };
  ongoing: boolean;
  title: string;
  subtitle: string;
  /** "Geçen Cumartesi (15 Kasım)" — what the numbers are compared with. */
  prevLabel: string;
  /** Short form for list rows: "geçen Cmt". */
  prevShort: string;
}

function periodOf(grain: Grain, anchor: Day, today: Day, range: DayRange): Period {
  if (grain === 'range') {
    const n = daysBetween(range.from, range.to).length;
    const prev = { from: addDays(range.from, -n), to: addDays(range.from, -1) };
    const ongoing = range.to === today;
    return {
      grain,
      from: range.from,
      to: range.to,
      end: range.to,
      prev,
      ongoing,
      title: rangeText(range.from, range.to),
      subtitle: `${n} gün · değiştirmek için dokun`,
      prevLabel: `Önceki ${n} gün (${rangeText(prev.from, prev.to)})${ongoing ? ', aynı saate kadar' : ''}`,
      prevShort: `önceki ${n} gün`,
    };
  }
  if (grain === 'day') {
    const prev = addDays(anchor, -7);
    const w = weekdayIndex(anchor);
    const ongoing = anchor === today;
    return {
      grain,
      from: anchor,
      to: anchor,
      end: anchor,
      prev: { from: prev, to: prev },
      ongoing,
      title: longDate(anchor),
      subtitle: ongoing ? 'Bugün' : anchor === addDays(today, -1) ? 'Dün' : '',
      prevLabel: `Geçen ${WEEKDAYS[w]} (${shortDate(prev)})${ongoing ? ', aynı saate kadar' : ''}`,
      prevShort: `geçen ${WEEKDAYS_SHORT[w]}`,
    };
  }
  if (grain === 'week') {
    const from = weekStart(anchor);
    const end = addDays(from, 6);
    const to = minDay(end, today);
    const ongoing = today <= end;
    const prev = { from: addDays(from, -7), to: addDays(to, -7) };
    const days = daysBetween(from, to).length;
    return {
      grain,
      from,
      to,
      end,
      prev,
      ongoing,
      title: rangeText(from, end),
      subtitle: ongoing ? `Bu hafta · Pazartesi'den bugüne ${days} gün` : '',
      prevLabel: ongoing ? `Geçen hafta aynı günler (${rangeText(prev.from, prev.to)}), aynı saate kadar` : `Geçen hafta (${rangeText(prev.from, prev.to)})`,
      prevShort: 'geçen hafta',
    };
  }
  const from = monthStart(anchor);
  const end = monthEnd(from);
  const to = minDay(end, today);
  const ongoing = today <= end;
  const prevFrom = monthStart(addDays(from, -1));
  const prevEnd = addDays(from, -1);
  const prevTo = ongoing ? minDay(addDays(prevFrom, daysBetween(from, to).length - 1), prevEnd) : prevEnd;
  return {
    grain,
    from,
    to,
    end,
    prev: { from: prevFrom, to: prevTo },
    ongoing,
    title: monthTitle(from),
    subtitle: ongoing ? `Bu ay · ${rangeText(from, to)}` : '',
    prevLabel: ongoing ? `${monthName(prevFrom)} aynı günler (${rangeText(prevFrom, prevTo)}), aynı saate kadar` : monthTitle(prevFrom),
    prevShort: `${monthName(prevFrom)}`,
  };
}

function step(grain: Grain, anchor: Day, dir: -1 | 1): Day {
  if (grain === 'day') return addDays(anchor, dir);
  if (grain === 'week') return addDays(weekStart(anchor), 7 * dir);
  const m = monthStart(anchor);
  return dir < 0 ? monthStart(addDays(m, -1)) : addDays(monthEnd(m), 1);
}

/** The same moment as now, on the last day of the previous period (an unfinished period's comparison). */
function cutoffFor(p: Period, today: Day): string | undefined {
  if (!p.ongoing) return undefined;
  const sinceMidnight = Date.now() - Date.parse(dayBounds(today).start);
  return new Date(Date.parse(dayBounds(p.prev.to).start) + sinceMidnight).toISOString();
}

function shiftRange(r: DayRange, dir: -1 | 1): DayRange {
  const n = daysBetween(r.from, r.to).length;
  return { from: addDays(r.from, n * dir), to: addDays(r.to, n * dir) };
}

export default function Reports() {
  const [grain, setGrain] = useState<Grain>('day');
  const [anchor, setAnchor] = useState<Day>(todayIstanbul());
  const [range, setRange] = useState<DayRange>(() => presetRanges(todayIstanbul())[0]![1]);
  const [picking, setPicking] = useState(false);
  const { data: shiftDays } = useLive(async () => new Set((await loadShifts(400)).map((sh) => istanbulDay(sh.opened_at))));
  // Raporlar always opens on today (kullanıcı 2026-11-21).
  useFocusEffect(
    useCallback(() => {
      setGrain('day');
      setAnchor(todayIstanbul());
    }, []),
  );
  const today = todayIstanbul();
  const p = periodOf(grain, anchor, today, range);
  const { data, error, refreshing, reload } = useLive(async () => {
    const [cur, prev, catalog] = await Promise.all([loadReportData(p.from, p.to), loadReportData(p.prev.from, p.prev.to), loadCatalog()]);
    return { cur, prev, catalog };
  }, [grain, anchor, range.from, range.to]);
  const go = (g: Grain, day: Day) => {
    setGrain(g);
    setAnchor(day);
  };
  const canNext = grain === 'range' ? shiftRange(range, 1).to <= today : step(grain, anchor, 1) <= today;
  const move = (dir: -1 | 1) => (grain === 'range' ? setRange(shiftRange(range, dir)) : setAnchor(step(grain, anchor, dir)));

  return (
    <Screen title="Raporlar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <Segmented<Grain>
        value={grain}
        options={[
          ['day', 'Gün'],
          ['week', 'Hafta'],
          ['month', 'Ay'],
          ['range', 'Aralık'],
        ]}
        onChange={(g) => {
          if (g === 'range') {
            setGrain('range');
            setPicking(true);
          } else go(g, grain === 'day' && anchor !== today ? anchor : today);
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <StepButton label="‹" a11y="Önceki" onPress={() => move(-1)} />
        <Pressable
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => grain === 'range' && setPicking(true)}
          disabled={grain !== 'range'}
          accessibilityRole={grain === 'range' ? 'button' : undefined}
          testID="report-period-button"
        >
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} testID="report-period">
            {p.title}
          </Text>
          {p.subtitle ? <Text style={styles.rowSub}>{p.subtitle}</Text> : null}
        </Pressable>
        <StepButton label="›" a11y="Sonraki" disabled={!canNext} onPress={() => canNext && move(1)} />
      </View>
      {data && <Report p={p} today={today} cur={data.cur} prev={data.prev} catalog={data.catalog} go={go} />}
      {grain === 'month' && <MonthList current={p.from} onPick={(m) => go('month', m)} />}
      {picking && (
        <RangeSheet
          value={range}
          openDays={shiftDays ?? new Set()}
          onClose={() => setPicking(false)}
          onPick={(r) => {
            setRange(r);
            setPicking(false);
          }}
        />
      )}
    </Screen>
  );
}

function StepButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

/** "1.235 ₺ az · %10" / "3 fazla", coloured; "—" without a previous value. */
function Diff({ cur, prev, money, onDark }: { cur: number; prev: number; money?: boolean; onDark?: boolean }) {
  const d = cur - prev;
  const pct = percentChange(cur, prev);
  const color = d === 0 ? (onDark ? colors.forestMuted : colors.muted) : d > 0 ? (onDark ? colors.upOnDark : colors.ok) : onDark ? colors.downOnDark : colors.danger;
  const amount = money ? formatTL(Math.abs(d)) : String(Math.abs(d));
  const text = d === 0 ? 'aynı' : `${amount} ${d > 0 ? 'fazla' : 'az'}${pct !== null && money ? ` · %${Math.abs(pct)}` : ''}`;
  return <Text style={{ color, fontWeight: '800', fontSize: onDark ? 15 : 12 }}>{text}</Text>;
}

function Box({ title, note, children, testID }: { title: string; note?: string; children: ReactNode; testID?: string }) {
  return (
    <Card>
      <View testID={testID}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
        {note ? <Text style={[styles.rowSub, { marginTop: 2 }]}>{note}</Text> : null}
        <View style={{ marginTop: 10 }}>{children}</View>
      </View>
    </Card>
  );
}

function Line({ left, sub, right, tone }: { left: string; sub?: string; right: string; tone?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: tone ?? colors.text }}>{left}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: tone ?? colors.text }}>{right}</Text>
    </View>
  );
}

function Report({
  p,
  today,
  cur,
  prev,
  catalog,
  go,
}: {
  p: Period;
  today: Day;
  cur: ReportData;
  prev: ReportData;
  catalog: Catalog;
  go(g: Grain, day: Day): void;
}) {
  const [allProducts, setAllProducts] = useState(false);
  if (cur.shifts.length === 0) {
    return <Empty text={p.grain === 'day' ? 'Bu gün kasa açılmadı.' : 'Bu dönemde kasa açılmadı.'} />;
  }
  const totals = periodTotals(cur);
  const hasPrev = prev.shifts.length > 0;
  const before = periodSales(prev, cutoffFor(p, today));
  const avg = totals.salesCount ? Math.round(totals.revenue / totals.salesCount) : 0;
  const prevAvg = before.sales ? Math.round(before.revenue / before.sales) : 0;
  const openDays = new Set(cur.shifts.map((s) => istanbulDay(s.opened_at))).size;
  const span = daysBetween(p.from, p.to).length;

  const products = productReport(cur, catalog.products, catalog.categories);
  const prevQty = new Map(productReport(prev, catalog.products, catalog.categories).products.map((r) => [r.productId, r.quantity]));
  const shown = allProducts ? products.products : products.products.slice(0, 5);
  const catTotal = Math.max(1, products.categories.reduce((a, c) => a + c.revenue, 0));
  const shades = ['#1E3A2B', '#2E6B47', '#4F8C64', '#86B596', '#B9D3C2', '#DCE8E0', '#C9CEC6', '#A9B0A8'];

  return (
    <>
      <View style={{ backgroundColor: colors.forest, borderRadius: 18, padding: 18 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.forestMuted }}>
          {p.grain === 'day' ? 'Ciro' : p.grain === 'week' ? 'Haftanın cirosu' : p.grain === 'month' ? 'Ayın cirosu' : 'Aralığın cirosu'}
        </Text>
        <Text style={{ fontSize: 38, fontWeight: '800', color: '#fff', marginTop: 2 }} testID="reports-revenue" numberOfLines={1} adjustsFontSizeToFit>
          {formatTL(totals.revenue)}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.forestMuted, marginTop: 4 }}>
          {p.grain === 'day' || span === 1
            ? 'Bu gün alınan her şey. Henüz ödenmemiş açık hesaplar dahil.'
            : `Günlük ortalama ${formatTL(Math.round(totals.revenue / Math.max(1, openDays)))} · ${openDays} gün açık`}
        </Text>
        <View style={{ marginTop: 14, backgroundColor: colors.forestChip, borderRadius: 12, padding: 12 }} testID="reports-compare">
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.forestMuted }}>{p.prevLabel}</Text>
          {hasPrev ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, gap: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{formatTL(before.revenue)}</Text>
              <Diff cur={totals.revenue} prev={before.revenue} money onDark />
            </View>
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 4 }}>O dönemde kasa açılmamış, karşılaştıracak veri yok.</Text>
          )}
        </View>
      </View>

      <View style={styles.grid}>
        <Card style={styles.stat}>
          <Text style={styles.label}>Satış</Text>
          <Text style={styles.statValue}>{totals.salesCount} hesap</Text>
          {hasPrev && (
            <Text style={styles.rowSub}>
              {p.prevShort} {before.sales} · <Diff cur={totals.salesCount} prev={before.sales} />
            </Text>
          )}
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.label}>Hesap başı ortalama</Text>
          <Text style={styles.statValue}>{formatTL(avg)}</Text>
          {hasPrev && before.sales > 0 && (
            <Text style={styles.rowSub}>
              {p.prevShort} {formatTL(prevAvg)} · <Diff cur={avg} prev={prevAvg} money />
            </Text>
          )}
        </Card>
      </View>

      <Box title="Kasaya giren para" note="Bu dönemde alınan ödemeler. Eski bir hesabın parası da ödendiği güne yazılır.">
        <Line left="Kart" right={formatTL(totals.card)} />
        <Line left="Nakit" right={formatTL(totals.cash)} />
        {totals.open > 0 && <Line left="Açık hesapta bekleyen" sub="Alındı, henüz ödenmedi" right={formatTL(totals.open)} tone={colors.info} />}
      </Box>

      {p.grain === 'day' && <HourChart p={p} cur={cur} prev={prev} hasPrev={hasPrev} />}
      {p.grain === 'week' && <WeekChart p={p} cur={cur} prev={prev} go={go} />}
      {p.grain === 'month' && <MonthChart p={p} cur={cur} go={go} />}
      {p.grain === 'range' && (span === 1 ? <HourChart p={p} cur={cur} prev={prev} hasPrev={hasPrev} /> : span <= 14 ? <RangeDays p={p} cur={cur} prev={prev} go={go} /> : <MonthChart p={p} cur={cur} go={go} />)}
      {(p.grain === 'week' || p.grain === 'month' || (p.grain === 'range' && span > 1)) && <BusyHours p={p} cur={cur} />}

      <Box title="En çok satanlar" note={hasPrev ? `Adet · ciro · ${p.prevShort} kaç adet` : 'Adet · ciro'} testID="top-products">
        {products.products.length === 0 && <Empty text="Bu dönemde satış yok." />}
        {shown.map((r) => {
          const before = prevQty.get(r.productId);
          return (
            <Line
              key={r.productId}
              left={r.name}
              sub={hasPrev ? (before === undefined ? `${p.prevShort} yoktu` : `${p.prevShort} ${before} adet`) : undefined}
              right={`${r.quantity} · ${formatTL(r.revenue)}`}
            />
          );
        })}
        {products.products.length > 5 && (
          <Pressable onPress={() => setAllProducts(!allProducts)} accessibilityRole="button" style={{ paddingTop: 10 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>
              {allProducts ? 'Daha az göster' : `Tümünü göster (${products.products.length})`}
            </Text>
          </Pressable>
        )}
      </Box>

      {products.categories.length > 0 && (
        <Box title="Kategoriler" note="Cironun kategorilere dağılımı (sepet indirimi düşülmeden)">
          <View style={{ flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
            {products.categories.map((c, i) => (
              <View key={c.name} style={{ flex: Math.max(c.revenue, 1) / catTotal, backgroundColor: shades[i % shades.length] }} />
            ))}
          </View>
          {products.categories.map((c, i) => (
            <View key={c.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: shades[i % shades.length] }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{c.name}</Text>
                <Text style={styles.rowSub}>
                  {c.quantity} adet · %{Math.round((c.revenue / catTotal) * 100)}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{formatTL(c.revenue)}</Text>
            </View>
          ))}
        </Box>
      )}

      <Box title="Cirodan düşenler">
        <Line left="İndirim" sub="%10, %15 ve elle yazılan sepet indirimleri" right={formatTL(totals.discount)} />
        <Line left="İptal" sub="Masadan çıkarılan ürün ve iptal edilen hesap" right={formatTL(totals.void)} />
        <Line left="İade" sub="Ödendikten sonra geri verilen para" right={formatTL(totals.refunds)} />
        <Line left="Fiyatı değiştirilen" sub="Kasada menü fiyatının altında satılan" right={formatTL(totals.priceChange)} />
        {totals.comp > 0 && <Line left="İkram" sub="Eski kayıtlar" right={formatTL(totals.comp)} />}
      </Box>
    </>
  );
}

function HourChart({ p, cur, prev, hasPrev }: { p: Period; cur: ReportData; prev: ReportData; hasPrev: boolean }) {
  const hours = hourlyRevenue(cur, p.from);
  const before = hourlyRevenue(prev, p.prev.from);
  const used = [...hours.keys()].filter((h) => hours[h]! > 0 || (hasPrev && before[h]! > 0));
  if (used.length === 0) return null;
  const from = Math.min(...used);
  const to = Math.max(...used, from + 5);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const peak = range.reduce((best, h) => (hours[h]! > hours[best]! ? h : best), range[0]!);
  return (
    <Box title="Saat saat ciro" note={hasPrev ? `Çubuk bu gün, kesikli çizgi ${p.prevLabel.split(',')[0]!.toLocaleLowerCase('tr')}.` : 'Her saatte ne kadar satıldı.'}>
      <Columns
        values={range.map((h) => hours[h]!)}
        compare={hasPrev ? range.map((h) => before[h]!) : undefined}
        labels={range.map((h, i) => (i % 2 === 0 ? hh(h) : ''))}
        highlight={range.indexOf(peak)}
        height={130}
      />
      {hours[peak]! > 0 && (
        <View style={{ marginTop: 12, backgroundColor: colors.accentSoft, borderRadius: 10, padding: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.forest }}>
            En yoğun saat {hh(peak)}:00–{hh(peak + 1)}:00 · {formatTL(hours[peak]!)}
          </Text>
        </View>
      )}
    </Box>
  );
}

function dayRevenue(data: ReportData): Map<Day, Kurus> {
  return new Map(revenueSeries(data, 'day').map((pt) => [pt.key, pt.totals.revenue]));
}

function BestWorst({ best, worst }: { best: string; worst: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
      <View style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: 10, padding: 10 }}>
        <Text style={styles.label}>En iyi gün</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.forest }}>{best}</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.greySoft, borderRadius: 10, padding: 10 }}>
        <Text style={styles.label}>En sakin gün</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{worst}</Text>
      </View>
    </View>
  );
}

function bestWorst(days: [Day, Kurus][], label: (d: Day) => string) {
  const open = days.filter(([, v]) => v > 0);
  if (open.length < 2) return null;
  const sorted = [...open].sort((a, b) => b[1] - a[1]);
  const [b, w] = [sorted[0]!, sorted.at(-1)!];
  return { best: `${label(b[0])} · ${formatTL(b[1])}`, worst: `${label(w[0])} · ${formatTL(w[1])}` };
}

function WeekChart({ p, cur, prev, go }: { p: Period; cur: ReportData; prev: ReportData; go(g: Grain, d: Day): void }) {
  const now = dayRevenue(cur);
  const before = dayRevenue(prev);
  const days = daysBetween(p.from, p.end);
  const bw = bestWorst(
    days.map((d) => [d, now.get(d) ?? 0]),
    (d) => WEEKDAYS[weekdayIndex(d)]!,
  );
  return (
    <Box title="Gün gün" note="Koyu bu hafta, açık geçen hafta. Bir güne dokun, o günün raporu açılır.">
      <Columns
        mode="bar"
        values={days.map((d) => now.get(d) ?? 0)}
        compare={days.map((d) => before.get(addDays(d, -7)) ?? 0)}
        labels={[...WEEKDAYS_SHORT]}
        height={130}
      />
      {bw && <BestWorst {...bw} />}
      <View style={{ marginTop: 8 }}>
        {days
          .filter((d) => d <= p.to)
          .map((d) => (
            <Row
              key={d}
              left={`${WEEKDAYS[weekdayIndex(d)]} · ${shortDate(d)}`}
              right={now.has(d) ? formatTL(now.get(d)!) : 'kapalı'}
              onPress={() => go('day', d)}
              testID="week-day-row"
            />
          ))}
      </View>
    </Box>
  );
}

function MonthChart({ p, cur, go }: { p: Period; cur: ReportData; go(g: Grain, d: Day): void }) {
  const now = dayRevenue(cur);
  const days = daysBetween(p.from, p.end);
  const bw = bestWorst(
    days.map((d) => [d, now.get(d) ?? 0]),
    (d) => `${shortDate(d)} ${WEEKDAYS_SHORT[weekdayIndex(d)]}`,
  );
  // Weeks (Monday–Sunday) that touch this month, only the days inside it.
  const weeks: { start: Day; from: Day; to: Day; revenue: Kurus; open: number }[] = [];
  for (let w = weekStart(p.from); w <= p.to; w = addDays(w, 7)) {
    const from = w < p.from ? p.from : w;
    const to = minDay(addDays(w, 6), p.to);
    const inWeek = daysBetween(from, to).filter((d) => now.has(d));
    weeks.push({ start: w, from, to, revenue: inWeek.reduce((a, d) => a + now.get(d)!, 0), open: inWeek.length });
  }
  const maxWeek = Math.max(1, ...weeks.map((w) => w.revenue));
  return (
    <>
      <Box title="Hafta hafta" note="Bir haftaya dokun, o haftanın raporu açılır.">
        {weeks.map((w, i) => (
          <Pressable key={w.start} onPress={() => go('week', w.start)} accessibilityRole="button" testID="month-week-row">
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{rangeText(w.from, w.to)}</Text>
                <Text style={styles.rowSub}>
                  {w.open} gün açık
                  {i > 0 && weeks[i - 1]!.revenue > 0 && w.revenue > 0 ? ` · önceki haftaya göre ` : ''}
                  {i > 0 && weeks[i - 1]!.revenue > 0 && w.revenue > 0 ? <Diff cur={w.revenue} prev={weeks[i - 1]!.revenue} money /> : null}
                </Text>
              </View>
              <View style={{ width: 70, height: 8, backgroundColor: colors.line, borderRadius: 4 }}>
                <View style={{ width: `${(w.revenue / maxWeek) * 100}%`, height: 8, backgroundColor: colors.accent, borderRadius: 4 }} />
              </View>
              <Text style={{ width: 84, textAlign: 'right', fontSize: 14, fontWeight: '800', color: colors.text }}>{formatTL(w.revenue)}</Text>
            </View>
          </Pressable>
        ))}
      </Box>
      <Box title="Gün gün" note="Her çubuk bir gün, boşluk kapalı gün.">
        <Columns
          mode="line"
          values={days.map((d) => now.get(d) ?? 0)}
          labels={days.map((d, i) => (i % 7 === 0 ? String(dayNum(d)) : ''))}
          height={110}
        />
        {bw && <BestWorst {...bw} />}
      </Box>
    </>
  );
}

function RangeDays({ p, cur, prev, go }: { p: Period; cur: ReportData; prev: ReportData; go(g: Grain, d: Day): void }) {
  const now = dayRevenue(cur);
  const before = dayRevenue(prev);
  const days = daysBetween(p.from, p.to);
  const prevDays = daysBetween(p.prev.from, p.prev.to);
  const bw = bestWorst(
    days.map((d) => [d, now.get(d) ?? 0]),
    (d) => `${shortDate(d)} ${WEEKDAYS_SHORT[weekdayIndex(d)]}`,
  );
  return (
    <Box title="Gün gün" note={`Koyu bu aralık, açık ${p.prevShort} (aynı sıradaki gün). Bir güne dokun, o günün raporu açılır.`}>
      <Columns
        mode="bar"
        values={days.map((d) => now.get(d) ?? 0)}
        compare={prevDays.map((d) => before.get(d) ?? 0)}
        labels={days.map((d) => String(dayNum(d)))}
        height={130}
      />
      {bw && <BestWorst {...bw} />}
      <View style={{ marginTop: 8 }}>
        {days.map((d) => (
          <Row
            key={d}
            left={`${WEEKDAYS[weekdayIndex(d)]} · ${shortDate(d)}`}
            right={now.has(d) ? formatTL(now.get(d)!) : 'kapalı'}
            onPress={() => go('day', d)}
            testID="range-day-row"
          />
        ))}
      </View>
    </Box>
  );
}

function BusyHours({ p, cur }: { p: Period; cur: ReportData }) {
  const map = heatmap(cur, cur.shifts, p.from, p.to, new Date().toISOString());
  const hours = Array.from({ length: map.toHour - map.fromHour + 1 }, (_, i) => map.fromHour + i);
  const max = Math.max(1, ...map.cells.flat().map((c) => c?.revenue ?? 0));
  if (!map.cells.some((row) => row.some(Boolean))) return null;
  const slot = (s: NonNullable<typeof map.busiest>) => `${WEEKDAYS[s.weekday]} ${hh(s.hour)}:00–${hh(s.hour + 2)}:00`;
  return (
    <Box
      title="Ne zaman yoğunuz?"
      note={
        p.grain === 'week'
          ? 'Her saatte ne kadar satıldı. Koyu çok, açık az, boş kutu o saatte kapalıydı.'
          : 'Her hafta günü ve saatte ortalama ne kadar satıldı. Koyu çok, açık az, boş kutu kapalı.'
      }
      testID="busy-hours"
    >
      <HeatGrid rowLabels={[...WEEKDAYS_SHORT]} hours={hours} rows={map.cells.map((row) => hours.map((h) => (row[h] ? row[h]!.revenue / max : null)))} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Text style={styles.axis}>Az</Text>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {heat.map((c) => (
            <View key={c} style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: c }} />
          ))}
        </View>
        <Text style={styles.axis}>Çok</Text>
      </View>
      {map.busiest && map.quietest && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: 10, padding: 10 }}>
            <Text style={styles.label}>En yoğun iki saat</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.forest }}>{slot(map.busiest)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.greySoft, borderRadius: 10, padding: 10 }}>
            <Text style={styles.label}>En sakin iki saat</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{slot(map.quietest)}</Text>
          </View>
        </View>
      )}
    </Box>
  );
}

/** Ay görünümünde aylar listesi (eski "Ay ay satışlar"): the last 12 months, newest first. */
function MonthList({ current, onPick }: { current: Day; onPick(m: Day): void }) {
  const { data } = useLive(async () => {
    const today = todayIstanbul();
    return loadReportData(monthStart(addDays(monthStart(today), -335)), today);
  });
  if (!data) return null;
  const months = revenueSeries(data, 'month');
  if (months.length === 0) return null;
  return (
    <Section title="Aylar">
      <Label>Bir aya dokun, o ayın raporu açılır.</Label>
      {[...months].reverse().map((m) => {
        const i = months.indexOf(m);
        const prev = i > 0 ? months[i - 1]!.totals.revenue : null;
        return (
          <Pressable key={m.key} onPress={() => onPick(m.key)} accessibilityRole="button" testID="month-row">
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: m.key === current ? colors.accentSoft : colors.panel,
                marginTop: 6,
              }}
            >
              <View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{monthTitle(m.key)}</Text>
                <Text style={styles.rowSub}>
                  {m.totals.salesCount} satış
                  {prev !== null && prev > 0 ? ' · önceki aya göre ' : ''}
                  {prev !== null && prev > 0 ? <Diff cur={m.totals.revenue} prev={prev} money /> : null}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{formatTL(m.totals.revenue)}</Text>
            </View>
          </Pressable>
        );
      })}
    </Section>
  );
}
