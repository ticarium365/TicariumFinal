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

## Sprint H — Buyer Portal × PROSAN Birleşmesi (TAMAM)
- Buyer-portal sayfaları PROSAN içine taşındı: artifacts/prosan/src/pages/satinalma/{Discovery,NewRfq,Rfqs,SellerInbox,index}.tsx — tüm internal navigation /satinalma/* prefix'ine güncellendi (Discovery "Teklif İste" + NewRfq onSuccess redirect dahil).
- Tek API host, tek auth, tek subdomain — backend hiç değişmedi.
- App.tsx: 6 yeni ProtectedRoute (/satinalma, /satinalma/kesfet, /satinalma/rfqs, /satinalma/rfqs/new, /satinalma/rfqs/:id, /satinalma/inbox).
- nav-config.ts: NavGroup ve NavItem tiplerine accountTypes?: Array<"buyer"|"seller"|"both"> alanları eklendi. Yeni "satinalma" grubu (5 item, item-level accountType filtreli).
- layout.tsx + command-palette.tsx: visibleGroups → group-level + item-level accountType filtresi (her iki nav yüzeyinde tutarlı).
- E2E PASS: admin (both) login → tüm 5 satinalma item görünür; Discovery → "Teklif İste" → /satinalma/rfqs/new?sellerId=X; NewRfq submit → /satinalma/rfqs/:id (404 yok).
- Eski buyer-portal artifact bozulmadı (geçiş sürecinde yedek olarak duruyor).

## Master Backlog (mimari odaklı sıra)
| # | Sprint | Açıklama | Durum |
|---|---|---|---|
| 0 | Sprint 51-55, 62, 65, 70 + Frontend UI | E-Fatura UBL-TR + Bütçe & Tahmin + Marketplace hardening + canonical ledger + PROSAN UI | TAMAM |
| 1 | **Sprint A — Architect Regression Tests** | Forecast aliases (avg/slope/label ↔ legacy categoryName/trendSlope/forecast invariant + finiteness + totalForecast≈Σ tolerans) + months clamp [2,12] + invalid period 400 + e-fatura outbox `lastResponse.xml` (UBL `<Invoice` root, mock fallback numeric PayableAmount, non-TRY USD DocumentCurrencyCode propagation, multi-line + AllowanceTotalAmount discount math) — `tests/integration.test.mjs` describe "Sprint A — Architect regression: forecast aliases + outbox XML" **6/6 PASS** | TAMAM |
| 1.5 | **Sprint I — Satınalma Hesabı (purchasing) refinement** | `accountType="purchasing"` üçüncü tip; `nav-config.isVisibleForAccount` whitelist; sade 5 item menü (Satınalma Merkezi · Menü Tercihleri · Marka & Logo · Firma Profili · Kullanıcılar); `/satinalma-merkezi` sayfası (filtre/arama/sort, xlsx+CSV+PDF export, favori toggle, iletişim/karşılaştırma modal, "Tekliflerim" link); `/b2b/catalog/marketplace` SADECE `isPublished=true` VE (`sourceProductId IS NULL` OR `products.stock > 0`) — onaylı + stoklu vitrin | TAMAM |
| 2 | Sprint B — Notification Hub Entegrasyonu | Bütçe alarmları + e-fatura olayları → site-içi bildirim merkezi | sıradaki |
| 3 | Sprint C — Marketplace Worker UI | Rate-limit/permanent-error görselleştirme; outbox tablosunda retry timer + status badge | sıradaki |
| 4 | Sprint D (eski 71) — Buyer Portal Foundation | Schema (`accountType`, `buyer_*`), buyer-portal artifact iskeleti, auth | TAMAM (Sprint H ile birleşti) |
| 5 | Sprint E (eski 72) — Buyer Discovery + RFQ | Firma/ürün listesi + multi-seller RFQ submit + satıcı RFQ Inbox + lead düşürme | TAMAM |
| 6 | Sprint F (eski 73) — Quote Response & Comparison | Satıcı yanıt formu + buyer karşılaştırma ekranı + accept/reject + audit | TAMAM |
| 7 | Sprint G — POS → E-Fatura "Satıştan Otomatik" UI | Satışlar listesinden tek tıkla outbox + XML preview entegrasyonu | sıradaki |
