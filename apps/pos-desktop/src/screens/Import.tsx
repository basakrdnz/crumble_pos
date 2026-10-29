import { formatTL } from '@crumble/shared';
import { useState } from 'react';
import { api } from '../api/client';
import type { ImportPreview } from '../catalog/menuCsv';
import { useAction } from '../components/useApi';

// "teyit edilecek" is not shown in the POS (2026-10-29); only missing prices are.
const STATUS_LABEL = { tamam: '', teyit_edilecek: '', fiyat_belirlenecek: 'Fiyat belirlenecek' };

export function Import() {
  const [fileName, setFileName] = useState<string>();
  const [text, setText] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const run = useAction();

  const load = async (file: File) => {
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    setPreview(await run(() => api.previewMenuImport(content)));
  };

  const newProducts = preview?.products.filter((p) => !p.exists) ?? [];
  const skipped = (preview?.products.length ?? 0) - newProducts.length;
  const newCategories = preview?.categories.filter((c) => !c.exists) ?? [];

  return (
    <>
      <h2>Menü içe aktar</h2>
      <p className="muted">
        CSV sütunları: <code>kategori, urun, fiyat_tl, durum, not</code>. Önce önizleme gösterilir, onaylayınca aktarılır.
        Zaten var olan ürünler (aynı kategori ve ad) atlanır.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV dosyası"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
            e.target.value = '';
          }}
        />
        {fileName && <span className="muted">{fileName}</span>}
      </div>

      {preview && (
        <>
          {preview.errors.length > 0 ? (
            <div className="panel" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>
              <strong>{preview.errors.length} hata var, içe aktarma yapılamaz:</strong>
              <ul>
                {preview.errors.map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    Satır {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="panel row" style={{ marginBottom: 12 }}>
              <span className="grow" data-testid="import-summary">
                {newCategories.length} yeni kategori, {newProducts.length} yeni ürün
                {skipped > 0 && `, ${skipped} ürün zaten var (atlanacak)`}
              </span>
              <button
                className="btn primary"
                disabled={newProducts.length === 0}
                onClick={() =>
                  run(async () => {
                    const result = await api.applyMenuImport(text!);
                    setPreview(await api.previewMenuImport(text!));
                    return result;
                  }).then(
                    (r) =>
                      r && window.alert(`İçe aktarıldı: ${r.categoriesCreated} kategori, ${r.productsCreated} ürün.`),
                  )
                }
              >
                Onayla ve içe aktar
              </button>
            </div>
          )}
          <table className="grid" aria-label="Önizleme">
            <thead>
              <tr>
                <th>Satır</th>
                <th>Kategori</th>
                <th>Ürün</th>
                <th className="right">Fiyat</th>
                <th>Durum</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {preview.products.map((p) => (
                <tr key={p.line} className={p.exists || !p.isActive ? 'inactive' : ''}>
                  <td className="muted">{p.line}</td>
                  <td>{p.categoryName}</td>
                  <td>{p.name}</td>
                  <td className="num">{formatTL(p.price)}</td>
                  <td>
                    {p.exists && <span className="badge muted">Zaten var</span>}{' '}
                    {STATUS_LABEL[p.status] && (
                      <span className="badge muted">
                        {STATUS_LABEL[p.status]}
                      </span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {p.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
