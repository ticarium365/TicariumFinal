# Ticarium365

## Overview
Ticarium365 is a multi-tenant SaaS platform providing comprehensive stock, barcode, sales, e-invoice, and marketplace management solutions. It enables businesses to efficiently control inventory, track sales, and manage customer/supplier relationships. Key features include robust stock management with low-stock alerts, detailed sales analytics, subscription and payment processing, and a flexible role-based access control system. The platform is designed for dynamic, tenant-specific branding and aims for continuous expansion with advanced reporting, integrated barcode/labeling centers, and e-commerce catalog synchronization.

## User Preferences
- I want iterative development.
- Ask before making major changes.
- Provide detailed explanations for complex solutions.
- Do not make changes to the `artifacts` directory unless specifically instructed.
- Do not make changes to the `lib/api-spec/openapi.yaml` file directly; it is the source for API client generation.

## System Architecture

The project uses a monorepo structure managed by `pnpm workspaces`.

### UI/UX Decisions
The frontend is built with React and Vite, styled with Tailwind CSS and `shadcn/ui` for a modern, responsive user experience. It features dynamic branding, a persistent sidebar and header, a `TrialBanner` for trial accounts, and a multi-step user onboarding wizard (`WelcomeTour`). The UI supports integrated POS terminals, data import wizards, loyalty program management, multi-currency handling, and comprehensive reporting dashboards. A public storefront (`/s/:slug`) allows anonymous visitors to browse products and place orders, adapting to tenant-specific themes and offering various payment integration options.

### Sprint A — Architect Regression Tests (yeni)
- `tests/integration.test.mjs` sonuna `Sprint A — Architect regression: forecast aliases + outbox XML` describe'ı eklendi.
- **T1 PASS**: `GET /budgets/forecast/expenses` hem alias (`avg`/`slope`/`label`) hem legacy (`categoryName`/`trendSlope`/`forecast`) keys döndürüyor; `slope===trendSlope`, `label===categoryName` kontratı assert ediliyor.
- **T2 PASS**: `POST /einvoice/outbox` → `GET /einvoice/outbox/:id` akışında UBL-TR XML `lastResponse.xml` JSONB içinden okunabiliyor (schema'da `rawXml` kolonu yoktur). 
- **MockEInvoiceProvider sertleştirildi**: `createInvoice()` artık `buildInvoiceXml()` ile gerçek UBL-TR XML üretip `raw.xml`'e koyuyor (önceden `getInvoiceXml`'de basit fake XML vardı; route fallback'i için yetersizdi). Tüm provider'lar artık aynı XML kontratını sağlıyor (mimari tutarlılık).

### Sprint B — Notification Hub Entegrasyonu (PASS, architect onaylı)
- **Yeni servis** `services/notifications/dispatch.ts`: tek-nokta in-app notification yazıcı.
  - `dispatchNotification()` günlük dedup'lı; `db.transaction` + `pg_advisory_xact_lock(lockKey)` ile atomik (race-driven dup yok). LockKey = FNV-1a 64-bit hash (companyId+type+entityType+entityId+dayBucket).
  - `dispatchBudgetAlerts()` BudgetAlert[]'i `budget_alert_critical/warning/info` olarak yazar; orphan_expense (categoryId null) için `hashPeriod()` deterministik **negatif** integer entityId üretir (gerçek pozitif categoryId'lerle çakışmaz).
  - `dispatchEinvoiceEvent()` outbox state-change'i (`einvoice_sent/failed/cancelled`) bell'e düşürür; `bypassDedup:true` (her geçiş görünür).
- **notification-rules ile ilişki**: rules engine kullanıcı tercih/kanal katmanı; dispatch sistem-kritik olaylar için doğrudan in-app yazar (architectural note dosya başında belgelendi).
- **Endpoint'ler**: `POST /budgets/alerts/dispatch` (computeBudgetAlerts→dispatch, `{period,created,deduped,total}` döner); `/einvoice/outbox/:id/send|cancel` route'ları success+failure'da fire-and-forget `dispatchEinvoiceEvent` çağırır.
- **Frontend**: `notification-center.tsx` TYPE_CONFIG genişletildi (TrendingDown, FileText, FileX, FileMinus ikonlarıyla 6 yeni tip).
- **Testler (4/4 PASS)**: idempotent dedup; budget_alert_* listede görünür; e-fatura outbox→notification (state-coupled assert + 3s/100ms polling); dedup günlük entity-bazlı.

### Sprint C — Marketplace Worker UI (PASS, architect onaylı)
- **Backend** `routes/marketplace.ts` GET /jobs response'u zenginleştirildi: `parseJobMeta()` worker'ın `lastError` prefix'inden (`[kalıcı|rate-limit|geçici] msg`) `errorCategory` (permanent|rate-limit|transient) + `errorMessage` parse eder; `nextRetryAt` (scheduledAt > now ∧ attempts < max ∧ !permanent ∧ status != completed iken ISO döner) ve `retryAvailable: boolean` türetilir.
- **Frontend** `pages/marketplace/index.tsx` Jobs tabı 9 sütuna genişledi:
  - Hata Tipi badge'leri: Hız Limiti (amber+Hourglass), Kalıcı Hata (destructive+AlertOctagon), Geçici (secondary+Clock).
  - Deneme `attemptCount/maxAttempts` (limit dolduysa kırmızı font-bold).
  - Sonraki Tekrar — canlı countdown ("3d 42s sonra"), 'Tekrar yok' / 'Limit doldu' / 'Sırada' durumları.
  - **Tek paylaşımlı 1s tick** (per-row interval yerine `JobsTab` parent'ında; `needsTick` false ise hiç çalışmaz).
  - Hata Mesajı: truncate + tooltip.
- **Test (1 PASS)**: Sprint C — GET /marketplace/jobs response shape (errorCategory enum, retryAvailable boolean, retryAvailable=true ⇒ nextRetryAt set).
- **Tech-debt notu**: Mimari olarak kategori `sync_jobs` tablosuna structured kolon olarak yazılmalı (text-prefix heuristic format-fragile). Sprint H+ için bekletildi.

### Master Backlog (mimari odaklı sıra)
1. ✅ Sprint A — Regression tests
2. ✅ Sprint B — Notification Hub Entegrasyonu (atomic dispatch + bell entegrasyonu)
3. ✅ Sprint C — Marketplace Worker UI (kategori badge + canlı retry countdown)
4. Sprint D (eski 71) — **Buyer Portal Foundation**: `companies.accountType` + `buyer_*` tablolar + `artifacts/buyer-portal` artifact iskeleti + auth ← SIRADAKİ
5. Sprint E (eski 72) — Buyer Discovery + RFQ (firma/ürün listesi + multi-seller RFQ + satıcı RFQ Inbox)
6. Sprint F (eski 73) — Quote Response & Comparison
7. Sprint G — POS → E-Fatura "Satıştan Otomatik" UI
8. Sprint H — Marketplace tech-debt: `sync_jobs.errorCategory` structured kolon + log join

### Sprint 86 — Command Palette (⌘K)
- `components/nav-config.ts` yeni paylaşılan modül: `NavItem`, `NavGroup`, `NAV_GROUPS` tek kaynaktan; layout sidebar ve command palette aynı veriyi tüketir (circular import riski yok).
- `components/command-palette.tsx`: ⌘K / Ctrl+K ile açılan global hızlı geçiş; rol-filtreli sayfa listesi + Quick Access (Dashboard, e-Ticarium Merkezi, Bildirimler).
- Layout en alta `<CommandPalette />` mount edildi.

### Sprint 82 — UX/UI + Auth Overhaul (in progress)
- **Login redesign**: split-panel layout (sol marka tanıtımı + sağ form), `autocomplete="username/current-password"` Chrome HIBP "veri ihlali" uyarısını susturur, "Şifremi unuttum" linki, şifre göster/gizle butonu.
- **Şifremi Unuttum** (3 adımlı sihirbaz `/sifremi-unuttum`): telefon → SMS 6 haneli kod → yeni şifre. Phone enumeration koruması (her zaman aynı yanıt), 5 deneme limiti, 10 dk kod TTL, 15 dk reset token TTL, atomik token tüketimi (race-safe).
- **Backend**: `POST /forgot-password|verify-reset-code|reset-password` (auth.ts) + ortak `passwordResetRateLimit` (15dk/10), hem `/api/auth/*` hem `/api/v1/auth/*` üzerinde.
- **DB**: `users.phone` + `password_reset_tokens` (companyId tenant izolasyonu, codeHash, resetTokenHash, attempts, consumed).
- **Tema**: light/dark token ayrımı, soft-blue açık tema.

### Technical Implementations
The backend is powered by Express 5, using PostgreSQL as the database with Drizzle ORM and Zod for schema validation. API clients and Zod schemas are generated from an OpenAPI specification using Orval. Authentication is session-based and scoped per company. Barcode scanning is handled by `@zxing/browser`, and QR codes are generated with `qrcode.react`. The monorepo includes `prosan` (frontend), `api-server` (backend), `lib/db` (database schema), and libraries for API specification, client, and Zod schemas. Features are controlled by a subscription-based feature flag system.

**Core Features:**
- **Multi-Tenancy:** Subdomain-based routing with `company_id` for database isolation.
- **User Roles:** Granular access control (`super_admin`, `admin`, `staff`, `viewer`).
- **Subscription & Payment:** Manages `trial`, `active`, `suspended` plans with `402 Payment Required` enforcement.
- **Stock Management:** Prevents negative stock, automates returns, and enforces unique product identifiers.
- **Sales Rules:** Role-based sales creation and return-only policy.
- **Error Handling:** Standardized JSON error responses.
- **Audit Logging:** Tracks critical system actions.
- **Security:** Secure session cookies, rate limiting, tenant isolation, idempotency for payments, and API-level business rule enforcement. Includes at-rest encryption for sensitive credentials.
- **Omnichannel Sales Channels:** Product-channel listings with flexible pricing and stock engines, including an adapter framework for marketplace API integrations.
- **B2B Network:** Supports network profiles, reviews, and a B2B directory, including a cross-tenant marketplace (`/b2b/vitrin`) for product discovery and RFQ.
- **e-Fatura (Provider-Agnostic):** Multi-tenant e-Invoice/e-Archive module with a pluggable `EInvoiceProvider` interface supporting various providers (e.g., Paraşüt, QNB eFinans, Foriba). Features outbox for outgoing and inbox for incoming invoices, with robust idempotency and state guards.
- **Marketplace (Provider-Agnostic):** Multi-tenant marketplace integration framework with a `MarketplaceProvider` interface and support for platforms like Trendyol, Hepsiburada, and N11. Includes product-channel mappings, pricing/stock rules, and a job queue for synchronization.
- **Profit Center & OCR:** Tenant-scoped financial overview with an OCR endpoint for automated expense form filling.
- **Accountant Panel:** Collaboration module with official report generation.
- **Data Import:** Supports CSV import for customers, suppliers, products, and expenses.
- **POS Terminal:** Rapid sales interface for barcode-scanner focused operations.
- **Production & BOM:** Manages `production_recipes` and `production_orders` with atomic transactions for stock.
- **Loyalty & Points System:** Configurable loyalty programs integrated with sales.
- **Multi-Currency:** Manages `currency_rates` with historical data.
- **True Profit Engine:** Effective-cost model considering purchase price, holding costs, and capital cost, generating per-product profit snapshots and AI-driven recommendations.
- **Shipping Management:** Region and weight-based shipping engine with configurable zones, rules, and product overrides.
- **Pricing Engine:** Channel-based pricing rule engine with various modes (markup, fixed, discount) and rounding options, supporting batch application and preview.
- **Aggregator (Ticarium Pazar):** Cross-tenant central marketplace listing chosen products from suppliers based on price and margin, accessible publicly.
- **Ad Budget Tracking:** Multi-channel advertising expense tracking with ROI, CPA, CPC, and profit calculations for various platforms.
- **Karlılık & Kanal Kıyas (Profit & Channel Comparison):** Analyzes sales performance by channel, breaking down revenue, COGS, commissions, shipping, and net profit.
- **Public Marketing Site:** Provides anonymous access to marketing pages, contact forms, and a comparison page.
- **Hardening:** Includes public endpoint rate limiting, enhanced Helmet security headers, a global error handler, audit log viewer, and an email infrastructure.
- **Kurulum & Kullanım Skoru (Setup & Usage Score):** Single shared checklist (~21 items, 3 categories — Firma Profili / Açılış Verileri / Modül Kullanımı) with weighted score (`api-server/src/lib/setup-checklist.ts`, parallel DB queries with `countSafe()` try/catch). Tenant page at `/kurulum-skoru` (admin role) shows circular gauge + per-category cards with "Tamamla →" deep links. First-login popover at bottom-right (one-shot per tab via sessionStorage scoped by `${companyId}_${userId}`, plus server-side `users.setup_checklist_dismissed_at` for permanent dismissal via "Bir daha gösterme"). Super-admin cross-tenant table at `/admin/musteri-doluluk` lists all tenants sorted ascending by score with KPI cards (Toplam/Ortalama/<%50 Acil) and per-category badges. API: `GET /api/kurulum-skoru`, `POST /api/kurulum-skoru/dismiss`, `GET /api/admin/musteri-doluluk` (mounted as separate router to avoid wildcard `/` collisions). Field-name pitfalls handled: `einvoice_settings.enabled`, `sms_settings.isActive`, `notification_rules.isActive`, `companies.isActive` (no `deletedAt`).
- **Hardening Pass — Phase C (T017):** (a) **Süper Admin → Sistem Sağlığı sayfası** (`pages/super-admin/sistem-saglik.tsx`, route `/super-admin/sistem-saglik`, `super_admin` role-gated). `/api/healthz/internal`'i çağırıyor — DB / Object Storage / SMTP için status badge + latency + detail kartları, runtime parmak izi (Node version, RSS/heap memory, uptime/version), 15 sn auto-refresh toggle + manuel yenile + focus'ta refetch. Sidebar'a "Sistem Sağlığı" eklendi (Pazaryeri Sağlık yanına). **Kritik bug fix:** `/healthz/internal` rol kontrolü `req.session.role` yerine `req.session.user?.role` okuyacak şekilde düzeltildi (önceden super_admin'ler bile 403 alıyordu). (b) **Stub e-fatura provider HTTP iskeleti** (`services/einvoice/stub-providers.ts`) — yeni `BaseHttpStubProvider` abstract class: `endpoints()` (sandbox/prod URL ayrımı + ping path), `authHeaders()` (Bearer/Basic default + override), `http()` helper (Node 18+ fetch + AbortController timeout + JSON parse). 5 provider (Paraşüt, QNB eFinans, Foriba, Logo eFlow, Mikro) gerçek base URL'ler ile; Mikro `X-API-KEY` override örneği. `healthCheck` artık eksik config kontrolü + endpoint ping atıyor: 2xx-3xx/405 → ok, 401/403 → "auth red", diğer 4xx/5xx → degraded, network/timeout → down. CRUD operasyonları (createInvoice/sendInvoice/cancelInvoice) hâlâ throw — UBL-TR XML üretimi + endpoint mapping API key entegrasyonunda eklenecek; HTTP iskeleti hazır.
- **Hardening Pass — Phase B-1 (T017):** (a) **Empty states** — `Suppliers`, `Purchases`, `StockCounts` sayfalarındaki ad-hoc "Yükleniyor / Henüz yok" UI'ları merkezi `<EmptyState>` component'ine geçirildi (zaten Products & Customers'da kullanılıyordu). Her boş listede ikon + başlık + açıklama + birincil CTA ("İlk Tedarikçiyi Oluştur", "İlk Faturayı Gir", "İlk Sayımı Başlat") ve uygun yerde ikincil CTA (örn. Purchases → "Tedarikçi Ekle"). Filtre/arama sonucu boşsa CTA gizlenir, "Filtreleri temizleyin" mesajı çıkar. (b) **TrialBadge** (`components/trial-badge.tsx`) — Header sticky bar'a (layout.tsx, `<QuickAction />` solunda) inject edildi; sadece `planType === "trial"` durumunda render olur. Renk tonu kalan güne göre: ≥7 gün yeşil, 3-6 gün sarı, 0-2 gün veya süresi dolmuşsa kırmızı (yanıp söner). Tıklayınca `/settings/subscription`'a gider — gelir odaklı CTA.
- **Hardening Pass — Phase A (T017):** (a) Merkezi feature kodları `lib/db/src/feature-codes.ts` (`@workspace/db/feature-codes` subpath export) — `FEATURES` sabitleri + `FeatureCode` union tipi; backend `routes/index.ts` ve `nav-config.ts` artık string yerine bu sabitleri/tipi kullanır → tipo derleme zamanında yakalanır. (b) Login brute-force `keyGenerator` artık `IP + username` kullanır (`app.ts:loginRateLimit`) — ofis NAT senaryolarında farklı kullanıcıların denemelerinin birbirini "yemesini" engeller, aynı kullanıcı için 20/15dk sınırı korur. (c) Abonelik değişiklikleri audit log'una bağlandı: `SUBSCRIPTION_CHANGE` (`/subscribe`), `SUBSCRIPTION_CANCEL` (`/cancel`), `SUBSCRIPTION_ADMIN_SET` (`/admin/billing/set-plan`) — kim, ne zaman, hangi plana, hangi cycle ile geçti detayıyla kaydedilir. (d) Subscription `/subscribe` ve `/admin/billing/set-plan` `db.transaction()` içinde — eski active'i cancel + yeni active insert + invoice + companies update tek atomik birimde (race-fix).
- **Backend Feature Guards + Subscription Cleanup (T016):** UI lock'ları pazarlama; gerçek yetki kontrolü `/api/*` üzerinde `requireFeature(code)` middleware ile yapılır (`middlewares/features.ts`). Sprint 87'de eksik mount'lar tamamlandı: `/b2b*` (customers.crm), `/channels` (marketplace.pro), `/storefronts` (marketplace.basic), `/pricing-rules` (marketplace.pro); ayrıca path-prefix'siz mount edilen `campaignsRouter`, `documentsRouter`, `aggregatorRouter` için path-filter wrapper ile `campaigns`/`documents`/`marketplace.pro` gate'leri eklendi. Trial tenant'larda `features=["*"]` olduğundan tüm guard'lar bypass olur. **Subscription temizliği:** `company_subscriptions` tablosunda PROSAN için 199 dup active satır vardı; `id=199` (en yeni) tutuldu, geri kalan 198 satır `cancelled` yapıldı. Schema'ya partial unique index eklendi: `uniqueIndex("company_subscriptions_active_per_company_uq").on(companyId).where(sql\`status = 'active'\`)` — bundan sonra bir company için aynı anda en fazla 1 active satır olabilir; yeni active eklenmeden önce eski active mutlaka cancel edilmeli. **Nav stabil id altyapısı:** `NavItem.id?: string` opsiyonel field eklendi; `navItemId(item)` helper href fallback'i ile geriye uyumlu çalışır; menu prefs key bumped to `tcrm_menu_hidden_v2_u<id>` (eski v1 kayıtları sıfırlanır). Sidebar/menu ayarları/testid'ler artık helper üzerinden id-tabanlı. **Mockup klasörü** (`artifacts/mockup-sandbox/.../ticarium365/`) sadece prototip referansıdır — README ile işaretlendi; canlı app `artifacts/prosan/`'dadır.
- **Sidebar Collapse + Paket Kilidi + Menü Tercihleri (T015):** Desktop sidebar can be manually collapsed (w-64↔w-16) via toggle button (`button-sidebar-toggle`); state persisted in localStorage (`ticarium365_sidebar_collapsed_v1`). When collapsed, only group icons render. **Paket kilidi:** all modules remain visible to all roles, but nav items whose `feature` (defined per item in `nav-config.ts`) is missing from the user's plan show a Lock icon next to the label; clicking the page wraps content in `<FeatureGate>` (in `layout.tsx`, computed via longest-prefix `currentRouteFeature`) which renders an "upgrade required" overlay (blurred page preview + "Paketi Yükselt" CTA → `/settings/subscription`). FeatureGate fail-closed-with-skeleton during loading, fail-open on error. **Menü tercihleri:** new page at `/settings/menu` lets users toggle individual nav items off/on with switches; preferences are user-scoped (`tcrm_menu_hidden_v1_u<userId>`) and reactive across the app via custom event. PROSAN was elevated to Kurumsal v2 (`plan_id=9`, ~31 features) so the pilot tenant sees no locks. New files: `components/use-features.ts`, `use-menu-prefs.ts`, `feature-gate.tsx`, `pages/settings/menu.tsx`. E2E tested: collapse persists across reload, lock badges hidden on Kurumsal, single-Layout render on /settings/menu.
- **Sprint 70 — Mimari Sıkılaştırma & Sprint 65 Hazırlık:** (a) **Encryption-at-rest**: `routes/ext-integrations.ts` accounting+ecommerce credentials AES-256-GCM (`enc:v1:` prefix) ile saklanır; nested object/array recursive (`encryptSecrets`/`decryptSecrets` simetrik). `routes/finance-documents.ts` mailbox `imapPassword` aynı şekilde şifreli; read'de mask (********). Legacy plain text okunabilirliği prefix-check ile korunur. (b) **Canonical Finance Ledger** (`services/finance/ledger.ts`): `getLedger / getSummary / getExpenseByCategory / getRevenueTotal / getExpenseTotal` — 5 kaynak (sales/purchases/expenses/cash_movements/bank_transactions) tek `LedgerEntry` formuna normalize. `routes/finance-dashboard.ts /summary` (3 ayrı sorgu → 1 ledger çağrısı, `includeReturnedSales:true` ile backward-compat) ve `routes/budgets.ts /comparison + /forecast/cashflow` ledger'a yönlendirildi. Sprint 65 tahmin motoru bu kaynak üzerinden geliştirilecek. (c) **ARCHITECTURE.md** (`artifacts/api-server/src/ARCHITECTURE.md`): yeni geliştirici/yatırımcı için 2-dakikalık mimari haritası — 5 entegrasyon hattı (marketplace canonical / channels bridge / ext-integrations legacy / integrations toggle / aggregator network), adapter pattern standardı, 3 worker pattern, finance ledger anlatımı, "X tablosu nerede" lookup, sprint geçmişi.
- **Firma Profili (Company Profile):** Tabbed page at `/firma-profili` (admin role) — Künye / Operasyon / Sabit Giderler / Performans / Parametreler. Stores company identity, employee/branch/working-day info, monthly fixed costs (rent, utilities, meals, payroll lines, misc), reference revenue, target gross margin, and a tenant-editable 2026 SGK config (`company_settings.sgk_config` jsonb). Built-in 2026 Türkiye payroll calculator (`api-server/src/lib/sgk-calc.ts`) supports gross→net and net→gross (binary search) with cumulative annual income tax brackets, employer-side costs (SGK 15.5%, unemployment 2%, short-term insurance 2.25%), and configurable exemptions. API: `GET/PUT /api/firma-profili`, `POST /api/firma-profili/sgk-hesapla`, `GET /api/firma-profili/aylik-toplam-gider`. Computed totals (monthly/annual/daily fixed cost + break-even revenue) returned with every read. **JSON-safety:** the top tax bracket uses `upTo: null` as the unbounded sentinel (Infinity is not JSON-serializable); the calc engine treats null as +∞, and `validateAndCleanSgkConfig` normalizes/sorts brackets and rejects out-of-range rates.

## External Dependencies

- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Database interaction.
- **Zod**: Schema validation.
- **Orval**: API client and schema generation.
- **express-session**: Session management.
- **bcryptjs**: Password hashing.
- **@zxing/browser**: Camera-based barcode scanning.
- **qrcode.react**: QR code generation.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **OpenAI Vision**: Used for receipt OCR.
- **multer**: For handling file uploads in data import.
- **Sentry**: Optional error tracking.
- **SMS Provider Adapter**: Per-tenant pluggable SMS providers (NetGSM gerçek HTTP, İletimerkezi/Vatansms stub, Mock sandbox). `sms_settings` tablosu tenant başına credentials (encrypted) + sandbox + senderHeader + lastHealth tutar. Factory karar ağacı: DB→env→missing/disabled. Rotalar: `/api/sms/{providers,settings,health-check,test-send,send,messages}`. Backward-compat `sendSms()` shim auth.ts ve sms-push.ts için korunur.
- **Expo Push**: Mobile push notification service.
- **Trendyol Sapigw**: Marketplace API for product, price, and order synchronization.
- **Hepsiburada MPOP API**: Marketplace API for product, price, and order synchronization.
- **N11 API**: Marketplace API for product, price, and order synchronization.
- **Paraşüt API**: e-Invoice integration via OAuth2.
- **TCMB EVDS**: Exchange rate data.