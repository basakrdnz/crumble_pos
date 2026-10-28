import type { CatalogChange } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { api } from '../../api/client';
import { useApiData } from '../../components/useApi';
import { formatDateTime } from '../../format';

const ENTITY: Record<CatalogChange['entity_type'], string> = {
  product: 'Ürün',
  category: 'Kategori',
  table: 'Masa',
  floor_plan: 'Bölüm',
};
const ACTION: Record<CatalogChange['action'], string> = { create: 'Eklendi', update: 'Değişti', delete: 'Silindi' };
const FIELD: Record<string, string> = {
  name: 'ad',
  price: 'fiyat',
  is_active: 'aktif',
  category_id: 'kategori',
  description: 'açıklama',
  sort_order: 'sıra',
};

function showValue(field: string | null, value: string | null): string {
  if (value === null) return '—';
  if (field === 'price') return formatTL(Number(value));
  if (field === 'is_active') return value === 'true' ? 'evet' : 'hayır';
  return value;
}

export function ChangeHistory() {
  const [changes] = useApiData(() => api.listCatalogChanges(500));
  const [products] = useApiData(() => api.listProducts());
  const [categories] = useApiData(() => api.listCategories());
  const names = new Map<string, string>([
    ...(products ?? []).map((p) => [p.id, p.name] as const),
    ...(categories ?? []).map((c) => [c.id, c.name] as const),
  ]);
  return (
    <>
      <h2>Değişiklik geçmişi</h2>
      <table className="grid" aria-label="Değişiklik geçmişi">
        <thead>
          <tr>
            <th>Zaman</th>
            <th>Tür</th>
            <th>Kayıt</th>
            <th>İşlem</th>
            <th>Eski → Yeni</th>
          </tr>
        </thead>
        <tbody>
          {(changes ?? []).map((c) => (
            <tr key={c.id}>
              <td className="muted">{formatDateTime(c.changed_at)}</td>
              <td>{ENTITY[c.entity_type]}</td>
              <td>{names.get(c.entity_id) ?? c.new_value ?? c.old_value}</td>
              <td>
                {ACTION[c.action]}
                {c.field && ` (${FIELD[c.field] ?? c.field})`}
              </td>
              <td>
                {c.action === 'update'
                  ? `${showValue(c.field, c.old_value)} → ${showValue(c.field, c.new_value)}`
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {changes?.length === 0 && <div className="empty">Henüz değişiklik yok.</div>}
    </>
  );
}
