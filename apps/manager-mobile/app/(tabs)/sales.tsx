import { formatTL, sumKurus, todayIstanbul } from '@crumble/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { DayPicker } from '../../components/pickers';
import { Card, Empty, Row, Screen } from '../../components/ui';
import { loadCatalog, loadReportData } from '../../lib/data';
import { formatTime } from '../../lib/format';
import { useLive } from '../../lib/useLive';

/** Satışlar (plan §6.2): sales of a day, newest first. */
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
          const table = data[1].tables.find((t) => t.id === tab.table_id);
          const label =
            [table && `Masa ${table.label}`, tab.customer_name].filter(Boolean).join(' · ') ||
            (tab.kind === 'quick' ? 'Hızlı satış' : 'Hesap');
          const pays = data[0].payments.filter((p) => p.tab_id === tab.id);
          const refunded = sumKurus(data[0].refunds.filter((r) => r.tab_id === tab.id).map((r) => r.amount));
          const methods = [...new Set(pays.map((p) => (p.method === 'cash' ? 'Nakit' : 'Kart')))].join(' + ');
          const status = tab.status === 'void' ? 'İptal' : refunded > 0 ? `İade ${formatTL(refunded)}` : methods;
          return { tab, label, status };
        })
    : [];

  return (
    <Screen title="Satışlar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <DayPicker day={day} onChange={setDay} />
      <Card>
        {rows.map(({ tab, label, status }) => (
          <Row
            key={tab.id}
            left={`${formatTime(tab.closed_at!)} · ${label}`}
            sub={status}
            right={tab.status === 'void' ? '—' : formatTL(tab.total ?? 0)}
            onPress={() => router.push(`/sale/${tab.id}`)}
            testID="sale-row"
          />
        ))}
        {data && rows.length === 0 && <Empty text="Bu gün satış yok." />}
      </Card>
    </Screen>
  );
}
