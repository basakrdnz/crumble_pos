import { formatTL, istanbulDay, summarizeShift } from '@crumble/shared';
import { Text } from 'react-native';
import { Card, Empty, Screen, Section, styles } from '../components/ui';
import { colors } from '../components/theme';
import { loadReportData, loadShifts } from '../lib/data';
import { formatDateTime, formatTime } from '../lib/format';
import { useLive } from '../lib/useLive';

/** Vardiyalar (plan §6.4). */
export default function Shifts() {
  const { data, error, refreshing, reload } = useLive(async () => {
    const shifts = await loadShifts(30);
    if (shifts.length === 0) return [];
    const report = await loadReportData(istanbulDay(shifts.at(-1)!.opened_at), istanbulDay(shifts[0]!.opened_at));
    return shifts.map((shift) => ({ shift, summary: summarizeShift(shift, report) }));
  });

  return (
    <Screen title="Vardiyalar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      {data?.length === 0 && <Empty text="Henüz vardiya yok." />}
      {data?.map(({ shift, summary }) => (
        <Section key={shift.id} title={`${formatDateTime(shift.opened_at)}${shift.closed_at ? ` → ${formatTime(shift.closed_at)}` : ' · açık'}`}>
          <Text style={styles.rowLeft}>
            Nakit {formatTL(summary.cashSales)} · Kart {formatTL(summary.cardSales)} · {summary.salesCount} satış
          </Text>
          <Text style={styles.rowSub}>
            Açılış kasası {formatTL(shift.opening_cash)} · Beklenen {formatTL(shift.expected_cash ?? summary.expectedCash)}
          </Text>
          {shift.closed_at && (
            <Text style={[styles.rowSub, { color: shift.cash_difference ? colors.danger : colors.ok }]} testID="shift-diff">
              Sayılan {formatTL(shift.counted_cash ?? 0)} · Fark {formatTL(shift.cash_difference ?? 0)}
            </Text>
          )}
          {(summary.discountTotal > 0 || summary.compTotal > 0 || summary.voidTotal > 0) && (
            <Text style={styles.rowSub}>
              İndirim {formatTL(summary.discountTotal)} · İkram {formatTL(summary.compTotal)} · İptal {formatTL(summary.voidTotal)}
            </Text>
          )}
          {shift.notes ? <Text style={styles.rowSub}>Not: {shift.notes}</Text> : null}
        </Section>
      ))}
      {!data && !error && <Card><Empty text="Yükleniyor…" /></Card>}
    </Screen>
  );
}
