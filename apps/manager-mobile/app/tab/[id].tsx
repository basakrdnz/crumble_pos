import { formatTL, istanbulDay, lineTotals, parseTL, sumKurus, tabTotals, type TabItem } from '@crumble/shared';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Sheet, sheetStyles as s } from '../../components/Menu';
import { colors } from '../../components/theme';
import { Badge, Card, Label, Row, Screen, Section, Stat, styles } from '../../components/ui';
import { loadCatalog, loadTabDetail, requestTabPayment, requestTabRename, requestTabVoid, type TabRequest } from '../../lib/data';
import { formatDateTime, formatDay, formatTime, openFor, tabLabel } from '../../lib/format';
import { useLive } from '../../lib/useLive';

const METHOD = { cash: 'Nakit', card: 'Kart' } as const;

function requestText(r: TabRequest): string {
  if (r.kind === 'pay') return `${formatTL(r.amount!)} ${METHOD[r.method!].toLocaleLowerCase('tr')} ödeme`;
  if (r.kind === 'rename') return `Ad: ${r.customer_name}`;
  return 'Hesabı iptal et';
}

/** Lines grouped by the Istanbul day they were added: "hangi gün ne alınmış". */
function byDay(items: TabItem[]): [string, TabItem[]][] {
  const groups = new Map<string, TabItem[]>();
  for (const item of items) {
    const day = istanbulDay(item.created_at);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()];
}

/** Açık hesap detayı (2026-11-04): what was taken when, payments, and actions that go to the POS. */
export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refreshing, reload } = useLive(async () => Promise.all([loadTabDetail(id), loadCatalog()]), [id]);
  const [sheet, setSheet] = useState<'pay' | 'rename' | 'void' | null>(null);
  const detail = data?.[0];
  if (!data) return <Screen underHeader title="Hesap" error={error}>{null}</Screen>;
  if (!detail) return <Screen underHeader title="Hesap" error={error}><Text>Bulunamadı.</Text></Screen>;

  const { tab, items, payments, requests } = detail;
  const totals = tabTotals(items, tab.discount_percent);
  const paid = sumKurus(payments.map((p) => p.amount));
  const pendingPay = sumKurus(requests.filter((r) => r.status === 'pending' && r.kind === 'pay').map((r) => r.amount!));
  const remaining = totals.total - paid;
  const open = tab.status === 'open';
  const pendingVoid = requests.some((r) => r.status === 'pending' && r.kind === 'void');
  const title = tabLabel(tab, data[1].tables);

  return (
    <Screen underHeader title={title} refreshing={refreshing} onRefresh={() => void reload()} error={error}>
      <Text style={styles.rowSub}>
        Açılış {formatDateTime(tab.opened_at)} · {open ? openFor(tab.opened_at) : tab.status === 'paid' ? 'ödendi, kapandı' : 'iptal edildi'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat compact label="Toplam" value={formatTL(totals.total)} />
        <Stat compact label="Alınan" value={formatTL(paid)} />
        <Stat compact label="Kalan" value={formatTL(open ? remaining : 0)} testID="tab-remaining" />
      </View>

      {open && (
        <Card>
          <Pressable
            style={[s.primary, (remaining - pendingPay <= 0 || pendingVoid) && { opacity: 0.5 }]}
            disabled={remaining - pendingPay <= 0 || pendingVoid}
            onPress={() => setSheet('pay')}
            accessibilityRole="button"
          >
            <Text style={s.primaryText}>Ödeme al</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => setSheet('rename')} accessibilityRole="button">
              <Text style={[s.secondaryText, { color: colors.text }]}>Adını değiştir</Text>
            </Pressable>
            <Pressable
              style={[s.secondary, { flex: 1 }, (paid > 0 || pendingPay > 0 || pendingVoid) && { opacity: 0.5 }]}
              disabled={paid > 0 || pendingPay > 0 || pendingVoid}
              onPress={() => setSheet('void')}
              accessibilityRole="button"
            >
              <Text style={s.secondaryText}>Hesabı iptal et</Text>
            </Pressable>
          </View>
          {paid > 0 && <Text style={[styles.rowSub, { marginTop: 8 }]}>Ödeme alınmış hesap telefondan iptal edilemez; önce kasada iade yapılır.</Text>}
        </Card>
      )}

      {requests.length > 0 && (
        <Section title="Telefondan istekler">
          {[...requests].reverse().map((r) => (
            <Row
              key={r.id}
              left={requestText(r)}
              sub={[formatDateTime(r.created_at), r.status === 'rejected' && r.error].filter(Boolean).join(' · ')}
              badge={
                r.status === 'pending' ? (
                  <Badge tone="info">kasaya gidiyor</Badge>
                ) : r.status === 'done' ? (
                  <Badge tone="ok">kasada yapıldı</Badge>
                ) : (
                  <Badge tone="danger">yapılamadı</Badge>
                )
              }
            />
          ))}
        </Section>
      )}

      {byDay(items).map(([day, lines]) => (
        <Section key={day} title={formatDay(day)}>
          {lines.map((item) => (
            <Row
              key={item.id}
              left={`${item.voided_at ? '✕ ' : ''}${item.name_snapshot}`}
              sub={[
                formatTime(item.created_at),
                `${item.quantity} × ${formatTL(item.unit_price)}`,
                item.voided_at && 'çıkarıldı',
                item.note && `not: ${item.note}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={item.voided_at ? '' : formatTL(lineTotals(item).total)}
            />
          ))}
        </Section>
      ))}
      {totals.cartDiscount > 0 && <Row left={`Sepet indirimi %${tab.discount_percent}`} right={`−${formatTL(totals.cartDiscount)}`} />}

      <Section title="Ödemeler">
        {payments.map((p) => (
          <Row key={p.id} left={METHOD[p.method]} sub={formatDateTime(p.paid_at)} right={formatTL(p.amount)} />
        ))}
        {payments.length === 0 && <Text style={styles.rowSub}>Henüz ödeme yok.</Text>}
      </Section>

      {sheet === 'pay' && (
        <PaySheet tabId={tab.id} max={remaining - pendingPay} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void reload(); }} />
      )}
      {sheet === 'rename' && (
        <RenameSheet tabId={tab.id} current={tab.customer_name ?? ''} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void reload(); }} />
      )}
      {sheet === 'void' && (
        <VoidSheet
          tabId={tab.id}
          title={title}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .then(onDone)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  return { busy, error, submit };
}

/** "300 ₺ aldım" / "hepsini aldım": amount, then cash or card. The POS writes it into its open shift. */
function PaySheet({ tabId, max, onClose, onDone }: { tabId: string; max: number; onClose(): void; onDone(): void }) {
  const [text, setText] = useState('');
  const { busy, error, submit } = useSubmit(onDone);
  let amount: number | null = null;
  try {
    amount = text ? parseTL(text) : null;
  } catch {
    amount = null;
  }
  const ok = amount !== null && amount > 0 && amount <= max && !busy;
  const send = (method: 'cash' | 'card') => submit(() => requestTabPayment(randomUUID(), tabId, amount!, method));
  return (
    <Sheet title="Ödeme al" onClose={onClose}>
      <Text style={s.sheetTitle}>Ödeme al</Text>
      <Text style={styles.rowSub}>Kalan {formatTL(max)}. Kasa açık vardiyaya yazar; hepsi alınınca hesap kapanır.</Text>
      <Label>Alınan tutar</Label>
      <View style={s.priceBox}>
        <TextInput
          style={s.priceInput}
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Alınan tutar"
        />
        <Text style={s.tl}>₺</Text>
      </View>
      <Pressable style={s.secondary} onPress={() => setText(formatTL(max).replace(' ₺', '').replace(/\./g, ''))} accessibilityRole="button">
        <Text style={[s.secondaryText, { color: colors.text }]}>Hepsi ({formatTL(max)})</Text>
      </Pressable>
      {amount !== null && amount > max && <Text style={styles.error}>Kalan tutardan fazla olamaz.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable style={[s.primary, { flex: 1 }, !ok && { opacity: 0.5 }]} disabled={!ok} onPress={() => send('cash')} accessibilityRole="button">
          <Text style={s.primaryText}>Nakit aldım</Text>
        </Pressable>
        <Pressable
          style={[s.primary, { flex: 1, backgroundColor: colors.text }, !ok && { opacity: 0.5 }]}
          disabled={!ok}
          onPress={() => send('card')}
          accessibilityRole="button"
        >
          <Text style={s.primaryText}>Kartla aldım</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function RenameSheet({ tabId, current, onClose, onDone }: { tabId: string; current: string; onClose(): void; onDone(): void }) {
  const [name, setName] = useState(current);
  const { busy, error, submit } = useSubmit(onDone);
  const ok = name.trim() !== '' && name.trim() !== current && !busy;
  return (
    <Sheet title="Adını değiştir" onClose={onClose}>
      <Text style={s.sheetTitle}>Hesabın adı</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ad" placeholderTextColor={colors.muted} autoFocus accessibilityLabel="Hesap adı" />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[s.primary, !ok && { opacity: 0.5 }]} disabled={!ok} onPress={() => submit(() => requestTabRename(randomUUID(), tabId, name.trim()))} accessibilityRole="button">
        <Text style={s.primaryText}>Kaydet</Text>
      </Pressable>
    </Sheet>
  );
}

function VoidSheet({ tabId, title, onClose, onDone }: { tabId: string; title: string; onClose(): void; onDone(): void }) {
  const { busy, error, submit } = useSubmit(onDone);
  return (
    <Sheet title="Hesabı iptal et" onClose={onClose}>
      <Text style={s.sheetTitle}>{title} iptal edilsin mi?</Text>
      <Text style={styles.rowSub}>Hesap silinmez, iptal kaydı olarak kalır ve gün sonu raporunda iptal olarak görünür.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[s.primary, { backgroundColor: colors.danger }, busy && { opacity: 0.5 }]}
        disabled={busy}
        onPress={() => submit(() => requestTabVoid(randomUUID(), tabId))}
        accessibilityRole="button"
      >
        <Text style={s.primaryText}>Evet, iptal et</Text>
      </Pressable>
    </Sheet>
  );
}
