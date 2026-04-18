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
- **NetGSM**: SMS provider.
- **Expo Push**: Mobile push notification service.
- **Trendyol Sapigw**: Marketplace API for product, price, and order synchronization.
- **Hepsiburada MPOP API**: Marketplace API for product, price, and order synchronization.
- **N11 API**: Marketplace API for product, price, and order synchronization.
- **Paraşüt API**: e-Invoice integration via OAuth2.
- **TCMB EVDS**: Exchange rate data.