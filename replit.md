# Ticarium365

## Overview
Ticarium365 is a multi-tenant SaaS platform designed to offer comprehensive business management solutions including stock, barcode, sales, e-invoice, and marketplace management. Its primary purpose is to empower businesses with efficient inventory control, sales tracking, and streamlined customer/supplier relationship management. The platform features robust stock management with low-stock alerts, detailed sales analytics, subscription processing, and flexible role-based access control. It supports dynamic, tenant-specific branding and aims for continuous growth through advanced reporting, integrated barcode/labeling centers, and e-commerce catalog synchronization. The business vision includes expanding into a central B2B network for product discovery and RFQ, and providing an aggregator marketplace (Ticarium Pazar) for public access to curated products from suppliers.

## User Preferences
- I want iterative development.
- Ask before making major changes.
- Provide detailed explanations for complex solutions.
- Do not make changes to the `artifacts` directory unless specifically instructed.
- Do not make changes to the `lib/api-spec/openapi.yaml` file directly; it is the source for API client generation.

## System Architecture

The project utilizes a monorepo structure managed by `pnpm workspaces`.

### UI/UX Decisions
The frontend is built with React and Vite, employing Tailwind CSS and `shadcn/ui` for a modern, responsive user experience. It features dynamic branding, a persistent sidebar and header, a `TrialBanner` for trial accounts, and a multi-step `WelcomeTour` for user onboarding. The UI integrates POS terminals, data import wizards, loyalty program management, multi-currency handling, and comprehensive reporting dashboards. A public storefront (`/s/:slug`) allows anonymous visitors to browse products and place orders, adapting to tenant-specific themes and offering various payment integrations. UI elements like `EmptyState` components provide consistent user feedback, and a global command palette (⌘K) offers quick navigation. The login experience has been redesigned with a split-panel layout and enhanced password recovery workflow.

### Technical Implementations
The backend is developed with Express 5, utilizing PostgreSQL as the database, Drizzle ORM for database interactions, and Zod for schema validation. API clients and Zod schemas are generated from an OpenAPI specification using Orval. Authentication is session-based and scoped per company, ensuring tenant isolation. Barcode scanning is managed by `@zxing/browser`, and QR codes are generated with `qrcode.react`. The monorepo comprises `prosan` (frontend), `api-server` (backend), `lib/db` (database schema), and libraries for API specifications, clients, and Zod schemas. Features are controlled by a subscription-based feature flag system, enforced by `requireFeature(code)` middleware.

**Core Features:**
- **Multi-Tenancy:** Subdomain-based routing with `company_id` for database isolation.
- **User Roles:** Granular access control (`super_admin`, `admin`, `staff`, `viewer`).
- **Subscription & Payment:** Manages `trial`, `active`, `suspended` plans with `402 Payment Required` enforcement and audit logging for changes.
- **Stock Management:** Prevents negative stock, automates returns, and enforces unique product identifiers.
- **Sales Rules:** Role-based sales creation and return-only policies.
- **Error Handling:** Standardized JSON error responses and a global error handler.
- **Audit Logging:** Tracks critical system actions, including subscription changes.
- **Security:** Secure session cookies, rate limiting (including brute-force protection per IP + username), tenant isolation, idempotency for payments, and API-level business rule enforcement. Sensitive credentials are encrypted at rest using AES-256-GCM.
- **Omnichannel Sales Channels:** Product-channel listings with flexible pricing and stock engines, including an adapter framework for marketplace API integrations.
- **B2B Network:** Supports network profiles, reviews, a B2B directory, cross-tenant marketplace (`/b2b/vitrin`), and Request for Quote (RFQ) functionality for buyer-seller interactions. This includes quote response, comparison, and awarding mechanisms.
- **e-Fatura (Provider-Agnostic):** Multi-tenant e-Invoice/e-Archive module with a pluggable `EInvoiceProvider` interface supporting various providers. Features an outbox for outgoing and inbox for incoming invoices, with robust idempotency and state guards. Stub HTTP providers are implemented for testing.
- **Marketplace (Provider-Agnostic):** Multi-tenant marketplace integration framework with a `MarketplaceProvider` interface, supporting platforms like Trendyol, Hepsiburada, and N11. Includes product-channel mappings, pricing/stock rules, and a job queue for synchronization with enhanced error categorization and retry logic.
- **Profit Center & OCR:** Tenant-scoped financial overview with an OCR endpoint for automated expense form filling.
- **Accountant Panel:** Collaboration module with official report generation.
- **Data Import:** Supports CSV import for various entities.
- **POS Terminal:** Rapid sales interface for barcode-scanner focused operations.
- **Production & BOM:** Manages `production_recipes` and `production_orders` with atomic transactions for stock.
- **Loyalty & Points System:** Configurable loyalty programs integrated with sales.
- **Multi-Currency:** Manages `currency_rates` with historical data.
- **True Profit Engine:** Effective-cost model considering purchase price, holding costs, and capital cost, generating per-product profit snapshots and AI-driven recommendations.
- **Shipping Management:** Region and weight-based shipping engine with configurable zones, rules, and product overrides.
- **Pricing Engine:** Channel-based pricing rule engine with various modes and rounding options, supporting batch application and preview.
- **Aggregator (Ticarium Pazar):** Cross-tenant central marketplace listing chosen products from suppliers.
- **Ad Budget Tracking:** Multi-channel advertising expense tracking with ROI, CPA, CPC, and profit calculations.
- **Karlılık & Kanal Kıyas (Profit & Channel Comparison):** Analyzes sales performance by channel.
- **Public Marketing Site:** Provides anonymous access to marketing pages and contact forms.
- **Notification Hub:** A centralized service for in-app notifications, ensuring deduplicated and atomic delivery of system-critical events and budget alerts.
- **System Health Page:** Super admin-gated page providing internal health checks for DB, object storage, SMTP, and runtime metrics, including status, latency, and auto-refresh.
- **Setup & Usage Score:** A checklist-based scoring system for tenant onboarding and feature adoption, with deep links for completion and super-admin overview.
- **Company Profile:** Tabbed page for managing company identity, operations, fixed costs, performance metrics, and a built-in payroll calculator based on Turkish regulations.
- **Architecture Documentation:** `ARCHITECTURE.md` provides a high-level overview of integration lines, adapter patterns, worker patterns, and the finance ledger.

## External Dependencies

- **PostgreSQL**: Primary database for data storage.
- **Drizzle ORM**: Used for database interactions.
- **Zod**: Utilized for schema validation.
- **Orval**: Generates API clients and schemas from OpenAPI specifications.
- **express-session**: Manages user sessions.
- **bcryptjs**: For secure password hashing.
- **@zxing/browser**: Facilitates camera-based barcode scanning.
- **qrcode.react**: Generates QR codes within the UI.
- **Tailwind CSS**: Provides utility-first styling.
- **shadcn/ui**: Offers a collection of reusable UI components.
- **OpenAI Vision**: Integrated for OCR functionality, particularly for receipt processing.
- **multer**: Handles file uploads, used in data import features.
- **Sentry**: Optional integration for error tracking.
- **SMS Provider Adapter**: Pluggable interface for various SMS providers (e.g., NetGSM, İletimerkezi, Vatansms).
- **Expo Push**: Used for sending mobile push notifications.
- **Trendyol Sapigw**: API for marketplace integration, covering product, price, and order synchronization.
- **Hepsiburada MPOP API**: API for marketplace integration, covering product, price, and order synchronization.
- **N11 API**: API for marketplace integration, covering product, price, and order synchronization.
- **Paraşüt API**: Integrated for e-Invoice functionalities via OAuth2.
- **TCMB EVDS**: Provides exchange rate data.

## Sprint H (v3) — Test Suite Auth + Subscription Repair + Prod Hardening (TAMAM)
- `node --test integration.test.mjs` (484 test) tam yeşil — exit=0, 0 fail (concurrency=8, ~115s).
- **Auth seed kapsamı tam**: `seedDefaultUsers` artık 8 kullanıcı: `admin/admin123`, `talha/talha123`, `nihat/nihat123`, `nihat_admin/nihat123`, `cenan/cenan123`, `superadmin/superadmin123` (rol=`super_admin`, enum-uyumlu), `personel/staff123`, `goruntule/staff123`. Dev/test'te parola hash'leri otomatik tazelenir (`bcrypt.compare` mismatch → rehash).
- **Production bootstrap hardening**: `seedDefaultUsers` `NODE_ENV=production`'da otomatik çalışmaz; tek seferlik bootstrap için `SEED_DEFAULT_USERS=1` env override gerekir → deterministik default-credential expose riski kapatıldı.
- Test fixture standardize: `cenan→admin`, `admin123/nihat123/superadmin123` unified.
- Sprint 11 fixture v2 paket geçişi: testler `free/starter/pro/enterprise` → `pkg_inventory/pkg_trade/pkg_growth/pkg_enterprise_v2` (seed v2 legacy slug'ları otomatik deactivate ediyor — production migration korundu).
- **Kritik isolation fix (Sprint 11 STRICT after())**: PROSAN'ı `pkg_growth/yearly/active`'e geri yükler + assert-driven doğrulama (plans 200, growth bulunur, subscribe 201, /current → active+pkg_growth). Aksi halde Sprint 12/22/23/73 (documents/hr.staff/campaigns/marketplace.*) FEATURE_LOCKED 403 cascade'i.
- **Tenant string normalize**: line ~1166 "co2 tedarikçisi co1'den görünmez" `tenant="nihat"` → `"nihatturizm"` + supplier-create 201 explicit assert (silent early-return kaldırıldı, false-positive kapanışı).
- **Sprint 62 before() düzeltme**: einvoice plan bootstrap loop'u `["prosan", "nihat"]` → `["prosan", "nihatturizm"]` + nihat-side credentials `nihat_admin/nihat123` (önceden mismatch vardı).
- Architect 4 tur (FAIL → FAIL → PASS → PASS) — milestone kabul.
- **Deferred (sıradaki sprint'e)**: per-suite isolated-fixture rewrite, talha cross-suite plan-coupling refactor, clean-DB bootstrap re-validation. Bunlar 484-pass için bloklayıcı değil.

## Sprint H — Buyer Portal × PROSAN Birleşmesi (TAMAM)
- Buyer-portal sayfaları PROSAN içine taşındı: artifacts/prosan/src/pages/satinalma/{Discovery,NewRfq,Rfqs,SellerInbox,index}.tsx — tüm internal navigation /satinalma/* prefix'ine güncellendi (Discovery "Teklif İste" + NewRfq onSuccess redirect dahil).
- Tek API host, tek auth, tek subdomain — backend hiç değişmedi.
- App.tsx: 6 yeni ProtectedRoute (/satinalma, /satinalma/kesfet, /satinalma/rfqs, /satinalma/rfqs/new, /satinalma/rfqs/:id, /satinalma/inbox).
- nav-config.ts: NavGroup ve NavItem tiplerine accountTypes?: Array<"buyer"|"seller"|"both"> alanları eklendi. Yeni "satinalma" grubu (5 item, item-level accountType filtreli).
- layout.tsx + command-palette.tsx: visibleGroups → group-level + item-level accountType filtresi (her iki nav yüzeyinde tutarlı).
- E2E PASS: admin (both) login → tüm 5 satinalma item görünür; Discovery → "Teklif İste" → /satinalma/rfqs/new?sellerId=X; NewRfq submit → /satinalma/rfqs/:id (404 yok).
- Eski buyer-portal artifact bozulmadı (geçiş sürecinde yedek olarak duruyor).
- **C1 — Buyer-portal decommission (2026-04-20)**: Geçiş tamamlandığı için yedek artifact `artifacts/buyer-portal` tamamen kaldırıldı. Workflow + artifact registration + dizin silindi (`pnpm-workspace.yaml` `artifacts/*` glob, otomatik). Backend `routes/buyer-portal.js` (buyer/seller routes) PROSAN tarafından kullanıldığı için DOKUNULMADI. Re-test: **488/488 PASS, exit=0, ~67s**. Aktif artifacts: api-server, prosan, smsystems-mobile, mockup-sandbox.
- **C2 — smsystems-mobile audit (2026-04-20)**: Expo tabanlı, gerçek aktif mobil ürün (app/_layout.tsx, app/(tabs), app/login.tsx, @workspace/api-client-react bağımlılığı). Workflow `artifacts/smsystems-mobile: expo` aktif. Decommission KAPSAM DIŞI — canlı ürün olarak korunuyor. Sprint 70 mobil push entegrasyonunun konsumeri.

## Sprint B (Test Hardening) — Per-suite isolated fixtures + plan-coupling kırma + clean-bootstrap re-validation (TAMAM, 2026-04-20)

**B1 + B2 (per-suite isolated plan fixtures + talha cross-suite plan-coupling refactor)**:
- `tests/integration.test.mjs` üst seviyede yeni helper: `ensureTenantPlan(tenant, slug, cycle)` — idempotent, sadece mismatch varsa superadmin set-plan çağırır. `_saJarCache` ile süperadmin login bir kere yapılır.
- Cross-suite plan-coupling kıran defansif `before()` injection — Sprint 11 STRICT after()'a load-bearing bağımlılık kalktı:
  - Sprint 12 (Dosya/Evrak) — mevcut before() içine ensure (PROSAN→pkg_growth/yearly).
  - Sprint 21 (Akıllı Bildirim) — yeni before() eklendi.
  - Sprint 22 (Personel Yönetimi) — yeni before().
  - Sprint 23 (Kampanya & İndirim) — yeni before().
  - Sprint 73.6 (Reklam Bütçesi) — mevcut before()'a inject.
  - Sprint 73.7 (Ticarium Pazar) — mevcut before()'a inject.
- Sprint 11 after() restore-mantığı korundu (belt-and-suspenders) ama artık tek savunma hattı değil.

**B3 (clean-DB bootstrap re-validation)**:
- API server workflow restart edildi (cold start ~5s + seedDefaultUsers idempotent rehash). Restart sonrası **488/488 PASS, exit=0, ~64s, concurrency=8** — bootstrap akışı stable.

**B4 (bootstrap docs)** — Geliştirici için 1-page özet:
1. **Seed**: API server cold-start'ında `seedDefaultUsers()` 8 kullanıcı yaratır/refresh eder (admin, talha, nihat, nihat_admin, cenan, superadmin, personel, goruntule). Production'da `SEED_DEFAULT_USERS=1` env override gerekir (deterministik default-credential expose riski kapatıldı).
2. **Plan seeding**: `pkg_inventory/pkg_trade/pkg_business/pkg_growth/pkg_enterprise_v2` v2 paketleri seed; legacy `free/starter/pro/enterprise` deactivate. PROSAN baseline = pkg_growth/yearly; NİHAT bootstrap'ta plansız (testler kendi plan zeminini ensure'lar).
3. **Test fixture (tek-seferlik dev/test)**: Tek runner host (localhost:8080), tek `integration.test.mjs` (488 test, 63 suite). Her plan-sensitive suite `ensureTenantPlan(...)` ile kendi zeminini garantiler (cross-suite coupling yok).
4. **Sprint H (CAS)**: Concurrent set-plan'ler için per-company advisory lock + FOR UPDATE row lock + opsiyonel `expectedSubscriptionId` precondition. Test helper `__test_cancel_active` (NODE_ENV !== "production" guard) no-row baseline için.
5. **Komutlar**: `pnpm install` (root) → `pnpm --filter @workspace/api-server dev` → `cd artifacts/api-server && node --test --test-concurrency=8 tests/integration.test.mjs`.

Final: **488/488 PASS, restart-stable, plan-coupling kırılmış**.

## Master Backlog (mimari odaklı sıra)
| # | Sprint | Açıklama | Durum |
|---|---|---|---|
| 0 | Sprint 51-55, 62, 65, 70 + Frontend UI | E-Fatura UBL-TR + Bütçe & Tahmin + Marketplace hardening + canonical ledger + PROSAN UI | TAMAM |
| 1 | **Sprint A — Architect Regression Tests** | Forecast aliases (avg/slope/label ↔ legacy categoryName/trendSlope/forecast invariant + finiteness + totalForecast≈Σ tolerans) + months clamp [2,12] + invalid period 400 + e-fatura outbox `lastResponse.xml` (UBL `<Invoice` root, mock fallback numeric PayableAmount, non-TRY USD DocumentCurrencyCode propagation, multi-line + AllowanceTotalAmount discount math) — `tests/integration.test.mjs` describe "Sprint A — Architect regression: forecast aliases + outbox XML" **6/6 PASS**. **Sprint A re-validation (2026-04-19)**: Sprint 10 izolasyon testi `pkg_trade` 403 sorunu — 4-round architect iterasyonu sonunda **PASS** (Verdict: Sprint A DONE, with conscious CAS trade-off): (a) **Feature-based fail-CLOSED guard** — `GET /subscriptions/features` 200 değilse mutation skip; aksi halde `isAllUnlocked` veya `features.includes("finance.expenses")` doğru NO-OP (slug whitelist yerine semantic check, pkg_business/trial wildcard/future plans dahil). (b) **State-preserving teardown** — `before()` GET `/subscriptions/current`'tan nihatPrePlan capture; pre-state okunamazsa mutation YAPMA (risky pkg_trade fallback kaldırıldı). `after()` lost-update guard ile yalnızca mevcut plan hala UPGRADE_TARGET=`pkg_growth/monthly` ise restore. (c) **Multi-dimension deterministic delta invariant** — paymentMethod="bank" ile unique marker expense insert; nihat: totalExpenses=+marker, netProfit=-marker, revenue=0, totalCashBalance=0; cenan: hepsi 0 (4 dim × 2 tenant = 8 kausal cross-tenant leak invariant); finally cleanup DELETE. (d) Backend CAS/version precondition Sprint H ileri sertleştirme olarak deferred — sequential test runner'da TOCTOU low-prob. **484/484 PASS, exit=0, ~66s, concurrency=8** | TAMAM |
| 1.1 | **Sprint H (CAS/Version Precondition) — 3-round architect PASS (2026-04-20)** | Sprint A 4. round'dan deferred backend hardening: `/admin/billing/set-plan` lost-update koruması. **Round 1**: optional `expectedSubscriptionId` body field + TX içinde `SELECT ... FOR UPDATE` ile aktif/grace satır lock + CAS check; mismatch → 409 `subscription_version_mismatch` + `currentSubscriptionId`. Sprint 10 teardown CAS-aware (201 veya 409 OK). 2 yeni test (T1 roundtrip stale 409→refresh 201, T2 backward-compat). **Round 2**: per-company `pg_advisory_xact_lock(signedKey)` (key = `(0x53455450 << 32) | companyId & 0x7fff...`) — no-row case'de bile tx'leri serileştirir, null-precondition gap kapanır. 23505 unique-violation → 409 mapping (refresh select ile fresh `currentSubscriptionId`). 5-paralel race testi: aynı `expectedSubscriptionId` ile 5 concurrent set-plan → tam 1×201 + 4×409 deterministik. **Round 3**: 23505 mapping constraint adıyla daraltıldı (`company_subscriptions_active_per_company_uq` only) — diğer unique ihlalleri yanıltıcı sınıflanmaz. TEST-ONLY endpoint `POST /admin/billing/__test_cancel_active` (NODE_ENV !== "production" guard, requireSuperAdmin) ile no-row baseline. Null-precondition race testi: clear → 2 paralel `expectedSubscriptionId: null` → tam 1×201 + 1×409 + final invariant `conflict.currentSubscriptionId === winner.subscription.id`. **Architect Round 3 verdict: PASS**. Toplam delivery: backend (CAS + advisory lock + FOR UPDATE + narrowed 23505 mapping + test endpoint) + 4 yeni test (T1 CAS roundtrip, T2 backward-compat, T3 5-paralel race, T4 null-precondition race). **488/488 PASS, exit=0, ~64s, concurrency=8**. Architect optional follow-up (deployment hardening, ertelendi): explicit ENABLE_TEST_ENDPOINTS opt-in flag + NODE_ENV startup health-check + CI test that __test endpoint returns 404 in prod. | TAMAM |
| 1.5 | **Sprint I — Satınalma Hesabı (purchasing) refinement** | `accountType="purchasing"` üçüncü tip; `nav-config.isVisibleForAccount` whitelist; sade 5 item menü (Satınalma Merkezi · Menü Tercihleri · Marka & Logo · Firma Profili · Kullanıcılar); `/satinalma-merkezi` sayfası (filtre/arama/sort, xlsx+CSV+PDF export, favori toggle, iletişim/karşılaştırma modal, "Tekliflerim" link); `/b2b/catalog/marketplace` SADECE `isPublished=true` VE (`sourceProductId IS NULL` OR `products.stock > 0`) — onaylı + stoklu vitrin | TAMAM |
| 1.6 | **Sprint I Phase 1 — Satınalma Merkezi şartname revizyonu** | Schema: `companies.city` (text) + `companies.isVerified` (bool) eklendi (drizzle push); `/b2b/catalog/marketplace` response'a `companyCity / companyVerified / productBrand / productStock` alanları + filtreler `city, brand, minOrderQty≤, fastOnly (leadDays≤3), certifiedOnly`; yeni endpoint'ler `/marketplace/cities` + `/marketplace/brands` (sadece aktif vitrin firmaları); frontend tablo kolon düzeni şartname uyumlu — **Ürün · Firma · Kategori · Şehir · Fiyat · Stok · Teslim Süresi · İşlem**; ekstra filtreler (Şehir/Marka select, Min sip. ≤ input, Hızlı/Sertifikalı/Favori checkbox); satır aksiyonları (Teklif İste · Firma Profili `/magaza/:subdomain` yeni tab · Favori · İletişim · Karşılaştır); Sertifikalı rozeti (ShieldCheck) firma adı yanında; Hızlı teslim ikonu (Zap) leadDays≤3'te; xlsx export 11 kolon (Marka · Şehir · Sertifikalı · Stok dahil); Sprint A regression 6/6 PASS (Phase 1 değişiklikleri non-breaking) | TAMAM |
| 2 | **Sprint B — Notification Hub Entegrasyonu** | `services/notifications/dispatch.ts` tek noktadan in-app yazım + günlük dedup (pg `pg_advisory_xact_lock` ile concurrent serileştirme); `dispatchBudgetAlerts` (severity → `budget_alert_critical/warning/info`, `entityType="budget"`, **`hashPeriod(period, type, categoryId)` → period+type+categoryId boyutuna duyarlı dedup** — aynı kategori farklı dönem aynı gün içinde AYRI kayıt); `dispatchEinvoiceEvent` (`einvoice_sent/failed/cancelled`, `entityType="einvoice_outbox"`, `bypassDedup=true` → status değişimleri her seferinde görünür); wiring: `routes/budgets.ts` recompute + `routes/einvoice.ts` send/cancel branch'ları; frontend `pages/notifications/index.tsx` ICON_MAP'e 6 yeni tip + entity tipi tabanlı deep-link (`/butce`, `/einvoice?outbox=:id`); `pages/einvoice/index.tsx` `?outbox=:id` query parse → `outbox-row-${id}` scroll + 3.5s primary-ring highlight pulse; regression `tests/integration.test.mjs` describe "Sprint B — Bütçe alarmları + e-fatura olayları → bildirim merkezi" **5/5 PASS** (dispatch idempotency, budget_alert_* listede görünür, einvoice send sonrası notification, entityId değişince yeni kayıt, **fixture-controlled period dimension dedup → disjoint entityId**); architect 2. round PASS | TAMAM |
| 3 | **Sprint C — Marketplace Worker UI** | `routes/marketplace.ts` `parseJobMeta(row)` türetilmiş alanlar: `errorCategory` (`rate-limit\|permanent\|transient`, lastError prefix `[kalıcı/rate-limit/geçici]`'den parse), `errorMessage` (cleaned), `nextRetryAt` (ISO, retry penceresi açıkken), `retryAvailable` (boolean: scheduledAt gelecekte + attempt<max + non-permanent + non-completed); `GET /marketplace/jobs` her satıra spread eder; frontend `pages/marketplace/index.tsx` `JobsTab` tek paylaşımlı 1s tick (per-row interval yerine), `JobRow` sub-component: status badge (completed=default, failed=destructive, queued/running=secondary), kategori rozetleri (Kalıcı=AlertOctagon destructive, Hız Limiti=Hourglass amber-500, Geçici=Clock secondary), `attemptCount/max` exhausted durumda destructive bold, retry timer canlı geri sayım (`Xd YYs sonra`, font-mono tabular-nums amber-600), permanent için "Tekrar yok", limit dolduysa "Limit doldu"; data-testid: `job-cat-${id}`, `job-retry-${id}`, `job-row-${id}`; regression `tests/integration.test.mjs` "Sprint C — GET /marketplace/jobs response'unda errorCategory + nextRetryAt + retryAvailable türetilmiş alanları yer alır" **1/1 PASS** | TAMAM |
| 4 | Sprint D (eski 71) — Buyer Portal Foundation | Schema (`accountType`, `buyer_*`), buyer-portal artifact iskeleti, auth | TAMAM (Sprint H ile birleşti) |
| 5 | Sprint E (eski 72) — Buyer Discovery + RFQ | Firma/ürün listesi + multi-seller RFQ submit + satıcı RFQ Inbox + lead düşürme | TAMAM |
| 6 | Sprint F (eski 73) — Quote Response & Comparison | Satıcı yanıt formu + buyer karşılaştırma ekranı + accept/reject + audit | TAMAM |
| 7 | Sprint G — POS → E-Fatura "Satıştan Otomatik" UI | Backend `POST /einvoice/from-sales` (Sprint 62) — `saleIds: number[]` validasyonu (boş→400, geçersiz→400, var olmayan→404, müşterisiz satış→400, viewer rolü→403), aynı müşteriye ait satışları birleştirir, sender'ı `einvoice_settings.config`'ten okur (`senderVkn` zorunlu), receiver'ı müşteri tablosundan kurar, satış satırlarını UBL line'larına map'ler (default %20 KDV), `einvoice_outbox` row insert eder + provider üzerinden `lastResponse.xml` üretir, `outbox.saleId` ile origin trace; frontend `pages/sales/history.tsx` her satışa müşterili ise `quick-invoice-${id}` butonu (FileText ikonu blue-600), `openQuickInvoice(saleId)` Dialog açar (max-w-3xl), `previewLoading` Loader2 spinner, `previewOutbox` döndüğünde Alıcı/Toplam/Para birimi grid + slate-950 dark XML viewer (`einvoice-xml-preview` testid, font-mono whitespace-pre-wrap), durum mesajı, "E-Fatura Listesine Git" navigation + "Gönder" butonu (draft/failed/queued statülerinde aktif); **Architect 4. round hardening (II) — RESERVE-FIRST + provider hata cleanup + deterministik polling**: (a) `uniqueIds.length !== sales.length` → **404 + missing[]** (kısmi liste sessizce devam etmiyor); (b) **uygulama-katmanı idempotency**: tek saleId için iptal/red dışı outbox varsa sent/accepted/sending → **409 + existingOutboxId**, draft/queued/failed → **200 + reused=true**; (c) **DB-katmanı race-safe garanti**: `einvoice_outbox_active_per_sale_idx` partial unique index `(companyId, saleId) WHERE status NOT IN ('cancelled','rejected')` — `'reserving'` da unique kapsamında; (d) **RESERVE-FIRST pattern**: önce `status='reserving'` placeholder INSERT atılır → DB index yarışı arbitrate eder → SADECE kazanan `provider.createInvoice` çağırır (mükerrer harici fatura imkânsız) → row provider sonucuyla update edilir; kaybedenler 23505 alır + 25ms×40 polling ile kazananı bekler — settled (status !== 'reserving') görürse **200 + reused=true + raceWon=false**, polling timeout sonu hâlâ 'reserving' ise yanıltıcı başarı vermez **503 + reserve_pending + Retry-After: 1**; (e) **provider hata cleanup**: winner provider.createInvoice throw ederse placeholder 'failed'e çekilir (statusMessage + lastResponse.error yazılır) → satır asla 'reserving'de kilitli kalmaz → idempotency-katmanı 'failed' satırı 200/reused olarak döndürdüğü için sonraki istekler reuse edip kullanıcıya retry imkânı verir; (f) test sertleştirildi (`__test_mock_counter` + `__test_mock_fail_next` endpoint'leri, NODE_ENV !== production'da açık): sender VKN PUT setup + 201 zorunlu + idempotent reuse aynı id + sent → 409/existingOutboxId + 5 paralel POST → `Set(ids).size === 1` + tam 1 created/4 reused + **KRİTİK: `provider.createInvoice` tam 1 kez çağrıldı** invariant; regression "POS → from-sales köprüsü — validation kontratı" suite altında **11/11 PASS** (validation 5 + happy 1 + sent-409 1 + concurrency-with-counter 1 + partial 1 + provider-fail-cleanup 1 + reserve-pending-503 1) + (g) **pre-check 'reserving' guard**: idempotency pre-check'i de aynı bounded polling + 503 davranışını uygular → late-loser hiçbir branch'te 'reserving' satırını 'reused' olarak görmez; **Architect 4. round (III) PASS** (her iki blocker — provider-error cleanup + reserving-asla-reused — hem 23505 collision hem pre-check branch'inde kapatıldı) | TAMAM |
