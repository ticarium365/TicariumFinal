# Kurucu (founder) erişimi — super_admin

Bu doküman, **platform kurucusunun** `super_admin` rolüyle sisteme nasıl gireceğini ve hesap kaybında nasıl kurtarılacağını özetler.

## Bugün kurucu nasıl giriş yapar?

1. **URL:** Herkese açık **`/login`** sayfası (ör. `https://app.ticarium365.com/login` veya tenant ön ekli adresiniz).
2. **Alan:** Formda **“Kullanıcı adı”** kutusu kullanılır.  
   - Normal kullanıcılar: yalnızca **username**.  
   - **`super_admin`:** **username** *veya* **kurumsal e-posta** (veritabanında `email` dolu ve `@` içeren girişler, yalnızca `super_admin` için eşleştirilir).
3. **Tenant:** API, isteği bir **şirket (tenant)** bağlamına çözer. **`super_admin`** başka şirketin subdomain’inde de oturum açabilir (`auth.ts` — `companyId` kontrolü muafiyeti).
4. **Sonrası:** Girişten sonra **`/super-admin`** ve **`/admin/*`** uçlarına erişim rol ile açılır.

## Mevcut otomatik akışlar (denetim özeti)

| Yöntem | Ne zaman | Güvenilir mi? |
|--------|----------|----------------|
| `SEED_DEFAULT_USERS=1` | Production’da açıkça açılırsa `seedDefaultUsers()` çalışır; `superadmin` / `superadmin123` vb. | **Önerilmez** kalıcı prod için; zayıf varsayılan şifreler. İş bitince kapatın, şifre değiştirin. |
| **`FOUNDER_BOOTSTRAP=1`** + e-posta/şifre env | İlk kurulum: DB’de **hiç `super_admin` yokken** tek seferlik | **Önerilen** env tabanlı güvenli yol (güçlü şifre, sonra env temizliği). |
| **Manuel script** `create-super-admin.mjs` | SSH/CI veya yerel, `DATABASE_URL` ile | **Önerilen** kurtarma / operasyon. |

Çift kurucu **engellenir:**

- Env bootstrap: DB’de **en az bir** `super_admin` varsa çalışmaz.
- Script: aynı kontrol; ayrıca **e-posta** ve **username** çakışması durdurulur.

## 1) Env ile tek seferlik bootstrap (production)

**Önkoşul:** `companies` tablosunda en az bir satır (boş DB’de API zaten varsayılan “prosan” şirketini seed edebilir).

Railway / ortam değişkenleri:

```env
FOUNDER_BOOTSTRAP=1
FOUNDER_BOOTSTRAP_EMAIL=sen@alanadin.com
FOUNDER_BOOTSTRAP_PASSWORD=           # production: min 12 karakter
# FOUNDER_BOOTSTRAP_USERNAME=       # isteğe bağlı; yoksa email'in @ öncesi sanitize
# FOUNDER_BOOTSTRAP_FULL_NAME=
```

1. Bir deploy / API restart tetikleyin (sunucu `runSeeds` sırasında bootstrap’i çalıştırır).
2. Log’da **`founder_bootstrap_complete_remove_FOUNDER_BOOTSTRAP_from_env`** benzeri uyarıyı doğrulayın.
3. **Hemen** `FOUNDER_BOOTSTRAP`, `FOUNDER_BOOTSTRAP_PASSWORD` ve gerekmiyorsa diğer `FOUNDER_BOOTSTRAP_*` satırlarını **silin** (veya `0` yapın).

**Giriş:** Aynı e-posta veya atanan **username** + şifre ile `/login`.

## 2) Manuel script (kurtarma / operasyon)

Repo kökünde `.env` içinde `DATABASE_URL` tanımlı olsun.

```bash
pnpm -C artifacts/api-server run create-super-admin -- "kurucu@firma.com" "GucluSifreEnAz12" "Ad Soyad"
```

İsteğe bağlı 4. argüman: **username** (çakışırsa script hata verir ve çıkar).

Şartlar:

- Veritabanında **hiç** `super_admin` olmamalı.
- E-posta başka kullanıcıda kayıtlı olmamalı.
- Şifre **en az 12 karakter**.

## 3) Mevcut super_admin — şifre sıfırlama (hotfix, API yok)

**Kim:** Yalnızca rolü `super_admin` olan ve **username veya e-posta** ile eşleşen **tek** kullanıcı güncellenir; yeni kullanıcı oluşturulmaz, diğer satırlara dokunulmaz.

**Nasıl** (repo kökünde `.env` → `DATABASE_URL`):

```bash
pnpm -C artifacts/api-server run reset-super-admin-password -- "superadmin" "YENI_GÜÇLÜ_SIFRE_12+"
```

veya e-posta ile:

```bash
pnpm -C artifacts/api-server run reset-super-admin-password -- "ticarium365@gmail.com" "YENI_GÜÇLÜ_SIFRE_12+"
```

- Parola **loglara veya stdout’a yazılmaz**; yalnızca başarıda `user id` ve `username` özetlenir.
- Eşleşme yoksa veya `super_admin` değilse script **güvenli şekilde çıkar** (çıkış kodu ≠ 0).
- Hash: **bcryptjs, 10 round** — `auth` ile aynı.

Script dosyası: `artifacts/api-server/scripts/reset-super-admin-password.mjs`

## Kurtarma senaryoları

| Durum | Ne yapın |
|--------|-----------|
| Şifre unutuldu, SMTP çalışıyor | `/sifremi-unuttum` — kullanıcıda telefon/e-posta akışı tanımlıysa sıfırlama. **Not:** Akış şu an **SMS** tabanlı; super_admin için hızlı çözüm: **bölüm 3 script**. |
| Şifre unutuldu, erişim şart | **`reset-super-admin-password`** (bölüm 3) veya Neon üzerinden dikkatli manuel müdahale. |
| Hiç super_admin yok | `FOUNDER_BOOTSTRAP=1` **veya** `create-super-admin.mjs`. |
| Yanlışlıkla iki yöntem | İlki çalışır; ikincisi “zaten super_admin var” diye **durur**. |

## Güvenlik notları

- `SEED_DEFAULT_USERS=1` ile üretimde çoklu zayıf hesap açılır; yalnızca **geçici** bootstrap için düşünün.
- Env’de **kalıcı şifre bırakmayın**; bootstrap sonrası temizleyin.
- `super_admin` sayısını operasyonel olarak sınırlı tutun; gereksiz hesapları pasifleştirin (`is_active`).

## İlgili kod

- Bootstrap: `artifacts/api-server/src/lib/founder-bootstrap.ts`
- Seed çağrı sırası: `artifacts/api-server/src/index.ts` (`runSeeds`)
- Giriş (e-posta ile super_admin): `artifacts/api-server/src/routes/auth.ts` (`POST /login`)
- Script: `artifacts/api-server/scripts/create-super-admin.mjs`
- Şifre sıfırlama (mevcut super_admin): `artifacts/api-server/scripts/reset-super-admin-password.mjs`
