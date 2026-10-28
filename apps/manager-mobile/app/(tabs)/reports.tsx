import { formatTL, type Granularity, hourlyActivity, periodTotals, revenueSeries } from '@crumble/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { type RangeKey, RangePicker, rangeOf } from '../../components/pickers';
import { Bars, Chip, Empty, Row, Screen, Section, styles } from '../../components/ui';
import { loadReportData } from '../../lib/data';
import { formatShortDay } from '../../lib/format';
import { useLive } from '../../lib/useLive';

const GRAN: [Granularity, string][] = [
  ['day', 'Günlük'],
  ['week', 'Haftalık'],
  ['month', 'Aylık'],
];

/** Raporlar (plan §6.5): revenue chart, hourly activity, discount/comp/void totals. */
export default function Reports() {
  const [range, setRange] = useState<RangeKey>('week');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const { data, error, refreshing, reload } = useLive(async () => {
    const { from, to } = rangeOf(range);
    return loadReportData(from, to);
  }, [range]);

  const series = data ? revenueSeries(data, granularity) : [];
  const hours = data ? hourlyActivity(data).filter((h) => h.hour >= 7 && h.hour <= 23) : [];
  const totals = data ? periodTotals(data) : null;

  return (
    <Screen title="Raporlar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <RangePicker value={range} onChange={setRange} />
      <View style={styles.chips}>
        {GRAN.map(([key, label]) => (
          <Chip key={key} label={label} active={key === granularity} onPress={() => setGranularity(key)} />
        ))}
      </View>
      {totals && (
        <>
          <Section title="Ciro">
            {series.length ? (
              <Bars rows={series.map((p) => ({ label: formatShortDay(p.key), value: p.totals.revenue }))} />
            ) : (
              <Empty text="Bu aralıkta satış yok." />
            )}
            <Row left="Toplam ciro" right={formatTL(totals.revenue)} testID="reports-revenue" />
            <Row left="Satış adedi" right={String(totals.salesCount)} />
          </Section>
          <Section title="Saatlik yoğunluk (satış adedi)">
            <Bars rows={hours.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.sales, display: `${h.sales} · ${formatTL(h.revenue)}` }))} />
          </Section>
          <Section title="İndirim / ikram / iptal">
            <Row left="İndirim" right={formatTL(totals.discount)} />
            <Row left="İkram" right={formatTL(totals.comp)} />
            <Row left="İptal" right={formatTL(totals.void)} />
            <Row left="İade" right={formatTL(totals.refunds)} />
            <Row left="Fiyat değişikliği farkı" right={formatTL(totals.priceChange)} />
          </Section>
        </>
      )}
    </Screen>
  );
}
