import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { isConfigured } from '../lib/supabase';
import { colors } from './theme';

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
      <View style={s.box}>
        <Text style={s.title}>Crumble Yönetim</Text>
        <Text style={s.muted}>Ortak hesabıyla giriş yapın.</Text>
        {!isConfigured && (
          <Text style={s.error}>Supabase adresi ayarlanmamış (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).</Text>
        )}
        <TextInput
          style={s.input}
          placeholder="E-posta"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="E-posta"
        />
        <TextInput
          style={s.input}
          placeholder="Şifre"
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
        <Pressable style={[s.button, (!email || !password || busy) && { opacity: 0.5 }]} disabled={!email || !password || busy} onPress={() => void submit()} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Giriş</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: '100%', maxWidth: 380, backgroundColor: colors.panel, borderRadius: 12, padding: 20, gap: 10, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  error: { color: colors.danger },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
