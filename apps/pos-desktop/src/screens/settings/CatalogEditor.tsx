import type { Category, Product } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PriceInput } from '../../components/PriceInput';
import { useAction, useApiData, useCatalogVersion } from '../../components/useApi';

function move<T>(items: readonly T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function CatalogEditor() {
  const catalogVersion = useCatalogVersion();
  const [categories, reloadCategories] = useApiData(() => api.listCategories());
  const [products, reloadProducts] = useApiData(() => api.listProducts(), [catalogVersion]);
  const [selectedId, setSelectedId] = useState<string>();
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState<Product | 'new'>();
  const run = useAction();

  useEffect(() => {
    if (categories && !categories.some((c) => c.id === selectedId)) setSelectedId(categories[0]?.id);
  }, [categories, selectedId]);

  const reload = async () => {
    await reloadCategories();
    await reloadProducts();
  };
  const selected = categories?.find((c) => c.id === selectedId);
  const inCategory = products?.filter((p) => p.category_id === selectedId) ?? [];

  if (!categories || !products) return null;

  return (
    <>
      <h2>Kategori ve ürünler</h2>
      <div className="two-col">
        <div className="panel">
          <div className="list" aria-label="Kategoriler">
            {categories.map((c, i) => (
              <CategoryRow
                key={c.id}
                category={c}
                count={products.filter((p) => p.category_id === c.id).length}
                selected={c.id === selectedId}
                onSelect={() => setSelectedId(c.id)}
                onMove={(delta) =>
                  run(async () => {
                    await api.reorderCategories(move(categories, i, delta).map((x) => x.id));
                    await reload();
                  })
                }
                onRename={(name) =>
                  run(async () => {
                    await api.renameCategory(c.id, name);
                    await reload();
                  })
                }
                onDelete={() => {
                  if (!window.confirm(`"${c.name}" kategorisi silinsin mi?`)) return;
                  void run(async () => {
                    await api.deleteCategory(c.id);
                    await reload();
                  }, 'Kategori silindi.');
                }}
              />
            ))}
            {categories.length === 0 && <div className="muted">Henüz kategori yok.</div>}
          </div>
          <form
            className="row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const created = await api.createCategory(newCategory);
                setNewCategory('');
                await reload();
                setSelectedId(created.id);
              });
            }}
          >
            <input
              className="input grow"
              placeholder="Yeni kategori"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button className="btn" disabled={!newCategory.trim()}>
              Ekle
            </button>
          </form>
        </div>

        <div className="panel">
          {selected ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <strong className="grow">{selected.name}</strong>
                <button className="btn primary" onClick={() => setEditing('new')}>
                  Yeni ürün
                </button>
              </div>
              <table className="grid" aria-label="Ürünler">
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th className="right">Fiyat</th>
                    <th>Durum</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inCategory.map((p, i) => (
                    <tr key={p.id} className={p.is_active ? '' : 'inactive'}>
                      <td>
                        {p.name}
                        {p.description && <div className="muted" style={{ fontSize: 13 }}>{p.description}</div>}
                      </td>
                      <td className="num">{formatTL(p.price)}</td>
                      <td>
                        {p.is_active ? <span className="badge ok">Aktif</span> : <span className="badge muted">Pasif</span>}
                      </td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn small"
                            title="Yukarı"
                            disabled={i === 0}
                            onClick={() =>
                              run(async () => {
                                await api.reorderProducts(move(inCategory, i, -1).map((x) => x.id));
                                await reloadProducts();
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            className="btn small"
                            title="Aşağı"
                            disabled={i === inCategory.length - 1}
                            onClick={() =>
                              run(async () => {
                                await api.reorderProducts(move(inCategory, i, 1).map((x) => x.id));
                                await reloadProducts();
                              })
                            }
                          >
                            ↓
                          </button>
                          <button className="btn small" onClick={() => setEditing(p)}>
                            Düzenle
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inCategory.length === 0 && <div className="empty">Bu kategoride ürün yok.</div>}
            </>
          ) : (
            <div className="empty">Soldan bir kategori seçin veya ekleyin.</div>
          )}
        </div>
      </div>

      {editing && selected && (
        <ProductDialog
          product={editing === 'new' ? undefined : editing}
          categories={categories}
          defaultCategoryId={selected.id}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reloadProducts();
          }}
        />
      )}
    </>
  );
}

function CategoryRow({
  category,
  count,
  selected,
  onSelect,
  onMove,
  onRename,
  onDelete,
}: {
  category: Category;
  count: number;
  selected: boolean;
  onSelect(): void;
  onMove(delta: number): void;
  onRename(name: string): void;
  onDelete(): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  if (renaming) {
    return (
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setRenaming(false);
          if (name.trim() && name !== category.name) onRename(name);
        }}
      >
        <input className="input grow" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn small">Kaydet</button>
      </form>
    );
  }
  return (
    <div className={`list-item${selected ? ' selected' : ''}`} onClick={onSelect}>
      <span className="grow">
        {category.name} <span className="muted">({count})</span>
      </span>
      {selected && (
        <>
          <button className="btn small" title="Yukarı" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="btn small" title="Aşağı" onClick={() => onMove(1)}>
            ↓
          </button>
          <button
            className="btn small"
            onClick={() => {
              setName(category.name);
              setRenaming(true);
            }}
          >
            Ad
          </button>
          <button className="btn small danger" onClick={onDelete}>
            Sil
          </button>
        </>
      )}
    </div>
  );
}

function ProductDialog({
  product,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  product?: Product;
  categories: Category[];
  defaultCategoryId: string;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? defaultCategoryId);
  const [price, setPrice] = useState(product?.price ?? 0);
  const [description, setDescription] = useState(product?.description ?? '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const run = useAction();

  const save = () =>
    run(async () => {
      if (product) {
        await api.updateProduct(product.id, {
          name,
          category_id: categoryId,
          price,
          description,
          is_active: isActive,
        });
      } else {
        await api.createProduct({ name, category_id: categoryId, price, description, is_active: isActive });
      }
      await onSaved();
    }, 'Kaydedildi.');

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h3>{product ? 'Ürünü düzenle' : 'Yeni ürün'}</h3>
        <div className="form">
          <label htmlFor="p-name">Ad</label>
          <input id="p-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="p-cat">Kategori</label>
          <select id="p-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label>Fiyat (₺)</label>
          <PriceInput value={price} onCommit={setPrice} ariaLabel="Fiyat" />
          <label htmlFor="p-desc">Açıklama</label>
          <textarea
            id="p-desc"
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label htmlFor="p-active">Aktif</label>
          <input id="p-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        </div>
        <div className="actions">
          {product && (
            <button
              type="button"
              className="btn danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (!window.confirm(`"${product.name}" silinsin mi?`)) return;
                void run(async () => {
                  await api.deleteProduct(product.id);
                  await onSaved();
                }, 'Ürün silindi.');
              }}
            >
              Sil
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={!name.trim()}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
