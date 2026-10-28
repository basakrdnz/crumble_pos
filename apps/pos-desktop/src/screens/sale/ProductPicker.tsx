import type { Category, Product } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useState } from 'react';

/** Category tabs on top, product buttons below (plan §5.1). Inactive products are hidden. */
export function ProductPicker({
  categories,
  products,
  onPick,
  disabled,
}: {
  categories: Category[];
  products: Product[];
  onPick(product: Product): void;
  disabled?: boolean;
}) {
  const visible = categories.filter((c) => products.some((p) => p.category_id === c.id && p.is_active));
  const [categoryId, setCategoryId] = useState<string>();
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!visible.some((c) => c.id === categoryId)) setCategoryId(visible[0]?.id);
  }, [visible, categoryId]);

  const query = search.trim().toLocaleLowerCase('tr');
  const shown = products.filter(
    (p) =>
      p.is_active &&
      (query ? p.name.toLocaleLowerCase('tr').includes(query) : p.category_id === categoryId),
  );

  return (
    <section className="picker">
      <div className="category-tabs" role="tablist" aria-label="Kategoriler">
        {visible.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={!query && c.id === categoryId}
            className={`btn${!query && c.id === categoryId ? ' active' : ''}`}
            onClick={() => {
              setSearch('');
              setCategoryId(c.id);
            }}
          >
            {c.name}
          </button>
        ))}
        <input
          className="input search"
          placeholder="Ürün ara"
          aria-label="Ürün ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown.length === 1) {
              onPick(shown[0]!);
              setSearch('');
            }
            if (e.key === 'Escape') setSearch('');
          }}
        />
      </div>
      <div className="product-grid" aria-label="Ürün listesi">
        {shown.map((p) => (
          <button key={p.id} className="product" disabled={disabled} onClick={() => onPick(p)}>
            <span className="name">{p.name}</span>
            <span className="price">{formatTL(p.price)}</span>
          </button>
        ))}
        {shown.length === 0 && <div className="empty">Ürün yok.</div>}
      </div>
    </section>
  );
}
