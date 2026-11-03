import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { colors } from '../components/theme';
import { Card, Row, Screen, styles } from '../components/ui';
import { useAuth } from '../lib/auth';
import { pushPreference, pushSupported, setPush } from '../lib/push';

/** Ayarlar (plan §6.7): sign out, notifications. */
export default function Settings() {
  const { session, signOut } = useAuth();
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void pushPreference().then((on) => setNotify(pushSupported && on));
  }, []);
  const toggle = async (on: boolean) => {
    setBusy(true);
    setMessage(null);
    const result = await setPush(on);
    setNotify(result.enabled);
    setMessage(result.error ?? null);
    setBusy(false);
  };
  return (
    <Screen underHeader title="Ayarlar">
      <Card>
        <Row left="Hesap" right={session?.user.email ?? ''} />
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLeft}>Bildirimler</Text>
            <Text style={styles.rowSub}>Gün açıldı, gün sonu, ortalamanın üstü ve ayın rekoru. Her biri günde en çok bir kez.</Text>
          </View>
          <Switch value={notify} disabled={busy || !pushSupported} onValueChange={(v) => void toggle(v)} accessibilityLabel="Bildirimler" />
        </View>
        {message && <Text style={[styles.rowSub, { color: colors.danger }]}>{message}</Text>}
      </Card>
      <Pressable
        onPress={() => void signOut()}
        style={{ marginTop: 16, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.danger, alignItems: 'center' }}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.danger, fontWeight: '700' }}>Çıkış yap</Text>
      </Pressable>
    </Screen>
  );
}
