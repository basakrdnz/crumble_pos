import { router } from 'expo-router';
import { Card, Row, Screen } from '../../components/ui';

export default function More() {
  return (
    <Screen title="Diğer">
      <Card>
        <Row left="Vardiyalar" sub="Açılış/kapanış, kasa sayımı, fark" right="›" onPress={() => router.push('/shifts')} />
        <Row left="Değişiklik geçmişi" sub="Ürün, fiyat, kategori ve kroki değişiklikleri" right="›" onPress={() => router.push('/history')} />
        <Row left="Ayarlar" right="›" onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}
