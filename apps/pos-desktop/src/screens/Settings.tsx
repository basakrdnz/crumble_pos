import { useState } from 'react';
import { BulkPrices } from './settings/BulkPrices';
import { CatalogEditor } from './settings/CatalogEditor';
import { ChangeHistory } from './settings/ChangeHistory';
import { Cloud } from './settings/Cloud';
import { FloorEditor } from './settings/FloorEditor';
import { Import } from './Import';
import { Maintenance } from './settings/Maintenance';
import { Password } from './settings/Password';
import { Shortcuts } from './settings/Shortcuts';

const SECTIONS = [
  { id: 'catalog', label: 'Kategori ve ürünler', render: () => <CatalogEditor /> },
  { id: 'prices', label: 'Toplu fiyat', render: () => <BulkPrices /> },
  { id: 'import', label: 'Menü içe aktar', render: () => <Import /> },
  { id: 'floor', label: 'Kroki düzenle', render: () => <FloorEditor /> },
  { id: 'history', label: 'Değişiklik geçmişi', render: () => <ChangeHistory /> },
  { id: 'cloud', label: 'Bulut bağlantısı', render: () => <Cloud /> },
  { id: 'password', label: 'Kasa şifresi', render: () => <Password /> },
  { id: 'shortcuts', label: 'Kısayollar', render: () => <Shortcuts /> },
  { id: 'maintenance', label: 'Yedek ve günlük', render: () => <Maintenance /> },
] as const;

export type SettingsSection = (typeof SECTIONS)[number]['id'];

export function Settings({ initial = 'catalog' }: { initial?: SettingsSection }) {
  const [section, setSection] = useState<SettingsSection>(initial);
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <>
      <nav className="sidebar" aria-label="Ayarlar">
        <h2>Ayarlar</h2>
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
