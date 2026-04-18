# Ticarium365 — Teknik Dökümantasyon

**Tarih:** Nisan 2026
**Versiyon:** Sprint B sonrası (41/41 hedef test yeşil)
**Marka:** Ticarium`365` — "365 gün işinin yanında"
**Eski adı:** SMSYSTEMS (Nisan 2026'da rebrand edildi)

---

## 1. Sistem Özeti

Ticarium365, Türk KOBİ pazarına yönelik **çok kiracılı (multi-tenant) SaaS** platformudur. Her tenant kendi `company_id` altında izole edilir ve subdomain bazlı routing kullanır. PROSAN ENDÜSTRİ ve NİHAT TURİZM şu an aktif tenant'lardır.

### Çekirdek Yetenekler

- Stok / barkod / satış yönetimi
- POS terminal ile hızlı satış
- Müşteri/tedarikçi CRM, B2B ağ + RFQ + katalog
- E-Fatura / E-Arşiv / E-İrsaliye (entegratör bağımsız)
- Pazaryeri entegrasyonu (Trendyol, Hepsiburada, N11, Amazon TR, Shopify, vb.)
- Bütçe & finansal tahmin motoru
- Net Kâr Merkezi + Gerçek Kâr Motoru (holding cost dahil)
- Hazır mağaza (storefront) + Ticarium Pazar (cross-tenant aggregator)
- Reklam bütçesi takibi (10 platform preset)
- Mali müşavir paneli + resmi raporlar
- Sadakat programı + çoklu para birimi
- Üretim & reçete (BOM) yönetimi
- Mobil uygulama (Expo)

---

## 2. Teknoloji Yığını

### Backend (`artifacts/api-server`)
- **Express 5** (Node.js)
- **PostgreSQL** + **Drizzle ORM** (type-safe)
- **Zod** schema validation
- **express-session** + **bcryptjs** auth
- **OpenAPI** spec (`lib/api-spec/openapi.yaml`) → **Orval** kod üretimi
- **esbuild** ESM bundling
- **AES-256-GCM** at-rest credential şifreleme (`lib/secret-crypto.ts`)
- **OpenAI Vision** (Replit AI proxy üzerinden) → fiş OCR

### Frontend (`artifacts/prosan`)
- **React + Vite**
- **Tailwind CSS** + **shadcn/ui**
- **@zxing/browser** kamera ile barkod tarama
- **qrcode.react** QR üretimi

### Mobil (`artifacts/smsystems-mobile`)
- **Expo / React Native**
- Müşteri arama, bakiye, alarm

### Monorepo (`pnpm workspaces`)
```
artifacts/
  api-server/        Express backend
  prosan/            Web tenant frontend
  smsystems-mobile/  Expo mobile
  mockup-sandbox/    Component preview server
lib/
  db/                Drizzle schema (kaynak)
  api-spec/          OpenAPI YAML (kaynak)
  api-client-react/  Orval ile üretilen client
  api-zod/           Orval ile üretilen Zod şemalar
docs/                Mimari dokümantasyon
```

---

## 3. Mimari Prensipler

### 3.1. Multi-Tenancy
- `company_id` her ana tabloda foreign key.
- Subdomain → `tenantMiddleware` → `req.companyId` set edilir.
- Anonim erişim gereken endpoint'ler (`/api/contact`, `/api/public/v1/...`) `tenantMiddleware`'den **önce** mount edilir.
- **TODO (Sprint D.1):** PostgreSQL **Row-Level Security (RLS)** ile DB-katmanı garantisi.

### 3.2. Provider-Agnostic Adapter Pattern
İki ana yerde tekrarlanan tasarım:

#### E-Fatura (`services/einvoice/factory.ts`)
6 sağlayıcı: `mock`, `parasut`, `qnb_efinans`, `foriba`, `logo_eflow`, `mikro`.
Ortak interface:
```ts
interface EInvoiceProvider {
  createInvoice(data): Promise<{ ok, externalId? }>
  sendInvoice(externalId): Promise<{ ok, status? }>
  cancelInvoice(externalId): Promise<{ ok }>
  getIncomingInvoices(since): Promise<{ ok, invoices }>
  healthCheck(): Promise<{ ok, message }>
}
```

#### Pazaryeri (`services/marketplace/factory.ts`)
11 sağlayıcı: `mock`, `trendyol` (gerçek), `hepsiburada`, `n11`, `amazon_tr`, `ciceksepeti`, `pttavm`, `shopify`, `woocommerce`, `ideasoft`, `ticimax`.
Ortak interface:
```ts
interface MarketplaceProvider {
  healthCheck(): Promise<{ ok, message }>
  pushStock(items): Promise<{ ok, results }>
  pushPrice(items): Promise<{ ok, results }>
  pullOrders(since): Promise<{ ok, orders }>
}
```

**Avantaj:** Yeni sağlayıcı = yeni `*-provider.ts` dosyası. Route/UI değişmez. API key beklerken stub dönmeye devam eder.

### 3.3. Atomic Transactions & Idempotency

#### `xmax = 0` MVCC tekniği (Sprint 51-55)
PostgreSQL'de bir satırın **insert mi update mi** edildiğini kanonik anlamak için:
```sql
INSERT ... ON CONFLICT (...) DO UPDATE SET ...
RETURNING id, (xmax = 0) AS was_inserted
```
Zaman penceresi heuristik'i değil — concurrent retry'lerde bile deterministik.

#### `pg_advisory_xact_lock` (Sprint 65, 73.7)
Race-safe seed ve recompute:
```sql
SELECT pg_advisory_xact_lock(65042, $companyId);
```
Transaction-scope, deadlock riski düşük. Default expense kategorileri ve aggregator winner seçiminde kullanılıyor.

#### `SELECT ... FOR UPDATE` (Sprint 55)
Sipariş→satış dönüşümünde concurrent isteği serileştirir. `convertedSaleId IS NOT NULL` ise mevcut satışları döndürür → duplicate yazım imkânsız.

#### All-or-nothing (Sprint 55)
Bir item bile eşleşemezse **custom Error throw** → Drizzle rollback → 422 `conversion_aborted` + `skipped[]`. Partial conversion'a izin yok (muhasebe netliği için).

### 3.4. Path-Prefix Discipline (Sprint 62'de bulunan kritik bug)

Express'te `router.use(middleware, subRouter)` PATH OLMADAN mount edilirse, middleware **sonraki tüm** `router.use()` kayıtlarına da sızar. Personnel router için path'siz mount, hr.staff özelliği olmayan tenant'lar için `/marketplace`, `/einvoice`, `/budgets` vb. tüm modülleri 403 ile bloke ediyordu.

**Kural:** Bundan sonra her `router.use(featureGate, sub)` mount'u açık `/path` prefix almalı. 4 regression testi koruma altında.

### 3.5. At-Rest Credential Şifreleme
`lib/secret-crypto.ts`:
- **AES-256-GCM**, key = scrypt(`SESSION_SECRET`, salt, 32 byte)
- Ciphertext prefix `enc:v1:` ile tanınır
- E-fatura/pazaryeri config'inde `apiKey, password, clientSecret, accessKey, secretKey, token` pattern'lerine uyan alanlar otomatik şifrelenir
- API response'larda asla görünmez (`********` mask)
- PUT'ta boş gönderilirse mevcut değer korunur (silinmez)

---

## 4. Tamamlanan Sprintler

### Sprint 27 — DevOps & İzleme
Temel logging, error tracking şablonları.

### Sprint 51-55 — Pazaryeri Altyapı Çekirdeği
- **Tablolar:** `marketplace_accounts`, `marketplace_mappings`, `marketplace_pricing_rules`, `marketplace_stock_rules`, `marketplace_jobs`, `marketplace_logs`, `marketplace_orders`
- `marketplace_orders` artık kalıcı tabloda (eski: `result jsonb`)
- **Unique index** `(companyId, accountId, externalOrderId)` → aynı sipariş 2 kere insert edilmez
- **Worker** (`services/marketplace/worker.ts`): 5sn interval, `xmax=0` ile insert/update ayrımı
- 11 sağlayıcı stub kayıtlı, mock tam çalışır

### Sprint 55 — Sipariş→Satış Otomasyonu
- **Endpoint:** `POST /api/marketplace/orders/:id/convert-to-sale`
- Multi-item siparişi per-product `sales` satırlarına dönüştürür
- `stock_movements` (type=sale) yazar
- `marketplace_orders.convertedSaleId` atanır
- **Product matching sırası:** mapping(externalProductId) → mapping(channelSku) → product(channelBarcode) → product(productCode) — sıralı `if` (eski `else if` bug'ı düzeltildi)
- **Idempotency:** `SELECT FOR UPDATE` + `convertedSaleId` check + `channelKey+channelOrderId` scope
- **All-or-nothing:** custom Error throw → rollback → 422
- **Frontend:** `/marketplace` "Siparişler" sekmesi (filtre: Bekleyen/Dönüştürülmüş/Hepsi, "Satışa Dönüştür" butonu, "Satış #N" rozeti)
- **Test:** 4 yeni integration test

### Sprint 62 — E-Fatura Provider Adapter
- **Tablolar:** `einvoice_settings` (companyId UNIQUE), `einvoice_outbox`, `einvoice_inbox`, `einvoice_events`
- **Atomic kilit ile çift gönderim koruması**
- **Mock provider** in-memory ETTN üretir, accept simüle eder
- **Paraşüt gerçek provider:** OAuth2 password grant, 7000s in-memory token cache, JSON:API contact upsert + sales_invoice + included details, `/e_invoices` fallback `/e_archives`
- 5 stub provider (QNB eFinans, Foriba, Logo eFlow, Mikro) — config kabul ediliyor
- Routes: `/api/einvoice/{providers,settings,health-check,outbox,inbox,events,stats}`
- Outbox status: `draft|queued|sending|sent|accepted|rejected|cancelled|failed`

### Sprint 65 — Bütçe & Tahmin Zemini
- **Tablolar:** `budgets`, `revenue_forecasts`, `cashflow_forecasts`, `expense_categories`
- **14 default TR gider kategorisi** auto-seed (Kira, Maaş, Elektrik, Su, Doğalgaz, vb.)
- **Race-safe:** `pg_advisory_xact_lock(65042, companyId)` + COUNT recheck pattern
- **Routes:**
  - `/api/budgets/comparison?period=YYYY-MM` (variance %, status: under/over)
  - `/api/budgets/forecast/revenue?basis=trend3|trend6|trend12|manual` (ağırlıklı ortalama)
  - `/api/budgets/forecast/cashflow?weeks=4` (openAR/openAP + haftalık projeksiyon)
- **Frontend:** `/butce` sayfası (CRUD, comparison tablosu, forecast grafiği)

### Sprint 64.5 — Public Marketing Site
- `PublicNav` (Hakkımızda · Amacımız · Paketler · Neden Farklıyız · İletişim)
- `/iletisim` formu → `POST /api/contact` (tenant middleware'den önce mount, IP rate limit 5/10dk)
- **Tablo:** `contact_requests`
- Super admin endpoints: `GET/PATCH /api/contact/admin`
- Karşılaştırma sayfası anonimleştirildi (Rekabet Kurulu uyumu)

### Sprint 72 — Gerçek Kâr Motoru (True Profit Engine)
**Effective-cost model:** purchase price + holding cost (rent/staff/electric per shelf-m²) + capital cost (annual%/365)
- **Tablolar:** `holding_cost_rules`, `expense_allocations`, `product_profit_snapshots` (idempotent unique idx), `inventory_turnover_metrics`
- **Daily 24h cron** per-product snapshot yazar
- Allocation: revenue / qty / category / m² / manual
- **Sayfalar:** `/gercek-kar` (top profit/losing/stagnant), `/gercek-kar/ayarlar` (admin), `/gercek-kar/oneriler` (rule-based advisor)
- **Feature flags:** `profit.holding_cost`, `profit.true_dashboard` (pkg_business+), `profit.ai_advisor` (pkg_growth+)

### Sprint 73 — e-Ticarium Merkezi (MVP shell)
`/eticarium-merkezi` — 9 sekmeli unified hub (Genel Bakış, Kanallar, Ürünler, Fiyat/Kargo Kuralları, Hazır Mağaza, Reklam, Siparişler, Karlılık).

### Sprint 73.1 — Hazır Mağaza & Müşteri Sitesi
3 tip storefront: `embedded` / `hosted` / `aggregator`. Ödeme modu: `merchant_pos` / `platform` / `whatsapp_only`.
- **Tablolar:** `storefronts`, `storefront_products`
- **Güvenlik:** PATCH whitelist, Zod paymentConfig, viewer rolüne `agreementCommissionPct`+`agreementNotes` redact, slug 23505 retry

### Sprint 73.2 — Fiyat Motoru
- **Tablo:** `price_engine_rules` (ad çakışmasını önlemek için marketplace `pricingRulesTable`'dan ayrı)
- Modlar: `markup_pct`, `markup_amount`, `fixed_price`, `cost_plus_pct`, `discount_pct`
- Yuvarlama: `nearest_1`, `nearest_5`, `ceil_99`, `ceil_95`, `psychological_9`
- Scope: channelKey + categoryFilter/brandFilter/productIds + validFrom/To + min/max + priority
- **Concurrency:** `pg_try_advisory_lock` + chunked batch upsert (500'lü)
- **Performans:** 1221 ürün için apply ≤500ms (önceden N+1)
- **Frontend:** `/fiyat-motoru` 3 sekme

### Sprint 73.3 — Kargo Yönetim Merkezi
- **Tablolar:** `shipping_zones` (cities jsonb, partial unique `WHERE is_default=true`), `shipping_rules` (desi range, freeOver, priority), `product_shipping_overrides`
- **Helper `quoteShipping`** öncelik: ürün override → şehir→bölge → priority+id ASC
- NO_ZONE/NO_RULE → `price: null + code` (silent ₺0 değil)
- Kargo firmaları: yurtici, aras, mng, ptt, ups, ceva, hepsijet, trendyol_express, sendeo, manual
- **Frontend:** `/kargo` 3 sekme (Bölgeler 81 TR şehir / Kurallar / Fiyat Sorgu)

### Sprint 73.4 — Karlılık & Kanal Kıyas
- `salesTable`'a `channelKey`, `channelOrderId`, `commissionAmount`, `shippingCost` kolonları
- Eski satışlar `channel_key=null` → `pos` olarak yorumlanır
- **Endpoint:** `/api/profit-engine/by-channel?days=30` — kanal başına ciro/COGS/komisyon/kargo/brüt/net kâr
- `/by-channel/:channelKey/top-products` (en kârlı 20)
- **Frontend:** `/karlilik-kanal` (KPI kartları, kanal karşılaştırma çubuk grafiği, zarar yazan kanallar kırmızı)

### Sprint 73.5 — Hazır Mağaza Public Render
- `/s/:slug` public sayfa (auth'suz)
- **Routes:** `/api/public/v1/storefronts/:slug` (GET) ve `POST` order
- `requireApiKey` middleware'inin **öncesinde** mount
- Atomic transaction: `orders` + `order_items` insert, sıkı stok kontrol
- Hassas alanlar (commissionPct, agreementNotes, paymentConfig içeriği) public'e sızmaz
- **Frontend:** `pages/storefront-public/index.tsx` mobile-first (sepet drawer, checkout, success)

### Sprint 73.6 — Reklam Bütçesi
- **Tablolar:** `ad_channels` (companyId+code unique), `ad_spends` (channelId+period unique)
- **10 platform preset:** Google, Meta, TikTok, X, LinkedIn, Snapchat, Pinterest, Reddit, YouTube, Trendyol Ads
- `/spends` `onConflictDoUpdate({target:[channelId,period]})` atomic upsert (race koruması)
- **Endpoints:** `/presets, /channels, /spends, /summary?period=YYYY-MM, /trend?months=6`
- KPI: ROAS, CPA, CPC, profit, budgetUsedPct
- **Frontend:** `/reklam-butce` 3 sekme

### Sprint 73.7 — Ticarium Pazar (Aggregator)
Cross-tenant merkezi pazar.
- **Tablo:** `aggregator_listings` (sourceCompanyId+sourceProductId+matchKey, marginPct, salePrice, status, chosen flag)
- `recomputeChosen(matchKeys[])` helper — `pg_advisory_xact_lock(7390737)` + `DISTINCT ON (match_key) ORDER BY sale_price ASC, id ASC`
- **DB-level invariant:** `UNIQUE (match_key) WHERE chosen=true` partial index + `UNIQUE (sourceCompanyId, sourceProductId)`
- Tüm activate/pause/update/delete/scan endpoint'leri recompute çağırır
- **Public:** `/api/public/v1/pazar?q=` — `tenantMiddleware`'den önce mount
- **Frontend:** tenant `/aggregator` (yönetim) + public `/pazar` (gezgin)

### Sprint 74 — Canlı Öncesi Sertleştirme
1. **Public rate limit:** `/api/public/v1/pazar` 60/dk, storefront POST 10/10dk, public katman 120/dk (production-only)
2. **Helmet sertleştirildi:** HSTS preload, Referrer-Policy strict, crossOriginResourcePolicy=cross-origin (Replit iframe), `trust proxy` 1
3. **Global error handler:** unknown exception generic mesaj + log; `unhandledRejection`/`uncaughtException` çökertmiyor
4. **Audit log viewer:** `/api/audit-logs` super admin (filter: action/username/companyId/from/to + `/actions` distinct + `/stats` günlük); `/super-admin/audit-logs` sayfası
5. **Tenant onboarding wizard:** `/super-admin/yeni-firma` 3 adımlı sihirbaz (firma → admin user → onay), TR karakter normalize subdomain
6. **E-mail altyapısı:** `lib/email.ts` nodemailer, `SMTP_*` env varlığında aktif, yoksa silent log
7. **Regression testleri** Sprint 73.6, 73.7, Canlı Öncesi — tümü geçiyor

### Sprint B — Trendyol Gerçek HTTP Konnektörü (en yeni)
`services/marketplace/trendyol-provider.ts`:
- **Auth:** HTTP Basic (`apiKey:apiSecret` base64)
- **Sandbox:** `stageapigw.trendyol.com/sapigw`, **prod:** `api.trendyol.com/sapigw`
- **Required creds:** `sellerId`, `apiKey`, `apiSecret`
- **Methods:**
  - `healthCheck` → `/suppliers/{id}/addresses` (hafif yetki kontrolü)
  - `pushStock` + `pushPrice` → tek endpoint `/products/price-and-inventory`, barcode bazlı
  - `pullOrders` → `/suppliers/{id}/orders` + status mapping (`created→paid→shipped→delivered/cancelled/returned`)
- `requireConfig()` helper eksik credential'ı erken yakalar
- HTTP/network hataları graceful (`ok:false + message`)
- Factory artık `trendyol` key'ini `TrendyolRealProvider`'a bağlar
- **Test:** 2 integration (gerçek HTTP / eksik config)

---

## 5. Veritabanı Şeması — Ana Tablolar

| Tablo | Amaç | Önemli Index/Constraint |
|---|---|---|
| `companies` | Tenant master | subdomain UNIQUE |
| `users` | Kullanıcılar (rol bazlı) | (companyId, email) UNIQUE |
| `products` | Ürün katalog | (companyId, productCode) UNIQUE, barcode index |
| `customers`, `suppliers` | CRM | companyId + name index |
| `sales`, `sales_items` | Satışlar | channelKey, channelOrderId, commissionAmount, shippingCost |
| `stock_movements` | Stok hareketleri | type: sale/purchase/return/transfer/production |
| `marketplace_accounts` | Pazaryeri hesapları | (companyId, provider) |
| `marketplace_orders` | Pull edilmiş siparişler | UNIQUE (companyId, accountId, externalOrderId) |
| `marketplace_mappings` | Ürün↔kanal eşleme | externalProductId, channelSku |
| `einvoice_settings` | E-fatura config (encrypted) | companyId UNIQUE |
| `einvoice_outbox/inbox/events` | Fatura akışı | UNIQUE (companyId, provider, externalId) |
| `budgets`, `revenue_forecasts`, `cashflow_forecasts` | Bütçe & tahmin | (companyId, period, scope, categoryId) UNIQUE |
| `expense_categories` | Default 14 TR kategori | companyId index |
| `holding_cost_rules`, `expense_allocations`, `product_profit_snapshots` | Gerçek kâr motoru | (companyId, productId, date) UNIQUE |
| `storefronts`, `storefront_products` | Hazır mağaza | slug UNIQUE per company |
| `aggregator_listings` | Ticarium Pazar | UNIQUE (sourceCompanyId, sourceProductId) + partial UNIQUE (matchKey) WHERE chosen=true |
| `ad_channels`, `ad_spends` | Reklam bütçesi | (companyId, code) + (channelId, period) UNIQUE |
| `shipping_zones/rules/overrides` | Kargo motoru | partial UNIQUE WHERE is_default=true |
| `price_engine_rules` | Fiyat kuralları | (companyId, name) UNIQUE |
| `audit_logs` | Sistem aksiyon takibi | timestamp index |
| `contact_requests` | Public form | createdAt index |

---

## 6. Güvenlik & Uyum

| Katman | Uygulama |
|---|---|
| Auth | session cookie (httpOnly, secure, sameSite=lax), bcrypt hash |
| Tenant izolasyonu | `req.companyId` filtreleme (uygulama katmanı); **TODO RLS** |
| Credential at-rest | AES-256-GCM, scrypt(SESSION_SECRET) key |
| API response masking | `********` for secret fields |
| Rate limit | login 20/15dk, contact 5/10dk, public pazar 60/dk, storefront POST 10/10dk |
| Helmet | HSTS preload (prod), Referrer-Policy strict, COOP/CORP cross-origin |
| Trust proxy | 1 (Replit reverse proxy ardında doğru IP) |
| Audit log | tüm kritik aksiyonlar (action/username/companyId/IP/details JSON) |
| 402 enforcement | trial/suspended planlar için `Payment Required` |
| Idempotency | payment, sale conversion, marketplace order pull |
| Input validation | Zod (whitelist PATCH, strict schemas) |
| Rekabet Kurulu uyumu | Karşılaştırma sayfası anonimleştirilmiş |

---

## 7. Test Kapsamı

**41/41 hedef test yeşil** (`tests/integration.test.mjs`):
- Sprint 51-55 (marketplace altyapı, idempotent pull)
- Sprint 55 (sale conversion: list, mapping yok rollback, mapping var convert+stok+idempotent, pull idempotency)
- Sprint 62 (e-fatura provider, mock + Paraşüt config gating)
- Sprint 65 (forecast revenue + cashflow)
- Sprint 73 (storefront, aggregator)
- Sprint 73.6 (presets, atomic upsert, summary)
- Sprint 73.7 (public pazar, stats, listings, concurrent activate-pause race)
- Sprint B (Trendyol gerçek HTTP, eksik config)
- Routing regression (hr.staff feature gate izolasyonu — 4 test)
- Canlı Öncesi (security headers, contact validation)

---

## 8. Frontend Sayfa Haritası

| Path | Sayfa |
|---|---|
| `/login` | Giriş + Ticarium365 brand |
| `/` | Dashboard (sales/stock insights) |
| `/pos` | Hızlı satış terminal (barkod odaklı) |
| `/products`, `/customers`, `/suppliers` | Ana CRUD |
| `/marketplace` | Pazaryeri (hesaplar/mappings/rules + **Siparişler tab**) |
| `/einvoice` | E-Fatura (settings/outbox/inbox/events) |
| `/butce` | Bütçe + tahmin grafiği |
| `/gercek-kar`, `/gercek-kar/ayarlar`, `/gercek-kar/oneriler` | Gerçek kâr motoru |
| `/eticarium-merkezi` | Unified commerce hub (9 tab) |
| `/magaza`, `/magaza/:id` | Hazır mağaza yönetimi |
| `/s/:slug` | Public storefront (auth'suz) |
| `/aggregator` | Ticarium Pazar yönetimi (tenant) |
| `/pazar` | Public Ticarium Pazar gezgini |
| `/fiyat-motoru` | Fiyat kural motoru |
| `/kargo` | Kargo motoru (3 tab) |
| `/karlilik-kanal` | Kanal karlılık karşılaştırma |
| `/reklam-butce` | Reklam bütçesi (3 tab) |
| `/iletisim`, `/hakkimizda`, `/paketler`, `/neden-farkliyiz` | Public marketing |
| `/karsilastir` | Anonim rakip karşılaştırma |
| `/super-admin/yeni-firma` | Tenant onboarding wizard |
| `/super-admin/audit-logs` | Cross-tenant audit log viewer |

---

## 9. Önemli Geliştirme Pratikleri

- **`lib/db/src/schema/*` kaynak**: schema değişince `npm run db:push --force`
- **`lib/api-spec/openapi.yaml` kaynak**: client (`lib/api-client-react`) ve Zod (`lib/api-zod`) Orval ile ÜRETİLİR — manuel düzenleme YASAK
- Yeni route eklerken `router.use('/path', subRouter)` formunda mount et
- Yeni provider eklerken adapter interface'e bağlı kal
- Yeni sensitive credential alanı varsa `SENSITIVE_RE` pattern'a ekle (otomatik şifreleme)
- Concurrent yazma varsa `xmax=0` veya `pg_advisory_xact_lock` kullan
- Frontend'de yeni sayfa eklerken sidebar entry + feature flag + viewer rolü guard

---

## 10. Sıradaki Sprintler

Detay için: **`docs/ROADMAP-2026-04.md`**

| Öncelik | Sprint | Süre |
|---|---|---|
| 🥇 | **C** — Hepsiburada + N11 gerçek konnektörler | 1-2 gün |
| 🥈 | **D.1** — PostgreSQL Row-Level Security | 1 gün |
| 🥈 | **D.2** — pg-boss background queue | 1 gün |
| 🥈 | **D.3** — Sentry DSN + structured tracking | 0.5 gün |
| 🥈 | **D.4** — `/api/v1/...` prefix + sürüm yönetimi | 0.5 gün |
| 🥈 | **D.5** — Rate limit konsolidasyonu | 0.5 gün |
| 🥈 | **D.6** — WebSocket / SSE canlı bildirim | 1 gün |
| 🥉 | **E** — Bütçe tahmin motoru (Holt-Winters) | 2-3 gün |
| ↻ | **F** — Backup/audit retention/perf/i18n/test 41→80+ | sürekli |

---

## 11. Dış Bağımlılıklar

- PostgreSQL (Replit yönetimli)
- OpenAI Vision (Replit AI proxy — fiş OCR)
- Trendyol Sapigw (sandbox + prod)
- Paraşüt API v4 (sandbox + prod)
- Object Storage (Replit App Storage — gelecek dosya yüklemeleri için)

**Henüz bağlanmamış:** Hepsiburada MPOP, N11 Sellers API, QNB eFinans, Foriba, Logo eFlow, Mikro, Sentry, SMTP sağlayıcı.

---

## Ek: Brand & Paketler

- Wordmark: **Ticarium**`365` (emerald 365)
- Display font: Outfit; body: Plus Jakarta Sans / Inter
- Logo mark: T`3` square
- Slogan: "365 gün işinin yanında."

**Abonelik paketleri (artan):** Stok → Ticaret → İşletme → Büyüme → Kurumsal
(Eski planlar otomatik **Kurumsal v2**'ye migrate edildi.)
