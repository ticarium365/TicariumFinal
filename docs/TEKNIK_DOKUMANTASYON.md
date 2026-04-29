# Ticarium365 Teknik Dokümantasyon

Bu doküman, Ticarium365 projesinin teknik yapısını, geliştirme ortamını, ana modüllerini ve canlıya çıkışta dikkat edilmesi gereken noktaları özetler.

**Hızlı giriş:** kökte [`dokümantasyon/`](../dokümantasyon/README.md) — yeni geliştirici özeti ([`yeni-gelistirici.md`](../dokümantasyon/yeni-gelistirici.md)) ve API envanteri ([`api-yuzeyi.md`](../dokümantasyon/api-yuzeyi.md)).

## 1. Genel Mimari

Ticarium365 monorepo yapısında geliştirilmiştir.

Ana parçalar:

- **Frontend:** `artifacts/prosan` (geçici/legacy workspace adı; ürün adı Ticarium365)
- **Backend API:** `artifacts/api-server`
- **Veritabanı paketi / schema:** `lib/db`
- **API client / React hook katmanı:** `lib/api-client-react`
- **API validasyon tipleri:** `lib/api-zod`
- **Dokümantasyon:** `docs`
- **Yardımcı scriptler:** `scripts`

Temel çalışma modeli:

1. Kullanıcı frontend üzerinden işlem yapar.
2. Frontend `/api/*` isteklerini backend’e gönderir.
3. Backend oturum, tenant, yetki, feature ve iş kurallarını uygular.
4. Veriler PostgreSQL üzerinde saklanır.
5. Kritik iş akışları için log, audit, ödeme, pazaryeri ve entegrasyon kayıtları tutulur.

## 2. Teknoloji Stack

Frontend:

- React
- Vite
- TypeScript
- Wouter routing
- TanStack Query
- Tailwind / UI component yapısı

Backend:

- Node.js
- Express
- TypeScript
- Drizzle ORM
- PostgreSQL
- express-session
- Pino logger
- Sentry entegrasyonu

Altyapı hedefleri:

- Cloudflare DNS / proxy
- Managed PostgreSQL: Neon veya Supabase önerilir
- Object storage: Cloudflare R2 / S3 uyumlu storage
- Iyzico ödeme entegrasyonu
- Sentry hata izleme

## 3. Lokal Geliştirme

### 3.1 Gereksinimler

- **Node.js 20.10+** (LTS; kök `.nvmrc` ve `package.json` `engines` ile hizalanır)
- pnpm
- PostgreSQL bağlantısı (`DATABASE_URL`)

### 3.2 Ortam Dosyası

Kök dizinde `.env` bulunmalıdır.

Önemli lokal değerler:

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
NODE_ENV=development
PORT=8080
VITE_API_BASE_URL=http://localhost:8080
LOG_LEVEL=info
ENABLE_SCHEDULER=false
```

### 3.3 Backend Başlatma

```bash
pnpm -C artifacts/api-server run dev
```

Backend varsayılan olarak:

```text
http://localhost:8080
```

üzerinden çalışır.

### 3.4 Frontend Başlatma

```bash
pnpm -C artifacts/prosan run dev
```

Frontend varsayılan olarak:

```text
http://localhost:3000
```

üzerinden çalışır.

Frontend Vite proxy ayarı sayesinde `/api/*` isteklerini `VITE_API_BASE_URL` değerine yönlendirir.

## 4. Monorepo Klasör Yapısı

### 4.1 `artifacts/prosan` (legacy workspace adı)

Ana web uygulamasıdır. Bu klasör adı erken geliştirme döneminden kalmıştır; kullanıcıya görünen ürün adı **Ticarium365** olmalıdır.

Önemli dosyalar:

- `src/App.tsx` — frontend route tanımları
- `src/pages/*` — sayfa bileşenleri
- `src/components/*` — ortak UI ve iş bileşenleri
- `vite.config.ts` — dev server, build, proxy ayarları

Önemli public sayfalar:

- `/`
- `/login`
- `/kayit`
- `/hakkimizda`
- `/amacimiz`
- `/paketler`
- `/iletisim`
- `/kvkk`

Önemli iç sayfalar:

- `/dashboard`
- `/products`
- `/sales`
- `/stock`
- `/finance`
- `/settings`
- `/marketplace`
- `/channels`
- `/admin/*`
- `/super-admin/*`

### 4.2 `artifacts/api-server`

Backend API uygulamasıdır.

Önemli dosyalar:

- `src/app.ts` — Express uygulaması, middleware sırası
- `src/index.ts` — server başlangıcı
- `src/routes/index.ts` — route mount noktaları
- `src/middlewares/auth.ts` — kimlik doğrulama / rol kontrolü
- `src/middlewares/tenant.ts` — tenant çözümleme
- `src/middlewares/tenant-boundary.ts` — tenant-session sınırı
- `src/middlewares/features.ts` — feature gate ve paket erişimleri
- `src/lib/sentry.ts` — Sentry entegrasyonu
- `src/lib/logger.ts` — log sistemi

### 4.3 `lib/db`

Veritabanı schema ve migration katmanıdır.

Önemli dosyalar:

- `src/schema/*` — Drizzle schema tanımları
- `migrations/*.sql` — SQL migration dosyaları
- `apply-sql-migrations.mjs` — migration çalıştırıcı

Migration komutu:

```bash
pnpm -C lib/db run migrate:sql
```

## 5. Backend Middleware Sırası

Backend uygulamasında middleware sırası kritiktir.

Özet akış:

1. Güvenlik / logging / parsing middleware’leri
2. Public endpoint’ler
3. Public webhook receiver’lar
4. Public marketplace/storefront endpoint’leri
5. Tenant middleware
6. Tenant-session hizalama
7. Auth gerektiren route’lar
8. Admin runtime route’ları
9. Global error handler

Özellikle şu sıra korunmalıdır:

```text
tenantMiddleware
enforceTenantSessionAlignment
main router
```

Bu yapı, yanlış subdomain veya paylaşılan cookie nedeniyle farklı tenant verisine erişimi engeller.

## 6. Auth, Session ve Tenant Güvenliği

### 6.1 Auth

Backend session tabanlı kimlik doğrulama kullanır.

Ana kontroller:

- `requireAuth`
- `requireRole([...])`
- `requireSuperAdmin`

### 6.2 Tenant Boundary

`tenant-boundary.ts`, oturumdaki `companyId` ile host/subdomain’den çözülen `req.companyId` değerini karşılaştırır.

Davranış:

- Eşleşirse istek devam eder.
- Eşleşmezse normal kullanıcı için `TENANT_SESSION_MISMATCH` döner.
- `super_admin` için session ilgili tenant’a hizalanabilir.
- `/billing/webhook` ve `/webhooks/*` gibi dış imzalı uçlar bu kontrolden hariç tutulur.

Bu yapı production tenant izolasyonu için kritiktir.

### 6.3 Frontend oturum doğrulama (Prosan)

Web arayüzü backend ile aynı **cookie tabanlı session** modelini kullanır; kimlik bilgisi **`GET /api/auth/me`** (veya eşdeğer OpenAPI hook: `useGetMe`) ile doğrulanır.

Önemli dosyalar:

- `artifacts/prosan/src/components/auth-context.tsx` — `AuthProvider`, oturum gövdesinin doğrulanması
- `artifacts/prosan/src/App.tsx` — `ProtectedRoute`, korumalı sayfa sarmalayıcısı
- `artifacts/prosan/src/lib/login-redirect.ts` — giriş sonrası güvenli yönlendirme (`next` parametresi)

Davranış özeti:

1. **Doğrulanmış kullanıcı:** Son başarılı `/me` yanıtında; sayısal ve sonlu `id`, boş olmayan `username`, izin verilen `role` (`admin` | `staff` | `viewer` | `super_admin`) olmalıdır. Eksik veya bozuk gövde oturum yok sayılır.
2. **React Query ve hata:** `/me` refetch **hata** verdiğinde (ör. süresi dolmuş çerez), önceki başarılı cache güvenilmez; cache temizlenir ve kullanıcı **oturumsuz** kabul edilir (stale-on-error sızıntısının önü).
3. **Korumalı rotalar:** `ProtectedRoute` yalnızca doğrulanmış `user` varken içerik (ve `Layout`) render eder; aksi halde tam ekran yükleyici gösterilir ve uygulama `loginUrlWithCurrentLocationNext()` ile `/login?next=...` adresine yönlendirir (ör. `/dashboard` için `next=/dashboard`).
4. **Halka açık sayfalar:** Ana sayfa, giriş/kayıt, ödeme dönüşü (`/odeme/sonuc`) vb. üzerindeyken `/me` hatası kullanıcıyı otomatik login’e atmaz.

## 7. Route Organizasyonu

Launch öncesi büyük route dosyaları sadeleştirilmiştir.

### 7.1 Subscriptions

Entrypoint:

```text
artifacts/api-server/src/routes/subscriptions.ts
```

Alt modüller:

- `routes/subscriptions/subscriptions-plans-seed.ts`
- `routes/subscriptions/subscriptions-shared-helpers.ts`
- `routes/subscriptions/subscriptions-admin-billing-metrics.ts`

Amaç:

- Plan seed
- Ortak subscription helper’ları
- Admin billing metrics route’u

ayrı dosyalarda tutulur.

### 7.2 Billing

Entrypoint:

```text
artifacts/api-server/src/routes/billing.ts
```

Alt modüller:

- `routes/billing/billing-iyzico-flow.ts`
- `routes/billing/billing-readonly.ts`

Korunan akışlar:

- Checkout
- Return
- Webhook
- Top-up
- Payment idempotency
- Payment state transition
- Billing analytics events

### 7.3 Marketplace

Entrypoint:

```text
artifacts/api-server/src/routes/marketplace.ts
```

Alt modüller:

- `routes/marketplace/marketplace-core.ts`
- `routes/marketplace/marketplace-workers.ts`
- `routes/marketplace/marketplace-orders.ts`
- `routes/marketplace/marketplace-observability.ts`
- `routes/marketplace/marketplace-self-heal.ts`
- `routes/marketplace/marketplace-profit.ts`
- `routes/marketplace/marketplace-autopilot-mount.ts`

Bu yapı, marketplace modülünün bakımını kolaylaştırır.

## 8. Ödeme Sistemi

Ödeme akışı `billing` route’ları üzerinden yürür.

Ana endpoint’ler:

- `POST /api/billing/checkout`
- `POST /api/billing/topup`
- `ALL /api/billing/return`
- `POST /api/billing/webhook`
- `GET /api/billing/payments`
- `GET /api/billing/topup-summary`

Production’da mock ödeme sağlayıcısı kapalıdır.

Gerekli production env:

```env
IYZICO_API_KEY=
IYZICO_SECRET_KEY=
IYZICO_MODE=
IYZICO_MERCHANT_ID=
```

Normal production’da şu değişken kullanılmamalıdır:

```env
BILLING_ALLOW_MOCK_IN_PRODUCTION=true
```

Webhook ve return akışında idempotency korunur. Aynı başarılı ödeme tekrar geldiğinde çift uygulama yapılmaması beklenir.

## 9. Marketplace Sistemi

Marketplace modülü şunları kapsar:

- Provider listesi
- Channel account yönetimi
- Account health check
- Product mapping
- Pricing / stock rule
- Sync job queue
- Logs / stats
- Orders
- Convert-to-sale
- Worker observability
- Self-heal bundle
- Profit automation signal
- Autopilot mount

Önemli endpoint örnekleri:

```text
GET  /api/marketplace/providers
GET  /api/marketplace/accounts
GET  /api/marketplace/accounts/health
POST /api/marketplace/jobs
GET  /api/marketplace/worker-observability
GET  /api/marketplace/self-healing
GET  /api/marketplace/profit-automation
GET  /api/marketplace/autopilot/safety-status
```

Marketplace route’ları `MARKETPLACE_BASIC` feature gate arkasında çalışır.

## 10. Autopilot Güvenliği

Autopilot route’ları marketplace altında mount edilir:

```text
/api/marketplace/autopilot/*
```

Önemli kontrol endpoint’i:

```text
GET /api/marketplace/autopilot/safety-status
```

Güvenlik ilkeleri:

- Okuma: admin / staff / super_admin
- Apply / rollback: admin / super_admin
- `confirm: true` gerektiren işlemler strict boolean kontrolüyle çalışır
- Eksik migration durumlarında `503` dönebilir

İlgili migration’lar:

- `006_marketplace_autopilot_action_logs.sql`
- `007_marketplace_autopilot_roi.sql`
- `008_company_settings_autopilot_closed_loop.sql`

## 11. Entegrasyonlar

Ana route’lar:

- `/api/integrations/*`
- `/api/ext-integrations/*`

Önemli readiness endpoint’i:

```text
GET /api/integrations/live-readiness
```

Bu endpoint, tenant’ın entegrasyon canlıya hazırlık durumunu değerlendirmek için kullanılır.

## 12. Veritabanı ve Migration

SQL migration’lar:

```text
lib/db/migrations
```

Çalıştırma:

```bash
pnpm -C lib/db run migrate:sql
```

Schema doğrulama:

```bash
node scripts/verify-production-schema.mjs
```

`verify-production-schema.mjs`, kritik production tablolarını ve kolonlarını kontrol eder.

Kontrol edilen bazı kritik alanlar:

- `companies`
- `users`
- `marketplace_autopilot_action_logs`
- `marketplace_autopilot_intent_events`
- `company_settings.autopilot_closed_loop`

Production’da şu değişken kullanılmamalıdır:

```env
SKIP_SCHEMA_VERIFY=1
```

## 13. CI / Doğruluk Kapısı

Ana kontrol komutu:

```bash
pnpm run ci:gate
```

Bu komut:

1. `lib/db` TypeScript kontrolü
2. API server build
3. Production schema doğrulama

adımlarını çalıştırır.

Production veya staging gate için gerçek `DATABASE_URL` gereklidir.

## 14. Environment Variables

Minimum production değişkenleri:

```env
DATABASE_URL=
SESSION_SECRET=
NODE_ENV=production
PORT=8080
TRUST_PROXY=1
SESSION_BEHIND_PROXY=1
SESSION_COOKIE_SAMESITE=none
SESSION_COOKIE_DOMAIN=.yourdomain.com
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
IYZICO_API_KEY=
IYZICO_SECRET_KEY=
IYZICO_MODE=
IYZICO_MERCHANT_ID=
SENTRY_DSN=
RELEASE_VERSION=
LOG_LEVEL=info
```

Staging için ayrı değerler kullanılmalıdır.

## 15. Cloudflare ve Deployment

Önerilen domain yapısı:

```text
app.domain.com
api.domain.com
staging.domain.com
api-staging.domain.com
admin.domain.com
```

Cloudflare ayarları:

- SSL/TLS: Full (strict)
- Always Use HTTPS: açık
- API subdomain’leri için cache bypass
- Proxy: açık

API cache’lenmemelidir.

## 16. Sentry

Sentry opsiyonel ama production için önerilir.

Gerekli env:

```env
SENTRY_DSN=
RELEASE_VERSION=
```

`src/lib/sentry.ts` davranışı:

- `SENTRY_DSN` yoksa Sentry devre dışı kalır.
- DSN varsa Sentry initialize edilir.
- 5xx global error handler üzerinden capture edilir.
- `companyId`, `requestId` gibi bilgiler tag olarak gönderilebilir.

## 17. Loglama

Backend Pino logger kullanır.

Önemli log kategorileri:

- Auth / session
- Tenant mismatch
- Billing checkout / webhook
- Marketplace worker
- Autopilot
- Sentry init
- Global error handler

Production’da dikkat edilmesi gereken log:

```text
tenant_default_company_fallback_used
```

Normal production DNS altında bu log görülmemelidir.

## 18. Kullanım Kılavuzu ve Ekran Görüntüleri

Kullanım kılavuzu:

```text
docs/KULLANIM_KILAVUZU.md
```

Ekran görüntü klasörleri:

```text
docs/user-guide-assets
docs/user-guide-auth-assets
```

Zip paketleri:

```text
docs/ticarium365-public-screenshots.zip
docs/ticarium365-auth-screenshots.zip
docs/ticarium365-all-screenshots.zip
```

## 19. Test ve Smoke Kontroller

Lokal smoke:

```bash
pnpm -C artifacts/api-server run dev
pnpm -C artifacts/prosan run dev
```

Kontrol:

```text
http://localhost:8080/api/healthz
http://localhost:3000
```

Production smoke:

```text
https://api.domain.com/api/healthz
https://api.domain.com/api/readyz
https://app.domain.com
```

Kritik manuel testler:

- Login
- Tenant mismatch
- Billing checkout / return / webhook
- Marketplace account health
- Worker observability
- Self-heal
- Autopilot safety-status
- Integrations live-readiness

## 20. Production Go-Live Kontrol Listesi

**Genişletilmiş tek otorite:** `docs/PRODUCTION_READINESS_CHECKLIST.md`

GO için:

- `pnpm run ci:gate` gerçek `DATABASE_URL` ile yeşil
- Migration’lar uygulanmış
- `verify-production-schema` OK
- Sentry aktif
- Iyzico live/sandbox ortamı doğru
- Mock billing production’da kapalı
- Tenant boundary testi başarılı
- Marketplace health/worker/self-heal başarılı
- Autopilot safety-status başarılı
- API health/readyz başarılı

NO-GO:

- `ci:gate` başarısız
- Migration eksik
- `DATABASE_URL` yanlış ortamı gösteriyor
- API cache’leniyor
- Sentry yok
- Iyzico mock kalmış
- Tenant mismatch koruması çalışmıyor
- Payment return/webhook doğrulanamıyor

## 21. Bakım Notları

Yeni geliştirmelerde:

- Büyük route dosyası büyütülmemeli.
- Yeni domain route’ları `registerX(router)` pattern’i ile eklenmeli.
- Tenant boundary bypass sadece gerçekten public/imzalı webhook uçları için yapılmalı.
- Billing state transition ve idempotency davranışı değiştirilmemeli.
- Marketplace worker/self-heal/autopilot akışları feature gibi değil production operasyon yüzeyi gibi ele alınmalı.
- Yeni migration sonrası `verify-production-schema.mjs` gerekiyorsa güncellenmeli.

## 22. Dağıtım, ortam doğrulama ve ilgili doküman haritası

**Dağıtım öncesi otomasyon (kök `package.json`):**

| Script | Amaç |
|--------|------|
| `pnpm run ci:gate` | Tip kontrol, API build, şema doğrulama; geliştirme/CI için ana kapı. |
| `pnpm run ci:deploy` | Production ortamı için `verify-production-env.mjs` + `tsc` (lib/db) + API build + `verify-production-schema.mjs` — canlıya çıkmadan önce güvenli kombinasyon. |
| `pnpm run smoke:staging` | `scripts/staging-smoke.mjs` — staging tabanında healthz/readyz, ana sayfa, login, API ve CORS duman testi. Taban URL: `SMOKE_BASE_URL` (ör. `https://staging-app...`). |

**Kök ortam şablonları (örnek; gerçek gizli değerleri repoya koymayın):**

- `.env.staging.example` — staging için izlenecek değişken isimleri ve güvenli varsayılanlar
- `.env.production.example` — production için zorunlu/opsiyonel matris; mock ödeme ve riskli bayraklar için uyarı notları

**Scriptler (`scripts/`):**

- `verify-production-env.mjs` — Production’da yasak veya zayıf yapılandırmalarda (ör. `BILLING_ALLOW_MOCK_IN_PRODUCTION`, `SKIP_SCHEMA_VERIFY=1` production’da) süreç çıkış kodu 1
- `verify-production-schema.mjs` — Kritik tablolar/sütunlar; `SKIP_SCHEMA_VERIFY=1` production’da yasak
- `staging-smoke.mjs` — Hafif URL tabanlı smoke; staging rejisi için

**Ayrıntılı operasyonel runbook’lar (bu dosyayı tamamlar):**

| Dosya | İçerik |
|--------|--------|
| `docs/DEPLOYMENT_RUNBOOK.md` | Genel dağıtım, sağlık uçları, oran sınırlandırma, yedekleme, Sentry, route sahipliği notları |
| `docs/STAGING_PRODUCTION_EXECUTION_RUNBOOK.md` | Cloudflare DNS, Neon staging/prod, deploy sırası, smoke/rollback, founder launch günü |
| `docs/FIRST_100_LAUNCH_OPERATIONS.md` | İlk 100 işletme beta operasyonu, öncelikler, tenant/ödeme/yedekleme |
| `docs/NAMING_AUDIT_TICARIUM365.md` | `artifacts/prosan` gibi legacy workspace adı ile ürün adı ayrımı; yapısal rename post-launch |
| `docs/PRODUCTION_READINESS_CHECKLIST.md` | **Canlıya çıkış — tek otorite** (oturum store, oran sınırları, health sırası, log/retention, Node, PITR, R2) |
| `docs/FINAL_LAUNCH_EXECUTION_ROUNDS.md` | **Son launch yürütme turları** (Sentry aktivasyon, restore provası, staging deploy, Iyzico sandbox, DNS/mail) |
| `docs/TECHNICAL_FREEZE_LIGHT.md` | **Launch scope politikası** (izinli/yasak iş türleri; yeni sistem/refactor yok) |
| `docs/STAGING_DEPLOY_EXECUTION.md` | **Staging deploy** (host topolojisi, sıra, env, Neon, Cloudflare, smoke, GO/BLOCKED) |
| `docs/COMPETITIVE_CAPABILITY_AUDIT_QUKASOFT.md` | **Rekabet yetenek denetimi** (Qukasoft benzeri benchmark’e karşı dürüst sınıflandırma; kod tabanlı) |
| `docs/STRATEGIC_LAUNCH_CLASSIFICATION.md` | **Stratejik sınıflandırma** (launch / ilk 20 / sonra / yasak karmaşıklık; sade, güven, düşük destek yükü) |
| `docs/WEEK1_LAUNCH_FOUNDATION_REPORT.md` | **30 gün mod — Hafta 1** (topoloji, DNS, Neon, env matrisi, preflight, GO/NEED_INPUT, founder girdileri) |
| `docs/LAUNCH_REPO_AUDIT.md` | **Mevcut repo vs temiz launch repo** (karmaşıklık, dist riski, monorepo, taşıma maliyeti; öneri) |
| `docs/FRONTEND_BUILD_AND_DEPLOY.md` | **Vite / prosan** — deploy kaynağı, `dist` commit yok, `ci:gate` doğrulaması |
| `docs/STAGING_DEPLOYMENT_PREPARATION.md` | **Staging canlı yürütme** (Neon, Cloudflare, hosting, duman) — doldur-boş alan + sıra |

Kullanıcı rehberi ve ekran görüntüleri için bölüm 18’e bakın.

## 23. Production clarification (oturum, log, sağlık, sınırlar)

Özet; tam tablolar: `docs/PRODUCTION_READINESS_CHECKLIST.md`.

- **Oturum:** `express-session` + `buildSessionOptions` + **`connect-pg-simple`** (`DATABASE_URL` ile Neon/PostgreSQL, tablo varsayılan `session`). Ayrıntı: `artifacts/api-server/src/lib/session-config.ts`.
- **Log:** Pino → stdout (prod’da JSON); retention uygulama dışı (platform + kurumsal politika). `LOG_LEVEL` ile seviye.
- **Sağlık:** `GET /api/healthz` ve `GET /api/readyz`, tenant ve session **öncesi** (canlı yük / monitör). Derin: `/api/healthz/deep` (tenant sonrası).
- **Oran sınırları:** Tam rota listesi bölüm 5 (aynı doc).
- **R2 / depolama:** `resolveStorageDriver()`; açık otomatik fallback yok; kılavuz: `PRODUCTION_READINESS_CHECKLIST.md` bölüm 7.

