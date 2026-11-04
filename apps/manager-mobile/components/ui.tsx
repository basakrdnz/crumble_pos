import { type Busyness, formatTL } from '@crumble/shared';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
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
  underHeader = false,
}: {
  title?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?(): void;
  error?: string | null;
  /** Full-width block above the padded content (Bugün's dark card). */
  hero?: ReactNode;
  /** Stack screens with a navigation header: the header already clears the status bar. */
  underHeader?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // The scroll view starts below the status bar, so iOS's pull-to-refresh
  // spinner shows right under it instead of behind the clock (2026-11-04).
  const top = underHeader ? 0 : insets.top;
  return (
    <View style={[styles.screen, hero ? { backgroundColor: colors.forest } : null]}>
      {/* Behind the transparent scroll view: green above (pull on Bugün), page colour below. */}
      {hero ? <View pointerEvents="none" style={styles.screenBottom} /> : null}
      <View style={{ height: top, backgroundColor: hero ? colors.forest : colors.bg }} />
      <ScrollView
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={hero ? styles.heroContent : [styles.content, { paddingTop: 16 }]}
        refreshControl={
          onRefresh ? (
            // White spinner on the green Bugün background, green elsewhere.
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={hero ? colors.forestInk : colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.panel}
            />
          ) : undefined
        }
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
    </View>
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
export function Delta({ value, suffix = '', onDark = false, size }: { value: number | null; suffix?: string; onDark?: boolean; size?: number }) {
  if (value === null) return <Text style={[styles.delta, size ? { fontSize: size } : null, { color: onDark ? colors.forestMuted : colors.faint }]}>—</Text>;
  const up = value >= 0;
  const color = onDark ? (up ? colors.upOnDark : colors.downOnDark) : up ? colors.ok : colors.danger;
  return <Text style={[styles.delta, size ? { fontSize: size } : null, { color }]}>{`${up ? '▲' : '▼'} %${Math.abs(value)}${suffix}`}</Text>;
}

export function Stat({
  label,
  value,
  sub,
  testID,
  big,
  compact,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  testID?: string;
  big?: boolean;
  /** Three in a row on a phone (açık hesap detayı). */
  compact?: boolean;
}) {
  return (
    <Card style={compact ? [styles.stat, styles.statCompact] : styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.statValue, big && styles.statBig, compact && styles.statValueCompact]} testID={testID} numberOfLines={1} adjustsFontSizeToFit>
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
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, backgroundColor: colors.forestChip, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  statusLevel: { color: colors.forestInk, fontFamily: fonts.heavy, fontSize: 21 },
  statusSub: { color: colors.forestMuted, fontFamily: fonts.bold, fontSize: 13 },
  statusShift: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  statusDot: { width: 9, height: 9, borderRadius: 999 },
  statusShiftText: { color: colors.forestInk, fontFamily: fonts.heavy, fontSize: 13 },
  screenBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', backgroundColor: colors.bg },
  // The page colour under the hero, so its rounded corners show it and not the green behind.
  heroContent: { flexGrow: 1, backgroundColor: colors.bg, paddingBottom: 40 },
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
  statCompact: { minWidth: 0, padding: 12 },
  statValueCompact: { fontSize: 16 },
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

/** Kafe yoğunluğu kadranı (2026-11-04, tasarım D): four arcs, filled up to the level, and a needle. */
export function BusyGauge({ level, width = 104 }: { level: number | null; width?: number }) {
  const cx = 56, cy = 58, r = 44, gap = 0.07;
  const point = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const needle = Math.PI + (((level ?? 0) + 0.5) * Math.PI) / 4;
  const tint = level === null ? colors.gaugeIdle : colors.busy[level]!;
  return (
    <Svg width={width} height={(width * 66) / 112} viewBox="0 0 112 66">
      {[0, 1, 2, 3].map((i) => {
        const a0 = Math.PI + (i * Math.PI) / 4 + gap;
        const a1 = Math.PI + ((i + 1) * Math.PI) / 4 - gap;
        return (
          <Path
            key={i}
            d={`M${point(a0)} A${r} ${r} 0 0 1 ${point(a1)}`}
            stroke={level !== null && i <= level ? tint : colors.gaugeIdle}
            strokeWidth={11}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
      {level !== null && (
        <>
          <Line x1={cx} y1={cy} x2={cx + 26 * Math.cos(needle)} y2={cy + 26 * Math.sin(needle)} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
          <Circle cx={cx} cy={cy} r={4.5} fill="#fff" />
        </>
      )}
    </Svg>
  );
}

/**
 * Bugün'ün durum kartı (2026-11-04, tasarım D): the busyness gauge, its level
 * and the last half hour's order count, and under them the shift (green dot
 * gently pulsing while open, red when closed). Only shows state.
 */
export function StatusCard({ busy, openedAt }: { busy: Busyness | null; openedAt: string | null }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const open = openedAt !== null;
  useEffect(() => {
    if (!open) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [open, pulse]);
  const shown = open ? busy : null;
  return (
    <View style={styles.status} testID="busy-meter" accessibilityLabel={shown ? `Yoğunluk: ${shown.label}` : 'Vardiya kapalı'}>
      <BusyGauge level={shown?.level ?? null} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusLevel, !shown && { color: colors.forestMuted }]} testID="busy-label">
          {shown?.label ?? '—'}
        </Text>
        <Text style={styles.statusSub}>{shown ? `son 30 dk · ${shown.orders} sipariş` : 'vardiya açılınca görünür'}</Text>
        <View style={styles.statusShift} testID="shift-light" accessibilityLabel={open ? 'Vardiya açık' : 'Vardiya kapalı'}>
          <Animated.View style={[styles.statusDot, { backgroundColor: open ? colors.shiftOpen : colors.shiftClosed, opacity: pulse }]} />
          <Text style={styles.statusShiftText}>{open ? `Vardiya açık · ${formatTime(openedAt)}` : 'Vardiya kapalı'}</Text>
        </View>
      </View>
    </View>
  );
}
