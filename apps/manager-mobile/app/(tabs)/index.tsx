import { formatTL, periodTotals, todayIstanbul } from '@crumble/shared';
import { Text, View } from 'react-native';
import { Row, Screen, Section, Stat, styles } from '../../components/ui';
import { loadOpenTabs, loadReportData } from '../../lib/data';
import { formatTime } from '../../lib/format';
import { useLive } from '../../lib/useLive';

/** Bugün (plan §6.1): live takings of shifts opened today. */
export default function Today() {
  const { data, error, refreshing, reload } = useLive(async () => {
    const today = todayIstanbul();
    const [report, open] = await Promise.all([loadReportData(today, today), loadOpenTabs()]);
    return { report, open, totals: periodTotals(report) };
  });

  return (
    <Screen title="Bugün" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      {data && (
        <>
          <View style={styles.grid}>
            <Stat label="Ciro" value={formatTL(data.totals.revenue)} testID="today-revenue" big />
          </View>
          <View style={[styles.grid, { marginTop: 10 }]}>
            <Stat label="Nakit" value={formatTL(data.totals.cash)} testID="today-cash" />
            <Stat label="Kart" value={formatTL(data.totals.card)} testID="today-card" />
          </View>
          <View style={[styles.grid, { marginTop: 10 }]}>
            <Stat label="Satış adedi" value={String(data.totals.salesCount)} testID="today-count" />
            <Stat label="Açık hesap" value={String(data.open.filter((t) => t.kind !== 'quick').length)} testID="today-open" />
          </View>
          <Section title="Vardiya">
            {data.report.shifts.length === 0 ? (
              <Text style={styles.rowSub}>Bugün vardiya açılmadı.</Text>
            ) : (
              data.report.shifts.map((s) => (
                <Row
                  key={s.id}
                  left={`Açılış ${formatTime(s.opened_at)}`}
                  right={s.closed_at ? `Kapanış ${formatTime(s.closed_at)}` : 'Açık'}
                  sub={`Açılış kasası ${formatTL(s.opening_cash)}`}
                  testID="today-shift"
                />
              ))
            )}
          </Section>
          <Section title="Bugünkü indirim / ikram / iptal">
            <Row left="İndirim" right={formatTL(data.totals.discount)} />
            <Row left="İkram" right={formatTL(data.totals.comp)} />
            <Row left="İptal" right={formatTL(data.totals.void)} />
            <Row left="İade" right={formatTL(data.totals.refunds)} />
          </Section>
        </>
      )}
    </Screen>
  );
}
