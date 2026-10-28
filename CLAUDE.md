# CLAUDE.md – Crumble POS

Bu dosya `CRUMBLE_POS_PLAN.md`'nin özetidir ve oturumlar arası hafızadır. **Tek doğru kaynak plan dosyasıdır.**
Çelişki görürsen plana uy. Planda olmayan bir ayrıntıda **varsayım yapma, dur ve kullanıcıya sor.**

## Bağlam

- Crumble Cafe (Ankara, Çankaya): tek şube, tek kasa PC. Narpos'un yerine geçecek.
- Yazarkasa/mali entegrasyon **yok**. Sistem sadece kayıt ve takip yapar. Kart ödemesi ayrı POS cihazından alınır, sistem "nakit/kart" diye kaydeder.
- Geliştirici: Başak. **İletişim Türkçe.** Kod, değişken ve tablo adları **İngilizce**. Arayüz metinleri **Türkçe**. Para birimi TL.

## Uygulamalar ve yetki

- **Kasa (PC, Windows):** Satış, hesap, vardiya, katalog, kroki. Girişte **tek sabit ortak şifre** sorulur, kullanıcı adı yok, rol yok. Şifre yerelde bcrypt/argon2 hash olarak saklanır ve ayarlardan eski şifre sorularak değiştirilir. "Kim açtı/kim değiştirdi" tutulmaz.
- **Yönetim (mobil):** Sadece ortaklar, e-posta + şifre (Supabase Auth). **Salt okunur.** "Son senkron: HH:MM" gösterir.
- **Bulut kimliği:** Kasa, Supabase'e tek bir cihaz kullanıcısıyla bağlanır (`app_metadata.role = 'device'`, ayrı `devices` tablosu yok). Bu, kasa şifresinden ayrıdır. Ortaklar `partners` tablosundan tanınır. **Service role anahtarı hiçbir istemciye konmaz.**

## Teknoloji (kesin)

- pnpm workspaces monorepo, TypeScript, **Node 22 LTS**, **Vitest**.
- Kasa: Electron + React + Vite (`electron-vite`), SQLite (`better-sqlite3`), sadece Windows, fare/klavye odaklı.
- Bulut: Supabase (Postgres, Auth, Realtime, RLS). Mobil: Expo + expo-router.
- Ortak kod: `packages/shared` (tipler, para, hesaplar, rapor mantığı).
- **Offline-önce:** Kasa önce SQLite'a yazar, sonra outbox ile buluta **tek yönlü** push eder. İnternet yokken hiçbir işlem engellenmez. Pull sadece yeni kurulum veya geri yüklemede yapılır. Fark çıkarsa **kasa doğrudur**.

## Kurallar (hata önleme)

- **Para:** Integer **kuruş**, asla float kullanma. Gösterim `1.234,50 ₺` (`formatTL`).
- **ID:** UUID, kasada üretilir. **Zaman:** DB'de UTC (`timestamptz`), ekranda Europe/Istanbul.
- **Silme yok:** Hiçbir kayıt fiziksel silinmez. Katalog (ürün/kategori/masa/bölüm) `deleted_at` ile soft delete edilir.
- **Değişmezlik (DB trigger ile zorunlu, hem SQLite hem Supabase):**
  - `payments`, `refunds` (ve geçmiş kaydı olan `catalog_changes`) sadece eklenir.
  - `tabs`: sadece `status, closed_at, closed_shift_id, total, table_id, customer_name`, indirim alanları değişir. Kapanınca (`paid`/`void`) donar.
  - `tab_items`: hesap açıkken sadece `quantity`, indirim, `is_comp`, `note`, `voided_at`, `void_reason` değişir. Hesap kapanınca donar.
  - `shifts`: sadece `closed_at, counted_cash, expected_cash, cash_difference, notes`. Kapanınca donar.
  - Kapanmış satıştaki hata **iade kaydıyla** düzeltilir.
- **Senkron:** Outbox sırayla gönderilir, UUID ile **idempotent**. Satış/ödeme/vardiya sadece eklenir. Katalogda **son yazan kazanır** (`updated_at`).
- **Satış ekranı (2026-10-27):** Serbest tutar satırı **yok**, her satır bir ürüne bağlı. Sepetteki satıra tıklanınca yan kolonda işlemler açılır: İptal, Fiyatı değiştir, Adet, İndirim, İkram, not. Yan kolonda telefon tuşları gibi bir sayı tuş takımı bulunur (fare ile tıklanır, klavyeden de yazılabilir; ekran dokunmatik değil). Fiyatı değiştir sadece o satırı etkiler, menü fiyatı değişmez. `list_price` saklanır, `unit_price <> list_price` olan satır raporda işaretli görünür ve fark raporlanır.
- **İndirim:** Sadece **tam sayı yüzde** (`discount_percent` 1–100). Hazır butonlar %10 ve %15, ayrıca elle yazılan yüzde. Yüzde indirim kuruşa **aşağı** yuvarlanır. Satır indirimi satır toplamından düşer. Sepet indirimi, satır indirimleri düşüldükten sonraki ara toplama uygulanır ve satırlara **dağıtılmaz**. Hesap toplamı = satır toplamları − sepet indirimi. Ürün raporları satır toplamlarını kullanır, sepet indirimi ayrı kalem olarak raporlanır.
- **İkram:** `is_comp = true` olan satırın tutarı 0 sayılır, ama ikram olarak ayrıca raporlanır.
- **Rapor günü:** Vardiyanın **açılış tarihi**. Ödeme ve iade toplamları, ödemenin/iadenin yapıldığı vardiyaya (`shift_id`) yazılır.
- **Beklenen nakit** = açılış kasası + nakit ödemeler − nakit iadeler. **Fark** = sayılan − beklenen.
- **void ve refund farkı:** `void` = hiç ödeme alınmamış hesabın iptalidir. `refund` = ödemesi alınmış satışın tamamının veya bir kısmının geri ödenmesidir. Kısmi ödemesi olan hesap void edilemez, önce iade yapılır.
- Satış tamamlama ve hesap kapatma anlarında bir `onSaleCompleted` olay noktası bırak (ileride yazıcı ve çekmece buraya bağlanacak).

## Veri modeli (özet, ayrıntı plan §8)

`categories`, `products` (+`description`, `needs_price_check`), `floor_plans`, `tables` (shape: circle/square/rectangle/rounded_rectangle), `shifts`, `tabs` (tek sipariş varlığı; ayrı `sales` tablosu yok; satış = `paid` tab; kind: quick/table/named), `tab_items` (`name_snapshot`, `unit_price` satış anını saklar), `payments`, `refunds`, `catalog_changes` (kullanıcı alanı yok), `partners`, `outbox` (sadece yerel). Hesap toplamı hesaplanır, kapanışta `tabs.total` olarak dondurulur.

## Menü içe aktarma (Faz 1)

Kaynak repo kökündeki `crumble_menu_seed.csv` (Google Doc `Crumble_Menu_Kasim2026_v2`'den üretildi; plan 83 der ama dosyada **84 ürün**, 8 kategori var, olduğu gibi aktarılır). Sütunlar: `kategori, urun, fiyat_tl, durum, not`.
- `fiyat_tl` × 100 → kuruş.
- Sıcak/buzlu ve boy seçenekleri ayrı ürün olarak, isim aynen aktarılır.
- `fiyat_belirlenecek` → pasif, fiyat 0.
- `teyit_edilecek` → aktif ve `needs_price_check = true` ("teyit edilecek" rozeti). Fiyat kaydedilince rozet kalkar.
- `not` → `products.description`.
- İçe aktarma önizleme gösterir ve onay alır.

## Fazlar

0. **İskelet** ✅ (bkz. aşağıdaki durum). Kabul: Electron headless + Expo web açılır, ikisi de `shared`'dan import eder.
1. **Katalog ve içe aktarma** ✅ CRUD, toplu fiyat tablosu, CSV içe aktarma, `catalog_changes`. Kabul `e2e/faz1-catalog.e2e.ts` ile gösterildi.
2. **Vardiya ve hızlı satış** ✅ (kabul: `test/sales.test.ts` örnek gün + `e2e/faz2-sale.e2e.ts`). Vardiya aç/kapat, satış ekranı, satır işlemleri paneli + sayı tuş takımı, fiyatı değiştir, indirim (%10/%15/elle), ikram, nakit/kart/karma ödeme (F12), Esc iptal, F3 yeni hesap. Kabul: örnek gün simülasyonunda beklenen nakit, elle yapılan hesapla aynı çıkar.
3. **Hesap ve kroki** ✅ (kabul: `test/tabs.test.ts` + `e2e/faz3-tabs.e2e.ts`). İsimle/masa hesabı, taşıma, kısmi/toplu ödeme, kroki gösterimi ve editörü, çoklu bölüm. Başlangıçta boş kroki. Kabul: masa → hesap → ürün → kısmi ödeme → kapat.
4. **İptal/iade** ✅ (kabul: `test/refunds.test.ts` + `e2e/faz4-refunds.e2e.ts`). Satır ve satış iadesi, kapanış toplamlarına yansıması.
5. **Senkron** ✅ (kabul: `test/sync.integration.test.ts` gerçek Postgres + `e2e/faz5-sync.e2e.ts`). Outbox, push, offline davranış, durum göstergesi. Supabase projesine migration'lar **kullanıcıyla birlikte** uygulanacak (`supabase/README.md`, henüz yapılmadı). Kabul: offline'da yapılan 20 satış, bağlantı gelince buluta **tam bir kez** düşer.
6. **Mobil** ✅ (kabul: `apps/pos-desktop/e2e/faz6-mobile.e2e.ts`). Giriş, Bugün, Satışlar, Ürün raporu, Vardiyalar, Raporlar, Değişiklik Geçmişi. Kabul: kasadaki satış birkaç saniyede mobilde görünür.
7. **Cilalama:** Windows installer, günlük yerel `.sqlite` yedeği, kısayol listesi, hata günlüğü.
8. **(Sonra) Ortak satış görünümü:** Crumble online siparişleri + kasa satışları (bkz. açık konu 9–10).

**MVP dışı:** Yazıcı/çekmece, barkod, stok/reçete, paket servis, ürün varyasyonu/ekstra (sıcak/buzlu sonraki sürümde gelecek; o zaman `tab_items.product_id` eski ürüne bağlı kalacak), ürün bazlı hesap bölme, kişi bazlı giriş/roller, mali entegrasyon, mobilde düzenleme.

## Çalışma kuralları

- Her seferinde **tek faz**. Faz sonunda çalışır halde bırak, kabul maddesini test et ve göster, sonra dur.
- Para ve vardiya nakit hesabı için birim testi (`packages/shared`). Senkron ve vardiya kapanışı için entegrasyon testi.
- Belirsizse dur ve sor, uydurma.

## Açık konular (kullanıcıya sorulacak)

1. Kroki arka plan görseli ve kafe ölçüleri (sonra verilecek, şimdilik boş kroki).
2. Bekleyen fiyatlar: Çıtır Kurabiye ve Vişneli Parmak Kurabiye (belirlenecek); Elmalı Kurabiye ve üç börek (teyit edilecek).
3. ~~Devir mi, zorunlu kapatma mı?~~ Plan §5.4'e göre kapanışta sorulur: açık hesaplar listelenir, "Hesaplara dön" veya "Sonraki vardiyaya devret". Devredilen hesabın ödemesi ödendiği vardiyaya yazılır.
4. ~~Ortak sayısı~~ Herkes aynı hesaba aynı şifreyle giriyor. E-posta kurulumda girilecek.
5. Supabase projesi ve Expo/Apple/Google hesapları var mı? (Supabase kurulumu: `supabase/README.md`)
6. Uygulama simgesi ve renk teması (yoksa sade nötr tema).
7. Kasa şifresi: boştayken otomatik kilit olsun mu, kaç dakika sonra? Unutulursa nasıl sıfırlanacak? (Şu an: sadece uygulama açılışında ve "Kilitle" butonuyla soruluyor. Sıfırlama yok.)
8. ~~Yüzde indirim küsuratlı olabilir mi?~~ Hayır: sadece tam sayı yüzde, hazır %10/%15 + elle.
9. ~~Mimari karar~~ **Karar (2026-10-28): İki sistem ayrı kalır.** Bu proje (kasa + Supabase + Expo yönetim) planlandığı gibi devam eder. Kullanıcının müşteri uygulaması `basakrdnz/crumble` (Flutter + Firebase, kendi yönetim bölümü var) da kendi yolunda devam eder. Yapıları değiştirilmez. İleride iki taraftaki satışları birlikte görmek için bir köprü kurulacak (plan Faz 8). Öneri: Crumble'daki tamamlanmış siparişler bir Cloud Function ile Supabase'deki `online_orders` tablosuna tek yönlü kopyalanır. Henüz kesin değil.
10. **Faz 8'de netleşecek:** Ortak görünüm hangi uygulamada olacak, ürünler iki menü arasında nasıl eşleşecek? Ayrıca online ödenmiş sipariş teslim edilirken kasada tekrar satış girilmemeli, yoksa ciro iki kez sayılır.

## Git akışı

- `main` korunur, doğrudan commit atılmaz. Her faz kendi dalında geliştirilir ve PR ile `main`'e birleştirilir. PR'ı kullanıcıya göster, birleştirme onayını bekle.
- Faz 0 dalı: `claude/exciting-lovelace-2jp3ev`.

## Uygulama notları (Faz 0'da alınan teknik kararlar)

- Repo kökü = planın kök klasörü. `packages/` ve `apps/` doğrudan kökte.
- `.npmrc`: `node-linker=hoisted` (Metro/React Native ve Electron paketleme için düz `node_modules`).
- `@crumble/shared` derlenmeden TS kaynağı olarak tüketilir (`exports: ./src/index.ts`). Electron main/preload'da bundle'a dahil edilir (`electron.vite.config.ts` → `externalizeDeps.exclude`). Metro bunu kendisi transpile eder.
- **better-sqlite3 rebuild:** Plan §3 bir rebuild adımı istiyordu, ama gerek kalmadı. v13 Node-API kullanıyor ve `win32-x64` dahil hazır binary ile geliyor. Node-API ABI-kararlı olduğu için Electron'da yeniden derleme gerekmez (`pos:smoke` bunu doğrular). `pnpm-workspace.yaml` → `ignoredBuiltDependencies: better-sqlite3`. İleride Node-API olmayan bir native modül eklenirse `@electron/rebuild` gerekir (header'lar `electronjs.org`'dan iner).
- Expo SDK 58, React 19.3, RN 0.88. Paket eklerken `npx expo install` kullan (bulut oturumunda `EXPO_OFFLINE=1` gerekebilir). Rotalar `apps/manager-mobile/app/` altında. Uygulama adı şimdilik "Crumble Yönetim", ikonlar Expo şablonundan.
- Supabase SQL (`supabase/migrations`), **hiçbir projeye uygulanmadı**:
  - `private` şeması: `is_device()` (JWT `app_metadata.role`), `is_partner()` (security definer) ve trigger fonksiyonları.
  - Birebir aynı içerikli (no-op) update her zaman serbest. Böylece senkronda yeniden gönderilen upsert idempotent kalır. Zaten var olan `tab_items` id'sinin yeniden insert'i de `ON CONFLICT` ile sorunsuz geçer. Faz 5'te insert-only tablolar için `ON CONFLICT DO NOTHING` kullan.
  - Şemada fazladan kısıtlar var: tek açık vardiya (partial unique index), `cash_difference = counted − expected`, `paid` ⇒ `closed_at`/`closed_shift_id`/`total` dolu, `void` ⇒ `closed_at`/`closed_shift_id` dolu, `tab_items.product_id` zorunlu, iade kalemi aynı hesaba ait (composite FK), iptal edilmiş kalem bir daha değişmez. Kullanıcı bunları onayladı.
  - `partners` de silinemez (kullanıcı: herkes tek ortak hesapla giriyor, kişi bazlı erişim kaldırmaya gerek yok). Sadece admin yönetir, API yazma yetkisi yok.
  - Migration'lar henüz hiçbir yere uygulanmadığı için Faz 0 içinde yerinde düzenlendi. **İlk uygulamadan sonra mevcut migration'ları asla düzenleme, yeni migration ekle.**
  - `pnpm db:test` geçici yerel Postgres kümesinde stub + migration + `supabase/tests/db.test.sql` çalıştırır.
- **Kasa kod yapısı (Faz 1):**
  - `src/db/schema.ts`: yerel SQLite şeması, Supabase ile aynı tablolar ve değişmezlik trigger'ları, ayrıca `outbox` ve `settings`. Migration'lar `PRAGMA user_version` ile sırayla uygulanır ve sadece eklenir.
  - `src/db/database.ts`: `insertRow`/`updateRow` her yazımda tam satırı outbox'a koyar. Bunlar her zaman `tx()` içinde çağrılır.
  - `src/db/*.ts`: iş kuralları (repository). Electron'dan bağımsızdır, Vitest ile bellek içi SQLite'ta test edilir (`test/`).
  - `src/api/contract.ts`: `PosApi` arayüzü. `server.ts` (ana süreç) ve `client.ts` (arayüz, Proxy) tek bir IPC kanalı üzerinden konuşur. Hatalar `{ok:false,error}` olarak döner.
  - `src/screens/`, `src/components/`: React arayüzü.
  - `e2e/`: Playwright (`playwright-core` `_electron`) ile gerçek uygulama testleri. `pnpm pos:e2e` build alıp çalıştırır. `CRUMBLE_SCREENSHOTS=<klasör>` verilirse ekran görüntüsü alınır.
  - `CRUMBLE_DB_PATH` veritabanı yolunu değiştirir (testler ve smoke testi geçici dosya kullanır). Varsayılan: Electron `userData/crumble.sqlite`.
  - Kendi kararım: içinde ürün olan kategori silinemez, önce ürünler taşınmalı veya silinmeli. Fiyatsız içe aktarılan pasif bir ürüne fiyat girilince otomatik aktif olur (plan §5.6). "Fiyat doğru" butonu fiyatı değiştirmeden rozeti kaldırır.
- **Satış (Faz 2):**
  - Hızlı satış, ilk ürün eklenince açılan `kind = quick` bir hesaptır. Uygulama çökerse yarım satış geri gelir. Sepetten çıkarılan satır iptal kaydı (`voided_at`) olarak kalır. "Satışı iptal et" (Esc) hesabı `void` yapar.
  - Hesap kuralları ve vardiya özeti `packages/shared/src/calc/` altında (`tabTotals`, `shiftSummary`), mobil raporlar da bunları kullanacak.
  - İptal toplamı = kapanan hesaplardaki iptal satırları + void hesapların tüm kalemleri. İkram ve iptal değeri satış fiyatından (`unit_price`) hesaplanır.
  - Kendi kararım: aynı ürüne tekrar tıklanınca sadece "düz" satırın (fiyatı, indirimi, ikramı ve notu değişmemiş) adedi artar, yoksa yeni satır açılır. Bir değişiklik hesabı alınmış ödemenin altına düşüremez. Tamamı ikram olan hesap ödeme alınmadan kapanır.
  - `onSaleCompleted` (`src/db/events.ts`), hesap `paid` olunca commit sonrası tetiklenir.
  - Kilit ana süreçte uygulanır: kilitliyken sadece `authStatus/setupPassword/unlock/lock` çalışır.
- **Hesap ve kroki (Faz 3):**
  - Kroki mantığı `src/db/floor.ts`, çizim `src/components/FloorCanvas.tsx` (görünüm ve düzenleyici). Mantıksal tuval 1200×800 birim (`src/floor/constants.ts`). Ekranda ölçeklenir, sürükleme bırakınca kaydedilir.
  - Kendi kararlarım:
    - Bir masada aynı anda tek açık hesap olur. Taşıma sadece boş masaya yapılır.
    - Masaya tıklanınca hesap hemen değil, ilk ürün eklenince açılır.
    - İsimle açılan hesap bir masaya taşınabilir (`kind` named kalır). İsmi silinemez.
    - Yeni şekil ilk boş yere konur. Etiket ilk boş numara olur, kanepe için "Kanepe N".
    - Açık hesabı olan masa veya bölüm silinemez.
  - Rehber görsel sadece bu bilgisayarda tutulur (`settings` tablosunda data URL). Senkronlanmaz, `floor_plans.background_image_url` boş kalır.
  - Masa, bölüm ve şekil değişiklikleri de `catalog_changes`'e yazılır (konum, boyut, renk dahil).
  - F3 her ekrandan "İsimle hesap aç" penceresini açar (açık vardiya varken).
- **İade (Faz 4):**
  - `src/db/refunds.ts`, ekran `src/screens/Sales.tsx` (Satışlar: vardiya seç, satış detayı, iade).
  - İade, ödendiği yöntemle sınırlıdır (kartla ödenen nakit iade edilemez). Açık vardiyaya yazılır.
  - Satır iadesinin önerilen tutarı, satır toplamından sepet indirimi payı düşülerek bulunur (`lineNetAfterCartDiscount`). Kasiyer tuş takımıyla değiştirebilir.
  - Kısmi ödemesi olan açık hesap iptal edilince `refundAndVoid` alınan parayı iade edip hesabı void yapar (tek işlemde).
  - "void sadece net ödeme 0 iken" kuralı DB'de de var: SQLite migration v2 ve `supabase/migrations/20261028000004_void_rule.sql`.
- **Senkron (Faz 5), `src/sync/`:**
  - `engine.ts` outbox'ı `seq` sırasıyla gönderir. Aynı tablodan art arda gelenler tek istekte gider, aynı satır birden çok kez varsa son hali gönderilir.
  - Ödeme, iade ve geçmiş kayıtları `insert-ignore` (ON CONFLICT DO NOTHING) ile, diğerleri upsert ile yazılır.
  - İlk hatada durur, sıra bozulmaz. Hata türü: çevrimdışı (tekrar denenir) ya da reddedildi (ekranda "Senkron hatası").
  - `service.ts`: yazımdan 1,5 sn sonra gönderir. Hata olursa 10 sn'den başlayıp 5 dakikaya kadar artan aralıklarla dener, yoksa 60 sn'de bir. Her başarılı gönderimden sonra `device_status` tablosuna heartbeat yazar. 14 günden eski gönderilmiş satırlar silinir.
  - `supabase.ts`: supabase-js ile cihaz girişi (`app_metadata.role = 'device'` kontrolü), upsert ve geri yükleme okuması.
  - `cloud.ts`: ayarlar, cihaz şifresi saklanmaz. Oturum `settings` tablosunda `safeStorage` (DPAPI) ile şifreli tutulur.
  - `restore.ts`: boş kasaya geri yükleme, outbox'a yazmaz. Hesaplar önce açık eklenir, sonra son hallerine getirilir (trigger'lar için).
  - Testler: `test/pgCluster.ts` geçici Postgres açar (stub + tüm migration'lar). `test/pgTransport.ts`, PostgREST gibi `json_populate_recordset` ve cihaz rolüyle yazar. `e2e/fakeSupabase.ts` uygulamayı gerçek HTTP üzerinden buna bağlar. Postgres yoksa bu testler atlanır.
  - Yeni migration: `20261028000005_device_status.sql` (telefondaki "son senkron" için).
- **Mobil yönetim (Faz 6), `apps/manager-mobile`:**
  - expo-router: `app/(tabs)` altında Bugün/Satışlar/Ürünler/Raporlar/Diğer. Ayrıca `sale/[id]`, `shifts`, `history`, `settings`.
  - Supabase ayarları `.env` dosyasında (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, bkz. `.env.example`).
  - Sadece `partners` tablosunda olan hesap girebilir. Kontrol bitmeden uygulama ekranı açılmaz.
  - Raporlar telefonda hesaplanır: `@crumble/shared/src/reports` (`periodTotals`, `revenueSeries`, `hourlyActivity`, `productReport`), kasadaki vardiya özetiyle aynı kurallar. Rapor günü = vardiyanın açılış günü (İstanbul, sabit UTC+3).
  - Veri büyürse sunucu tarafı toplama (SQL view/RPC) düşünülebilir. Şimdilik sayfalı (1000) okuma yapılıyor.
  - Canlılık: Supabase Realtime (`20261028000006_realtime.sql` yayını) + 15 sn yoklama yedeği (`EXPO_PUBLIC_POLL_MS`). Yerel testte Realtime yok, E2E yoklamayla (3 sn) ölçüyor.
  - "Son senkron" bilgisi `device_status`'tan okunur, 10 dakikadan eskiyse uyarı renginde gösterilir.
  - Bildirim tercihi sadece kaydedilir, push bildirimi yok (plan kapsamında gönderim tanımlı değil).
  - Not: RN'de `textTransform: 'uppercase'` Türkçe bilmez (i→I), kullanma.
  - E2E altyapısı: `e2e/fakeSupabase.ts`, Auth + PostgREST POST/GET alt kümesini gerçek Postgres'e cihaz/ortak rolüyle (RLS açık) çevirir. Gerçek PostgREST ikili dosyası indirilemedi (izin verilmedi), yerine bu kullanılıyor.
- Henüz yapılmayanlar: `supabase/seed`.

## Komutlar

```
pnpm install | pnpm test | pnpm typecheck | pnpm db:test
pnpm pos:dev | pnpm pos:smoke | pnpm pos:e2e | pnpm mobile:web | pnpm mobile:smoke
```

Bulut (Linux) oturumunda `pos:smoke` xvfb ile ve `--no-sandbox` ile çalışır. `mobile:smoke` Playwright ister.
