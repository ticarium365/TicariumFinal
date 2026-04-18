# SMS — Stok Yönetim Sistemi (Multi-Tenant SaaS)

## Overview

SMS is a multi-tenant SaaS platform designed for comprehensive stock, barcode, and sales management, accessible via subdomain-based routing. The platform, branded as **SMSYSTEMS**, offers dynamic tenant-specific branding. Its core purpose is to provide businesses with efficient tools for inventory control, sales tracking, and managing customer/supplier relationships. Key capabilities include robust stock management with low-stock alerts, detailed sales analytics, customer and supplier relationship management, subscription and payment processing, and a flexible role-based access control system. The project aims to expand with advanced reporting, integrated barcode/labeling centers, and e-commerce catalog synchronization.

## User Preferences

- I want iterative development.
- Ask before making major changes.
- Provide detailed explanations for complex solutions.
- Do not make changes to the `artifacts` directory unless specifically instructed.
- Do not make changes to the `lib/api-spec/openapi.yaml` file directly; it is the source for API client generation.

## System Architecture

The project employs a monorepo strategy managed by `pnpm workspaces`.

### UI/UX Decisions

The frontend is built with React and Vite, utilizing Tailwind CSS and `shadcn/ui` for a modern, responsive design. Branding is dynamic, adapting to tenant-specific logos and primary colors, while the platform maintains the "SMSYSTEMS" brand. Navigation is facilitated by a persistent sidebar and header, incorporating a `TrialBanner` for trial accounts. The system includes reusable UI components for common functionalities like layout, authentication, company context, and various alerts/modals. User onboarding features a multi-step wizard and a `WelcomeTour`. Comprehensive reporting dashboards provide sales and stock insights.

### Technical Implementations

The backend is powered by Express 5. PostgreSQL is the chosen database, managed with Drizzle ORM for type-safe interactions, and Zod for schema validation. API client code and Zod schemas are automatically generated from an OpenAPI specification using Orval. Authentication is session-based, secured with `express-session` and `bcryptjs`, and scoped per company. Barcode scanning uses `@zxing/browser`, and QR codes are generated with `qrcode.react`. The build process leverages `esbuild` for ESM bundling. The monorepo organizes `prosan` (frontend), `api-server` (backend), `lib/db` (database schema), `lib/api-spec`, `lib/api-client-react`, and `lib/api-zod`.

### Feature Specifications

- **Multi-Tenancy**: Achieved through subdomain-based routing, with all database tables strictly isolated by a `company_id`.
- **User Roles**: Granular access control is managed via `super_admin`, `admin`, `staff`, and `viewer` roles.
- **Subscription & Payment**: Supports `trial`, `active`, `suspended` plans, with `trial_ends_at` tracking and `402 Payment Required` enforcement. Bank transfers are supported, requiring super-admin confirmation.
- **Stock Management**: Prevents negative stock, automatically restores stock on sales returns, and enforces unique product codes/barcodes per company. Products can be deactivated to hide them while preserving historical data.
- **Sales Rules**: Role-based sales creation (viewers cannot create sales). Sales are not deleted but returned.
- **Error Handling**: Standardized JSON error responses with specific error codes.
- **Audit Logging**: Tracks critical actions across the system.
- **Security**: Implements secure session cookies, rate limiting on login, tenant isolation, idempotency for payment processing, and API-level enforcement of business rules.
- **Omnichannel Sales Channels**: Features product-channel listings with flexible pricing and stock engines (fixed, markup, buffer, etc.) across various marketplace and e-commerce platforms. Includes adapter framework for marketplace API integrations.
- **B2B Network**: Enables companies to manage network profiles, receive reviews, and participate in a B2B directory.
- **B2B RFQ & Ordering**: Supports a request-for-quote (RFQ) system, quote management, and a B2B order workflow with status tracking and notifications.
- **B2B Catalog**: Allows companies to publish selected products as a B2B catalog, enabling potential buyers to request quotes.
- **e-Fatura (Provider-Agnostic)**: Multi-tenant e-Fatura/e-Arşiv module with a pluggable `EInvoiceProvider` interface (createInvoice, sendInvoice, cancelInvoice, getIncomingInvoices, healthCheck). Ships with a sandbox `mock` provider plus stubs for Paraşüt, QNB eFinans, Foriba, Logo e-Flow, Mikro — credentials are stored per company in masked JSON config. Outbox (draft → sending → sent/accepted/cancelled/failed) uses atomic status locking to prevent double-send; inbox uses `ON CONFLICT DO NOTHING` upsert for idempotent polling. RBAC: viewers can read, only admin/staff/super_admin can mutate. Surfaces in `/einvoice` page with Outbox/Inbox/Settings/Events tabs.

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