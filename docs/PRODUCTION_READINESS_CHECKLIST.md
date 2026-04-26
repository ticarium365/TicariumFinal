# Ticarium365 — Production readiness (tek kaynak kontrol listesi)

Bu dosya, canlıya çıkış ve “production clarification” turlarında **tek otorite** kontrol listesidir. **Son yürütme turları** (Sentry, yedek/restore, staging deploy, Iyzico sandbox, DNS/mail): `docs/FINAL_LAUNCH_EXECUTION_ROUNDS.md`. **Staging tek ekran deploy:** `docs/STAGING_DEPLOY_EXECUTION.md`. **Launch öncesi scope:** `docs/TECHNICAL_FREEZE_LIGHT.md`. Ayrıntılı adımlar: `docs/DEPLOYMENT_RUNBOOK.md`, `docs/STAGING_PRODUCTION_EXECUTION_RUNBOOK.md`, `docs/FIRST_100_LAUNCH_OPERATIONS.md`. Mimari özet: `docs/TEKNIK_DOKUMANTASYON.md`.

---

## 1) Node.js sürümü (P0-5)

| Kaynak | Beklenti |
|--------|----------|
| Kök `.nvmrc` | `20` (LTS) |
| `package.json` / `artifacts/*/package.json` `engines.node` | `>=20.10.0 <25` |
| Runtime (Cloudflare Worker değil; Node API) | CI ve üretim aynı major/minor bandında olmalı |

Yerel uyum: `nvm use` / `fnm use` (`.nvmrc`).

---

## 2) Oturum (session) store mimarisi (P0-1)

| Konu | Durum |
|------|--------|
| Implementasyon | `express-session` + `buildSessionOptions` (`artifacts/api-server/src/lib/session-config.ts`) |
| `store` seçeneği | **Atanmıyor** → express-session **varsayılan MemoryStore** (süreç belleği) |
| Anlam | Tek Node süreç / tek replika senaryosunda tutarlı oturum; yatay replika veya farklı süreçlere giden trafikte oturum paylaşılmaz |
| Post-launch ölçek | Paylaşımlı store (ör. Redis, `connect-pg-simple`) aynı `SESSION_SECRET` ve çerez ayarlarıyla değerlendirilmeli |

Kod içi açıklama: `session-config.ts` dosyasındaki JSDoc.

---

## 3) Sağlık uçları — erişim sırası (P0-3)

| Rota | Davranış |
|------|----------|
| `GET /api/healthz`, `GET /api/v1/healthz` | DB ping; JSON. **Tenant middleware yok**; CORS/helmet/sıkıştırma/pino sonrası, **body parser ve `express-session` önünde** mount (`artifacts/api-server/src/app.ts`) — izleme istekleri oturum yazmaz |
| `GET /api/readyz`, `GET /api/v1/readyz` | DB hazır mı; aynı sıra kısıtı |
| `GET /api/healthz/deep` (ve v1) | `routes/health.ts` — tenant zincirinden geçer; derin teşhis içindir, uptime için **yalnızca** hafif `.../api/healthz` ve `.../api/readyz` kullanılmalı |

Kontrol: public IP’den `curl` / monitör; 401/403 bekleme **yok** (barring platform firewall).

---

## 4) Log hedefi ve saklama (P0-4)

| Konu | Politika |
|------|----------|
| Hedef | **stdout/stderr** (structural JSON) — Pino, `pino-http` |
| Geliştirme | `pino-pretty` (renk) |
| Üretim | Ham JSON; toplama **platforma** aittir (Fly.io, K8s, Replit, Docker log driver, Cloudflare / worker değil) |
| `LOG_LEVEL` | Varsayılan `info` |
| Saklama (retention) | Uygulama içinde **dosya rotasyonu yok**; hedef: en az 7–30 gün (uyumluluk ve destek için), ücretli log SaaS’te planlanan süre |
| Hassas alan | Logger `redact`: `Authorization`, `Cookie`, `Set-Cookie` |

---

## 5) Rota bazlı oran sınırlandırma (P0-2)

Üretimde `skip` ile devre dışı bırakılanlar, **production dışı** ortamda sınırları atlar. Tablo: **dakika penceresi / üst sınır / açıklama**. IPv6 anahtarları: `ipKeyGenerator` (express-rate-limit v8) kullanılır.

| Rota / önek | Pencere | Max | Amaç |
|---------------|---------|-----|------|
| `POST /api/auth/login` (+ v1) | 15 dk | 20 (IP+username) | Brute-force; başarılar sayılmaz |
| `POST` şifre sıfırlama uçları | 15 dk | 10 / IP | SMS/e-posta spam |
| `POST /api/contact` | 10 dk | 5 / IP | Form spam |
| `…/public/v1/pazar` | 1 dk | 60 / IP | Public tarama |
| `POST …/public/v1/storefronts` | 10 dk | 10 / IP | Sipariş spam |
| ` /api/public` (genel) | 1 dk | 120 / IP | Public API |
| `POST /api/billing/webhook` (+ v1) | 1 dk | 240 / IP | Iyzico imzalı webhook; flood |
| Tüm metodlar `/api/billing/return` (+ v1) | 1 dk | 90 / IP | PSP dönüş |
| `POST /api/webhooks/...` (+ v1) | 1 dk | 400 / IP | Kanal inbound; HMAC ile birlikte |
| `POST /api/client-errors` | 1 dk | 30 / IP | Tarayıcı hata spam |
| `POST /api/auth/register/business`, `.../register/buyer` (+ v1) | 10 dk | 5 / IP (in-memory) | prod; `DISABLE_REGISTER_RATE_LIMIT=1` ile atlanabilir (yalnızca test) |

Kod: `app.ts` (çoğu), `auth.ts` (kayıt), `client-errors.ts` (client-errors), `lib/rate-limit-factory.ts` (ileride kademeler).

---

## 6) Yedekleme, PITR, restore provası (P1-6)

| Adım | Beklenti |
|------|----------|
| Neon/PostgreSQL | Günlük yedek + mümkünse **PITR** açık; saklama süresi planla |
| Otomatik yedek | Açık |
| Yıllık/launch öncesi | Farklı **staging veya one-off** instance’a restore; üretim verisine doğrudan overwrite yok |
| Doğrulama | `node scripts/verify-production-schema.mjs` restore DB’ye karşı; smoke: `healthz`, `readyz`, auth |
| Sorumluluk | Restore süresi ve sorumlu kişi not edilir (detay: `docs/DEPLOYMENT_RUNBOOK.md` bölüm 7.3) |

---

## 7) R2 / object storage — yedek davranış (P1-7)

| Durum | Davranış |
|-------|----------|
| `STORAGE_DRIVER` + env | `resolveStorageDriver()`: açık `r2` / `replit` veya R2 env doluysa R2, aksi replit yolu |
| R2 down veya `HeadBucket` hata | `probeR2Storage` / `checkObjectStorage` (health **deep**) `down` veya `degraded`; uygulama **çekirdeği** (satış, DB) ayrı |
| Yükleme hatası (presign, Put) | API katmanı kullanıcıya hata; işlem tekrarlanabilir olmalı; otomatik “sessiz replit’e geç” **yok** — operatör `STORAGE_DRIVER` veya R2 erişimini düzeltir |
| Yedek script | `scripts/src/db-backup.ts`: R2 veya Replit object storage; biri erişilemezse script hata verir (fail-closed) |

Stratejik not: eşzamanlı iki backend driver failover **post-launch**; launch’ta sağlam tek driver + runbook yeter.

---

## 8) Kısa GO / NO-GO (mevcut runbook’larla örtüşür)

- `pnpm run ci:gate` veya deploy için `pnpm run ci:deploy` yeşil (`ci:gate` artık **commit’li `artifacts/prosan/dist` yok** kontrolü içerir; frontend deploy **kaynak derlemesi** — `docs/FRONTEND_BUILD_AND_DEPLOY.md`).
- `SESSION_SECRET`, `DATABASE_URL`, Iyzico prod anahtarları, Sentry, `RELEASE_VERSION` runbook’taki gibi.
- Bu dosyadaki 2–4 (oturum, log, sağlık) ve 5 (oran sınırları) maddeleri gözden geçirildi.
- Daha ayrıntılı DNS/Neon/rollback: `STAGING_PRODUCTION_EXECUTION_RUNBOOK.md`.

**Bu checklist güncellendiğinde** `docs/DEPLOYMENT_RUNBOOK.md` içindeki 7.1 oran tablosu tekrar etmek yerine bu dosyaya referans verilir (tek kaynak).
