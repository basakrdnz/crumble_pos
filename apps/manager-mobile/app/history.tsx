import type { CatalogChange } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { Card, Empty, Row, Screen } from '../components/ui';
import { loadCatalog, loadChanges } from '../lib/data';
import { formatDateTime } from '../lib/format';
import { useLive } from '../lib/useLive';

const ENTITY: Record<CatalogChange['entity_type'], string> = { product: 'Ürün', category: 'Kategori', table: 'Masa', floor_plan: 'Bölüm' };
const FIELD: Record<string, string> = {
  name: 'ad', price: 'fiyat', is_active: 'aktif', category_id: 'kategori', description: 'açıklama', sort_order: 'sıra',
  label: 'etiket', shape: 'şekil', x: 'konum', y: 'konum', width: 'genişlik', height: 'yükseklik', rotation: 'açı', color: 'renk',
};

function value(field: string | null, v: string | null): string {
  if (v === null) return '—';
  if (field === 'price') return formatTL(Number(v));
  if (field === 'is_active') return v === 'true' ? 'evet' : 'hayır';
  return v;
}

/** Değişiklik geçmişi (plan §6.6): what changed (old → new) and when. */
export default function History() {
  const { data, error, refreshing, reload } = useLive(async () => Promise.all([loadChanges(300), loadCatalog()]));
  const names = new Map<string, string>();
  if (data) {
    for (const p of data[1].products) names.set(p.id, p.name);
    for (const c of data[1].categories) names.set(c.id, c.name);
    for (const t of data[1].tables) names.set(t.id, `Masa ${t.label}`);
    for (const f of data[1].floorPlans) names.set(f.id, f.name);
  }
  return (
    <Screen title="Değişiklik geçmişi" refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <Card>
        {data?.[0].map((c) => (
          <Row
            key={c.id}
            left={`${ENTITY[c.entity_type]} · ${names.get(c.entity_id) ?? c.new_value ?? c.old_value ?? ''}`}
            sub={`${formatDateTime(c.changed_at)} · ${
              c.action === 'create'
                ? 'eklendi'
                : c.action === 'delete'
                  ? 'silindi'
                  : `${FIELD[c.field ?? ''] ?? c.field}: ${value(c.field, c.old_value)} → ${value(c.field, c.new_value)}`
            }`}
            testID="change-row"
          />
        ))}
        {data?.[0].length === 0 && <Empty text="Henüz değişiklik yok." />}
      </Card>
    </Screen>
  );
}
