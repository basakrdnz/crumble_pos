# Crumble POS

Crumble Cafe için kasa (Windows, Electron) ve yönetim (mobil, Expo) uygulamaları.
Kapsam ve kararlar: [`CRUMBLE_POS_PLAN.md`](CRUMBLE_POS_PLAN.md). Özet ve çalışma kuralları: [`CLAUDE.md`](CLAUDE.md).

## Yapı

```
packages/shared        ortak tipler, para (kuruş) ve hesap fonksiyonları
apps/pos-desktop       kasa uygulaması (Electron + React + Vite, SQLite)
apps/manager-mobile    yönetim uygulaması (Expo, expo-router)
supabase/migrations    bulut şeması, değişmezlik trigger'ları, RLS (henüz hiçbir projeye uygulanmadı)
supabase/tests         migration'ların yerel Postgres testleri
```

## Windows'ta kurulum ve çalıştırma

PowerShell'de, repo kökünde:

1. **Node 22 LTS** kur: <https://nodejs.org> (LTS 22.x) veya `winget install OpenJS.NodeJS.LTS`.
   Kontrol: `node -v` → `v22.x`.
2. **pnpm**'i Node ile gelen corepack üzerinden aç (sürüm `package.json` içindeki `packageManager` alanından gelir):
   ```powershell
   corepack enable
   pnpm -v
   ```
3. Bağımlılıkları kur:
   ```powershell
   pnpm install
   ```
   Visual Studio / C++ derleme araçları **gerekmez**: `better-sqlite3` (v13) Windows x64 için hazır derlenmiş
   Node-API binary'si ile gelir ve Electron'da yeniden derleme (rebuild) olmadan çalışır.
   Electron binary'si ilk çalıştırmada otomatik indirilir.

### Kasa uygulaması (Electron)

```powershell
pnpm pos:dev     # geliştirme modu: pencere açılır, kod değişince yenilenir
pnpm pos:smoke   # Faz 0 kabul testi: build alır, uygulamayı gizli açar, sonucu yazar
```

`pnpm pos:smoke` başarılıysa çıktı şöyle biter:

```
{ mainShared: '1.234,50 ₺', rendererText: '1.234,50 ₺', sqlite: '3.x.x' }
SMOKE OK
```

- `mainShared`: Electron ana süreci `@crumble/shared` içinden `formatTL` çağırdı.
- `rendererText`: React ekranı `@crumble/shared` ile hesaplanan tutarı gösterdi.
- `sqlite`: `better-sqlite3` Electron içinde yüklendi.

Uçtan uca testler (uygulamayı açıp arayüzde tıklar):

```powershell
pnpm pos:e2e
```

Menü ilk kez yüklenirken: **Ayarlar → Menü içe aktar** → repo kökündeki `crumble_menu_seed.csv` dosyasını seç → önizlemeyi kontrol et → **Onayla ve içe aktar**.

### Kurulum dosyası (installer)

Windows'ta, repo kökünde:

```powershell
pnpm pos:dist
```

Çıktı: `apps\pos-desktop\release\Crumble-POS-Kurulum-1.0.0.exe`. Kurulumla masaüstü ve Başlat menüsü kısayolu oluşur. Uygulama tam ekran açılır, aynı anda tek pencere çalışır.

### Veri, yedek ve günlük

Hepsi `%APPDATA%\Crumble POS\` klasöründe durur. Kaldırma işlemi bu klasörü silmez.

- `crumble.sqlite`: kasanın veritabanı.
- `backups\crumble-YYYY-AA-GG.sqlite`: her gün otomatik alınan yedek, son 30 gün saklanır. **Ayarlar → Yedek ve günlük** ekranında "Şimdi yedekle" butonu var.
- `logs\crumble-YYYY-AA-GG.log`: hata günlüğü. Aynı ekrandan okunabilir.

Bir yedeğe dönmek için uygulamayı kapatın, yedek dosyasını `crumble.sqlite` adıyla bu klasöre kopyalayın.

Test ve geliştirme için `CRUMBLE_DATA_DIR` ortam değişkeni veri klasörünü değiştirir, `CRUMBLE_DB_PATH` sadece veritabanı yolunu değiştirir.

### Yönetim uygulaması (Expo)

Önce `apps/manager-mobile/.env.example` dosyasını `.env` olarak kopyalayın, içine Supabase adresini ve **anon** anahtarını yazın (bkz. `supabase/README.md`).

```powershell
pnpm mobile:web            # tarayıcıda açar (http://localhost:8081)
pnpm --filter @crumble/manager-mobile start   # Expo Go ile telefonda açmak için QR kod
```

Ortak hesabıyla giriş yapılır. Ekranlar: Bugün, Satışlar, Ürünler, Raporlar, Diğer (Vardiyalar, Değişiklik geçmişi, Ayarlar).
`pnpm mobile:smoke` aynı kontrolü otomatik yapar ama Playwright ister (`npm i -g playwright`, sonra `npx playwright install chromium`).

### Testler

```powershell
pnpm test        # birim testleri (Vitest, packages/shared)
pnpm typecheck   # tüm paketlerde TypeScript kontrolü
```

## Supabase migration testleri (opsiyonel)

`supabase/migrations` altındaki SQL dosyaları **henüz hiçbir Supabase projesine uygulanmadı**. Faz 5'ten önce birlikte uygulanacak.

Yerel, geçici bir Postgres kümesinde (Supabase'e bağlanmadan) şema, değişmezlik kuralları ve RLS testleri:

```bash
pnpm db:test   # Linux/macOS/WSL, Postgres 15+ binary'leri gerekir
```

`supabase/tests/supabase_stub.sql` sadece bu yerel test içindir (Supabase'in `auth` şemasını taklit eder), Supabase'e **uygulanmaz**.
