import type { Category, Product } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useRef, useState } from 'react';

/**
 * Search (F2) and category chips on top, product tiles below (plan §5.1). A
 * tile shows how many of it are in the cart. Inactive products are hidden.
 */
export function ProductPicker({
  categories,
  products,
  inCart,
  onPick,
  disabled,
}: {
  categories: Category[];
  products: Product[];
  /** product id -> quantity in the current cart */
  inCart: ReadonlyMap<string, number>;
  onPick(product: Product): void;
  disabled?: boolean;
}) {
  const visible = categories.filter((c) => products.some((p) => p.category_id === c.id && p.is_active));
  const [categoryId, setCategoryId] = useState<string>();
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!visible.some((c) => c.id === categoryId)) setCategoryId(visible[0]?.id);
  }, [visible, categoryId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F2') return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const query = search.trim().toLocaleLowerCase('tr');
  const shown = products.filter(
    (p) => p.is_active && (query ? p.name.toLocaleLowerCase('tr').includes(query) : p.category_id === categoryId),
  );

  return (
    <section className="picker" aria-label="Ürünler">
      <div className="picker-top">
        <label className="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
          </svg>
          <input
            ref={searchRef}
            className="input"
            placeholder="Ürün ara"
            aria-label="Ürün ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown.length === 1) {
                onPick(shown[0]!);
                setSearch('');
              }
              if (e.key === 'Escape') {
                setSearch('');
                e.currentTarget.blur();
                e.stopPropagation();
              }
            }}
          />
          <kbd>F2</kbd>
        </label>
      </div>
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
      </div>
      <div className="product-grid" aria-label="Ürün listesi">
        {shown.map((p) => {
          const qty = inCart.get(p.id) ?? 0;
          return (
            <button key={p.id} className={`product${qty ? ' in-cart' : ''}`} disabled={disabled} onClick={() => onPick(p)}>
              <span className="name">{p.name}</span>
              <span className="foot">
                <span className="price">{formatTL(p.price)}</span>
                {qty > 0 && (
                  <span className="qty" aria-label={`Sepette ${qty}`}>
                    {qty}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {shown.length === 0 && <div className="empty">Ürün yok.</div>}
      </div>
    </section>
  );
}
