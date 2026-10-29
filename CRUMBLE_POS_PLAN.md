# Crumble POS – Proje Planı (Claude Code için)

Çalışma adı: **Crumble POS**. Arayüz dili: **Türkçe**. Para birimi: **TL**.

## 0. Bağlam (önce oku)

- **İşletme:** Crumble Cafe, Ankara (Çankaya). Küçük bir kafe, tek şube, tek kasa bilgisayarı.
- **Neden yapılıyor:** Kafede kullanılan **Narpos** yerine geçecek, daha hızlı ve sade, kendi sistemimiz. Narpos'ta yazarkasa entegrasyonu yoktu, yani sadece kayıt ve takip yapıyordu. Yeni sistem de aynı: yasal fiş bu sistemin işi değil.
- **Mevcut iş akışı:** Sabah vardiya açılır, gün içinde müşteri ürün söyler ve kasada ürünler seçilir (ya da toplam fiyat elle girilir), ödeme nakit veya kart (ayrı POS cihazından) alınır, gerekirse masa/isim üzerine hesap açılır ve müşteriler sonra toplu öder, akşam vardiya kapanır ve kasa sayılır.
- **Geliştirici (Başak):** Bilgisayar mühendisliği geçmişi var, SQL, REST API ve JSON/CSV ile rahat. Türkçe konuşuyor. İletişim **Türkçe**, kod, değişken ve tablo adları **İngilizce** olsun. Arayüz metinleri Türkçe.
- **Önemli:** Bu proje yeni başlıyor, önceki bir konuşma veya hafıza yok. Bu belge ve `crumble_menu_seed.csv` tek bilgi kaynağıdır.

Bu belge kararları ve kapsamı verir. Burada yazmayan bir ayrıntı için **varsayım yapma, dur ve sor**. Kod yazmadan önce "Açık Konular" bölümünü oku.

---

## 1. Amaç

Kafede kullanılan Narpos'un yerine geçecek, daha hızlı ve sade bir sistem:

1. **Kasa uygulaması (PC):** Kafede herkesin kullandığı satış, masa/hesap, vardiya ve ürün yönetimi programı.
2. **Yönetim uygulaması (mobil):** Sadece ortaklar için. Ciro, açılış-kapanış saatleri, satılan ürünler ve yapılan tüm değişikliklerin geçmişi.

Sistem **yazarkasaya veya mali cihaza bağlı değildir**. Yasal fiş bu sistemin konusu değil. Sadece kayıt ve takip yapılır. Ödeme POS cihazından ayrıca alınır, sistem sadece "nakit" veya "kart" olarak kaydeder.

## 2. Kullanıcılar ve yetki

| Kullanıcı | Uygulama | Giriş | Yapabildikleri |
|---|---|---|---|
| Kafe çalışanı / ortak | Kasa (PC) | **Tek sabit şifre** (ortak kasa girişi) | Satış, hesap, vardiya, ürün/kategori/fiyat düzenleme, kroki düzenleme |
| Ortak | Yönetim (mobil) | E-posta + şifre | Sadece görüntüleme. Çalışanlar buraya erişemez |

- Kasa uygulaması açılışta bir **giriş ekranı** gösterir: sadece şifre alanı. Tek, sabit, ortak bir şifre vardır. Amaç: PC hep kafede durduğu için çalışanlar dışında kimsenin sisteme girememesi.
- Kasada **kişi bazlı giriş yok**, kullanıcı adı yok, rol ayrımı yok. Şifreyi giren herkes her şeyi yapabilir.
- Şifre ilk kurulumda belirlenir, yerelde **hash'lenmiş** saklanır (düz metin değil, bcrypt/argon2). Ayarlarda mevcut şifre sorularak değiştirilebilir.
- Bu şifre, bulut bağlantısı için kullanılan cihaz kimliğinden (bkz. 7) **ayrıdır**.
- Vardiya açılışında "kim açtı" bilgisi **tutulmaz**, sadece saat tutulur.
- Kasadaki her ürün/fiyat/kategori değişikliği **tarih-saatle kaydedilir** (kim yaptığı kaydedilmez, çünkü ortak giriş). Ortaklar bunu mobilde "Değişiklik Geçmişi" olarak görür.

## 3. Teknoloji kararları (kesin)

- Tek monorepo, **TypeScript** her yerde.
- **Kasa:** Electron + React + Vite. Sadece **Windows**. Fare ve klavye odaklı (dokunmatik şart değil). Yerel veritabanı: **SQLite** (better-sqlite3).
- **Bulut:** **Supabase** (Postgres, Auth, Realtime, Row Level Security).
- **Mobil:** **React Native + Expo**, iPhone ve Android tek kod.
- Ortak kod (tipler, para hesapları, rapor mantığı): `packages/shared`.
- Kasa **offline-önce** çalışır. Önce yerel SQLite'a yazar, sonra buluta senkronize eder. İnternet yokken hiçbir işlem engellenmez.
- **Araçlar:** Node 22 LTS, **pnpm workspaces**, **Vitest** (birim ve entegrasyon testleri). Electron'da `better-sqlite3` native modül olduğu için Electron sürümüne göre yeniden derleme (rebuild) adımını kur ve belgele.

## 4. Genel kurallar (hata önleme)

- **Para:** Tüm tutarlar **kuruş cinsinden tam sayı** saklanır (`integer`). Ondalık sayı kullanma. Gösterirken TL formatla (`1.234,50 ₺`).
- **ID:** Tüm kayıtlar **UUID**, kasada üretilir (sunucuya bağımlı değil).
- **Zaman:** Veritabanında **UTC** (`timestamptz`), ekranda **Europe/Istanbul**.
- **Silme yok, değişmezlik kuralı (kesin):**
  - **Hiçbir kayıt fiziksel olarak silinmez.** Ürün/kategori/masa/bölüm `deleted_at` ile soft delete edilir.
  - `payments` ve `refunds` **tamamen değişmez** (sadece eklenir, güncellenmez).
  - Diğer tablolarda **sadece yaşam döngüsü alanları** güncellenebilir:
    - `tabs`: `status`, `closed_at`, `closed_shift_id`, `total`, `table_id`, `customer_name` (masa taşıma/isim ekleme) ve `discount_percent`. Kapalı (`paid`/`void`) bir hesapta bu alanlar bir daha değişmez.
    - `tab_items`: hesap **açıkken** adet, satış fiyatı (`unit_price`), indirim, ikram ve not güncellenebilir, `voided_at` / `void_reason` dolar. `list_price` (menü fiyatı) ve `name_snapshot` değişmez. Hesap kapandıktan sonra hiçbir alanı değişmez.
    - `shifts`: `closed_at`, `counted_cash`, `expected_cash`, `cash_difference`, `notes`. Kapanmış vardiya bir daha değişmez.
  - Kapanmış bir satışta hata varsa düzeltme **iade kaydı** ile yapılır, kayıt değiştirilmez.
  - Bu kural hem yerel SQLite'ta (trigger) hem Supabase'te (RLS + trigger) uygulanır. Yasak güncellemeyi veritabanı reddeder.
- **Senkron:** İşlemler yerelde bir `outbox` tablosuna yazılır, sırayla buluta gönderilir. Her kayıt UUID ile geldiği için **idempotent** (aynı kayıt iki kez gelirse çift yazılmaz).
- **Çakışma:** Satış/ödeme/vardiya sadece eklenir, çakışma olmaz. Katalog (ürün, fiyat, kategori, kroki) için **son yazan kazanır** (`updated_at`).
- Her tabloda: `id`, `created_at`, `updated_at`, `deleted_at` (uygun olanlarda).
- **Yuvarlama:** İndirim sadece yüzde olarak verilir (tam sayı). Yüzde indirim hesabı kuruşa **aşağı** yuvarlanır (müşteri lehine değil, tutarlılık için tek kural). **İndirim kuralı:** Satır indirimi o satırın toplamından düşer. Sepet (hesap) indirimi, satır indirimleri düşüldükten sonraki ara toplam üzerinden hesaplanır ve satırlara **dağıtılmaz**. Hesap toplamı = (satır toplamlarının toplamı) − sepet indirimi. Ürün bazlı raporlar satır toplamlarını kullanır, sepet indirimi ayrı bir kalem olarak raporlanır.
- **Rapor günü:** Raporlama **vardiyanın açılış tarihine** göre yapılır (gece yarısını geçen vardiya tek güne yazılır). "Bugün" = bugünün tarihinde açılan vardiya(lar). Ödeme/ciro toplamları ise ödeme anının vardiyasına göredir (bkz. 8).
- **Senkron yönü:** Tek kasa var. Veri **kasadan buluta tek yönlü** gönderilir (push). Buluttan kasaya çekme (pull) sadece yeni kurulumda veya geri yüklemede kullanılır.
- **Tutarlılık:** Bulut ile kasa arasında fark olursa **kasa doğru kabul edilir**.

## 5. Kasa uygulaması (PC) – özellikler

### 5.1 Satış ekranı (ana ekran)
- Üstte kategori sekmeleri, ortada ürün butonları (grid), yanda sepet.
- Ürüne tıkla = sepete ekle. Tekrar tıkla = adet artar.
- **Serbest tutar satırı yok** (2026-10-27 kararı). Sepetteki her satır bir ürüne bağlıdır.
- **Satır işlemleri paneli:** Sepetteki bir satıra tıklanınca yan kolonda o satırın işlemleri açılır: **Adet**, **Fiyatı değiştir**, not ve **Satırı çıkar** (iptal kaydı tutulur). Satır indirimi ve ikram yok (2026-10-29).
- **Sayı tuş takımı:** Yan kolonda telefon tuşları gibi küçük bir sayı tuş takımı (0–9, sil, onay) bulunur. Adet, fiyat, sepet indirimi yüzdesi ve kısmi ödeme tutarı bununla girilir. Ekran dokunmatik değildir: tuşlara fareyle tıklanır, klavyeden rakam yazmak da çalışır.
- **Fiyatı değiştir:** Sadece o satışın o satırının fiyatı değişir, menü fiyatı değişmez. Satırda menü fiyatı (`list_price`) da saklanır. Fiyatı değiştirilmiş satırlar raporda işaretli görünür ve aradaki fark raporlanır.
- **İndirim:** Sadece **yüzde** ve sadece **sepete** (2026-10-29). Hazır butonlar **%10** ve **%15**, ayrıca tuş takımıyla elle yazılan tam sayı yüzde (1–100).
- **İkram yok** (2026-10-29, kullanıcı: kullanmıyoruz). Veri modelindeki `is_comp` alanı eski kayıtlar ve raporlar için kalır, kasa artık yazmaz.
- **Ödeme (2026-10-29):** Ayrı ödeme penceresi yok. Sepetin altında doğrudan **Nakit ödendi** (`F11`) ve **Kartla ödendi** (`F12`) butonları bulunur, basınca kalan tutar o yöntemle alınır ve satış kapanır. Karma ödeme, "alınan" ve "para üstü" yok. Hesapta kısmi ödeme için önce tutar yazılır, sonra yöntem seçilir.
- Klavye kısayolları: nakit (`F11`), kart (`F12`), iptal (`Esc`), yeni hesap (`F3`), ürün ara (`F2`). Kısayol listesi ayarlarda görünür.

### 5.2 Masa ve hesap (adisyon)
- **Hesap (tab):** Açık bir sipariş hesabı. `table_id` (opsiyonel) ve `customer_name` (opsiyonel) alanları var. **En az biri dolu olmalı.**
- İki yoldan açılır:
  1. **Kroki ekranından** bir masaya tıkla.
  2. **"İsimle hesap aç"** butonu, isim soyisim yaz.
- Açık hesaba ürün eklenir, sonradan eklemeye devam edilir.
- Hesap işlemleri: ürün ekle/çıkar, masa değiştir (taşı), hesabı isimle ilişkilendir, **tutar bazlı kısmi ödeme**, **toplu ödeme ile kapatma**.
- Hesaptan çıkarılan ürün **iptal kaydı** olarak tutulur (neden: opsiyonel not).
- Ürün bazlı hesap bölme **MVP dışı**.

### 5.3 Kroki (masa haritası)
- Ekranda kafenin planı vardır. Şekiller: **daire, kare, dikdörtgen, yuvarlatılmış dikdörtgen (kanepe/koltuk)**.
- Her şeklin: etiket (örn. "5", "Kanepe 1"), renk, konum (x, y), boyut (genişlik, yükseklik), dönüş açısı.
- **Durum rengi:** Boş masa nötr/kendi rengi, dolu masa vurgulu renk ve üzerinde açık hesap toplamı.
- Birden fazla **bölüm** tanımlanabilir (örn. "İç mekan", "Dış mekan"), her bölüm için sekme.
- **Kroki düzenleme modu** (Ayarlar içinde): şekil ekle, sürükle, boyutlandır, döndür, renk/etiket ver, sil. Kroki arka planına **opsiyonel rehber görsel** yüklenebilir (yarı saydam, sadece yerleştirmeye yardımcı, hesaplamaya karışmaz).
- Kroki görseli sonradan proje girdisi olarak verilecek. **Şekiller görselden otomatik çıkarılmaz**, kullanıcı editörden elle yerleştirir. Başlangıçta boş bir kroki ile başla.

### 5.4 Vardiya (açılış / gün sonu)
- **Güncelleme (2026-10-29):** Kasa sayımı yapılmıyor. Açılış kasası sorulmaz (0 kaydedilir), kapanışta sayılan nakit sorulmaz, fark hesaplanmaz. Beklenen nakit (nakit ödemeler − nakit iadeler) bilgi olarak saklanır. Gün sonunda **her açık hesap için karar** verilir: nakit al, kart al, sonraki vardiyaya **devret** veya iptal et. Hepsine karar verilmeden gün sonu alınamaz. En çok satanlar gibi ürün raporları kasada değil yönetim uygulamasında.
- ~~**Vardiya aç:** Açılış kasası (nakit) tutarı girilir.~~ Açılış saati otomatik kaydedilir.
- Aynı anda **tek açık vardiya** olabilir. Açık vardiya yokken satış yapılamaz (ekran "Vardiyayı aç" der).
- **Gün sonu (vardiya kapat):** Sistem özet gösterir: ciro, nakit, kart, indirim, iade, iptal toplamları. Beklenen nakit = nakit ödemeler − nakit iadeler (açılış kasası 0) bilgi olarak kaydedilir; sayım ve fark yok.
- Açık hesaplar gün sonu ekranında listelenir, her biri için nakit / kart / devret / iptal seçilir. Devredilen hesap açık kalır, ödemesi ödendiği vardiyaya yazılır.
- Kapanışta **gün sonu özeti** ekranı ve yazdırılabilir görünüm (yazıcı entegrasyonu sonra).

### 5.5 İptal / iade
- Tamamlanmış satışın tamamı veya bir satırı iptal/iade edilebilir. Orijinal kayıt değişmez, bağlı bir **iade kaydı** eklenir. Neden notu opsiyonel.
- İade, ödeme yöntemine göre nakit veya kart olarak vardiya hesabına yansır.
- **`tabs.status = void` ile `refunds` farkı:** `void` = **hiç ödeme alınmamış** hesabın iptali (yanlış açılan, müşterinin vazgeçtiği hesap). `refund` = **ödemesi alınmış** satışın tamamının veya bir kısmının geri ödenmesi. Kısmi ödemesi alınmış bir hesap `void` edilemez, önce alınan ödemeler iade edilmelidir.

### 5.6 Ayarlar (katalog yönetimi)
- **Kategori:** ekle, ad değiştir, sırala, sil (soft).
- **Ürün:** ekle, ad, kategori, fiyat, aktif/pasif, sırala, sil (soft). Varyasyon/ekstra seçeneği **MVP dışı**.
- **Toplu fiyat görünümü:** Tüm ürünleri tablo halinde göster, hücreden fiyatı düzenle.
- Bu ekranlardaki **her değişiklik** `catalog_changes` tablosuna yazılır (bkz. veri modeli).
- **İlk veri içe aktarma:** Proje ekindeki `crumble_menu_seed.csv` dosyasından (Kasım 2026 menüsü, 83 ürün, 8 kategori). Sütunlar: `kategori, urun, fiyat_tl, durum, not`. İçe aktarma, önizleme gösterip onay alarak çalışan bir ekran olsun.
  - `fiyat_tl` TL cinsindendir, içe aktarırken **kuruşa çevir** (×100).
  - Varyasyon özelliği MVP dışı olduğu için sıcak/buzlu ve küçük/büyük seçenekleri CSV'de **ayrı ürün** olarak yazıldı, adın sonunda parantez içinde (örn. "Balkabağı Latte (Buzlu)"). Aynen aktar.
  - `durum = fiyat_belirlenecek` olan ürünler **pasif** (`is_active = false`) ve fiyat 0 olarak aktarılır. Ayarlardan fiyat girilince aktif edilir.
  - `durum = teyit_edilecek` olan ürünler aktif aktarılır. `needs_price_check` alanı veride kalır ama kasa arayüzünde "teyit edilecek" rozeti ve filtresi **gösterilmez** (2026-10-29, kullanıcı fiyatları kendisi düzenler).
  - `not` sütunu ürün açıklaması olarak saklanır (`products.description`, opsiyonel metin). Veri modeline bu alan eklenecek.
  - Varsa Kap! (Vitrin) kategorisi kasada normal kategori olarak görünür.
- **Kroki düzenleme** (bkz. 5.3).
- **Bulut bağlantısı kurulumu** (ilk açılışta cihaz kaydı, bkz. 7).

## 6. Yönetim uygulaması (mobil) – ekranlar

Giriş: e-posta + şifre (Supabase Auth). Sadece ortak hesaplar.

1. **Bugün:** Canlı. Bugünkü ciro, nakit/kart dağılımı, satış adedi, bugünkü vardiyanın açılış saati ve (kapandıysa) kapanış saati, açık hesap sayısı.
2. **Satışlar:** Gün seçilir. Satış listesi, detay (ürünler, ödeme, iptal/iade).
3. **Ürün raporu:** Seçilen tarih aralığında hangi üründen kaç adet, ne kadar ciro. Kategori kırılımı.
4. **Vardiyalar:** Geçmiş vardiya listesi: açılış/kapanış saati, açılış kasası, sayılan, fark, toplamlar.
5. **Raporlar:** Günlük/haftalık/aylık ciro grafiği, saatlik yoğunluk, indirim/ikram/iptal toplamları.
6. **Değişiklik Geçmişi:** Kasa ayarlarında yapılan her ürün/kategori/fiyat değişikliği: ne değişti (eski → yeni), ne zaman.
7. **Ayarlar:** Çıkış, bildirim tercihi.

Mobil **salt okunurdur**, veri düzenlenmez. Veriler senkronize olduktan sonra görünür. Ekranda "son senkron: HH:MM" bilgisi gösterilir.

## 7. Bulut ve güvenlik

- **Kasa cihaz kimliği:** Kasa PC'nin bulutla konuşması için tek bir **cihaz kullanıcısı** (Supabase Auth'ta ayrı kullanıcı, rol `device`) kullanılır. Kurulumda bir ortak bu bilgiyi girer. Çalışanlar bu bilgiyi görmez. Kasadaki giriş ekranı sadece sabit şifreyi sorar (bkz. 2).
- **Row Level Security zorunlu:**
  - `device` rolü: satış, ödeme, vardiya, katalog tablolarına **ekleme/güncelleme**, okuma kendi verisi. Silme yok.
  - `partner` rolü: **sadece okuma** (tüm tablolar).
  - `partners` tablosu ortakları listeler. Ortak rolü buradan belirlenir. Çalışanlar bu tabloda yoktur.
  - **Cihaz rolü:** Cihaz kullanıcısı Supabase Auth'ta `app_metadata.role = 'device'` ile işaretlenir (kullanıcı kendi `app_metadata`'sını değiştiremez, sadece yönetici/service role ayarlar). RLS bu JWT alanını kontrol eder. Ayrı bir `devices` tablosu **yok**.
  - `device` rolünün güncelleme yetkisi, Bölüm 4'teki değişmezlik kuralıyla sınırlıdır.
- **Service role anahtarı hiçbir istemciye konmaz.**
- Yedekleme: Supabase otomatik yedeği yeterli. Ek olarak kasa yerelinde günlük `.sqlite` yedeği alınır.

## 8. Veri modeli (özet)

Tüm tablolarda ortak alanlar: `id uuid`, `created_at`, `updated_at`. Tutarlar `integer` (kuruş).

- `categories` (name, sort_order, deleted_at)
- `products` (category_id, name, description?, price, is_active, needs_price_check, sort_order, deleted_at)
- `floor_plans` (name, sort_order, background_image_url?, deleted_at)
- `tables` (floor_plan_id, label, shape, x, y, width, height, rotation, color, deleted_at)
- `shifts` (opened_at, closed_at?, opening_cash, counted_cash?, expected_cash?, cash_difference?, notes?)
- `tabs` – **tek sipariş/hesap varlığı**. Hızlı satış da bir tab'dır (açılıp hemen kapanır). Ayrı bir `sales` tablosu **yoktur**; "satış" = kapanmış (`paid`) tab.
  Alanlar: `opened_shift_id`, `closed_shift_id?`, `kind` (quick/table/named), `table_id?`, `customer_name?`, `status` (open/paid/void), `discount_percent?` (tam sayı 1–100, sepet indirimi), `total?` (sadece kapanışta dondurulur), `opened_at`, `closed_at?`.
  Kısıt: `kind = table` ise `table_id` zorunlu, `named` ise `customer_name` zorunlu, `quick` ise ikisi de boş olabilir. Masaya bağlı hesapta isim de yazılabilir.
- `tab_items` (tab_id, product_id, name_snapshot, list_price, unit_price, quantity, discount_percent?, is_comp, note?, voided_at?, void_reason?) – `list_price` = ürün eklendiği andaki menü fiyatı, `unit_price` = satış fiyatı (fiyatı değiştir ile farklı olabilir; `unit_price <> list_price` ise "fiyatı değiştirildi"). Ürün çıkarılırsa satır silinmez, `voided_at` dolar.
- `payments` (tab_id, **shift_id**, method: cash/card, amount, paid_at) – **ödemenin yapıldığı vardiyaya** yazılır. Karma ödemede iki satır. Kısmi ödemede tab açıkken de payment eklenebilir.
- `refunds` (tab_id, tab_item_id?, **shift_id**, amount, method, reason?, created_at) – iade, **iadenin yapıldığı vardiyaya** yazılır.

**Hesaplama kuralı:** Vardiya nakit/kart toplamları `payments` ve `refunds` tablolarındaki `shift_id`'den hesaplanır. Bir hesap bir vardiyada açılıp sonraki vardiyada ödenebilir, ödeme ödendiği vardiyaya sayılır. Hesap toplamı, `tab_items` (iptal edilmemiş) ve indirimlerden **sistem tarafından hesaplanır**, tabloda ayrıca saklanmaz (kapanışta `total` değeri `tabs.total` olarak dondurulur).
- `catalog_changes` (entity_type: product/category/table/floor_plan, entity_id, action: create/update/delete, field?, old_value?, new_value?, changed_at) – kullanıcı alanı yok
- `partners` (user_id, email)
- `outbox` (**sadece yerel SQLite**): senkron kuyruğu

`name_snapshot`, `list_price` ve `unit_price` satış anındaki değeri saklar. Sonradan menü fiyatı değişse eski satış değişmez.

## 9. Proje ağacı

```
(repo kökü = basakrdnz/crumble_pos; packages/ ve apps/ doğrudan kökte, ekstra bir crumble-pos klasörü yok)
├─ package.json                 (workspaces)
├─ README.md
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ types/             (tablo tipleri, enum'lar)
│        ├─ money.ts           (kuruş<->TL, formatlama)
│        ├─ calc/              (sepet, indirim, vardiya beklenen nakit)
│        └─ reports/           (ürün, saatlik, günlük toplam sorguları)
├─ apps/
│  ├─ pos-desktop/             (Electron + React)
│  │  ├─ electron/             (main, preload, SQLite erişimi)
│  │  └─ src/
│  │     ├─ screens/           (Sale, Tabs, FloorPlan, Shift, Settings, Import)
│  │     ├─ components/
│  │     ├─ db/                (şema, migration, repository)
│  │     └─ sync/              (outbox, push, pull, durum göstergesi)
│  └─ manager-mobile/          (Expo)
│     └─ app/                  (Bugün, Satışlar, Ürünler, Vardiyalar, Raporlar, Geçmiş, Ayarlar)
└─ supabase/
   ├─ migrations/              (şema + RLS)
   └─ seed/
```

## 10. Fazlar

1. **Faz 0 – İskelet:** Monorepo, shared paketi, `supabase/migrations` altına şema + RLS **SQL dosyaları yazılır ama hiçbir Supabase projesine uygulanmaz** (uygulama, Faz 5'ten önce kullanıcı projeyi açınca birlikte yapılır). Boş Electron ve Expo uygulamaları açılıyor. *Kabul:* Linux ortamında Electron headless, Expo web modunda açılır ve ikisi de `shared` paketinden bir fonksiyon import edebilir. Windows'ta çalıştırma testini kullanıcı kendisi yapar, bunun için Windows'ta çalıştırma komutlarını README'ye yaz.
2. **Faz 1 – Katalog ve içe aktarma:** Kategori/ürün CRUD, toplu fiyat tablosu, `crumble_menu_seed.csv` dosyasından içe aktarma, `catalog_changes` kaydı. *Kabul:* menü yüklenir, fiyat değişince geçmiş satırı oluşur.
3. **Faz 2 – Vardiya ve hızlı satış:** Vardiya aç/kapat, satış ekranı, satır işlemleri paneli ve sayı tuş takımı, fiyatı değiştir, indirim (%10/%15/elle), ikram, nakit/kart/karma ödeme. *Kabul:* örnek bir gün simüle edilir, kapanıştaki beklenen nakit elle hesapla aynıdır.
4. **Faz 3 – Hesap ve kroki:** İsimle hesap, masa hesabı, taşıma, kısmi/toplu ödeme, kroki gösterimi ve düzenleme editörü, çoklu bölüm. *Kabul:* masaya tıkla hesap aç, ürün ekle, kısmi ödeme al, kapat.
5. **Faz 4 – İptal/iade:** Satır ve satış iptali/iadesi, kapanış toplamlarına yansıma.
6. **Faz 5 – Senkron:** Outbox, buluta gönderme, internet kesilince/gelince davranış, durum göstergesi. *Kabul:* internet kapalıyken 20 satış yapılıp açılınca hepsi **bir kez** buluta düşer.
7. **Faz 6 – Mobil uygulama:** Giriş, Bugün, Satışlar, Ürün raporu, Vardiyalar, Raporlar, Değişiklik Geçmişi. *Kabul:* kasadaki satış birkaç saniye içinde mobilde görünür.
8. **Faz 7 – Cilalama ve paketleme:** Windows kurulum dosyası (installer), yerel yedek, kısayol listesi, hata günlüğü.
9. **Tasarım yenileme (2026-10-29):** Tasarım planı (Design artifact "Crumble POS Tasarım Planı"): G2 Orman paleti (koyu orman yeşili sol ray `#1E3A2B`, nötr zemin `#F3F4F1`, ana yeşil `#2E6B47`, kahve ve sarı yok), solda 88 px menü rayı, satış ekranı "ürünler · satır işlemleri paneli · sepet" (S2), ödeme butonları alt alta (P2), giriş ekranı "Günaydın." düzeni. Aynı turda ikram, satır indirimi, karma, para üstü, kasa sayımı, açılış kasası ve "teyit edilecek" arayüzden kaldırılır.
10. **Faz 8 (sonra) – Ortak satış görünümü:** Crumble müşteri uygulamasındaki (`basakrdnz/crumble`, Firebase) online siparişler ile kasa satışlarının birlikte görülmesi. **Öneri, henüz kesin değil:** Crumble'daki ödemesi tamamlanmış siparişler, bir Firebase Cloud Function ile tek yönlü olarak Supabase'deki ayrı bir `online_orders` tablosuna kopyalanır. Kasa tabloları buna karışmaz. Mobil yönetim uygulaması iki kaynağı yan yana gösterir. Ayrıntılar (alanlar, ürün eşleştirme, nerede gösterileceği) bu faza gelince kullanıcıyla netleşecek.

## 11. MVP dışı (şimdi yapma)

**Stok düzenleme ve sayımı** (ileride eklenecek, planı ayrıca çıkarılacak), fiş/adisyon yazıcısı ve para çekmecesi (ileride eklenecek, bu yüzden satış tamamlama ve hesap kapatma anlarında bir `onSaleCompleted` olay noktası bırak), barkod, stok ve reçete, paket servis entegrasyonları, ürün varyasyonu/ekstra, ürün bazlı hesap bölme, kişi bazlı personel girişi ve rol/yetki ayrımı (kasada sadece tek sabit şifre var), yasal/mali entegrasyon, mobilde düzenleme.

### Sonraki sürüm notu: Sıcak / Buzlu seçeneği

Planlanıyor ama acelesi yok (kış sezonu başında, MVP sonrası). Fikir: bir ürün için "Sıcak" / "Buzlu" gibi seçenekler ve her seçeneğe **fiyat farkı** (örn. +15 ₺). MVP'de bu ürünler CSV'de ayrı ürün olarak duruyor. Varyasyon eklendiğinde bunlar tek ürüne birleştirilecek. Bu yüzden:
- MVP'de varyasyon için ekran veya tablo **yapma**.
- Satış kalemlerinde `name_snapshot` ve `unit_price` zaten satış anındaki değeri saklıyor, eski satışlar bozulmaz.
- Geçmiş satış raporları birleştirme sonrası da çalışmalı, bu yüzden `tab_items.product_id` eski ürüne bağlı kalır (silme yok, soft delete).

## 12. Açık konular (kod yazmadan önce kullanıcıya sor)

1. Kroki arka plan görseli ve kafenin ölçüleri (sonradan verilecek, şimdilik boş kroki).
2. ~~QR menü ürün listesi~~ Tamam: `crumble_menu_seed.csv` ekte. Bekleyen fiyatlar: Çıtır Kurabiye ve Vişneli Parmak Kurabiye (belirlenecek); Elmalı Kurabiye ve üç börek (teyit edilecek).
3. Açık hesap varken vardiya kapatılırsa **devir mi, zorunlu kapatma mı** (Faz 2'de sor).
4. ~~Ortak sayısı ve e-postaları~~ Kullanıcı (2026-10-27): herkes aynı hesaba aynı şifreyle giriyor, kişi bazlı ortak hesabı gerekmiyor. Kullanılacak e-posta kurulumda girilecek.
5. Supabase projesi ve Expo/Apple/Google hesapları kullanıcıda var mı.
6. Uygulama simgesi. Renk teması kararlaştı (G2 Orman, bkz. Faz listesi "Tasarım yenileme").
7. Kasa şifresi: ~~otomatik kilit~~ olmayacak (2026-10-28). Şifre unutulursa nasıl sıfırlanacak? (açık)

## 13. Çalışma kuralları (Claude Code için)

**İlk adım:** Bu belgeyi baştan sona oku. Sonra repo köküne bu belgenin özetini içeren bir `CLAUDE.md` yaz (kararlar, kurallar, fazlar, açık konular), çünkü sonraki oturumlarda hafıza olmayacak. Sonra **sadece Faz 0'a** başla ve bitince dur, kabul maddesini göster.

- Her faz sonunda çalışır halde bırak, sonraki faza geçmeden kabul maddesini test et.
- Para hesabı ve vardiya nakit hesabı için **birim testi** yaz (`packages/shared`).
- Senkron ve vardiya kapanışı için **entegrasyon testi** yaz.
- Belirsiz bir durumda dur ve sor, uydurma.
- **Git akışı:** `main` korunur. Her faz ayrı bir dalda geliştirilir ve PR ile `main`'e birleştirilir. PR kullanıcıya gösterilir.
