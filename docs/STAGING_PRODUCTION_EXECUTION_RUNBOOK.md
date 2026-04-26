# Ticarium365 — Staging + Production Execution Runbook

**Canonical production checklist:** `docs/PRODUCTION_READINESS_CHECKLIST.md` (oranı sınırlandırma, oturum, sağlık, log, Node, yedekleme, R2).

**Final launch execution rounds (Sentry, backup, staging, Iyzico sandbox, DNS/mail):** `docs/FINAL_LAUNCH_EXECUTION_ROUNDS.md`

Bu doküman, gerçek launch yürütmesi içindir. Fake altyapı, fake yeşil statü veya varsayımsal credential içermez.

## 1. Cloudflare DNS Topology Checklist

Önerilen host yapısı:

| Ortam | Host | Amaç | Cloudflare Proxy |
|------|------|------|------------------|
| Production | `app.YOURDOMAIN.com` | müşteri web uygulaması | On |
| Production | `api.YOURDOMAIN.com` | backend API | On |
| Production future | `admin.YOURDOMAIN.com` | ileride ayrı admin/control panel | On / placeholder |
| Staging | `app.staging.YOURDOMAIN.com` | staging web uygulaması | On |
| Staging | `api.staging.YOURDOMAIN.com` | staging API | On |

Cloudflare DNS adımları:

1. Frontend provider hedefini al.
2. Backend provider hedefini al.
3. Cloudflare DNS’e CNAME kayıtları ekle.
4. `app.*` hostlarını frontend target’a yönlendir.
5. `api.*` hostlarını backend target’a yönlendir.
6. `admin.*` için şimdilik frontend placeholder veya boş landing hedefi kullan.
7. DNS propagation sonrası tarayıcıdan hostların açıldığını doğrula.

Cloudflare SSL/security:

- SSL/TLS mode: **Full (strict)**
- Always Use HTTPS: **On**
- Automatic HTTPS Rewrites: **On**
- API cache: **Bypass**
- WAF/bot baseline: **On**
- API için cache rule:
  - `api.YOURDOMAIN.com/*` → bypass cache
  - `api.staging.YOURDOMAIN.com/*` → bypass cache

## 2. Neon Staging / Production DB Checklist

İki ayrı DB kullanılmalı:

| DB | Amaç |
|----|------|
| `ticarium365_staging` | staging test |
| `ticarium365_production` | canlı müşteri verisi |

Neon checklist:

1. Staging ve production için ayrı project veya en azından ayrı database oluştur.
2. Production DB için backup/PITR imkanını doğrula.
3. Staging DB’ye production credential koyma.
4. Production `DATABASE_URL` sadece production host env panelinde dursun.
5. Staging `DATABASE_URL` sadece staging host env panelinde dursun.
6. SSL mode kullan: `sslmode=require` veya provider’ın önerdiği daha sıkı ayar.
7. **İlk deploy öncesi (şema):** migration’ı staging `DATABASE_URL` ile çalıştırın; ardından doğrulama:
   - Staging: `pnpm run ci:gate` (`.env` veya ortamda `DATABASE_URL` staging olmalı; `ci:deploy` *değil* — o script `verify-production-env` production gate’idır).
   - Production: `pnpm run ci:deploy`.

```bash
pnpm -C lib/db run migrate:sql
pnpm run ci:gate
```

Not: Staging’de `NODE_ENV=production` kullanılması (örnek şablonda olduğu gibi) güvenlik dallanmasını canlıya yakın test etmek içindir; yine de host ve DB ayrıdır.

## 3. Deploy Sequence Runbook

### 3.1 Staging Deploy

1. Cloudflare staging DNS kayıtlarını oluştur:
   - `app.staging.YOURDOMAIN.com`
   - `api.staging.YOURDOMAIN.com`
2. Neon staging DB oluştur.
3. Staging env değerlerini host paneline gir:
   - `.env.staging.example` referans alınır.
4. Backend/API deploy et.
5. Staging DB migration çalıştır:

```bash
pnpm -C lib/db run migrate:sql
```

6. Staging gate çalıştır:

```bash
pnpm run ci:gate
```

7. Frontend deploy et.
8. Smoke test checklist’i tamamla.
9. Sentry staging environment’da event geldiğini doğrula.

5 dakikalık otomatik smoke:

```bash
SMOKE_APP_URL=https://app.staging.YOURDOMAIN.com \
SMOKE_API_URL=https://api.staging.YOURDOMAIN.com \
SMOKE_ORIGIN=https://app.staging.YOURDOMAIN.com \
pnpm run smoke:staging
```

PowerShell:

```powershell
$env:SMOKE_APP_URL="https://app.staging.YOURDOMAIN.com"
$env:SMOKE_API_URL="https://api.staging.YOURDOMAIN.com"
$env:SMOKE_ORIGIN="https://app.staging.YOURDOMAIN.com"
pnpm run smoke:staging
```

### 3.2 Production Deploy

1. Launch freeze ilan et.
2. Production DNS kayıtlarını doğrula:
   - `app.YOURDOMAIN.com`
   - `api.YOURDOMAIN.com`
3. Neon production DB oluştur ve backup ayarını doğrula.
4. Production env değerlerini host paneline gir:
   - `.env.production.example` referans alınır.
5. Backend/API deploy et.
6. Production DB migration çalıştır.
7. Sert production gate çalıştır:

```bash
pnpm run ci:deploy
```

8. Frontend deploy et.
9. Production smoke test checklist’i tamamla.
10. İlk 30-60 dakika Sentry/log/uptime izle.
11. İlk müşteri kohortunu küçük başlat.

## 4. Smoke Test Checklist

Her deploy sonrası minimum kontrol.

### 4.1 Health

- `GET https://api.<env-domain>/api/healthz`
- `GET https://api.<env-domain>/api/readyz`

Beklenen:

- 2xx response
- Cloudflare SSL hatası yok
- API cache yok

Otomatik smoke script bu bölümlerin hafif sürümünü çalıştırır:

- `/api/healthz`
- `/api/readyz`
- homepage
- login page
- anonymous API auth rejection
- CORS preflight sanity
- protected endpoint anonymous rejection

Script fail ederse production’a ilerleme yapılmaz; önce fail summary okunur.

### 4.2 Login

1. Web app açılır.
2. Test admin ile login olunur.
3. `/dashboard` açılır.
4. `/api/auth/me` 200 döner.
5. Sayfa refresh sonrası oturum korunur.

Fail ise kontrol:

- `SESSION_SECRET`
- `SESSION_COOKIE_DOMAIN`
- `SESSION_COOKIE_SAMESITE`
- `TRUST_PROXY`
- `CORS_ALLOWED_ORIGINS`

### 4.3 Tenant Boundary

1. Tenant A hostunda login ol.
2. Aynı browser’da Tenant B hostuna git.
3. Beklenen:
   - temiz login ekranı veya
   - `TENANT_SESSION_MISMATCH`
4. Loglarda `tenant_default_company_fallback_used` normal prod DNS altında görünmemeli.

### 4.4 Billing Checkout

Staging:

1. `IYZICO_MODE=sandbox`
2. Paid plan seç.
3. `/api/billing/checkout` payment URL döndürür.
4. Sandbox ödeme tamamlanır.
5. `/api/billing/return` sonucu işler.
6. Payment status succeeded olmalı.

Production:

- Sadece provider-approved düşük riskli test ile doğrula.
- `BILLING_ALLOW_MOCK_IN_PRODUCTION` boş olmalı.

### 4.5 Billing Webhook

Kontroller:

- valid webhook accepted
- invalid signature rejected
- duplicate success webhook idempotent
- failed payment analytics/log oluşur
- topup success credits once applies

### 4.6 Marketplace

Kontroller:

- `/api/marketplace/accounts/health`
- `/api/marketplace/jobs`
- `/api/marketplace/logs`
- `/api/marketplace/stats`
- `/api/marketplace/worker-observability`
- `/api/marketplace/self-healing`

Beklenen:

- 200 response
- provider credential yoksa anlamlı hata
- worker stuck job yok

### 4.7 Autopilot

Kontrol:

- `/api/marketplace/autopilot/safety-status`

Beklenen:

- 200 response
- migration missing 503 yok
- rollback/safety matrix görünür

### 4.8 Integrations

Kontrol:

- `/api/integrations/live-readiness`

Beklenen:

- 200 response
- tenant readiness bundle döner
- external credential yoksa açıkça “eksik” görünür, fake OK dönmez

## 5. Rollback Checklist

Rollback kararı gerektiren durumlar:

- login bozuk
- tenant boundary bozuk
- payment checkout/return/webhook bozuk
- production DB migration eksik/hatalı
- tekrarlayan 5xx
- Sentry alarm fırtınası
- API health/readyz düşüyor

Rollback adımları:

1. Yeni müşteri alımını durdur.
2. Son deploy release ID’yi not et.
3. Önce frontend’i önceki stable release’e al.
4. API deploy’u önceki stable release’e al.
5. DB migration rollback yoksa restore kararı ver:
   - sadece founder + teknik sorumlu onayıyla
   - production üzerine değil, önce restore DB doğrulamasıyla
6. Cloudflare DNS değiştirilmişse önceki target’a geri al.
7. Health/readyz kontrol et.
8. Sentry/log hatalarının durduğunu doğrula.
9. Etkilenen müşterilere kısa ve dürüst bilgilendirme hazırla.

## 6. Founder Launch Day Checklist

Launch sabahı:

- Production env değerleri kontrol edildi.
- `pnpm run ci:deploy` geçti.
- Neon backup açık.
- Sentry production event alıyor.
- Uptime monitors aktif.
- Iyzico live/sandbox durumu net.
- Cloudflare SSL Full strict.
- API cache bypass.
- Support mailbox aktif.
- WhatsApp/support hattı hazır veya placeholder metni net.

İlk müşteri öncesi:

1. Test login.
2. Test dashboard.
3. Test ürün/satış/stok.
4. Test ödeme akışı.
5. Test marketplace health.
6. Test integrations readiness.
7. Tenant boundary smoke.
8. Sentry/log kontrol.

İlk gün:

- 3-5 işletmeden fazla onboarding yapma.
- Her işletme için not tut:
  - nerede takıldı
  - hangi fiyat itirazı geldi
  - hangi entegrasyon istendi
  - ilk değer anı neydi
  - destek gereksinimi neydi

NO-GO:

- ci/deploy gate fail
- Sentry kapalı
- payment mock production’da aktif
- webhook doğrulanmamış
- tenant test fail
- production DB backup yok

