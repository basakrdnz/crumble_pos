import { Tabs } from 'expo-router/js-tabs';
import { type ColorValue, Platform, Text, View } from 'react-native';
import { colors, fonts } from '../../components/theme';

// Simple drawn icons (no icon font): the glyph sits in a 24 px box. U+FE0E asks iOS
// for the text form of ☕, otherwise it draws the colour emoji and ignores the tint.
const icon =
  (glyph: string) =>
  ({ color }: { color: ColorValue }) => (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 18, fontFamily: fonts.heavy }}>{glyph}</Text>
    </View>
  );

// The web build (tests, store screenshots) has no home-indicator inset, so the
// default bar clips its labels; give it the room an iPhone has.
const webBar = Platform.OS === 'web' ? { height: 86, paddingTop: 4, paddingBottom: 26 } : null;

/** M1: white tab bar, the active tab in green (2026-10-30). */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.border, ...webBar },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="sales" options={{ title: 'Satışlar', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="products" options={{ title: 'Ürünler', tabBarIcon: icon('☕\uFE0E') }} />
      <Tabs.Screen name="reports" options={{ title: 'Raporlar', tabBarIcon: icon('▥') }} />
      <Tabs.Screen name="more" options={{ title: 'Diğer', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
