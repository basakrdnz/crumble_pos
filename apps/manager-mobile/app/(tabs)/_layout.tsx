import { Tabs } from 'expo-router/js-tabs';
import { type ColorValue, Text, View } from 'react-native';
import { colors, fonts } from '../../components/theme';

// Simple drawn icons (no icon font): the glyph sits in a 24 px box.
const icon =
  (glyph: string) =>
  ({ color }: { color: ColorValue }) => (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 18, fontFamily: fonts.heavy }}>{glyph}</Text>
    </View>
  );

/** M1: white tab bar, the active tab in green (2026-10-30). */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="sales" options={{ title: 'Satışlar', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="products" options={{ title: 'Ürünler', tabBarIcon: icon('☕') }} />
      <Tabs.Screen name="reports" options={{ title: 'Raporlar', tabBarIcon: icon('▥') }} />
      <Tabs.Screen name="more" options={{ title: 'Diğer', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
