import { Card, Empty, Row, Screen } from '../components/ui';
import { loadPushLog } from '../lib/data';
import { formatDateTime } from '../lib/format';
import { useLive } from '../lib/useLive';

/** Bildirimler (2026-11-03): what the database sent to the phones, newest first. */
export default function Notifications() {
  const { data, error, refreshing, reload } = useLive(() => loadPushLog());
  return (
    <Screen underHeader title="Bildirimler" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <Card>
        {data?.map((n) => (
          <Row key={n.id} left={n.title} sub={`${formatDateTime(n.sent_at)} · ${n.body}`} />
        ))}
        {data && data.length === 0 && <Empty text="Henüz bildirim gönderilmedi." />}
      </Card>
    </Screen>
  );
}
