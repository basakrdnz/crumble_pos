import { type Category, formatTL, parseTL, type Product } from '@crumble/shared';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addMenuProduct, type Catalog, type DeviceStatus, deleteMenuProduct, loadCatalog, loadChanges, loadDeviceStatus, setProductPrice } from '../lib/data';
import { formatDateTime } from '../lib/format';
import { useLive } from '../lib/useLive';
import { colors, fonts } from './theme';
import { Badge, Card, Chip, Chips, Empty, Label, Row, styles } from './ui';

const toText = (kurus: number) => formatTL(kurus).replace(' ₺', '').replace(/\./g, '');

/**
 * Ürünler → Menü (telefondan menü, 2026-10-30): change a price, add a product,
 * remove one. Categories and everything else stay on the POS.
 */
export function MenuEditor() {
  const { data, error, reload } = useLive(async () => {
    const [catalog, changes, device] = await Promise.all([loadCatalog(), loadChanges(500), loadDeviceStatus()]);
    return { catalog, changes, device };
  });
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);

  if (!data) return error ? <Text style={styles.error}>{error}</Text> : null;
  const categories = data.catalog.categories.filter((c) => !c.deleted_at);
  const current = categoryId ?? categories[0]?.id ?? null;
  const query = search.trim().toLocaleLowerCase('tr');
  const products = data.catalog.products.filter(
    (p) => !p.deleted_at && (query ? p.name.toLocaleLowerCase('tr').includes(query) : p.category_id === current),
  );
  const lastChange = (id: string) => data.changes.find((c) => c.entity_id === id);

  return (
    <>
      <TextInput style={s.search} placeholder="Ürün ara" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} accessibilityLabel="Ürün ara" />
      {!query && (
        <Chips>
          {categories.map((c) => (
            <Chip key={c.id} label={c.name} active={c.id === current} onPress={() => setCategoryId(c.id)} />
          ))}
        </Chips>
      )}
      <Card style={{ paddingVertical: 4 }}>
        {products.map((p) => (
          <Row
            key={p.id}
            left={p.name}
            sub={p.is_active ? undefined : 'satışta değil'}
            right={`${formatTL(p.price)}  ›`}
            badge={pendingOnPos(p, lastChange(p.id)?.source, data.device) ? <Badge tone="info">kasaya gidiyor</Badge> : undefined}
            onPress={() => setEditing(p)}
            testID="menu-row"
          />
        ))}
        {products.length === 0 && <Empty text="Ürün yok." />}
      </Card>
      <Text style={styles.rowSub}>Değişiklik kasaya yaklaşık 20 saniyede düşer; kasa çevrimdışıysa bağlanınca alır. Açık hesaplardaki fiyatlar değişmez.</Text>
      <Pressable style={s.fab} onPress={() => setAdding(true)} accessibilityRole="button">
        <Text style={s.fabText}>+ Ürün ekle</Text>
      </Pressable>
      {editing && (
        <PriceSheet
          product={editing}
          category={categories.find((c) => c.id === editing.category_id)}
          last={lastChange(editing.id)}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {adding && (
        <AddSheet
          catalog={data.catalog}
          initialCategory={current}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

/** True while the phone's change is newer than the POS's last sync heartbeat. */
function pendingOnPos(p: Product, source: string | undefined, device: DeviceStatus | null): boolean {
  if (source !== 'mobile') return false;
  return !device || Date.parse(p.updated_at) > Date.parse(device.last_sync_at);
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet} accessibilityLabel={title}>
        <View style={s.handle} />
        {children}
      </View>
    </Modal>
  );
}

function PriceSheet({
  product,
  category,
  last,
  onClose,
  onDone,
}: {
  product: Product;
  category?: Category;
  last?: { source: string; changed_at: string };
  onClose(): void;
  onDone(): void;
}) {
  const [text, setText] = useState(toText(product.price));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let price: number | null = null;
  try {
    price = parseTL(text);
  } catch {
    price = null;
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Fiyat değiştir" onClose={onClose}>
      <Label>{category?.name ?? ''}</Label>
      <Text style={s.sheetTitle}>{product.name}</Text>
      <Text style={styles.rowSub}>
        Şu anki fiyat {formatTL(product.price)}
        {last ? ` · son değişiklik ${last.source === 'mobile' ? 'telefondan' : 'kasadan'}, ${formatDateTime(last.changed_at)}` : ''}
      </Text>
      <Label>Yeni fiyat</Label>
      <View style={s.priceBox}>
        <TextInput
          style={s.priceInput}
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel="Yeni fiyat"
        />
        <Text style={s.tl}>₺</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[s.primary, (price === null || price < 0 || price === product.price || busy) && { opacity: 0.5 }]}
        disabled={price === null || price < 0 || price === product.price || busy}
        onPress={() => void run(() => setProductPrice(product.id, price!))}
        accessibilityRole="button"
      >
        <Text style={s.primaryText}>Fiyatı kaydet</Text>
      </Pressable>
      <Pressable
        style={[s.secondary, confirmDelete && { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}
        disabled={busy}
        onPress={() => (confirmDelete ? void run(() => deleteMenuProduct(product.id)) : setConfirmDelete(true))}
        accessibilityRole="button"
      >
        <Text style={s.secondaryText}>{confirmDelete ? 'Emin misin? Menüden kaldır' : 'Ürünü menüden kaldır'}</Text>
      </Pressable>
    </Sheet>
  );
}

function AddSheet({
  catalog,
  initialCategory,
  onClose,
  onDone,
}: {
  catalog: Catalog;
  initialCategory: string | null;
  onClose(): void;
  onDone(): void;
}) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let price: number | null = null;
  try {
    price = text ? parseTL(text) : null;
  } catch {
    price = null;
  }
  const ok = name.trim() !== '' && categoryId !== null && price !== null && price >= 0 && !busy;
  return (
    <Sheet title="Yeni ürün" onClose={onClose}>
      <Text style={s.sheetTitle}>Yeni ürün</Text>
      <Label>Ürün adı</Label>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ürün adı" placeholderTextColor={colors.muted} accessibilityLabel="Ürün adı" />
      <Label>Kategori</Label>
      <Chips>
        {catalog.categories
          .filter((c) => !c.deleted_at)
          .map((c) => (
            <Chip key={c.id} label={c.name} active={c.id === categoryId} onPress={() => setCategoryId(c.id)} />
          ))}
      </Chips>
      <Label>Fiyat</Label>
      <TextInput style={s.input} value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.muted} accessibilityLabel="Fiyat" />
      <Text style={styles.rowSub}>Kasada bu kategorinin sonuna eklenir ve hemen satışa açılır. Kategori ekleme ve sıralama kasadan yapılır.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[s.primary, !ok && { opacity: 0.5 }]}
        disabled={!ok}
        onPress={() => {
          setBusy(true);
          setError(null);
          addMenuProduct(randomUUID(), categoryId!, name.trim(), price!)
            .then(onDone)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
        accessibilityRole="button"
      >
        <Text style={s.primaryText}>Ürünü ekle</Text>
      </Pressable>
    </Sheet>
  );
}

const s = StyleSheet.create({
  search: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 14, fontFamily: fonts.semibold, color: colors.text },
  fab: { alignSelf: 'flex-end', height: 52, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontFamily: fonts.heavy, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,36,32,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 32, gap: 10 },
  handle: { width: 40, height: 5, borderRadius: 9, backgroundColor: '#D8DCD5', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 22, fontFamily: fonts.heavy, color: colors.text },
  priceBox: { height: 60, borderRadius: 14, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  priceInput: { flex: 1, minWidth: 0, height: '100%', borderWidth: 0, outlineWidth: 0, textAlign: 'right', fontSize: 26, fontFamily: fonts.heavy, color: colors.text },
  tl: { fontSize: 22, fontFamily: fonts.heavy, color: colors.text },
  input: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 16, fontFamily: fonts.semibold, color: colors.text },
  primary: { height: 54, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontFamily: fonts.heavy, fontSize: 16 },
  secondary: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.danger, fontFamily: fonts.bold, fontSize: 14 },
});
