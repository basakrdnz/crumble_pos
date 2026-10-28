import { formatTL } from '@crumble/shared';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadDeviceStatus } from '../lib/data';
import { formatDateTime, formatTime } from '../lib/format';
import { useLive } from '../lib/useLive';
import { colors } from './theme';

/** Scrollable screen with pull-to-refresh and the "son senkron" line (plan §6). */
export function Screen({
  title,
  children,
  refreshing = false,
  onRefresh,
  error,
}: {
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?(): void;
  error?: string | null;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <LastSync />
      </View>
      {error && (
        <Text style={styles.error} testID="error">
          {error}
        </Text>
      )}
      {children}
    </ScrollView>
  );
}

export function LastSync() {
  const { data } = useLive(loadDeviceStatus);
  const stale = data && Date.now() - Date.parse(data.last_sync_at) > 10 * 60_000;
  return (
    <Text style={[styles.sync, stale && { color: colors.warn }]} testID="last-sync">
      {data === undefined
        ? ''
        : data === null
          ? 'Kasa henüz senkron olmadı'
          : `Son senkron: ${stale ? formatDateTime(data.last_sync_at) : formatTime(data.last_sync_at)}`}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Stat({ label, value, testID, big }: { label: string; value: string; testID?: string; big?: boolean }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, big && styles.statBig]} testID={testID}>
        {value}
      </Text>
    </Card>
  );
}

export function Row({
  left,
  right,
  sub,
  onPress,
  testID,
}: {
  left: string;
  right?: string;
  sub?: string;
  onPress?(): void;
  testID?: string;
}) {
  const body = (
    <View style={styles.row} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLeft}>{left}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right ? <Text style={styles.rowRight}>{right}</Text> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.section}>{title}</Text>
      <Card>{children}</Card>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button">
      <Text style={[styles.chipText, active && { color: colors.accent, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

/** Minimal horizontal bar chart (no chart library). */
export function Bars({ rows }: { rows: { label: string; value: number; display?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{r.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${(r.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>{r.display ?? formatTL(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  sync: { color: colors.muted, marginTop: 2 },
  error: { color: colors.danger, marginBottom: 8 },
  card: { backgroundColor: colors.panel, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
  stat: { flex: 1, minWidth: 140 },
  statLabel: { color: colors.muted, fontSize: 13 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 4 },
  statBig: { fontSize: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  rowLeft: { fontSize: 15, color: colors.text },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowRight: { fontSize: 15, fontWeight: '600', color: colors.text },
  // No textTransform: 'uppercase' — it is not Turkish-aware (i -> I instead of İ).
  section: { fontSize: 14, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  barLabel: { width: 64, fontSize: 12, color: colors.muted },
  barTrack: { flex: 1, height: 14, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 14, backgroundColor: colors.accent, borderRadius: 4 },
  barValue: { width: 96, textAlign: 'right', fontSize: 12, color: colors.text },
  empty: { color: colors.muted, textAlign: 'center', padding: 24 },
  badge: { fontSize: 12, fontWeight: '700' },
});
