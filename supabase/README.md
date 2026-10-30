# Supabase kurulumu

Aşağıdaki adımlar bir kez, bir ortak tarafından Supabase panelinde yapılır.

## 1. Proje

1. <https://supabase.com> → **New project**. Bölge olarak Avrupa'yı seçin (ör. `eu-central-1`, Frankfurt).
2. **Authentication → Sign In / Providers → Email**: "Allow new users to sign up" seçeneğini **kapatın**. Kullanıcıları sadece siz eklersiniz.

## 2. Şema: tek dosya

**SQL Editor → New query**: `supabase/setup.sql` dosyasının tamamını yapıştırıp **Run**'a basın.

- Bu dosya `supabase/migrations` altındaki tüm migration'ların ad sırasıyla birleşimidir (`supabase/bundle.sh` üretir, elle düzenlenmez).
- Tek işlem (transaction) olarak çalışır: bir hata olursa hiçbir şey uygulanmaz.
- Sadece **yeni** bir projeye bir kez uygulanır. Sonraki değişiklikler yeni migration dosyası olarak gelir ve sadece o dosya çalıştırılır.
- `supabase/tests/supabase_stub.sql` **uygulanmaz**. O dosya sadece yerel testler içindir.

Supabase CLI ile de olur: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.

## 3. Kullanıcılar

**Authentication → Users → Add user → Create new user** ile iki kullanıcı açın. Her ikisinde de "Auto confirm user" işaretli olsun.

- **Kasa cihazı**, ör. `kasa@crumble.local`, güçlü bir şifre. Bu şifre sadece kasa bağlanırken bir kez girilir.
- **Ortak hesabı** (yönetim uygulaması, herkes aynı hesabı kullanır), ör. `ortak@crumble.local`.

Sonra **SQL Editor**'de (e-postaları kendinizinkilerle değiştirin):

```sql
-- Kasa cihaz rolü (app_metadata'yı kullanıcı kendisi değiştiremez, RLS buna bakar)
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "device"}'
where email = 'kasa@crumble.local';

-- Ortak hesabı
insert into public.partners (user_id, email)
select id, email from auth.users where email = 'ortak@crumble.local';

-- Kontrol: iki satır görmelisiniz (device ve partner)
select email, raw_app_meta_data ->> 'role' as role,
       exists (select 1 from public.partners p where p.user_id = u.id) as partner
from auth.users u;
```

## 4. Anahtarlar

**Project Settings → API** (yeni panelde **API Keys** ve **Data API**) sayfasından iki değer alınır:

- **Project URL**: `https://<ref>.supabase.co`
- **anon / publishable** anahtar.

**service_role / secret** anahtarı kasaya ya da telefona **asla** girilmez.

## 5. Kasayı bağlama

Kasada **Ayarlar → Bulut bağlantısı**: adres, anon key, cihaz e-postası ve şifresi → **Bağlan**.

- Şifre kasada saklanmaz. Sadece oturum saklanır (Windows'ta şifreli).
- Bağlantıdan önce yapılan tüm kayıtlar sırayla gönderilir. Sol raydaki gösterge durumu gösterir.
- Yeni bir bilgisayarda **Buluttan geri yükle** butonu, boş bir kasaya buluttaki tüm verileri indirir.

## 6. Yönetim uygulaması

`apps/manager-mobile/.env.example` dosyasını `.env` olarak kopyalayıp aynı adres ve anon key'i yazın. Girişte ortak hesabının e-posta ve şifresi kullanılır.
