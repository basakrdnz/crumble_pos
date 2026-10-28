import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Login } from '../components/Login';
import { colors } from '../components/theme';
import { AuthProvider, useAuth } from '../lib/auth';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!session) return <Login />;
  return (
    <Stack screenOptions={{ headerTintColor: colors.accent, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sale/[id]" options={{ title: 'Satış detayı' }} />
      <Stack.Screen name="shifts" options={{ title: 'Vardiyalar' }} />
      <Stack.Screen name="history" options={{ title: 'Değişiklik geçmişi' }} />
      <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
