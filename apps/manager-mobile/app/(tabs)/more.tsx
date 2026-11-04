import { router } from 'expo-router';
import { Card, Row, Screen } from '../../components/ui';

export default function More() {
  return (
    <Screen title="Diğer">
      <Card>
        <Row left="Açık hesaplar" sub="Ne zaman açıldı, ne alındı; ödeme, ad, iptal" right="›" onPress={() => router.push('/open-tabs')} />
        <Row left="Vardiyalar" sub="Açılış, gün sonu, beklenen nakit" right="›" onPress={() => router.push('/shifts')} />
        <Row left="Bildirimler" sub="Gönderilen son bildirimler" right="›" onPress={() => router.push('/notifications')} />
        <Row left="Değişiklik geçmişi" sub="Ürün, fiyat, kategori ve kroki değişiklikleri" right="›" onPress={() => router.push('/history')} />
        <Row left="Ayarlar" right="›" onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}
