import { Gloock_400Regular } from '@expo-google-fonts/gloock';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Login } from '../components/Login';
import { colors, fonts } from '../components/theme';
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
    <Stack
      screenOptions={{
        headerTintColor: colors.accent,
        headerTitleStyle: { fontFamily: fonts.heavy, color: colors.text },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sale/[id]" options={{ title: 'Satış detayı' }} />
      <Stack.Screen name="shifts" options={{ title: 'Vardiyalar' }} />
      <Stack.Screen name="history" options={{ title: 'Değişiklik geçmişi' }} />
      <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Fonts are bundled with the app (no network needed).
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, Gloock_400Regular });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.forest }} />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
