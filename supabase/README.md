# Supabase kurulumu

Bu klasördeki SQL dosyaları **henüz hiçbir Supabase projesine uygulanmadı**. Aşağıdaki adımlar bir kez, bir ortak tarafından yapılır.

## 1. Proje

1. <https://supabase.com> → **New project**. Bölge olarak Avrupa'yı seçin (ör. `eu-central-1`, Frankfurt).
2. **Authentication → Sign In / Providers → Email**: "Allow new users to sign up" seçeneğini **kapatın**. Kullanıcıları sadece siz eklersiniz.

## 2. Şema (migration'lar)

Dosyaları **ad sırasıyla** uygulayın:

```
supabase/migrations/20261027000001_schema.sql
supabase/migrations/20261027000002_immutability.sql
supabase/migrations/20261027000003_rls.sql
supabase/migrations/20261028000004_void_rule.sql
supabase/migrations/20261028000005_device_status.sql
supabase/migrations/20261028000006_realtime.sql
```

İki yol var:

- **Supabase CLI (önerilen):** `npx supabase login`, `npx supabase link --project-ref <ref>`, sonra `npx supabase db push`.
- **SQL Editor:** Her dosyanın içeriğini sırayla yapıştırıp çalıştırın.

`supabase/tests/supabase_stub.sql` **uygulanmaz**. O dosya sadece yerel testler içindir.

## 3. Kasa cihaz kullanıcısı

**Authentication → Users → Add user → Create new user**: e-posta (ör. `kasa@crumble.local`) ve güçlü bir şifre girin, "Auto confirm" işaretli olsun. Sonra **SQL Editor**'de bu kullanıcıyı cihaz rolüne alın:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "device"}'
where email = 'kasa@crumble.local';
```

`app_metadata` alanını kullanıcı kendisi değiştiremez, sadece yönetici değiştirebilir. RLS bu alanı kontrol eder.

## 4. Ortak (yönetim uygulaması) hesabı

Herkes aynı hesabı kullanacak. **Add user** ile bir e-posta ve şifre oluşturun, sonra:

```sql
insert into public.partners (user_id, email)
select id, email from auth.users where email = 'ortak@crumble.local';
```

## 5. Kasayı bağlama

**Project Settings → API** sayfasından **Project URL** ve **anon public** anahtarını alın. Kasada **Ayarlar → Bulut bağlantısı** ekranına adresi, anon key'i, cihaz e-postasını ve şifresini girip **Bağlan**'a basın.

- Şifre kasada saklanmaz. Sadece oturum saklanır (Windows'ta şifreli).
- Bağlantıdan önce yapılan tüm kayıtlar sırayla gönderilir. Üst çubuktaki gösterge durumu gösterir.
- **service_role** anahtarı kasaya ya da telefona **asla** girilmez.

Yeni bir bilgisayarda **Buluttan geri yükle** butonu, boş bir kasaya buluttaki tüm verileri indirir.
