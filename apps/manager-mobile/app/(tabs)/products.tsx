import { formatTL, productReport } from '@crumble/shared';
import { useState } from 'react';
import { type RangeKey, RangePicker, rangeOf } from '../../components/pickers';
import { Bars, Empty, Row, Screen, Section } from '../../components/ui';
import { loadCatalog, loadReportData } from '../../lib/data';
import { useLive } from '../../lib/useLive';

/** Ürün raporu (plan §6.3): units and revenue per product, by category. */
export default function Products() {
  const [range, setRange] = useState<RangeKey>('today');
  const { data, error, refreshing, reload } = useLive(async () => {
    const { from, to } = rangeOf(range);
    const [report, catalog] = await Promise.all([loadReportData(from, to), loadCatalog()]);
    return productReport(report, catalog.products, catalog.categories);
  }, [range]);

  return (
    <Screen title="Ürün raporu" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <RangePicker value={range} onChange={setRange} />
      {data && (
        <>
          <Section title="Kategoriler">
            <Bars rows={data.categories.map((c) => ({ label: c.name.slice(0, 10), value: c.revenue, display: `${c.quantity} · ${formatTL(c.revenue)}` }))} />
            {data.cartDiscount > 0 && <Row left="Sepet indirimleri" right={`−${formatTL(data.cartDiscount)}`} />}
            <Row left="Toplam" right={formatTL(data.totalRevenue)} testID="products-total" />
          </Section>
          <Section title="Ürünler">
            {data.products.map((p) => (
              <Row
                key={p.productId}
                left={p.name}
                sub={`${p.quantity} adet${p.compQuantity ? ` · ${p.compQuantity} ikram` : ''}`}
                right={formatTL(p.revenue)}
                testID="product-row"
              />
            ))}
            {data.products.length === 0 && <Empty text="Bu aralıkta satış yok." />}
          </Section>
        </>
      )}
    </Screen>
  );
}
