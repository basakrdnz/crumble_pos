import { addDays, type Day, todayIstanbul } from '@crumble/shared';
import { Pressable, Text, View } from 'react-native';
import { formatDay } from '../lib/format';
import { colors } from './theme';
import { Chip, styles } from './ui';

export function DayPicker({ day, onChange }: { day: Day; onChange(day: Day): void }) {
  const today = todayIstanbul();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Pressable onPress={() => onChange(addDays(day, -1))} accessibilityLabel="Önceki gün" style={styles.chip}>
        <Text>◀</Text>
      </Pressable>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }} testID="picked-day">
        {day === today ? `Bugün · ${formatDay(day)}` : formatDay(day)}
      </Text>
      <Pressable
        onPress={() => day < today && onChange(addDays(day, 1))}
        accessibilityLabel="Sonraki gün"
        style={[styles.chip, day >= today && { opacity: 0.4 }]}
      >
        <Text>▶</Text>
      </Pressable>
    </View>
  );
}

export type RangeKey = 'today' | 'week' | 'month' | '30d';

export function rangeOf(key: RangeKey): { from: Day; to: Day } {
  const to = todayIstanbul();
  if (key === 'today') return { from: to, to };
  if (key === 'week') return { from: addDays(to, -6), to };
  if (key === '30d') return { from: addDays(to, -29), to };
  return { from: `${to.slice(0, 7)}-01`, to };
}

const LABELS: Record<RangeKey, string> = { today: 'Bugün', week: 'Son 7 gün', month: 'Bu ay', '30d': 'Son 30 gün' };

export function RangePicker({ value, onChange }: { value: RangeKey; onChange(key: RangeKey): void }) {
  return (
    <View style={styles.chips}>
      {(Object.keys(LABELS) as RangeKey[]).map((key) => (
        <Chip key={key} label={LABELS[key]} active={key === value} onPress={() => onChange(key)} />
      ))}
    </View>
  );
}
