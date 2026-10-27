import { expectedCash, formatTL } from '@crumble/shared';
import { StyleSheet, Text, View } from 'react-native';

// Faz 0 placeholder: proves the app can use @crumble/shared.
const sample = expectedCash(50000, [{ method: 'cash', amount: 73450 }], []);

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crumble Yönetim</Text>
      <Text>Yönetim uygulaması iskeleti (Faz 0).</Text>
      <Text>
        Ortak paket testi: <Text testID="smoke">{formatTL(sample)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
});
