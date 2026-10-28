import { formatTL } from '@crumble/shared';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { PriceInput } from '../../components/PriceInput';
import { useAction, useApiData } from '../../components/useApi';

export function BulkPrices() {
  const [categories] = useApiData(() => api.listCategories());
  const [products, reload] = useApiData(() => api.listProducts());
  const [filter, setFilter] = useState<'all' | 'check' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const run = useAction();

  const categoryName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories]);
  const rows = (products ?? []).filter(
    (p) =>
      (filter === 'all' || (filter === 'check' ? p.needs_price_check : !p.is_active)) &&
      p.name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')),
  );
  const checkCount = products?.filter((p) => p.needs_price_check).length ?? 0;

  const savePrice = (id: string, price: number) =>
    run(async () => {
      await api.updateProduct(id, { price });
      await reload();
    }, `Fiyat kaydedildi: ${formatTL(price)}`);

  return (
    <>
      <h2>Toplu fiyat</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Ürün ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
        <button className={`btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          Tümü
        </button>
        <button className={`btn${filter === 'check' ? ' active' : ''}`} onClick={() => setFilter('check')}>
          Teyit edilecek ({checkCount})
        </button>
        <button className={`btn${filter === 'inactive' ? ' active' : ''}`} onClick={() => setFilter('inactive')}>
          Pasif
        </button>
        <span className="muted">Fiyatı yazıp Enter'a basın. Değişiklik geçmişe kaydedilir.</span>
      </div>
      <table className="grid" aria-label="Toplu fiyat">
        <thead>
          <tr>
            <th>Kategori</th>
            <th>Ürün</th>
            <th className="right">Fiyat (₺)</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'inactive'} data-product={p.name}>
              <td className="muted">{categoryName.get(p.category_id)}</td>
              <td>{p.name}</td>
              <td className="right">
                <PriceInput value={p.price} onCommit={(price) => void savePrice(p.id, price)} ariaLabel={`${p.name} fiyatı`} />
              </td>
              <td>
                {!p.is_active && <span className="badge muted">Pasif</span>}{' '}
                {p.needs_price_check && (
                  <>
                    <span className="badge warn">Teyit edilecek</span>{' '}
                    <button className="btn small" onClick={() => void savePrice(p.id, p.price)}>
                      Fiyat doğru
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {products && rows.length === 0 && <div className="empty">Gösterilecek ürün yok.</div>}
    </>
  );
}
