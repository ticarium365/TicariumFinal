# Ticarium365 — Deployment & launch rehearsal (P0)

Özellik eklemeyin; bu doküman **canlıya çıkış**, **staging provası** ve **geri dönüş** içindir. Son yürütme turu kontrol listeleri: `docs/FINAL_LAUNCH_EXECUTION_ROUNDS.md`.

## 1. Ortam değişkenleri (minimum)

| Değişken | Amaç |
|----------|------|
| `DATABASE_URL` | PostgreSQL (SSL önerilir) |
| `SESSION_SECRET` | Prod: ≥32 karakter, zayıf listede olmamalı |
| `NODE_ENV=production` | Güvenlik dallanması |
| `TRUST_PROXY` / `SESSION_BEHIND_PROXY` | Cloudflare / TLS sonlandırıcı |
| `SESSION_COOKIE_*` | Mümkünse kiracı başına **host-only** çerez; kök alan `.` ile paylaşım + `enforceTenantSessionAlignment` birlikte gözden geçirilmeli |
| `IYZICO_*` | Gerçek tahsilat; prod’da mock kapalı (`BILLING_ALLOW_MOCK_IN_PRODUCTION` yok) |
| `SENTRY_DSN` | 5xx hata izleme (önerilir) |
| `RELEASE_VERSION` | Sürüm etiketi |

## 2. Veritabanı

```bash
pnpm -C lib/db run migrate:sql
pnpm exec tsc -p lib/db
node scripts/verify-production-schema.mjs
# Veritabanı olmadan yalnızca derleme: SKIP_SCHEMA_VERIFY=1 node scripts/verify-production-schema.mjs
```

`verify-production-schema` başarısızsa migration eksik demektir (ör. `008_company_settings_autopilot_closed_loop.sql`).

## 3. CI / doğruluk kapısı (dürüst pipeline)

Tam monorepo `pnpm run typecheck` yeşil olana kadar:

```bash
pnpm run ci:gate
```

Bu komut: `lib/db` deklarasyon üretimi + **api-server esbuild** + şema doğrulaması + **`artifacts/prosan/dist` altında commit’li dosya yok** (`scripts/verify-no-committed-prosan-dist.mjs`) kontrolü. Frontend deploy **kaynak derlemesi** — ayrıntı: `docs/FRONTEND_BUILD_AND_DEPLOY.md`. Üretim branch’inde `ci:gate` yeşil olmalıdır.

Production deploy öncesi daha sert kapı:

```bash
pnpm run ci:deploy
```

`ci:deploy`, önce `scripts/verify-production-env.mjs` çalıştırır. Production için `SKIP_SCHEMA_VERIFY=1`, `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`, eksik `SENTRY_DSN`, eksik `RELEASE_VERSION`, eksik `IYZICO_*` veya zayıf `SESSION_SECRET` varsa deploy durur.

## 4. Pazaryeri webhook (kanal)

Üretimde (`NODE_ENV=production`) kanal hesabında **`webhookSecret` ≥ 16 karakter** yoksa inbound webhook **401** döner. Secret’ı kanal ayarlarına yazın.

## 5. Billing webhook

- Prod’da **mock** Iyzico yok: `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` zorunlu.
- Acil istisna (önerilmez): `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`.

## 6. Sağlık uçları

```bash
curl -fsS "https://API_HOST/api/healthz"
curl -fsS "https://API_HOST/api/readyz"
```

Uptime monitor önerisi:

- `GET https://API_HOST/api/healthz` — her 60 saniye, 2 ardışık hata alarm.
- `GET https://API_HOST/api/readyz` — her 60 saniye, 2 ardışık hata alarm.
- Alert kanalı: kurucu + teknik sorumlu e-posta/Slack/Discord.
- Alarm metninde release (`RELEASE_VERSION`) ve ortam (`NODE_ENV`) not edilmeli.

## 7. Yavaş sorgu (P0-7)

`scripts/pg_slow_query_audit.sql` içindeki yorumları izleyin; staging’de `pg_stat_statements` açıp en yavaş sorguları inceleyin.

Launch haftası plan:

- Staging’de `pg_stat_statements` açık olmalı.
- İlk 100 işletme boyunca her gün en yavaş 20 sorgu kontrol edilir.
- 1 saniye üstü sık tekrarlayan sorgular P1 incelemeye alınır.
- 3 saniye üstü kullanıcı akışını etkileyen sorgular launch blocker sayılır.

## 7.1 Rate limit haritası

**Otorite tablo (tek kaynak):** `docs/PRODUCTION_READINESS_CHECKLIST.md` — bölüm 5. Orada yoksa burada da yok sayılır; uç eklendikçe o dosya güncellenir. Önceki sürümler: auth/contact/public, billing webhook/return, inbound marketplace webhooks, client-errors, kayıt (auth içi).

## 7.2 Worker / ödeme alarm eşikleri

Manuel launch izleme eşiği:

- Billing webhook 5xx: 5 dakika içinde 2+ olay → ödeme akışı durdurulup incelenir.
- `BILLING_MOCK_DISABLED`: production’da görülürse Iyzico env yanlış; deploy NO-GO.
- Payment `pending` yaşlanması: 30 dakika üstü 5+ kayıt → Iyzico callback/webhook kontrol edilir.
- Marketplace worker failed job: 15 dakika içinde 10+ failed → worker logları ve provider rate limit kontrol edilir.
- Marketplace rate-limit retry: 1 saatte 20+ → kanal bazlı backoff gözden geçirilir.
- Self-heal requeue sürekli artıyorsa otomatik aksiyonlar durdurulmadan önce manuel inceleme yapılır.

## 7.3 Backup / restore kontrolü

Production database için:

- Günlük otomatik backup açık olmalı.
- Point-in-time restore varsa aktif edilmeli.
- İlk launch öncesi bir staging restore provası yapılmalı.
- Restore hedefi production değil, ayrı staging/restore DB olmalı.

Restore provası minimum:

1. Son backup’tan ayrı restore DB oluştur.
2. `DATABASE_URL` restore DB’ye çevrilmiş şekilde `node scripts/verify-production-schema.mjs` çalıştır.
3. Smoke: login, `/api/healthz`, `/api/readyz`, `/api/subscriptions/current`.
4. Restore süresi ve sorumlu kişi runbook’a not edilir.

## 7.4 P2 planlar — launch sonrası

RLS rollout:

- Önce kritik tablolar için read-only shadow policy tasarla.
- Staging’de tenant mismatch ve feature gate testleriyle doğrula.
- Audit log + backup restore provası olmadan production RLS açma.
- İlk faz: yüksek riskli tenant verileri (`customers`, `products`, `sales`, `marketplace_orders`).

İkinci ödeme sağlayıcı mimarisi:

- Mevcut `BillingProvider` interface korunur.
- Yeni sağlayıcı ayrı adapter olarak eklenir.
- Idempotency key, conversationId ve webhook signature doğrulama contract’ı değişmez.
- İlk 100 işletme launch öncesi ikinci sağlayıcı eklenmez; yalnız fallback tasarımı dokümante edilir.

## 8. Staging tam prova (P0-10) — kontrol listesi

1. Yeni şirket + subdomain + kullanıcı oluştur.
2. Giriş → ürün → satış (mutabakat).
3. Marketplace önizleme (okuma) → mümkünse sandbox kanal.
4. Billing: plan seçimi → ödeme sayfası redirect (sandbox) → return/webhook (sandbox imza).
5. İkinci kiracı ile aynı tarayıcıda **farklı subdomain**: oturum hatası / çıkış beklentisi (`TENANT_SESSION_MISMATCH` veya temiz login).
6. `tenant_default_company_fallback_used` log satırı **olmamalı** (normal prod DNS).

## 9. Dondurulacaklar (launch sırasında)

Yeni dashboard / founder bundle / analytics yüzeyi eklemeyin. Mevcut autopilot **onay semantiği** ve billing **idempotency** davranışını değiştirmeyin.

## 10. P1 borç (launch sonrası)

- **Abonelik rotaları (`/subscriptions/*`)** — `artifacts/api-server/src/routes/subscriptions.ts` hâlâ router giriş noktasıdır; plan seed ve `GET /admin/billing/metrics` ayrı modüllere taşındı:
  - `routes/subscriptions/subscriptions-plans-seed.ts` — `seedSubscriptionPlans` / `seedSubscriptionPlansV2`
  - `routes/subscriptions/subscriptions-shared-helpers.ts` — iptal/tahsilat/kullanım yardımcıları
  - `routes/subscriptions/subscriptions-admin-billing-metrics.ts` — süper-admin billing metrics kaydı (`registerSubscriptionsAdminBillingMetrics`)
- **Billing rotaları (`/billing/*`)** — `artifacts/api-server/src/routes/billing.ts` router giriş noktasıdır; implementasyon modüllere ayrıldı:
  - `routes/billing/billing-iyzico-flow.ts` — checkout / return / webhook + top-up state machine (`registerBillingIyzicoFlow`)
  - `routes/billing/billing-readonly.ts` — `credit-packs` / `payments` / `topup-summary` (`registerBillingReadonlyRoutes`)
- **Marketplace rotaları (`/marketplace/*`)** — `artifacts/api-server/src/routes/marketplace.ts` router giriş noktasıdır; domain’lere göre modüllere ayrıldı:
  - `routes/marketplace/marketplace-core.ts` — providers / accounts / mappings / pricing+stock rules / preview (`registerMarketplaceCoreRoutes`)
  - `routes/marketplace/marketplace-workers.ts` — sync jobs/logs/stats (`registerMarketplaceWorkerRoutes`)
  - `routes/marketplace/marketplace-orders.ts` — orders list/get/convert-to-sale (`registerMarketplaceOrdersRoutes`)
  - `routes/marketplace/marketplace-observability.ts` — worker observability (`registerMarketplaceObservabilityRoutes`)
  - `routes/marketplace/marketplace-self-heal.ts` — self-heal bundle (`registerMarketplaceSelfHealRoutes`)
  - `routes/marketplace/marketplace-profit.ts` — profit automation signals (`registerMarketplaceProfitRoutes`)
  - `routes/marketplace/marketplace-autopilot-mount.ts` — autopilot mount (`registerMarketplaceAutopilotRoutes`)
- Founder cockpit sadeleştirme.
