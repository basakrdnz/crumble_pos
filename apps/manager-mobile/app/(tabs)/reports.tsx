import {
  addDays,
  type Day,
  daypartTops,
  formatTL,
  heatmap,
  monthStart,
  percentChange,
  periodKpis,
  periodTotals,
  productReport,
  productTrends,
  type ReportData,
  revenueSeries,
  todayIstanbul,
  weekStart,
  WEEKDAYS_SHORT,
} from '@crumble/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { type RangeKey, RangePicker, rangeOf } from '../../components/pickers';
import { colors, fonts, heat } from '../../components/theme';
import { Bars, Card, Chip, Chips, Columns, Delta, Empty, HeatGrid, Label, Row, Screen, Section, Segmented, Stat, styles } from '../../components/ui';
import { loadCatalog, loadReportData } from '../../lib/data';
import { formatShortDay } from '../../lib/format';
import { useLive } from '../../lib/useLive';

type Part = 'summary' | 'hours' | 'products' | 'compare';
const PARTS = [
  ['summary', 'Özet'],
  ['hours', 'Saatler'],
  ['products', 'Ürünler'],
  ['compare', 'Kıyas'],
] as const;

/** Raporlar (plan §6.5, analiz 2026-10-30): Özet · Saatler · Ürünler · Kıyas. Numbers only, no commentary. */
export default function Reports() {
  const [part, setPart] = useState<Part>('summary');
  return (
    <Screen title="Raporlar">
      <Segmented<Part> value={part} options={PARTS} onChange={setPart} />
      {part === 'summary' && <Summary />}
      {part === 'hours' && <Hours />}
      {part === 'products' && <ProductsPart />}
      {part === 'compare' && <Compare />}
    </Screen>
  );
}

function Summary() {
  const [range, setRange] = useState<RangeKey>('week');
  const { data, error } = useLive(async () => {
    const { from, to } = rangeOf(range);
    return loadReportData(from, to);
  }, [range]);
  const totals = data ? periodTotals(data) : null;
  const series = data ? revenueSeries(data, 'day') : [];
  return (
    <>
      <RangePicker value={range} onChange={setRange} />
      {error && <Text style={styles.error}>{error}</Text>}
      {totals && (
        <>
          <Card>
            <Label>Ciro · {totals.salesCount} satış</Label>
            <Text style={[styles.statValue, styles.statBig]} testID="reports-revenue">
              {formatTL(totals.revenue)}
            </Text>
          </Card>
          <View style={styles.grid}>
            <Stat label="Nakit" value={formatTL(totals.cash)} />
            <Stat label="Kart" value={formatTL(totals.card)} />
          </View>
          {series.length > 1 && (
            <Section title="Günlük ciro">
              <Bars rows={series.map((p) => ({ label: formatShortDay(p.key), value: p.totals.revenue }))} />
            </Section>
          )}
          <Section title="İndirim / iptal / iade">
            <Row left="İndirim" right={formatTL(totals.discount)} />
            {totals.comp > 0 && <Row left="İkram" right={formatTL(totals.comp)} />}
            <Row left="İptal" right={formatTL(totals.void)} />
            <Row left="İade" right={formatTL(totals.refunds)} />
            <Row left="Fiyat değişikliği farkı" right={formatTL(totals.priceChange)} />
          </Section>
        </>
      )}
    </>
  );
}

type HoursRange = 'week' | 'month' | '3m';
function hoursRange(key: HoursRange): { from: Day; to: Day } {
  const to = todayIstanbul();
  if (key === 'week') return { from: weekStart(to), to };
  if (key === 'month') return { from: monthStart(to), to };
  return { from: addDays(to, -89), to };
}
const hh = (h: number) => String(h).padStart(2, '0');

function Hours() {
  const [range, setRange] = useState<HoursRange>('month');
  const { data, error } = useLive(async () => {
    const { from, to } = hoursRange(range);
    return { report: await loadReportData(from, to), from, to };
  }, [range]);
  const map = data ? heatmap(data.report.tabs, data.report.shifts, data.from, data.to, new Date().toISOString()) : null;
  const hours = map ? Array.from({ length: map.toHour - map.fromHour + 1 }, (_, i) => map.fromHour + i) : [];
  const max = map ? Math.max(1, ...map.cells.flat().map((c) => c?.revenue ?? 0)) : 1;
  return (
    <>
      <Chips>
        {(
          [
            ['week', 'Bu hafta'],
            ['month', 'Bu ay'],
            ['3m', 'Son 3 ay'],
          ] as const
        ).map(([key, label]) => (
          <Chip key={key} label={label} active={key === range} onPress={() => setRange(key)} />
        ))}
      </Chips>
      {error && <Text style={styles.error}>{error}</Text>}
      {map && (map.busiest ? (
        <>
          <Card>
            <Label>Yoğunluk haritası · saat başı ortalama ciro</Label>
            <View style={{ marginTop: 10 }}>
              <HeatGrid
                rowLabels={[...WEEKDAYS_SHORT]}
                hours={hours}
                rows={map.cells.map((row) => hours.map((h) => (row[h] ? row[h]!.revenue / max : null)))}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text style={styles.axis}>Ölü</Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {heat.map((c) => (
                  <View key={c} style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: c }} />
                ))}
              </View>
              <Text style={styles.axis}>Yoğun</Text>
            </View>
            <Text style={[styles.rowSub, { marginTop: 6 }]}>Saatler vardiya açılışı ile gün sonu arasından; boş kutu = o saatte kapalıydı.</Text>
          </Card>
          <View style={styles.grid}>
            <Stat
              label="En yoğun"
              value={`${WEEKDAYS_SHORT[map.busiest.weekday]} ${hh(map.busiest.hour)}–${hh(map.busiest.hour + 2)}`}
              sub={`${formatTL(map.busiest.revenue)} · ${map.busiest.sales} satış`}
              testID="busiest"
            />
            <Stat
              label="En ölü"
              value={`${WEEKDAYS_SHORT[map.quietest!.weekday]} ${hh(map.quietest!.hour)}–${hh(map.quietest!.hour + 2)}`}
              sub={`${formatTL(map.quietest!.revenue)} · ${map.quietest!.sales} satış`}
              testID="quietest"
            />
          </View>
          <Section title="Günlere göre saat başı ortalama">
            {map.cells.map((row, d) => {
              const open = row.filter(Boolean);
              if (!open.length) return null;
              const avg = Math.round(open.reduce((a, c) => a + c!.revenue, 0) / open.length);
              return <Row key={d} left={WEEKDAYS_SHORT[d]!} sub={`${open.length} saat açık`} right={formatTL(avg)} />;
            })}
          </Section>
        </>
      ) : (
        <Empty text="Bu aralıkta vardiya yok." />
      ))}
    </>
  );
}

function sameLengthBefore(from: Day, to: Day): { from: Day; to: Day } {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

function ProductsPart() {
  const [range, setRange] = useState<RangeKey>('week');
  const { data, error } = useLive(async () => {
    const cur = rangeOf(range);
    const prev = sameLengthBefore(cur.from, cur.to);
    const [now, before, catalog] = await Promise.all([loadReportData(cur.from, cur.to), loadReportData(prev.from, prev.to), loadCatalog()]);
    return {
      report: productReport(now, catalog.products, catalog.categories),
      trends: productTrends(now, before, catalog),
      parts: daypartTops(now, catalog),
    };
  }, [range]);
  const total = data ? Math.max(1, data.report.categories.reduce((a, c) => a + c.revenue, 0)) : 1;
  const shades = ['#1E3A2B', '#2E6B47', '#4F8C64', '#86B596', '#B9D3C2', '#DCE8E0', '#EDEFEB', '#D8DCD5'];
  return (
    <>
      <RangePicker value={range} onChange={setRange} />
      {error && <Text style={styles.error}>{error}</Text>}
      {data && (data.trends.length === 0 ? (
        <Empty text="Bu aralıkta satış yok." />
      ) : (
        <>
          <Card>
            <Label>Kategori payı</Label>
            <View style={{ flexDirection: 'row', height: 14, borderRadius: 9, overflow: 'hidden', gap: 2, marginTop: 8 }}>
              {data.report.categories.map((c, i) => (
                <View key={c.name} style={{ flex: c.revenue / total, backgroundColor: shades[i % shades.length] }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              {data.report.categories.map((c, i) => (
                <Text key={c.name} style={styles.rowSub}>
                  <Text style={{ color: shades[i % shades.length] }}>■ </Text>
                  {c.name} %{Math.round((c.revenue / total) * 100)}
                </Text>
              ))}
            </View>
          </Card>
          <Section title="En çok kazandıranlar · önceki döneme göre">
            {data.trends.slice(0, 10).map((t) => (
              <Row
                key={t.productId}
                left={t.name}
                sub={`${t.quantity} adet`}
                right={formatTL(t.revenue)}
                badge={t.change === null ? <Text style={[styles.delta, { color: colors.info }]}>yeni</Text> : <Delta value={t.change} />}
                testID="trend-row"
              />
            ))}
          </Section>
          <Section title="Günün bölümüne göre en çok satanlar">
            {data.parts
              .filter((p) => p.sales > 0)
              .map((p) => (
                <Row
                  key={p.id}
                  left={`${p.label} ${hh(p.from === 0 ? 0 : p.from)}–${hh(p.to === 24 ? 24 : p.to)}`}
                  sub={p.top.map((t) => `${t.name} ${t.quantity}`).join(' · ')}
                  right={`${p.sales} satış`}
                />
              ))}
          </Section>
          {data.report.cartDiscount > 0 && (
            <Text style={styles.rowSub}>Sepet indirimi ürünlere dağıtılmaz: −{formatTL(data.report.cartDiscount)}</Text>
          )}
        </>
      ))}
    </>
  );
}

type Grain = 'day' | 'week' | 'month';

function periods(grain: Grain): { cur: { from: Day; to: Day }; prev: { from: Day; to: Day }; label: string; prevLabel: string } {
  const today = todayIstanbul();
  if (grain === 'day') return { cur: { from: today, to: today }, prev: { from: addDays(today, -7), to: addDays(today, -7) }, label: 'Bugün', prevLabel: 'Geçen hafta aynı gün' };
  if (grain === 'week') {
    const from = weekStart(today);
    const days = (Date.parse(today) - Date.parse(from)) / 86_400_000;
    return { cur: { from, to: today }, prev: { from: addDays(from, -7), to: addDays(from, -7 + days) }, label: 'Bu hafta', prevLabel: 'Geçen hafta aynı günler' };
  }
  const from = monthStart(today);
  const prevFrom = monthStart(addDays(from, -1));
  const days = (Date.parse(today) - Date.parse(from)) / 86_400_000;
  const prevTo = [addDays(prevFrom, days), addDays(from, -1)].sort()[0]!;
  return { cur: { from, to: today }, prev: { from: prevFrom, to: prevTo }, label: 'Bu ay', prevLabel: 'Geçen ay aynı günler' };
}

function kpisOf(data: ReportData) {
  const totals = periodTotals(data);
  return { totals, kpis: periodKpis(data, totals) };
}

function Compare() {
  const [grain, setGrain] = useState<Grain>('week');
  const { data, error } = useLive(async () => {
    const p = periods(grain);
    const [cur, prev] = await Promise.all([loadReportData(p.cur.from, p.cur.to), loadReportData(p.prev.from, p.prev.to)]);
    return { p, cur, prev };
  }, [grain]);

  let chart: { values: number[]; compare: number[]; labels: string[] } | null = null;
  if (data && grain !== 'day') {
    const a = revenueSeries(data.cur, 'day');
    const b = revenueSeries(data.prev, 'day');
    const days = grain === 'week' ? 7 : Math.ceil(((Date.parse(data.p.cur.to) - Date.parse(data.p.cur.from)) / 86_400_000 + 1) / 7);
    const bucket = (series: typeof a, start: Day) => {
      const out = Array<number>(days).fill(0);
      for (const pt of series) {
        const i = Math.floor((Date.parse(pt.key) - Date.parse(start)) / 86_400_000 / (grain === 'week' ? 1 : 7));
        if (i >= 0 && i < days) out[i]! += pt.totals.revenue;
      }
      return out;
    };
    chart = {
      values: bucket(a, data.p.cur.from),
      compare: bucket(b, data.p.prev.from),
      labels: grain === 'week' ? [...WEEKDAYS_SHORT] : Array.from({ length: days }, (_, i) => `${i + 1}. hf`),
    };
  }
  const cur = data ? kpisOf(data.cur) : null;
  const prev = data ? kpisOf(data.prev) : null;

  return (
    <>
      <Segmented<Grain>
        value={grain}
        options={[
          ['day', 'Gün'],
          ['week', 'Hafta'],
          ['month', 'Ay'],
        ]}
        onChange={setGrain}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {data && cur && prev && (
        <>
          <Card>
            <Label>{data.p.label}</Label>
            <Text style={[styles.statValue, styles.statBig]} testID="compare-revenue">
              {formatTL(cur.totals.revenue)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.rowSub}>
                {data.p.prevLabel} {formatTL(prev.totals.revenue)} ·{' '}
              </Text>
              <Delta value={percentChange(cur.totals.revenue, prev.totals.revenue)} />
            </View>
            {chart && (
              <View style={{ marginTop: 12 }}>
                <Columns values={chart.values} compare={chart.compare} mode="bar" labels={chart.labels} />
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                  <Text style={[styles.axis, { color: colors.muted }]}>
                    <Text style={{ color: colors.apply }}>■</Text> Önceki
                  </Text>
                  <Text style={[styles.axis, { color: colors.muted }]}>
                    <Text style={{ color: colors.accent }}>■</Text> Bu dönem
                  </Text>
                </View>
              </View>
            )}
          </Card>
          <View style={styles.grid}>
            <Kpi label="Satış" value={String(cur.kpis.sales)} change={percentChange(cur.kpis.sales, prev.kpis.sales)} />
            <Kpi label="Ort. sepet" value={formatTL(cur.kpis.avgBasket)} change={percentChange(cur.kpis.avgBasket, prev.kpis.avgBasket)} />
            <Kpi
              label="İndirim oranı"
              value={`%${(cur.kpis.discountPermille / 10).toLocaleString('tr-TR')}`}
              note={`önce %${(prev.kpis.discountPermille / 10).toLocaleString('tr-TR')}`}
            />
            <Kpi label="İptal" value={formatTL(cur.kpis.void)} change={percentChange(cur.kpis.void, prev.kpis.void)} invert />
          </View>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, change, note, invert }: { label: string; value: string; change?: number | null; note?: string; invert?: boolean }) {
  return (
    <Stat
      label={label}
      value={value}
      sub={
        note ? (
          <Text style={styles.rowSub}>{note}</Text>
        ) : change === undefined ? undefined : invert && change !== null ? (
          <Text style={[styles.delta, { color: change > 0 ? colors.danger : colors.ok }]}>{`${change >= 0 ? '▲' : '▼'} %${Math.abs(change)}`}</Text>
        ) : (
          <Delta value={change ?? null} />
        )
      }
    />
  );
}
