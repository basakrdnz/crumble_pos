import { formatTL, sumKurus, todayIstanbul } from '@crumble/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { DayPicker } from '../../components/pickers';
import { Badge, type BadgeTone, Card, Empty, Label, Row, Screen, styles } from '../../components/ui';
import { loadCatalog, loadReportData } from '../../lib/data';
import { formatTime, tabLabel } from '../../lib/format';
import { useLive } from '../../lib/useLive';

/** Satışlar (plan §6.2): sales of a day, newest first, with how they were paid. */
export default function Sales() {
  const [day, setDay] = useState(todayIstanbul());
  const { data, error, refreshing, reload } = useLive(
    async () => Promise.all([loadReportData(day, day), loadCatalog()]),
    [day],
  );

  const rows = data
    ? [...data[0].tabs]
        .filter((t) => t.status !== 'open')
        .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
        .map((tab) => {
          const pays = data[0].payments.filter((p) => p.tab_id === tab.id);
          const refunded = sumKurus(data[0].refunds.filter((r) => r.tab_id === tab.id).map((r) => r.amount));
          const methods = [...new Set(pays.map((p) => (p.method === 'cash' ? 'Nakit' : 'Kart')))].join(' + ');
          const [tone, status]: [BadgeTone, string] =
            tab.status === 'void'
              ? ['danger', 'İptal']
              : refunded > 0
                ? ['grey', `İade ${formatTL(refunded)}`]
                : [methods.includes('+') ? 'info' : 'ok', methods || 'Ödemesiz'];
          return { tab, label: tabLabel(tab, data[1].tables), tone, status };
        })
    : [];
  const paid = rows.filter((r) => r.tab.status === 'paid');

  return (
    <Screen title="Satışlar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <DayPicker day={day} onChange={setDay} />
      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
        <Label>{paid.length} satış</Label>
        <Text style={styles.rowRight} testID="sales-total">
          {formatTL(sumKurus(paid.map((r) => r.tab.total ?? 0)))}
        </Text>
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        {rows.map(({ tab, label, tone, status }) => (
          <Row
            key={tab.id}
            left={`${formatTime(tab.closed_at!)} · ${label}`}
            right={tab.status === 'void' ? '—' : formatTL(tab.total ?? 0)}
            badge={<Badge tone={tone}>{status}</Badge>}
            onPress={() => router.push(`/sale/${tab.id}`)}
            testID="sale-row"
          />
        ))}
        {data && rows.length === 0 && (
          <View>
            <Empty text="Bu gün satış yok." />
          </View>
        )}
      </Card>
    </Screen>
  );
}
