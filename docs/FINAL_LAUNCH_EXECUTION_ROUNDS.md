# Ticarium365 — Final launch execution rounds

Bu belge, **canlı öncesi son yürütme turları** için kontrol listesidir: mimari değişiklik veya yeni özellik içermez. Teknik taban: `docs/PRODUCTION_READINESS_CHECKLIST.md`. Geniş deploy/DNS/rollback: `docs/STAGING_PRODUCTION_EXECUTION_RUNBOOK.md`, `docs/DEPLOYMENT_RUNBOOK.md`. **İlk canlı staging** (Cloudflare, Neon, hosting, duman) için sıra: `docs/STAGING_DEPLOYMENT_PREPARATION.md`.

---

## Round 1 — Sentry gerçek aktivasyon

**Amaç:** Production’da ve (önce) staging’de hataların Sentry’ye düştüğünü **kanıtlamak**; `SENTRY_DSN` boş bırakılmamış olmalı (`scripts/verify-production-env.mjs` production gate’de zorunlu tutar).

| # | Adım | Tamam |
|---|------|--------|
| 1 | [sentry.io](https://sentry.io) üzerinde **ayrı proje** veya **environment** ayrımı: en az `staging`, `production` etiketleri (`NODE_ENV` backend’de `environment` olarak iletilir). | [ ] |
| 2 | Server DSN’i oluştur; **DSN’i yalnızca host env paneline** yapıştır (repo’ya commit yok). | [ ] |
| 3 | `RELEASE_VERSION` staging/prod için **anlamlı sabit etiket** (örn. `staging-2026-04-25-001`, git SHA kısaltması). Production’da `dev` / `local` / `latest` kullanma. | [ ] |
| 4 | API deploy sonrası **kontrollü test hatası**: örn. geçici olarak sadece staging’de çağrılan bir test uç veya `curl` ile 500 üreten bilinçli hata yoksa, Sentry’de **test capture** (Sentry UI “send test event”) veya güvenli şekilde tetiklenen tek seferlik sunucu tarafı `throw` (staging). | [ ] |
| 5 | Sentry’de event’in geldiğini doğrula: **release** alanı `RELEASE_VERSION`, **environment** doğru. | [ ] |
| 6 | Opsiyonel: e-posta/Slack **issue alert** kuralı (önerilir: yeni issue, tekrar sayısı eşiği). | [ ] |
| 7 | Startup log: `SENTRY_DSN` yoksa prod’da uyarı (`sentry.ts`); canlıda bu uyarı **görülmemeli**. | [ ] |

**Hayır sayılanlar:** DSN commit’li repo; production’da `SENTRY_DSN` boş; `RELEASE_VERSION` anlamsız etiket.

---

## Round 2 — Yedekleme / restore provası (rehearsal)

**Amaç:** Veritabanı sağlayıcısında yedek + mümkünse PITR’in **gerçekten** kullanılabildiğini göstermek; uygulama şemasının restore kopyasında tutarlı olduğunu doğrulamak.

| # | Adım | Tamam |
|---|------|--------|
| 1 | Neon (veya kullandığınız PG) panelinde: **otomatik yedek** açık; PITR / retention süresi not edildi. | [ ] |
| 2 | **Production verisine yazmadan**: yeni bir DB instance veya branch’e restore / point-in-time recovery (sağlayıcı adımları). | [ ] |
| 3 | Restore edilmiş DB için geçici `DATABASE_URL` ile: `node scripts/verify-production-schema.mjs` **OK**. | [ ] |
| 4 | Aynı URL ile: `GET /api/healthz` ve `GET /api/readyz` (geçici olarak bu DB’ye bağlı bir API kopyası veya lokal) **200**. | [ ] |
| 5 | Restore süresi (RTO hissi), sorumlu kişi, tarih — operasyon notuna (ör. `DEPLOYMENT_RUNBOOK` veya iç wiki) kaydedildi. | [ ] |

**Dikkat:** Restore hedefi **asıl production connection string’i değiştirerek** değil; izole ortamda yapılır.

---

## Round 3 — Gerçek staging deploy provası (rehearsal)

**Amaç:** Staging hostnames, env ve sıranın canlıdaki gibi **uçtan uca** çalıştığını doğrulamak.

**Uygulama rehberi (tek ekran):** `docs/STAGING_DEPLOY_EXECUTION.md` — topoloji, deploy sırası, env, Neon, Cloudflare, smoke, GO/BLOCKED.

| # | Adım | Tamam |
|---|------|--------|
| 1 | DNS: `app.staging.<domain>` ve `api.staging.<domain>` CNAME’ler hedefe gidiyor; SSL Full (strict). Ayrıntı: `STAGING_PRODUCTION_EXECUTION_RUNBOOK` §1. | [ ] |
| 2 | Ayrı **staging** `DATABASE_URL`; migration: `pnpm -C lib/db run migrate:sql`. | [ ] |
| 3 | Staging env: `.env.staging.example` ile hizala (`IYZICO_MODE=sandbox`, CORS sadece staging kökenleri, `SESSION_COOKIE_DOMAIN` staging `.domain` ile tutarlı). | [ ] |
| 4 | Deploy: API sonra frontend (mevcut runbook sırası). | [ ] |
| 5 | `pnpm run ci:gate` (staging DB URL ile) yeşil veya ekip kuralı neyse. | [ ] |
| 6 | Otomatik smoke: `SMOKE_APP_URL`, `SMOKE_API_URL`, `SMOKE_ORIGIN` set → `pnpm run smoke:staging` **tüm maddeler geçer**. | [ ] |
| 7 | Manuel: login, dashboard, Sentry’de (staging) en az bir istek/health sonrası **sessiz hata fırtınası yok**. | [ ] |
| 8 | Tenant sınırı: iki farklı subdomain davranışı runbook **§4.3** ile uyumlu. | [ ] |

---

## Round 4 — Iyzico sandbox tam ödeme testi

**Amaç:** **Sandbox** anahtarlarıyla checkout → yönlendirme → dönüş → (mümkünse) webhook zincirinin uçtan uca geçerli olduğunu kanıtlamak; **ödeme iş kurallarına dokunulmaz** — sadece test adımları.

**Önkoşul:** Staging’de `IYZICO_MODE=sandbox`, Iyzico panelinden sandbox API key, `BILLING_ALLOW_MOCK_IN_PRODUCTION` boş, mock mod yok.

| # | Adım | Tamam |
|---|------|--------|
| 1 | Giriş yapmış test kullanıcı; ücretli plan veya kredi yüklemesi UI’dan tetiklenir. | [ ] |
| 2 | `POST` checkout yanıtı **ödeme sayfası URL** veya Iyzico akışına yönlendirme sağlar (4xx/5xx yok). | [ ] |
| 3 | Iyzico **sandbox** ödeme ekranında test kartı / sandbox onayı ile işlem **başarılı** tamamlanır. | [ ] |
| 4 | Dönüş: `/api/billing/return` çağrısı **başarı senaryosunda** abonelik / ödeme durumunu tutarlı günceller (UI veya API ile doğrulama). | [ ] |
| 5 | Iyzico webhook: staging’de imzalı `POST` **kabul**; kasıtsız/yanlış imza **red**; mükerrer başarı (varsa) **idempotent** (mevcut davranış). | [ ] |
| 6 | Loglarda: beklenmeyen `BILLING_MOCK` veya `Iyzico` auth hata fırtınası yok. | [ ] |
| 7 | Production’da canlı prova: yalnız Iyzico’nun izin verdiği **minimal** canlı test; `IYZICO_MODE=production` ve `ci:deploy` / env gate kırmızı değil. | [ ] |

Ayrıntılı smoke maddeleri: `STAGING_PRODUCTION_EXECUTION_RUNBOOK` §4.4–4.5, `DEPLOYMENT_RUNBOOK` §5.

---

## Round 5 — Domain / DNS / e-posta hazırlık

**Amaç:** Müşterinin uygulamaya ve API’ye güvenle erişmesi, e-posta iletiminin (doğrulama, fatura, destek) **temel** SPF/DKIM/DMARC ile desteklenmesi.

| # | Adım | Tamam |
|---|------|--------|
| 1 | **DNS:** apex + `app` + `api` + staging CNAME’ler Cloudflare (veya DNS sağlayıcı) üzerinde; proxy ve SSL **Full (strict)**. API için cache bypass. Detay: `STAGING_PRODUCTION_EXECUTION_RUNBOOK` §1. | [ ] |
| 2 | **Cookie / CORS:** `CORS_ALLOWED_ORIGINS` ve `SESSION_COOKIE_DOMAIN` **gerçek** app/api domain’leriyle eşleşir (localhost/wildcard production’da yasak — `verify-production-env`). | [ ] |
| 3 | **E-posta gönderimi:** `SMTP_HOST` (+ auth) staging’de test mail (kayıt doğrulama veya manuel `nodemailer` benzeri akış) **ulaştı mı** kontrol. | [ ] |
| 4 | **SPF:** Tek bir SPF kaydı; posta sağlayıcının verdiği include’lar. | [ ] |
| 5 | **DKIM:** Sağlayıcıdan gelen CNAME/TXT kayıtları eklendi. | [ ] |
| 6 | **DMARC:** `_dmarc` TXT; başlangıç `p=none` ile izleme, sonra sıkılaştırma (`FIRST_100_LAUNCH_OPERATIONS` §4). | [ ] |
| 7 | **Gelen kutuları:** `destek@` / `fatura@` veya net alias; yanıt süresi sorumluluğu atandı. | [ ] |
| 8 | Iyzico / banka / SMS (NetGSM) için **bildirim** gidecek domain veya from adresi, sağlayıcı şartlarına uyuyor. | [ ] |

---

## Tur tamamlandı mı? (kısa GO özeti)

| Tur | Bitti sayılması için |
|-----|------------------------|
| 1 | Staging + prod (veya politikanız: en az prod) Sentry’de gerçek event + anlamlı `RELEASE_VERSION` |
| 2 | İzole restore üzerinde şema + health doğrulandı, not alındı |
| 3 | Staging URL’ler üzerinde smoke + manuel login tenant testi |
| 4 | Sandbox uçtan uca; prod’da sadece onaylı minimal canlı test |
| 5 | DNS/SSL, CORS/session ile uyum, mail SPF/DKIM/DMARC ve test mesajı |

Tüm turlar tamamlandıktan sonra founder launch günü için: `STAGING_PRODUCTION_EXECUTION_RUNBOOK` §6.
