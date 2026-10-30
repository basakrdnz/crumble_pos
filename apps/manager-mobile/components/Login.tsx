import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { isConfigured } from '../lib/supabase';
import { colors, fonts } from './theme';

const hourFormat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: 'numeric', hourCycle: 'h23' });

function greeting(): string {
  const hour = Number(hourFormat.format(new Date()));
  if (hour >= 5 && hour < 12) return 'Günaydın.';
  if (hour >= 12 && hour < 18) return 'İyi günler.';
  return 'İyi akşamlar.';
}

/** "Günaydın." on the forest green, the form in a sheet below (same language as the POS). */
export function Login() {
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await signIn(email, password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.hero}>
        <Text style={s.brand}>CRUMBLE</Text>
        <View>
          <Text style={s.greet}>{greeting()}</Text>
          <Text style={s.heroText}>Yönetim paneli. Ortak hesabınla giriş yap.</Text>
        </View>
      </View>
      <View style={s.sheet}>
        {!isConfigured && (
          <Text style={s.error}>Supabase adresi ayarlanmamış (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).</Text>
        )}
        <TextInput
          style={s.input}
          placeholder="E-posta"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="E-posta"
        />
        <TextInput
          style={s.input}
          placeholder="Şifre"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => void submit()}
          accessibilityLabel="Şifre"
        />
        {error && (
          <Text style={s.error} testID="login-error">
            {error}
          </Text>
        )}
        <Pressable
          style={[s.button, (!email || !password || busy) && { opacity: 0.5 }]}
          disabled={!email || !password || busy}
          onPress={() => void submit()}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Giriş</Text>}
        </Pressable>
        <Text style={s.foot}>Crumble Yönetim · sadece ortaklar</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.forest },
  hero: { flex: 1, padding: 28, paddingTop: 64, justifyContent: 'space-between', paddingBottom: 40 },
  brand: { fontFamily: fonts.brand, color: '#fff', fontSize: 16, letterSpacing: 3 },
  greet: { fontFamily: fonts.brand, color: '#fff', fontSize: 44, lineHeight: 50 },
  heroText: { fontFamily: fonts.semibold, color: colors.forestMuted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 12 },
  input: {
    height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, fontSize: 16,
    backgroundColor: '#fff', fontFamily: fonts.semibold, color: colors.text,
  },
  error: { color: colors.danger, fontFamily: fonts.semibold },
  button: { height: 54, backgroundColor: colors.accent, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontFamily: fonts.heavy, fontSize: 16 },
  foot: { fontSize: 12, color: colors.muted, textAlign: 'center', fontFamily: fonts.semibold },
});
