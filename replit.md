# SMS — Stok Yönetim Sistemi (Multi-Tenant SaaS)

## Overview

SMS is a multi-tenant SaaS platform for stock, barcode, and sales management, accessible via subdomain-based routing (e.g., `prosan.smsystem.com`). The platform brand is **SMSYSTEMS**, with tenant branding dynamically fetched from the API. The system aims to provide a comprehensive solution for businesses to manage their inventory, sales, and customer/supplier relationships efficiently. Key features include robust stock management with low-stock alerts, detailed sales tracking, customer and supplier management, payment and subscription handling, and a flexible role-based access control system. Future ambitions include advanced reporting, barcode/labeling centers, and e-commerce catalog integration.

## User Preferences

- I want iterative development.
- Ask before making major changes.
- Provide detailed explanations for complex solutions.
- Do not make changes to the `artifacts` directory unless specifically instructed.
- Do not make changes to the `lib/api-spec/openapi.yaml` file directly; it is the source for API client generation.

## System Architecture

The project utilizes a monorepo structure managed by `pnpm workspaces`.

### UI/UX Decisions

- **Frontend Framework**: React with Vite, styled using Tailwind CSS and `shadcn/ui` for component design.
- **Branding**: Platform brand is "SMSYSTEMS," while tenant-specific branding (e.g., logo, primary color) is dynamic.
- **Navigation**: Features a sidebar and header with a `TrialBanner` for trial accounts.
- **Components**: Reusable components for layout, authentication context, company context, trial gateway, low-stock alerts, and bulk stock updates (supporting XLSX drag-drop).
- **Onboarding**: A multi-step onboarding wizard and a `WelcomeTour` guide new tenants.
- **Reporting**: Comprehensive sales and stock reports, including daily summaries and KPI tracking.

### Technical Implementations

- **Backend Framework**: Express 5 for the API server.
- **Database**: PostgreSQL with Drizzle ORM for type-safe database interactions.
- **Validation**: Zod for schema validation, integrated with `drizzle-zod`.
- **API Client Generation**: Orval generates React Query hooks and Zod schemas from an OpenAPI specification (`openapi.yaml`).
- **Authentication**: Session-based authentication using `express-session` and `bcryptjs`, scoped per company.
- **Barcode Scanning**: `@zxing/browser` for camera-based barcode scanning.
- **QR Code Generation**: `qrcode.react` for rendering QR codes.
- **Build System**: `esbuild` for ESM bundling.
- **Monorepo Structure**: `pnpm workspaces` manages `prosan` (frontend), `api-server` (backend), `lib/db` (database schema), `lib/api-spec`, `lib/api-client-react`, and `lib/api-zod`.

### Feature Specifications

- **Multi-Tenancy**: Subdomain-based tenant resolution (`Host` header or `X-Tenant`). All database tables include a `company_id` column to ensure strict data isolation.
- **User Roles**: `super_admin`, `admin`, `staff`, `viewer` with granular access control.
- **Subscription & Payment**:
    - **Plan Types**: `trial`, `active`, `suspended`.
    - **Trial Management**: `trial_ends_at` tracks trial duration. Access restricted with `402 Payment Required` upon expiry.
    - **Bank Transfer Payment**: System supports bank transfers, with `pending` payments managed by super-admins for `confirmation/rejection`.
- **Stock Management**:
    - Prevents negative stock levels.
    - Sales returns automatically restore stock.
    - Unique barcodes and product codes per company.
    - Product deactivation (`isActive: false`) hides products from lists but preserves historical sales data.
- **Sales Rules**: `viewer` role cannot create sales; `admin` and `staff` can. Sales are not deleted, only returned.
- **Error Handling**: Standardized JSON error format with specific error codes (e.g., `INSUFFICIENT_STOCK`, `DUPLICATE_BARCODE`, `PAYMENT_REQUIRED`).
- **Audit Logging**: Tracks key actions such as logins, sales, payment processing, and company plan changes.
- **Security**:
    - **Session Security**: `httpOnly`, `secure`, `sameSite` cookies.
    - **Rate Limiting**: Applied to login attempts to prevent brute-force attacks.
    - **Tenant Security**: `X-Tenant` header used only in non-production environments; production relies on subdomain resolution.
    - **Idempotency**: Payment processing prevents double-processing of confirmed or rejected payments.
    - **Business Rule Enforcement**: Critical business rules (e.g., stock levels, return validity) are enforced at the API level.

## Sprint Durumu

| Sprint | Kapsam | Durum |
|--------|--------|-------|
| 1–4 | Temel altyapı, Onboarding, Bildirimler, Müşteri/Cari Takibi | ✅ TAMAMLANDI |
| 5 | Tedarikçi/Alış Yönetimi (CRUD, Alış Faturası, Stok Girişi) | ✅ TAMAMLANDI |
| 6 | Gelişmiş Raporlama (Kâr/Müşteri/Tedarikçi/Stok analizleri, CSV exportlar, 5 sekme) | ✅ TAMAMLANDI |
| 7 | Barkod/Etiket Merkezi (4 şablon, toplu seçim, termal uyumluluk, QR, PDF) | ✅ TAMAMLANDI |
| 8–18 | Sayım/Stok Düzeltme → E-ticaret katalog | ⏳ BEKLIYOR |

**Testler:** 128/128 geçiyor — 20 suite (API integration), E2E (Playwright) Sprint 7 onaylandı

### Yeni Rotalar & Sayfalar (Sprint 5–7)
- `/suppliers`, `/suppliers/:id` — Tedarikçi yönetimi
- `/purchases`, `/purchases/new` — Alış faturası yönetimi
- `/reports` — Gelişmiş raporlar (Satış/Kâr/Müşteri/Tedarikçi/Stok sekmeleri + CSV export)
- `/barcodes` — Etiket Merkezi (Termal/Fiyat/Raf/QR şablonlar, JsBarcode + QRCodeSVG, toplu yazdırma)

### Yeni Backend Rotalar (Sprint 5–7)
- `GET /api/reports/profit` — Ürün/kategori/aylık kâr analizi
- `GET /api/reports/customer-analytics` — Müşteri ciro + borç analizi
- `GET /api/reports/supplier-analytics` — Tedarikçi harcama + borç analizi
- `GET /api/reports/purchases-summary` — Alış özet raporu
- `GET /api/reports/export/sales` — Satış CSV export (BOM+)
- `GET /api/reports/export/purchases` — Alış CSV export
- `GET /api/reports/export/stock` — Stok CSV export

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Drizzle ORM**: Used for interacting with PostgreSQL.
- **Zod**: Schema validation library.
- **Orval**: API client generator for OpenAPI specifications.
- **express-session**: Middleware for session management in Express.
- **bcryptjs**: Library for hashing passwords.
- **@zxing/browser**: Barcode scanning library for client-side use.
- **qrcode.react**: React component for generating QR codes.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **shadcn/ui**: Reusable UI components.