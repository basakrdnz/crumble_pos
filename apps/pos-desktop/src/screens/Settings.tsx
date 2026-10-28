import { useState } from 'react';
import { BulkPrices } from './settings/BulkPrices';
import { CatalogEditor } from './settings/CatalogEditor';
import { ChangeHistory } from './settings/ChangeHistory';
import { Import } from './Import';

const SECTIONS = [
  { id: 'catalog', label: 'Kategori ve ürünler', render: () => <CatalogEditor /> },
  { id: 'prices', label: 'Toplu fiyat', render: () => <BulkPrices /> },
  { id: 'import', label: 'Menü içe aktar', render: () => <Import /> },
  { id: 'history', label: 'Değişiklik geçmişi', render: () => <ChangeHistory /> },
] as const;

export function Settings() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('catalog');
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <>
      <nav className="sidebar" aria-label="Ayarlar">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`btn${s.id === section ? ' active' : ''}`} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="content">{current.render()}</div>
    </>
  );
}
