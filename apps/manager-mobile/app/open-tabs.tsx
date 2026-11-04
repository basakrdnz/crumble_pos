import { router } from 'expo-router';
import { Badge, Card, Empty, Row, Screen } from '../components/ui';
import { loadCatalog, loadOpenTabRows } from '../lib/data';
import { formatDateTime, formatTL, openFor, tabLabel } from '../lib/format';
import { useLive } from '../lib/useLive';

/** Açık hesaplar (2026-11-04): every open tab, oldest first; tap for details and actions. */
export default function OpenTabs() {
  const { data, error, refreshing, reload } = useLive(async () => Promise.all([loadOpenTabRows(), loadCatalog()]));
  const rows = data?.[0] ?? [];
  const tables = data?.[1].tables ?? [];
  return (
    <Screen underHeader title="Açık hesaplar" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <Card>
        {rows.map((r) => (
          <Row
            key={r.tab.id}
            left={tabLabel(r.tab, tables)}
            sub={`${formatDateTime(r.tab.opened_at)} · ${openFor(r.tab.opened_at)} · ${r.itemCount} ürün${r.paid > 0 ? ` · ${formatTL(r.paid)} alındı` : ''}`}
            right={`${formatTL(r.remaining)}  ›`}
            badge={r.pending > 0 ? <Badge tone="info">kasaya gidiyor</Badge> : undefined}
            onPress={() => router.push(`/tab/${r.tab.id}`)}
            testID="open-tab-row"
          />
        ))}
        {data && rows.length === 0 && <Empty text="Açık hesap yok." />}
      </Card>
    </Screen>
  );
}
