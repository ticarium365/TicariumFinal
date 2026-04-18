# SMS — Stok Yönetim Sistemi (Multi-Tenant SaaS)

## Overview

SMS is a multi-tenant SaaS platform, branded as **SMSYSTEMS**, offering comprehensive stock, barcode, and sales management with dynamic tenant-specific branding. Its core purpose is to provide businesses with efficient tools for inventory control, sales tracking, and managing customer/supplier relationships. Key capabilities include robust stock management with low-stock alerts, detailed sales analytics, customer and supplier relationship management, subscription and payment processing, and a flexible role-based access control system. The project aims to expand with advanced reporting, integrated barcode/labeling centers, and e-commerce catalog synchronization.

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