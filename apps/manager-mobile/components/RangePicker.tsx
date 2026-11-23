// Raporlar · Aralık (kullanıcı 2026-11-23): pick any start and end day on a
// month calendar, ‹ › moving month to month. Days the café was open carry a
// dot. First tap = start, second tap = end (a day before the start becomes the
// new start).
import { addDays, type Day, daysBetween, monthStart, todayIstanbul, weekdayIndex } from '@crumble/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Sheet, sheetStyles as s } from './Menu';
import { colors } from './theme';
import { styles } from './ui';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HEAD = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const monthEnd = (m: Day) => addDays(monthStart(addDays(m, 32)), -1);

export interface DayRange {
  from: Day;
  to: Day;
}

export function presetRanges(today: Day): [string, DayRange][] {
  const thisMonth = monthStart(today);
  const lastMonth = monthStart(addDays(thisMonth, -1));
  return [
    ['Son 7 gün', { from: addDays(today, -6), to: today }],
    ['Son 30 gün', { from: addDays(today, -29), to: today }],
    ['Bu ay', { from: thisMonth, to: today }],
    ['Geçen ay', { from: lastMonth, to: addDays(thisMonth, -1) }],
  ];
}

export function RangeSheet({
  value,
  openDays,
  onClose,
  onPick,
}: {
  value: DayRange;
  /** Days with a shift (a dot under the number). */
  openDays: ReadonlySet<Day>;
  onClose(): void;
  onPick(range: DayRange): void;
}) {
  const today = todayIstanbul();
  const [month, setMonth] = useState(monthStart(value.to));
  const [from, setFrom] = useState<Day | null>(value.from);
  const [to, setTo] = useState<Day | null>(value.to);

  const first = month;
  const lead = weekdayIndex(first);
  const cells: (Day | null)[] = [...Array<null>(lead).fill(null), ...daysBetween(first, monthEnd(first))];
  while (cells.length % 7) cells.push(null);
  const canNext = addDays(monthEnd(month), 1) <= today;

  const tap = (d: Day) => {
    if (d > today) return;
    if (!from || to) {
      setFrom(d);
      setTo(null);
    } else if (d < from) {
      setFrom(d);
    } else {
      setTo(d);
    }
  };
  const ready = from && to;
  const days = ready ? daysBetween(from, to).length : 0;

  return (
    <Sheet title="Tarih aralığı" onClose={onClose}>
      <Text style={s.sheetTitle}>Tarih aralığı</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {presetRanges(today).map(([label, r]) => (
          <Pressable
            key={label}
            onPress={() => {
              setFrom(r.from);
              setTo(r.to);
              setMonth(monthStart(r.to));
            }}
            style={styles.chip}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Pressable onPress={() => setMonth(monthStart(addDays(month, -1)))} accessibilityRole="button" accessibilityLabel="Önceki ay" style={arrow}>
          <Text style={arrowText}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }} testID="range-month">
          {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
        </Text>
        <Pressable
          onPress={() => canNext && setMonth(addDays(monthEnd(month), 1))}
          disabled={!canNext}
          accessibilityRole="button"
          accessibilityLabel="Sonraki ay"
          style={[arrow, !canNext && { opacity: 0.35 }]}
        >
          <Text style={arrowText}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {HEAD.map((h) => (
          <Text key={h} style={[styles.axis, { flex: 1, textAlign: 'center' }]}>
            {h}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 44 }} />;
          const inRange = from && (to ? d >= from && d <= to : d === from);
          const edge = d === from || d === to;
          const future = d > today;
          return (
            <Pressable
              key={d}
              onPress={() => tap(d)}
              disabled={future}
              accessibilityRole="button"
              accessibilityLabel={d}
              testID={`range-day-${d}`}
              style={{ width: `${100 / 7}%`, height: 44, padding: 2 }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: edge ? colors.accent : inRange ? colors.accentSoft : 'transparent',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: edge ? '#fff' : future ? colors.faint : colors.text, opacity: future ? 0.5 : 1 }}>
                  {Number(d.slice(8, 10))}
                </Text>
                {openDays.has(d) && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 1, backgroundColor: edge ? '#fff' : colors.accent }} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.rowSub}>
        {ready ? `${days} gün seçildi` : from ? 'Bitiş gününe dokun' : 'Başlangıç gününe dokun'} · noktalı günler kasanın açık olduğu günler
      </Text>
      <Pressable
        style={[s.primary, !ready && { opacity: 0.5 }]}
        disabled={!ready}
        onPress={() => ready && onPick({ from, to })}
        accessibilityRole="button"
        testID="range-apply"
      >
        <Text style={s.primaryText}>Göster</Text>
      </Pressable>
    </Sheet>
  );
}

const arrow = {
  width: 44,
  height: 44,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
const arrowText = { fontSize: 22, fontWeight: '700' as const, color: colors.text };
