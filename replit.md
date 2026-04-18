# Ticarium365 — 365 gün işinin yanında (Multi-Tenant SaaS)

## Overview

Ticarium365 is a multi-tenant SaaS platform (rebranded from SMSYSTEMS in Apr 2026), offering comprehensive stock, barcode, sales, e-invoice, and marketplace management with dynamic tenant-specific branding (each tenant shows its own name in the sidebar header with a "powered by Ticarium365" subtitle).

### Brand
- Wordmark: **Ticarium**`365` (emerald 365), display font: Outfit; body: Plus Jakarta Sans / Inter.
- Logo mark: T`3` square. Slogan: "365 gün işinin yanında."
- Brand surfaces: `/login` screen, sidebar subtitle, html `<title>`, mobile app name. Tenant brand (company.name) remains primary on the sidebar header.
- Subscription packages: Stok / Ticaret / İşletme / Büyüme / Kurumsal (legacy plans auto-migrated to Kurumsal v2).

 Its core purpose is to provide businesses with efficient tools for inventory control, sales tracking, and managing customer/supplier relationships. Key capabilities include robust stock management with low-stock alerts, detailed sales analytics, customer and supplier relationship management, subscription and payment processing, and a flexible role-based access control system. The project aims to expand with advanced reporting, integrated barcode/labeling centers, and e-commerce catalog synchronization.

## User Preferences

- I want iterative development.
- Ask before making major changes.
- Provide detailed explanations for complex solutions.
- Do not make changes to the `artifacts` directory unless specifically instructed.
- Do not make changes to the `lib/api-spec/openapi.yaml` file directly; it is the source for API client generation.

## System Architecture

The project employs a monorepo strategy managed by `pnpm workspaces`.

### UI/UX Decisions

The frontend is built with React and Vite, utilizing Tailwind CSS and `shadcn/ui` for a modern, responsive design. Branding is dynamic, adapting to tenant-specific logos and primary colors. Navigation is facilitated by a persistent sidebar and header, incorporating a `TrialBanner` for trial accounts. The system includes reusable UI components for common functionalities like layout, authentication, company context, and various alerts/modals. User onboarding features a multi-step wizard and a `WelcomeTour`. Comprehensive reporting dashboards provide sales and stock insights. The UI supports an integrated POS terminal, data import wizards, loyalty program management, and multi-currency handling.

### Technical Implementations

The backend is powered by Express 5, with PostgreSQL as the database, managed by Drizzle ORM for type-safe interactions, and Zod for schema validation. API client code and Zod schemas are automatically generated from an OpenAPI specification using Orval. Authentication is session-based, secured with `express-session` and `bcryptjs`, and scoped per company. Barcode scanning uses `@zxing/browser`, and QR codes are generated with `qrcode.react`. The build process leverages `esbuild` for ESM bundling. The monorepo organizes `prosan` (frontend), `api-server` (backend), `lib/db` (database schema), `lib/api-spec`, `lib/api-client-react`, and `lib/api-zod`. Features are gated by a subscription-based feature flag system with a 60-second in-memory cache and automatic cache invalidation.

### Feature Specifications

- **Multi-Tenancy**: Subdomain-based routing with database isolation via `company_id`.
- **User Roles**: Granular access control (`super_admin`, `admin`, `staff`, `viewer`).
- **Subscription & Payment**: Supports `trial`, `active`, `suspended` plans with `trial_ends_at` tracking and `402 Payment Required` enforcement.
- **Stock Management**: Prevents negative stock, automates stock restoration on returns, enforces unique product codes/barcodes, and allows product deactivation.
- **Sales Rules**: Role-based sales creation and return-only policy instead of deletion.
- **Error Handling**: Standardized JSON error responses with specific codes.
- **Audit Logging**: Tracks critical system actions.
- **Security**: Secure session cookies, rate limiting, tenant isolation, idempotency for payments, and API-level business rule enforcement.
- **Omnichannel Sales Channels**: Product-channel listings with flexible pricing and stock engines, including an adapter framework for marketplace API integrations.
- **B2B Network**: Enables companies to manage network profiles, receive reviews, and participate in a B2B directory.
- **B2B RFQ & Ordering**: Supports request-for-quote (RFQ) system, quote management, and B2B order workflow.
- **B2B Catalog**: Allows companies to publish B2B catalogs for quote requests.
- **e-Fatura (Provider-Agnostic)**: Multi-tenant e-Invoice/e-Archive module with a pluggable `EInvoiceProvider` interface and support for various providers (mock, Paraşüt, QNB eFinans, Foriba, Logo e-Flow, Mikro). Includes outbox for outgoing and inbox for incoming invoices.
- **Marketplace (Provider-Agnostic)**: Multi-tenant marketplace integration framework with a `MarketplaceProvider` interface and stubs for various platforms (Trendyol, Hepsiburada, N11, Amazon TR, Shopify, WooCommerce, etc.). Features product-channel mappings, pricing/stock rules, and a job queue for synchronization.
- **Net Kâr Merkezi (Profit Center) + Fiş OCR**: Tenant-scoped financial overview (revenue, COGS, expenses, assets, employee costs, recurring expenses) with an OCR endpoint for automated expense form filling using OpenAI vision.
- **Mali Müşavir Paneli + Resmi Raporlar**: Accountant collaboration module with invite tokens and cross-company access. Generates official reports (KDV beyanı, Form Ba/Bs, Mizan).
- **Rakip Konumlandırma (Competitive Landing)**: Public `/karsilastir` page highlighting differentiators and capabilities against competitors.
- **Veri İçe Aktarımı (Data Import)**: `/api/import/preview` and `/api/import/run` routes supporting CSV import for customers, suppliers, products, and expenses with automatic column matching and idempotent processing.
- **Hızlı Satış (POS Terminal)**: `/pos` page designed for barcode-scanner focused rapid sales with product grid, live cart, customer selection, multiple payment options, and discounts.
- **E-İrsaliye + E-Arşiv Ayrımı**: Extended `einvoice` schema to differentiate `IRSALIYE` (e-delivery note) and `EInvoiceScenario` types.
- **Üretim & Reçete (BOM)**: Manages `production_recipes`, `recipe_components`, and `production_orders` with atomic transactions for stock management during production.
- **Sadakat & Puan Sistemi**: Configurable `loyalty_settings` and `loyalty_transactions` (earn, redeem, adjust, expire) integrated with sales and customer management.
- **Çoklu Para Birimi**: `currency_rates` management (USD/EUR/GBP/CHF/JPY → TRY) with history and conversion capabilities.
- **Mobil Derinleştirme**: Expanded Expo app with `(tabs)/customers.tsx` for customer search, balance display, and alerts.
- **Fiyat Motoru (Sprint 73.2)**: Kanal bazlı kural motoru — `priceEngineRulesTable` (DB: `price_engine_rules`, ad çakışmasını önlemek için marketplace `pricingRulesTable`'dan ayrı tutuldu). Modlar: `markup_pct`, `markup_amount`, `fixed_price`, `cost_plus_pct`, `discount_pct`. Yuvarlama: `nearest_1`, `nearest_5`, `ceil_99`, `ceil_95`, `psychological_9`. Scope: channelKey + jsonb categoryFilter/brandFilter/productIds + validFrom/To + min/max limit + priority. Saf hesaplama helper'ları (`computePriceFromRule`, `ruleMatches`, `roundPrice`). API: `/api/pricing-rules` CRUD + `/preview` (etki simülasyonu) + `/apply` (chunked batch upsert 500'lü gruplar + PostgreSQL `pg_try_advisory_lock` ile aynı (company,channel) için eşzamanlılık koruması). Frontend: `/fiyat-motoru` 3 sekme (Kurallar listesi/Önizleme/Toplu Uygula). Hub'da pricing tab artık `live`. **Performans**: 1221 ürün için apply ≤500ms (önceden N+1).
- **Hazır Mağaza & Müşteri Sitesi (Sprint 73.1)**: Üç tip storefront — `embedded` (müşterinin kendi sitesine widget snippet), `hosted` (`firmaadi.ticarium365.shop`), `aggregator` (bizim merkezi e-ticaret, ayrı domain — yakında, en uygun fiyatlı eşleşen ürünleri kâr marjıyla satar). Ödeme modu anlaşmaya bağlı: `merchant_pos` (işletmenin POS'una redirect, komisyonsuz), `platform` (Ticarium365 tahsil + komisyon), `whatsapp_only`. Tablolar: `storefronts`, `storefront_products`, `aggregator_listings` (matchKey ile en ucuz ürün seçimi). API: `/api/storefronts/*` CRUD + ürün link/unlink. Frontend: `/magaza` liste + `/magaza/:id` 5 sekme (Genel/Ürünler/Ödeme/Tema/Embed). Güvenlik: PATCH whitelist (slug/type/companyId değiştirilemez), strict Zod paymentConfig/themeConfig şemaları, viewer rolüne `agreementNotes`+`agreementCommissionPct`+`paymentConfig` redact, slug 23505 race-condition retry.
- **e-Ticarium Merkezi (Sprint 73, MVP shell)**: Unified multi-channel commerce hub at `/eticarium-merkezi`. Tabbed UI (9 sections: Genel Bakış, Kanallar, Ürünler, Fiyat Kuralları, Kargo Kuralları, Hazır Mağaza, Reklam Bütçesi, Siparişler, Karlılık & Analiz). MVP wires existing modules (channels, marketplace, b2b/orders, campaigns) as "Aktif" cards; pricing/shipping/storefront/ads/analytics shown as "Yakında" placeholders. Sidebar entry uses `Sparkles` icon, role-gated for admin/staff/viewer (CTA buttons hidden for viewer). New schema/feature flags (commerce.pricing, commerce.shipping, commerce.storefront, commerce.ads) to be added in subsequent sprints.
- **Public marketing site (Sprint 64.5)**: Anonymous visitors see `PublicNav` (Hakkımızda · Amacımız · Paketler · Neden Farklıyız · İletişim) above `/login` and 4 public pages. Contact form at `/iletisim` (Ad Soyad/Şirket/Telefon/Email) POSTs to `/api/contact` which is mounted **before** tenant middleware in `app.ts` for true anonymous access. IP rate limit: 5 req/10min in production. Schema: `contact_requests` table. Super admin endpoints: `GET /api/contact/admin`, `PATCH /api/contact/admin/:id`. Karşılaştırma sayfası anonimleştirildi (rakip marka adları → jenerik kategoriler, fiyat sütunu silindi) — Rekabet Kurulu uyumu.
- **Gerçek Kâr Motoru (True Profit Engine, Sprint 72)**: Effective-cost model that ages stock — purchase price + accumulated holding cost (rent/staff/electric per shelf-m²) + capital cost (annual % / 365). Tables: `holding_cost_rules`, `expense_allocations`, `product_profit_snapshots` (idempotent upsert with unique idx on company+product+date), `inventory_turnover_metrics`. Daily 24h cron writes per-product snapshots; live endpoint computes on-demand. Allocation methods supported: revenue, qty, category, m2, manual. Pages: `/gercek-kar` (dashboard with top-profit/losing/stagnant lists), `/gercek-kar/ayarlar` (rules+expenses, admin only), `/gercek-kar/oneriler` (rule-based AI advisor). Feature codes: `profit.holding_cost`+`profit.true_dashboard` (pkg_business+), `profit.ai_advisor` (pkg_growth+).

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
- **OpenAI Vision**: Used for receipt OCR (via Replit AI proxy).
- **multer**: For handling file uploads in data import.