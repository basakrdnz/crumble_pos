import { addDays, formatTL, monthStart, percentChange, revenueSeries, todayIstanbul } from '@crumble/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../components/theme';
import { Bars, Card, Delta, Empty, Label, Screen, styles } from '../components/ui';
import { loadReportData } from '../lib/data';
import { useLive } from '../lib/useLive';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/**
 * Ay ay satışlar (kullanıcı 2026-11-21): every month of the last year, newest
 * first; a month opens to its days. Ciro by the day things were taken.
 */
export default function Months() {
  const { data, error, refreshing, reload } = useLive(async () => {
    const today = todayIstanbul();
    return loadReportData(monthStart(addDays(monthStart(today), -335)), today);
  });
  const [open, setOpen] = useState<string | null>(null);

  const months = data ? revenueSeries(data, 'month') : [];
  const days = data ? revenueSeries(data, 'day') : [];
  const shown = open ?? months.at(-1)?.key ?? null;

  return (
    <Screen underHeader title="Ay ay satışlar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      {data && months.length === 0 && <Empty text="Henüz satış yok." />}
      {[...months].reverse().map((m) => {
        const i = months.indexOf(m);
        const prev = i > 0 ? months[i - 1]!.totals.revenue : 0;
        const expanded = shown === m.key;
        const t = m.totals;
        return (
          <Pressable key={m.key} onPress={() => setOpen(expanded ? '' : m.key)} accessibilityRole="button" testID="month-row">
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Label>{monthName(m.key)}</Label>
                {i > 0 && <Delta value={percentChange(t.revenue, prev)} />}
              </View>
              <Text style={[styles.statValue, styles.statBig]}>{formatTL(t.revenue)}</Text>
              <Text style={styles.rowSub}>
                {t.salesCount} satış · Nakit {formatTL(t.cash)} · Kart {formatTL(t.card)}
              </Text>
              {t.open > 0 && <Text style={styles.rowSub}>Açık hesapta bekleyen: {formatTL(t.open)}</Text>}
              {expanded ? (
                <View style={{ marginTop: 10 }}>
                  <Bars
                    rows={days
                      .filter((d) => d.key.slice(0, 7) === m.key.slice(0, 7))
                      .reverse()
                      .map((d) => ({ label: `${Number(d.key.slice(8))} ${MONTHS[Number(d.key.slice(5, 7)) - 1]!.slice(0, 3)}`, value: d.totals.revenue }))}
                  />
                </View>
              ) : (
                <Text style={[styles.rowSub, { color: colors.muted, marginTop: 6 }]}>Günleri görmek için dokun</Text>
              )}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
