import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { colors } from '../components/theme';
import { Card, Row, Screen, styles } from '../components/ui';
import { useAuth } from '../lib/auth';

const NOTIFY_KEY = 'crumble.notifications';

/** Ayarlar (plan §6.7): sign out, notification preference. */
export default function Settings() {
  const { session, signOut } = useAuth();
  const [notify, setNotify] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(NOTIFY_KEY).then((v) => setNotify(v === '1'));
  }, []);
  return (
    <Screen title="Ayarlar">
      <Card>
        <Row left="Hesap" right={session?.user.email ?? ''} />
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLeft}>Bildirimler</Text>
            <Text style={styles.rowSub}>Tercih kaydedilir; bildirim gönderimi sonraki sürümde.</Text>
          </View>
          <Switch
            value={notify}
            onValueChange={(v) => {
              setNotify(v);
              void AsyncStorage.setItem(NOTIFY_KEY, v ? '1' : '0');
            }}
          />
        </View>
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
