import { formatTL, lineTotals, tabTotals } from '@crumble/shared';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Row, Screen, Section, styles } from '../../components/ui';
import { loadSale } from '../../lib/data';
import { formatDateTime } from '../../lib/format';
import { useLive } from '../../lib/useLive';

const METHOD = { cash: 'Nakit', card: 'Kart' } as const;

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useLive(() => loadSale(id), [id]);
  if (!data) return <Screen title="Satış" error={error}>{data === null && <Text>Bulunamadı.</Text>}</Screen>;
  const totals = tabTotals(data.items, data.tab.discount_percent);
  return (
    <Screen title={data.tab.status === 'void' ? 'İptal edilen hesap' : formatTL(data.tab.total ?? totals.total)} error={error}>
      <Text style={styles.rowSub}>
        {formatDateTime(data.tab.opened_at)}
        {data.tab.closed_at ? ` → ${formatDateTime(data.tab.closed_at)}` : ''}
        {data.tab.customer_name ? ` · ${data.tab.customer_name}` : ''}
      </Text>
      <Section title="Ürünler">
        {data.items.map((item) => (
          <Row
            key={item.id}
            left={`${item.voided_at ? '✕ ' : ''}${item.name_snapshot}`}
            sub={[
              `${item.quantity} × ${formatTL(item.unit_price)}`,
              item.unit_price !== item.list_price && `menü ${formatTL(item.list_price)}`,
              item.discount_percent && `%${item.discount_percent} indirim`,
              item.is_comp && 'ikram',
              item.voided_at && `çıkarıldı${item.void_reason ? `: ${item.void_reason}` : ''}`,
              item.note && `not: ${item.note}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            right={item.voided_at ? '' : formatTL(lineTotals(item).total)}
          />
        ))}
        {totals.cartDiscount > 0 && <Row left={`Sepet indirimi %${data.tab.discount_percent}`} right={`−${formatTL(totals.cartDiscount)}`} />}
      </Section>
      <Section title="Ödemeler">
        {data.payments.map((p) => (
          <Row key={p.id} left={METHOD[p.method]} sub={formatDateTime(p.paid_at)} right={formatTL(p.amount)} />
        ))}
        {data.payments.length === 0 && <Text style={styles.rowSub}>Ödeme yok.</Text>}
      </Section>
      {data.refunds.length > 0 && (
        <Section title="İadeler">
          {data.refunds.map((r) => (
            <Row key={r.id} left={`${METHOD[r.method]} iade`} sub={[formatDateTime(r.created_at), r.reason].filter(Boolean).join(' · ')} right={`−${formatTL(r.amount)}`} />
          ))}
        </Section>
      )}
    </Screen>
  );
}
