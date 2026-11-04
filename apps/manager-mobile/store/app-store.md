# App Store'a gönderme (Unlisted)

Karar (2026-11-04): uygulama App Store'a **Unlisted** (listelenmemiş) olarak çıkar. Aramada görünmez, sadece linki olan kurar ve TestFlight'taki gibi 90 günde süresi dolmaz. Apple incelemecisine ortak hesabı verilir.

Build'i GitHub Actions zaten App Store Connect'e yüklüyor (`mobile-ios.yml`, main'e her birleşmede). Aşağıdakiler App Store Connect'te (appstoreconnect.apple.com → Uygulamalar → Crumble Yönetim) **bir kez** elle doldurulur.

## Otomatik yüklenenler (2026-11-04)

`.github/workflows/app-store-metadata.yml` (fastlane deliver, GitHub'daki ASC API anahtarıyla) şunları App Store Connect'e kendisi yazar: ad, alt başlık, açıklama, tanıtım metni, anahtar kelimeler, destek ve gizlilik adresi, telif, kategoriler (`store/metadata/`) ve ekran görüntüleri (`store/screenshots/` 6,9", `store/screenshots-6.5/` 6,5"). Bu dosyalar değişip main'e (veya bir Claude dalına) gelince çalışır, elle de başlatılır. Build yüklemez, incelemeye göndermez. Elle kalanlar: App Privacy, fiyat ve ülkeler, dağıtım yöntemi, inceleme bilgileri (hesap ve şifre), build seçimi ve "İncelemeye gönder".

## 1. Uygulama Bilgileri (App Information)

| Alan | Değer |
|---|---|
| Ad (Name) | Crumble Yönetim |
| Alt başlık (Subtitle) | Crumble Cafe ortak paneli |
| Birincil kategori | İş (Business) |
| İkincil kategori | Finans (Finance), isteğe bağlı |
| İçerik hakları | Üçüncü taraf içerik yok |
| Yaş derecelendirmesi | Tüm sorulara "Hayır/Yok" → 4+ |

## 2. Fiyat ve Bulunabilirlik (Pricing and Availability)

- Fiyat: **Ücretsiz**.
- Ülke: sadece **Türkiye** yeterli.
- **App Distribution Methods** bölümü varsa: **Unlisted App** seçilir. Yoksa 7. adımdaki form doldurulur.

## 3. Uygulama Gizliliği (App Privacy)

- Gizlilik politikası adresi: `https://github.com/basakrdnz/crumble_pos/blob/main/apps/manager-mobile/store/gizlilik.md`
- "Veri topluyor musunuz?" → **Evet**. Sadece:
  - **İletişim Bilgileri → E-posta adresi**: kullanım amacı **Uygulama İşlevselliği** (App Functionality). Kullanıcıya bağlı: **Evet**. İzleme (tracking): **Hayır**.
- Diğer bütün türler: **toplanmıyor**. Bildirim anahtarı Apple'ın listesinde ayrı bir tür değildir.

## 4. Sürüm 1.0 sayfası

**Ekran görüntüleri (iPhone 6,9"):** `store/screenshots/` içindeki 6 dosyayı sırayla sürükle (1320×2868). Görsellerdeki rakamlar demo verisidir, gerçek ciro değildir. Yeniden üretmek için: `apps/pos-desktop/e2e/store-screenshots.e2e.ts`.

**Tanıtım metni (Promotional Text):**
> Kasadaki satışlar birkaç saniye içinde telefonunuzda.

**Açıklama (Description):**
> Crumble Yönetim, Crumble Cafe ortaklarının kafeyi telefondan takip ettiği uygulamadır. Kasadaki her satış birkaç saniye içinde telefona düşer.
>
> • Bugün: anlık ciro, kafenin şu anki yoğunluğu (sakin → çok yoğun), nakit/kart, satış sayısı; dünün ve geçen haftanın aynı saatiyle kıyas
> • Satışlar: gün gün tüm satışlar ve ayrıntıları
> • Ürünler: kategori ve ürün bazında satış raporu
> • Raporlar: günlük ciro, saat saat yoğunluk haritası, en yoğun ve en sakin saatler, gün/hafta/ay kıyası
> • Açık hesaplar: hangi gün ne alındığı; telefondan ödeme kaydı, ad değiştirme, iptal
> • Menü: fiyat değiştirme, ürün ekleme ve silme, kasaya kendiliğinden gider
> • Bildirimler: gün açıldı, gün sonu, ortalamanın üstü, ayın rekoru
>
> Uygulama sadece kafe ortaklarına verilmiş hesaplarla kullanılabilir.

**Anahtar kelimeler (Keywords):**
> crumble,kafe,cafe,kasa,ciro,satış,rapor,vardiya,gün sonu,menü

**Destek adresi (Support URL):** `https://github.com/basakrdnz/crumble_pos/issues`

**Pazarlama adresi:** boş bırakılabilir.

**Build:** "Build" bölümünden en son build seçilir (TestFlight'taki numara).

**Telif (Copyright):** `2026 Crumble Cafe`

**Sürüm yayını (Version Release):** **Bu sürümü elle yayınla** (Manually release). Unlisted onayı gelmeden herkese açık yayınlanmasın.

## 5. İnceleme bilgileri (App Review Information)

- **Oturum açma gerekli:** işaretli.
- Kullanıcı adı: `ortak@crumble.local`
- Şifre: ortak hesabının şifresini **sen yazarsın** (repoya ve bu dosyaya yazılmaz).
- İletişim: adın, telefonun ve e-postan.
- **Notlar (Notes),** İngilizce:

> Crumble Yönetim is an internal app for the partners (owners) of one café, Crumble Cafe in Ankara, Turkey. It shows the café's live sales from its point-of-sale computer, lets the owners edit menu prices and record payments for open tabs. Accounts are created by the café; there is no sign-up, so there is no account creation or deletion flow. The demo account is a real partner account and shows the café's real data: please keep it confidential. The app is in Turkish. We are requesting Unlisted App distribution because it is only for the café's owners.

## 6. İncelemeye gönder

"İncelemeye Ekle" → "İncelemeye Gönder". Şifreleme sorusu çıkmaz (`ITSAppUsesNonExemptEncryption: false`). İnceleme genelde 1–3 gün sürer.

## 7. Unlisted başvurusu

2\. adımda "Unlisted App" seçeneği yoksa: https://developer.apple.com/contact/request/unlisted-app/ formu doldurulur (uygulama adı, Apple ID `6829931111`, neden: "Internal app for the owners of one café, not for the public"). Apple onaylayınca uygulama sayfasında **Yayınla** (Release) düğmesine basılır ve App Store linki gelir: `https://apps.apple.com/tr/app/id6829931111`. Link ortaklara gönderilir. TestFlight'taki uygulama App Store sürümüyle güncellenir.

## Sonraki sürümler

Main'e birleşen her değişiklik yeni bir build'i TestFlight'a yükler. App Store'a çıkmak için App Store Connect'te yeni sürüm (ör. 1.0.1) açılır, build seçilir ve incelemeye gönderilir. Ekran görüntüleri ve metinler aynı kalır. Sürüm numarası `app.json` → `expo.version` içindedir.
