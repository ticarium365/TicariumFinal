# HTTP API yüzeyi — özet envanter

Amaç: yeni geliştirici ve operatörün **hangi trafiğin nerede** aktığını tablo ile görmesi. Tüm method/path listesi değil; **Express mount** ve **policy** özeti. Tam uç listesi için ilgili router dosyalarına bakın (`artifacts/api-server/src/routes/`).

## Base URL ve sürüm

- Üretimde tipik kök: `https://<api-host>/api` (ve aynı ağaç **`/api/v1`** altında tekrarlanır).
- `app.ts` içinde ana router hem `/api` hem `/api/v1` üzerine mount edilir; çoğu uygulama uçları **iki önek ile de** aynı handler’a gider.

## Katman A — Oturum / tenant öncesi (halka açık veya imza/rate-limit)

Bu mount’lar **`tenantMiddleware` ve `enforceTenantSessionAlignment` önünde** gelir (bkz. `app.ts`).

| Alan | Örnek önek / rota | Kimlik / politika | Not |
|------|-------------------|-------------------|-----|
| Sağlık | `GET /api/healthz`, `GET /api/readyz` (ve `/api/v1/...`) | Yok | DB ping; orchestration için |
| İletişim | `POST /api/contact` | Rate limit | Form / talep |
| KVKK talep | `/api/kvkk`, `/api/v1/kvkk` | Rate limit / politika router içinde | |
| Ödeme | `POST .../billing/webhook`, ödeme dönüşü | Rate limit; webhook imzası iş kuralı | Tam path `app.ts` |
| Gelen webhook | `/api/webhooks`, `/api/v1/webhooks` | Rate limit + sağlayıcı doğrulaması | Ham body gerektiren mount sırası kritik |
| Genel halk API | `/api/public/v1/...` | **API key** (`requireApiKey`) + scope | Ürün katalog vb. |
| Mağaza / vitrin | `publicStorefront`, `aggregatorPublic` vb. | Uç bazında | Pazaryeri / sipariş yüzeyleri |
| İstemci hataları | `clientErrorsRouter` | Genelde anon | Sentry benzeri toplama |

## Katman B — Tenant + oturum hizalaması sonrası

`tenantMiddleware` → `enforceTenantSessionAlignment` → **`routes/index.ts`** ana router.

**Genel kural:** Aşağıdaki tabloda “Session” = tarayıcı **`Cookie`** ile `express-session`. Bir çok önek ek olarak **`requireFeature(FEATURES.…)`** ile paket kapsamına bağlıdır (satır içi yorumlar `index.ts` içinde).

### Oturum ve sistem

| Önek (router `.use`) | Tipik kimlik | Öne çıkan gate |
|------------------------|--------------|----------------|
| `/auth` | Session (login sonrası cookie) | Login rate limit üst katmanda |
| `/health` (router içi) | Değişebilir | Ana `healthz` ayrı mount |
| `/users` | Session + rol | Router içi `requireAuth` vb. |
| `/companies` | Session + rol | Çok kiracı yönetimi |
| `/settings`, `/firma-profili` | Session | |
| `/onboarding`, `/kurulum-skoru` | Session | Admin onboarding |
| `/subscriptions`, `/billing` | Session | Abonelik / ödeme okuma-yazma |

### Operasyonel domain (özet)

| Önek | Feature / not (çoğu satır `index.ts`) |
|------|----------------------------------------|
| `/products`, `/stock` | `INVENTORY_CORE` |
| `/sales` | `SALES_INVOICES` |
| `/customers`, `/b2b/*` | `CUSTOMERS_CRM` |
| `/suppliers`, `/purchases` | `SUPPLIERS` |
| `/stock-counts` | `STOCK_COUNTS` |
| `/finance` | `FINANCE_EXPENSES` |
| `/banking` | `FINANCE_BANKING` |
| `/finance-dashboard` | `PROFIT_DASHBOARD` |
| `/channels`, `/pricing-rules` | `MARKETPLACE_PRO` |
| `/marketplace`, `/storefronts`, `/shipping` | `MARKETPLACE_BASIC` |
| `/einvoice` | `EINVOICE_BASIC` |
| `/profit`, `/budgets`, `/ad-budgets` | `PROFIT_DASHBOARD` (çoğu) |
| `/personnel` (+ departments, leave-requests) | Path altında `HR_STAFF` |
| `/campaigns` | Path altında `CAMPAIGNS` |
| `/accountant`, `/reports-official` | `ACCOUNTANT_PANEL` |
| `/import` | `INVENTORY_CORE` |
| `/production` | `PRODUCTION_BOM` |
| `/loyalty` | `LOYALTY_POINTS` |
| `/currency` (kur) | `CURRENCY_MULTI` (+ ayrı `currency-rates` mount) |
| `/ticarium-center` | Auth |
| `/profit-engine` | Router içi paket kapıları |
| `/buyer`, `/seller` | Portal uçları |
| `/aggregator` | Path `/aggregator*` için `MARKETPLACE_PRO` |
| `/audit-logs` | Genelde süper-admin politikası (router) |
| `/dashboard`, `/reports`, … | Her router kendi `requireAuth`; bazıları ek feature |

> **Belgeler:** `documentsRouter` path-prefix’siz mount; yalnızca `/documents*` için `FEATURES.DOCUMENTS` gate uygulanır (`index.ts` içi regex).

### Admin runtime

| Önek | Not |
|------|-----|
| `/api/admin/...`, `/api/v1/admin/...` | Feature flags runtime (`featureFlagsRuntimeRouter` — `app.ts` sonrası mount; auth router içinde) |

## OpenAPI ve istemci

Tip güvenli çağrılar için frontend **`@workspace/api-client-react`** kullanır; kaynak genelde `lib/api-spec` ile üretim/hizalama pipeline’ına bağlıdır. Tek tek REST tablosunun yerine bu katman “sözleşme”yi yansıtır.

## Okuma sırası önerisi

1. `artifacts/api-server/src/app.ts` — middleware sırası (güvenlik üretiminde kritik).  
2. `artifacts/api-server/src/routes/index.ts` — mount listesi ve `requireFeature` satırları.  
3. [TEKNIK_DOKUMANTASYON.md §5–6](../docs/TEKNIK_DOKUMANTASYON.md) — tenant boundary ve auth.
