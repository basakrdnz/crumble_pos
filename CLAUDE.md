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
- **İndirim:** Yüzde indirim kuruşa **aşağı** yuvarlanır. Satır indirimi satır toplamından düşer. Sepet indirimi, satır indirimleri düşüldükten sonraki ara toplama uygulanır ve satırlara **dağıtılmaz**. Hesap toplamı = satır toplamları − sepet indirimi. Ürün raporları satır toplamlarını kullanır, sepet indirimi ayrı kalem olarak raporlanır.
- **İkram:** `is_comp = true` olan satırın tutarı 0 sayılır, ama ikram olarak ayrıca raporlanır.
- **Rapor günü:** Vardiyanın **açılış tarihi**. Ödeme ve iade toplamları, ödemenin/iadenin yapıldığı vardiyaya (`shift_id`) yazılır.
- **Beklenen nakit** = açılış kasası + nakit ödemeler − nakit iadeler. **Fark** = sayılan − beklenen.
- **void ve refund farkı:** `void` = hiç ödeme alınmamış hesabın iptalidir. `refund` = ödemesi alınmış satışın tamamının veya bir kısmının geri ödenmesidir. Kısmi ödemesi olan hesap void edilemez, önce iade yapılır.
- Satış tamamlama ve hesap kapatma anlarında bir `onSaleCompleted` olay noktası bırak (ileride yazıcı ve çekmece buraya bağlanacak).

## Veri modeli (özet, ayrıntı plan §8)

`categories`, `products` (+`description`, `needs_price_check`), `floor_plans`, `tables` (shape: circle/square/rectangle/rounded_rectangle), `shifts`, `tabs` (tek sipariş varlığı; ayrı `sales` tablosu yok; satış = `paid` tab; kind: quick/table/named), `tab_items` (`name_snapshot`, `unit_price` satış anını saklar), `payments`, `refunds`, `catalog_changes` (kullanıcı alanı yok), `partners`, `outbox` (sadece yerel). Hesap toplamı hesaplanır, kapanışta `tabs.total` olarak dondurulur.

## Menü içe aktarma (Faz 1)

Kaynak `crumble_menu_seed.csv` (Google Doc `Crumble_Menu_Kasim2026_v2`'den üretildi; 83 ürün, 8 kategori). Sütunlar: `kategori, urun, fiyat_tl, durum, not`.
- `fiyat_tl` × 100 → kuruş.
- Sıcak/buzlu ve boy seçenekleri ayrı ürün olarak, isim aynen aktarılır.
- `fiyat_belirlenecek` → pasif, fiyat 0.
- `teyit_edilecek` → aktif ve `needs_price_check = true` ("teyit edilecek" rozeti). Fiyat kaydedilince rozet kalkar.
- `not` → `products.description`.
- İçe aktarma önizleme gösterir ve onay alır.

## Fazlar

0. **İskelet** ✅ (bkz. aşağıdaki durum). Kabul: Electron headless + Expo web açılır, ikisi de `shared`'dan import eder.
1. **Katalog ve içe aktarma:** CRUD, toplu fiyat tablosu, CSV içe aktarma, `catalog_changes`. Kabul: menü yüklenir, fiyat değişince geçmiş satırı oluşur.
2. **Vardiya ve hızlı satış:** Vardiya aç/kapat, satış ekranı, serbest tutar (F2), indirim, ikram, nakit/kart/karma ödeme (F12), Esc iptal, F3 yeni hesap. Kabul: örnek gün simülasyonunda beklenen nakit, elle yapılan hesapla aynı çıkar.
3. **Hesap ve kroki:** İsimle/masa hesabı, taşıma, kısmi/toplu ödeme, kroki gösterimi ve editörü, çoklu bölüm. Başlangıçta boş kroki. Kabul: masa → hesap → ürün → kısmi ödeme → kapat.
4. **İptal/iade:** Satır ve satış iadesi, kapanış toplamlarına yansıması.
5. **Senkron:** Outbox, push, offline davranış, durum göstergesi. Önce Supabase projesine migration'lar **kullanıcıyla birlikte** uygulanır. Kabul: offline'da yapılan 20 satış, bağlantı gelince buluta **tam bir kez** düşer.
6. **Mobil:** Giriş, Bugün, Satışlar, Ürün raporu, Vardiyalar, Raporlar, Değişiklik Geçmişi. Kabul: kasadaki satış birkaç saniyede mobilde görünür.
7. **Cilalama:** Windows installer, günlük yerel `.sqlite` yedeği, kısayol listesi, hata günlüğü.

**MVP dışı:** Yazıcı/çekmece, barkod, stok/reçete, paket servis, ürün varyasyonu/ekstra (sıcak/buzlu sonraki sürümde gelecek; o zaman `tab_items.product_id` eski ürüne bağlı kalacak), ürün bazlı hesap bölme, kişi bazlı giriş/roller, mali entegrasyon, mobilde düzenleme.

## Çalışma kuralları

- Her seferinde **tek faz**. Faz sonunda çalışır halde bırak, kabul maddesini test et ve göster, sonra dur.
- Para ve vardiya nakit hesabı için birim testi (`packages/shared`). Senkron ve vardiya kapanışı için entegrasyon testi.
- Belirsizse dur ve sor, uydurma.

## Açık konular (kullanıcıya sorulacak)

1. Kroki arka plan görseli ve kafe ölçüleri (sonra verilecek, şimdilik boş kroki).
2. Bekleyen fiyatlar: Çıtır Kurabiye ve Vişneli Parmak Kurabiye (belirlenecek); Elmalı Kurabiye ve üç börek (teyit edilecek).
3. Açık hesap varken vardiya kapatılırsa **devir mi, zorunlu kapatma mı**? (Faz 2'de sor.)
4. Ortak sayısı ve e-postaları (`partners`).
5. Supabase projesi ve Expo/Apple/Google hesapları var mı?
6. Uygulama simgesi ve renk teması (yoksa sade nötr tema).
7. Kasa şifresi: boştayken otomatik kilit olsun mu, kaç dakika sonra? Unutulursa nasıl sıfırlanacak?
8. **(Faz 0'da eklendi)** Yüzde indirim tam sayı mı (0–100, şemada böyle), yoksa küsuratlı (ör. %12,5) olabilir mi? Faz 2'den önce teyit et.

## Uygulama notları (Faz 0'da alınan teknik kararlar)

- Repo kökü = planın kök klasörü. `packages/` ve `apps/` doğrudan kökte.
- `.npmrc`: `node-linker=hoisted` (Metro/React Native ve Electron paketleme için düz `node_modules`).
- `@crumble/shared` derlenmeden TS kaynağı olarak tüketilir (`exports: ./src/index.ts`). Electron main/preload'da bundle'a dahil edilir (`electron.vite.config.ts` → `externalizeDeps.exclude`). Metro bunu kendisi transpile eder.
- **better-sqlite3 rebuild:** Plan §3 bir rebuild adımı istiyordu, ama gerek kalmadı. v13 Node-API kullanıyor ve `win32-x64` dahil hazır binary ile geliyor. Node-API ABI-kararlı olduğu için Electron'da yeniden derleme gerekmez (`pos:smoke` bunu doğrular). `pnpm-workspace.yaml` → `ignoredBuiltDependencies: better-sqlite3`. İleride Node-API olmayan bir native modül eklenirse `@electron/rebuild` gerekir (header'lar `electronjs.org`'dan iner).
- Expo SDK 58, React 19.3, RN 0.88. Paket eklerken `npx expo install` kullan (bulut oturumunda `EXPO_OFFLINE=1` gerekebilir). Rotalar `apps/manager-mobile/app/` altında. Uygulama adı şimdilik "Crumble Yönetim", ikonlar Expo şablonundan.
- Supabase SQL (`supabase/migrations`), **hiçbir projeye uygulanmadı**:
  - `private` şeması: `is_device()` (JWT `app_metadata.role`), `is_partner()` (security definer) ve trigger fonksiyonları.
  - Birebir aynı içerikli (no-op) update her zaman serbest. Böylece senkronda yeniden gönderilen upsert idempotent kalır. Zaten var olan `tab_items` id'sinin yeniden insert'i de `ON CONFLICT` ile sorunsuz geçer. Faz 5'te insert-only tablolar için `ON CONFLICT DO NOTHING` kullan.
  - Şemada fazladan kısıtlar var: tek açık vardiya (partial unique index), `cash_difference = counted − expected`, `paid` ⇒ `closed_at`/`closed_shift_id`/`total` dolu, `void` ⇒ `closed_at`/`closed_shift_id` dolu, `is_custom_amount ⇔ product_id null`, iade kalemi aynı hesaba ait (composite FK), iptal edilmiş kalem bir daha değişmez.
  - `partners` silme yasağının dışında: ortağın erişimi kaldırılabilsin diye. Sadece admin yönetir, API yazma yetkisi yok.
  - `pnpm db:test` geçici yerel Postgres kümesinde stub + migration + `supabase/tests/db.test.sql` çalıştırır.
- Henüz yapılmayanlar: yerel SQLite şeması/migration'ları ve outbox (Faz 1/5), "void sadece net ödeme 0 iken" DB kuralı (Faz 4), Realtime yayını (Faz 6), `supabase/seed`.

## Komutlar

```
pnpm install | pnpm test | pnpm typecheck | pnpm db:test
pnpm pos:dev | pnpm pos:smoke | pnpm mobile:web | pnpm mobile:smoke
```

Bulut (Linux) oturumunda `pos:smoke` xvfb ile ve `--no-sandbox` ile çalışır. `mobile:smoke` Playwright ister.
