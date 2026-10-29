import { formatTL } from '@crumble/shared';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { PriceInput } from '../../components/PriceInput';
import { useAction, useApiData, useCatalogVersion } from '../../components/useApi';

/** Fiyatlar: every product with its price and a "satışta" switch. */
export function BulkPrices() {
  const catalogVersion = useCatalogVersion();
  const [categories] = useApiData(() => api.listCategories());
  const [products, reload] = useApiData(() => api.listProducts(), [catalogVersion]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const run = useAction();

  const categoryName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories]);
  const query = search.toLocaleLowerCase('tr');
  const rows = (products ?? []).filter(
    (p) =>
      (filter === 'all' || (filter === 'inactive' ? !p.is_active : p.category_id === filter)) &&
      p.name.toLocaleLowerCase('tr').includes(query),
  );
  const inactiveCount = products?.filter((p) => !p.is_active).length ?? 0;

  const savePrice = (id: string, price: number) =>
    run(async () => {
      await api.updateProduct(id, { price });
      await reload();
    }, `Fiyat kaydedildi: ${formatTL(price)}`);
  const setActive = (id: string, isActive: boolean) =>
    run(async () => {
      await api.updateProduct(id, { is_active: isActive });
      await reload();
    }, isActive ? 'Ürün satışa açıldı.' : 'Ürün satıştan kaldırıldı.');

  return (
    <>
      <div className="page-head">
        <h2>Toplu fiyat</h2>
        <span className="grow" />
        <input
          className="input"
          placeholder="Ürün ara"
          aria-label="Ürün ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className={`btn pill small${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          Tümü
        </button>
        {(categories ?? []).map((c) => (
          <button key={c.id} className={`btn pill small${filter === c.id ? ' active' : ''}`} onClick={() => setFilter(c.id)}>
            {c.name}
          </button>
        ))}
        <button className={`btn pill small${filter === 'inactive' ? ' active' : ''}`} onClick={() => setFilter('inactive')}>
          Pasif ({inactiveCount})
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Fiyatı yazıp Enter'a basın. Değişiklik geçmişe kaydedilir.
        </span>
      </div>
      <table className="grid" aria-label="Toplu fiyat">
        <thead>
          <tr>
            <th>Ürün</th>
            <th>Kategori</th>
            <th className="right">Fiyat (₺)</th>
            <th className="right">Satışta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'inactive'} data-product={p.name}>
              <td style={{ fontWeight: 700 }}>{p.name}</td>
              <td className="muted">{categoryName.get(p.category_id)}</td>
              <td className="right">
                <PriceInput value={p.price} onCommit={(price) => void savePrice(p.id, price)} ariaLabel={`${p.name} fiyatı`} />
              </td>
              <td className="right">
                <button
                  role="switch"
                  aria-checked={p.is_active}
                  aria-label={`${p.name} satışta`}
                  className={`switch${p.is_active ? ' on' : ''}`}
                  onClick={() => void setActive(p.id, !p.is_active)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {products && rows.length === 0 && <div className="empty">Gösterilecek ürün yok.</div>}
    </>
  );
}
