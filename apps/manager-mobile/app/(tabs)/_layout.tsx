import { Tabs } from 'expo-router/js-tabs';
import { type ColorValue, Text } from 'react-native';
import { colors } from '../../components/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('☀') }} />
      <Tabs.Screen name="sales" options={{ title: 'Satışlar', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="products" options={{ title: 'Ürünler', tabBarIcon: icon('☕') }} />
      <Tabs.Screen name="reports" options={{ title: 'Raporlar', tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="more" options={{ title: 'Diğer', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
