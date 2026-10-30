import { formatTL, productReport } from '@crumble/shared';
import { useState } from 'react';
import { MenuEditor } from '../../components/Menu';
import { type RangeKey, RangePicker, rangeOf } from '../../components/pickers';
import { Bars, Empty, Row, Screen, Section, Segmented } from '../../components/ui';
import { loadCatalog, loadReportData } from '../../lib/data';
import { useLive } from '../../lib/useLive';

type View_ = 'report' | 'menu';

/** Ürünler: satış raporu (plan §6.3) and the menu the partners can edit (2026-10-30). */
export default function Products() {
  const [view, setView] = useState<View_>('report');
  return (
    <Screen title="Ürünler">
      <Segmented<View_>
        value={view}
        options={[
          ['report', 'Satış raporu'],
          ['menu', 'Menü'],
        ]}
        onChange={setView}
      />
      {view === 'report' ? <Report /> : <MenuEditor />}
    </Screen>
  );
}

function Report() {
  const [range, setRange] = useState<RangeKey>('today');
  const { data, error } = useLive(async () => {
    const { from, to } = rangeOf(range);
    const [report, catalog] = await Promise.all([loadReportData(from, to), loadCatalog()]);
    return productReport(report, catalog.products, catalog.categories);
  }, [range]);
  return (
    <>
      <RangePicker value={range} onChange={setRange} />
      {error && <Empty text={error} />}
      {data && (
        <>
          <Section title="Kategoriler">
            <Bars rows={data.categories.map((c) => ({ label: c.name, value: c.revenue, display: `${c.quantity} · ${formatTL(c.revenue)}` }))} />
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
    </>
  );
}
