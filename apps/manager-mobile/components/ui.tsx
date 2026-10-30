import { formatTL } from '@crumble/shared';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadDeviceStatus } from '../lib/data';
import { formatDateTime, formatTime } from '../lib/format';
import { useLive } from '../lib/useLive';
import { colors, fonts, heat } from './theme';

/** Scrollable screen: big title, "son senkron" badge, pull to refresh (plan §6). */
export function Screen({
  title,
  children,
  refreshing = false,
  onRefresh,
  error,
  hero,
}: {
  title?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?(): void;
  error?: string | null;
  /** Full-width block above the padded content (Bugün's dark card). */
  hero?: ReactNode;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={hero ? { paddingBottom: 40 } : styles.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {hero}
      <View style={hero ? styles.content : undefined}>
        {title && (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <LastSync />
          </View>
        )}
        {error && (
          <Text style={styles.error} testID="error">
            {error}
          </Text>
        )}
        <View style={{ gap: 12 }}>{children}</View>
      </View>
    </ScrollView>
  );
}

/** "Son senkron 14:31" pill; red when the POS has not synced for 10 minutes. */
export function LastSync({ onDark = false }: { onDark?: boolean }) {
  const { data } = useLive(loadDeviceStatus);
  const stale = data && Date.now() - Date.parse(data.last_sync_at) > 10 * 60_000;
  const text =
    data === undefined
      ? ''
      : data === null
        ? 'Kasa henüz senkron olmadı'
        : `Son senkron: ${stale ? formatDateTime(data.last_sync_at) : formatTime(data.last_sync_at)}`;
  if (onDark) {
    return (
      <Text style={[styles.syncDark, stale && { color: colors.downOnDark }]} testID="last-sync">
        ● {text}
      </Text>
    );
  }
  return (
    <View style={[styles.sync, (stale || data === null) && { backgroundColor: colors.dangerSoft }]}>
      <View style={[styles.syncDot, (stale || data === null) && { backgroundColor: colors.danger }]} />
      <Text style={[styles.syncText, (stale || data === null) && { color: colors.danger }]} testID="last-sync">
        {text}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** ▲ %15 / ▼ %7 (green / red); nothing when there is no basis. */
export function Delta({ value, suffix = '', onDark = false }: { value: number | null; suffix?: string; onDark?: boolean }) {
  if (value === null) return <Text style={[styles.delta, { color: onDark ? colors.forestMuted : colors.faint }]}>—</Text>;
  const up = value >= 0;
  const color = onDark ? (up ? colors.upOnDark : colors.downOnDark) : up ? colors.ok : colors.danger;
  return <Text style={[styles.delta, { color }]}>{`${up ? '▲' : '▼'} %${Math.abs(value)}${suffix}`}</Text>;
}

export function Stat({
  label,
  value,
  sub,
  testID,
  big,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  testID?: string;
  big?: boolean;
}) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.statValue, big && styles.statBig]} testID={testID}>
        {value}
      </Text>
      {sub ? typeof sub === 'string' ? <Text style={styles.rowSub}>{sub}</Text> : sub : null}
    </Card>
  );
}

export function Row({
  left,
  right,
  sub,
  onPress,
  testID,
  badge,
}: {
  left: string;
  right?: string;
  sub?: string;
  onPress?(): void;
  testID?: string;
  badge?: ReactNode;
}) {
  const body = (
    <View style={styles.row} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLeft}>{left}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {right ? <Text style={styles.rowRight}>{right}</Text> : null}
        {badge}
      </View>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <Card style={{ paddingVertical: 4 }}>{children}</Card>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

/** Segmented control (Raporlar sections, Gün / Hafta / Ay). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange(value: T): void;
}) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map(([key, label]) => (
        <Pressable
          key={key}
          onPress={() => onChange(key)}
          style={[styles.segItem, key === value && styles.segOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: key === value }}
        >
          <Text style={[styles.segText, key === value && { color: colors.text }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export type BadgeTone = 'ok' | 'info' | 'grey' | 'danger';
const TONES: Record<BadgeTone, [string, string]> = {
  ok: [colors.accentSoft, colors.accent],
  info: [colors.infoSoft, colors.info],
  grey: [colors.greySoft, colors.grey],
  danger: [colors.dangerSoft, colors.danger],
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const [bg, fg] = TONES[tone];
  return <Text style={[styles.badge, { backgroundColor: bg, color: fg }]}>{children}</Text>;
}

/** Horizontal bars (product revenue etc.). */
export function Bars({ rows }: { rows: { label: string; value: number; display?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${(r.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>{r.display ?? formatTL(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Vertical columns with an optional comparison per column: a lighter bar
 * beside it (`compare: 'bar'`) or a dashed level line (`compare: 'line'`).
 */
export function Columns({
  values,
  compare,
  mode = 'line',
  labels,
  highlight,
  height = 110,
  dark = false,
}: {
  values: number[];
  compare?: (number | null)[];
  mode?: 'line' | 'bar';
  labels: string[];
  highlight?: number;
  height?: number;
  dark?: boolean;
}) {
  const max = Math.max(1, ...values, ...(compare ?? []).map((v) => v ?? 0));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: mode === 'bar' ? 6 : 3, height }}>
        {values.map((v, i) => {
          const c = compare?.[i] ?? null;
          return (
            <View key={i} style={{ flex: 1, height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
              {mode === 'bar' && (
                <View style={{ flex: 1, height: `${((c ?? 0) / max) * 100}%`, backgroundColor: colors.apply, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              )}
              <View
                style={{
                  flex: 1,
                  height: `${(v / max) * 100}%`,
                  backgroundColor: i === highlight ? colors.accent : mode === 'bar' ? colors.accent : '#C8DCCF',
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
              />
              {mode === 'line' && c !== null && (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${(c / max) * 100}%`,
                    borderTopWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: dark ? colors.forestMuted : '#9DB5A5',
                  }}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: mode === 'bar' ? 6 : 3, marginTop: 4 }}>
        {labels.map((l, i) => (
          <Text key={i} style={[styles.axis, { flex: 1 }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Weekday × hour grid; cells are 0..1 intensities, null = closed. */
export function HeatGrid({ rows, rowLabels, hours }: { rows: (number | null)[][]; rowLabels: string[]; hours: number[] }) {
  return (
    <View style={{ gap: 2 }} testID="heatmap">
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <Text style={[styles.axis, { width: 30 }]} />
        {hours.map((h) => (
          <Text key={h} style={[styles.axis, { flex: 1, textAlign: 'center' }]}>
            {h % 2 === 0 ? h : ''}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <Text style={[styles.axis, { width: 30 }]}>{rowLabels[r]}</Text>
          {row.map((v, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 20,
                borderRadius: 4,
                backgroundColor: v === null ? 'transparent' : heat[Math.min(heat.length - 1, Math.floor(v * (heat.length - 0.01)))],
                borderWidth: v === null ? 1 : 0,
                borderColor: colors.line,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

/** One-line number fact with a coloured mark (Bugün / Raporlar cards; no commentary). */
export function Fact({ tone, children }: { tone: 'up' | 'down' | 'info'; children: ReactNode }) {
  const [bg, fg, mark] =
    tone === 'up' ? [colors.accentSoft, colors.accent, '▲'] : tone === 'down' ? [colors.dangerSoft, colors.danger, '▼'] : [colors.infoSoft, colors.info, '●'];
  return (
    <View style={styles.fact}>
      <Text style={[styles.factMark, { backgroundColor: bg, color: fg }]}>{mark}</Text>
      <Text style={styles.factText}>{children}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 28, fontFamily: fonts.heavy, color: colors.text },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  syncText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent },
  syncDark: { fontSize: 12, fontFamily: fonts.bold, color: colors.forestMuted },
  error: { color: colors.danger, marginBottom: 8, fontFamily: fonts.semibold },
  card: { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16 },
  label: { color: colors.muted, fontSize: 12, fontFamily: fonts.bold },
  stat: { flex: 1, minWidth: 140, padding: 14 },
  statValue: { fontSize: 20, fontFamily: fonts.heavy, color: colors.text, marginTop: 4 },
  statBig: { fontSize: 34 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 8 },
  rowLeft: { fontSize: 14, color: colors.text, fontFamily: fonts.bold },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontFamily: fonts.semibold },
  rowRight: { fontSize: 14, fontFamily: fonts.heavy, color: colors.text },
  // No textTransform: 'uppercase' — it is not Turkish-aware (i -> I instead of İ).
  section: { fontSize: 13, fontFamily: fonts.bold, color: colors.muted, marginBottom: 6 },
  chip: { paddingHorizontal: 13, height: 32, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  chipActive: { borderColor: colors.forest, backgroundColor: colors.forest },
  chipText: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  seg: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 12, backgroundColor: colors.keyAlt },
  segItem: { flex: 1, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.panel, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 13, fontFamily: fonts.heavy, color: colors.muted },
  badge: { fontSize: 11, fontFamily: fonts.heavy, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  delta: { fontSize: 12, fontFamily: fonts.heavy },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  barLabel: { width: 96, fontSize: 12, color: colors.text, fontFamily: fonts.bold },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.greySoft, borderRadius: 9, overflow: 'hidden' },
  bar: { height: 8, backgroundColor: colors.accent, borderRadius: 9 },
  barValue: { width: 92, textAlign: 'right', fontSize: 12, color: colors.text, fontFamily: fonts.heavy },
  axis: { fontSize: 10, color: colors.faint, fontFamily: fonts.bold },
  empty: { color: colors.muted, textAlign: 'center', padding: 24, fontFamily: fonts.semibold },
  fact: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  factMark: { width: 26, height: 26, borderRadius: 9, textAlign: 'center', lineHeight: 26, fontSize: 12, overflow: 'hidden' },
  factText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text, fontFamily: fonts.semibold },
});
