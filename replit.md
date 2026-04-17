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
| 7 | Barkod/Etiket Merkezi (4 şablon, toplu seçim, A4/termal, QR, PDF) | ✅ TAMAMLANDI |
| 8 | Stok Sayım Merkezi (sayım oturumu, barkodlu sayım, fark raporu, toplu düzeltme, CSV) | ✅ TAMAMLANDI |
| 10 | Kasa/Gider/Finans Merkezi (gider kategorileri, gider yönetimi, kasa hareketleri, özet, aylık rapor, CSV) | ✅ TAMAMLANDI |
| 9 | Çok Şubeli Yapı (şube CRUD, şube stok seviyeleri, şubeler arası transfer, kullanıcı atama) | ✅ TAMAMLANDI |
| 13 | Entegrasyon Çekirdeği (webhook CRUD, test ping, teslimat logu, API key yönetimi, HMAC imzalama) | ✅ TAMAMLANDI |
| 14 | Muhasebe Entegrasyonu (5 sağlayıcı, CRUD, sync simülasyonu, log, credential maskeleme) | ✅ TAMAMLANDI |
| 15 | E-Ticaret Entegrasyonu (6 platform, CRUD, ürün/sipariş/stok sync, log) | ✅ TAMAMLANDI |
| 11 | Abonelik Sistemi v2 (planlar, abone ol/iptal/yenile, kullanım, faturalar, 4 limit türü) | ✅ TAMAMLANDI |
| 12 | Dosya/Evrak Yönetimi (kategoriler, GCS presigned upload, filtre/arama, indir, tenant izolasyonu) | ✅ TAMAMLANDI |
| 21 | Akıllı Bildirim Sistemi (7 tip, kural CRUD, toggle, test, kullanıcı tercihleri, tenant izolasyonu) | ✅ TAMAMLANDI |
| 22 | Personel Yönetimi (departmanlar, personel CRUD, toggle, izin talepleri, onay/red, tenant izolasyonu) | ✅ TAMAMLANDI |
| 23 | Kampanya & İndirim Yönetimi (yüzde/sabit/buy-x-get-y, kapsam, tarih, kupon, apply endpoint) | ✅ TAMAMLANDI |
| 20 | Public API (Bearer token auth, 12-char prefix, /info/products/inventory/campaigns/stats, scope RBAC) | ✅ TAMAMLANDI |
| 16 | Katalog Yönetimi (catalog settings CRUD, public /catalog endpoint, enabled/disabled toggle) | ✅ TAMAMLANDI |
| 17 | Sipariş Yönetimi (orders CRUD, status workflow, public order creation via catalog) | ✅ TAMAMLANDI |
| 18 | Müşteri Grupları (customer groups + members, discount_pct, CRUD, tenant izolasyonu) | ✅ TAMAMLANDI |
| 19 | Sipariş & Katalog Analitik (/orders/analytics period, /catalog-analytics, bySource, topProducts) | ✅ TAMAMLANDI |
| 24 | QA & Giriş Doğrulama (orders/customer-groups eksik alan, geçersiz ID, 404 edge case testleri) | ✅ TAMAMLANDI |
| 25 | Performans (compression middleware, 5MB body limit, JSON content-type doğrulama) | ✅ TAMAMLANDI |
| 26 | Güvenlik (helmet security headers, X-Content-Type-Options, X-Frame-Options, role-based 403) | ✅ TAMAMLANDI |
| 27 | DevOps & İzleme (GET /healthz/deep — DB bağlantısı, uptime, version, timestamp) | ✅ TAMAMLANDI |
| 28–29 | Mobil (Expo React Native — Barkod tarayıcı, stok yönetimi, 4 tab: Panel/Tarayıcı/Ürünler/Satışlar) | ✅ TAMAMLANDI |

**Testler:** 383/383 geçiyor — 44 suite (API integration)

### Mobil Uygulama (Sprint 28–29)
- **Artifact**: `artifacts/smsystems-mobile` (Expo Router, port 21079)
- **Auth**: Session tabanlı (AsyncStorage cookie jar, X-Tenant header)
- **Ekranlar**:
  - `/login` — Kullanıcı adı/şifre girişi, hata gösterimi, haptics
  - `/(tabs)/index` — Dashboard: bugünkü ciro, 4 istatistik kartı, kritik stok uyarıları
  - `/(tabs)/scanner` — CameraView barkod tarayıcı + manuel giriş, stok +/- hızlı güncelleme
  - `/(tabs)/products` — Ürün listesi, debounced arama, stok durum göstergesi
  - `/(tabs)/sales` — Satış geçmişi, bugün özet kartı
- **Tema**: Dark/light mode desteği (koyu: #0F1117 arkaplan, mavi #4D9FFF primary, teal #00C9A7 accent)
- **Paketler**: expo-camera@~17.0.10, @react-native-async-storage/async-storage@2.2.0

### Yeni Rotalar & Sayfalar (Sprint 5–10)
- `/suppliers`, `/suppliers/:id` — Tedarikçi yönetimi
- `/purchases`, `/purchases/new` — Alış faturası yönetimi
- `/reports` — Gelişmiş raporlar (Satış/Kâr/Müşteri/Tedarikçi/Stok sekmeleri + CSV export)
- `/barcodes` — Etiket Merkezi (Termal/Fiyat/Raf/QR şablonlar, A4 ızgara yazdırma)
- `/stock-counts`, `/stock-counts/:id` — Stok Sayım Merkezi (oturum yönetimi, barkod sayımı, fark/düzeltme)
- `/finance` — Kasa/Finans Merkezi (özet dashboard, gider yönetimi, kasa hareketleri)

### Yeni Backend Rotalar (Sprint 5–10)
- `GET /api/reports/profit` — Ürün/kategori/aylık kâr analizi
- `GET /api/reports/customer-analytics` — Müşteri ciro + borç analizi
- `GET /api/reports/supplier-analytics` — Tedarikçi harcama + borç analizi
- `GET /api/reports/purchases-summary` — Alış özet raporu
- `GET /api/reports/export/sales` — Satış CSV export (BOM+)
- `GET /api/reports/export/purchases` — Alış CSV export
- `GET /api/reports/export/stock` — Stok CSV export
- `GET/POST /api/stock-counts` — Sayım oturumu CRUD
- `POST /api/stock-counts/:id/items` — Barkod/kod ile sayım kalemi upsert
- `POST /api/stock-counts/:id/load-all` — Tüm ürünleri oturuma yükle
- `POST /api/stock-counts/:id/close` — Oturumu kapat
- `POST /api/stock-counts/:id/approve` — Toplu stok düzeltme onayla
- `GET /api/stock-counts/:id/export` — Fark raporu CSV
- `GET/POST /api/finance/expense-categories` — Gider kategorileri
- `PUT /api/finance/expense-categories/:id` — Kategori güncelle
- `GET/POST /api/finance/expenses` — Gider CRUD
- `DELETE /api/finance/expenses/:id` — Gider sil
- `GET /api/finance/expenses/export` — Gider CSV export
- `GET /api/finance/cash` — Kasa listesi
- `GET/POST /api/finance/cash/:id/movements` — Kasa hareketleri
- `GET /api/finance/summary` — Finans özeti (gelir/gider/kasa)
- `GET /api/finance/monthly-summary` — Aylık finans özeti

### DB Şeması (Sprint 10 ek tablolar)
- `expense_categories` — Gider kategorileri (companyId, name, icon, color)
- `expenses` — Gider kayıtları (companyId, categoryId, amount, description, expenseDate, paymentMethod)
- `cash_registers` — Kasa tanımları (companyId, name, openingBalance, currentBalance, isDefault)
- `cash_movements` — Kasa hareketleri (registerId, type, direction, amount, balanceBefore, balanceAfter)

## Sprint 46-49 — Omnichannel Satış Kanalları (TAMAMLANDI)

- Yeni tablo: `product_channel_listings` — kiracı başına ürün × kanal eşlemesi (companyId+productId+channelKey unique). 8 kanal sabit (`CHANNEL_KEYS`): trendyol, hepsiburada, n11, amazon_tr (marketplace) · shopify, own_site (ecommerce) · supplier_network, public_catalog (b2b).
- Fiyat motoru (`computeEffectivePrice`): 4 mod — `fixed`, `markup_pct`, `markup_amount`, `base` — opsiyonel `minPrice` tabanı + zaman pencereli `campaignPrice`/`campaignStartsAt`/`campaignEndsAt` desteği.
- Stok motoru (`computeEffectiveStock`): 4 mod — `full`, `buffer` (stok−tampon), `fixed`, `percent` — `minStockShow`/`maxStockShow` ile kelepçe + `stopBelowCritical` kritik altında otomatik gizleme.
- API: `/api/channels` altında `GET /` (kanal tanımları), `GET /stats` (kanal başına toplam/aktif), `GET /:channelKey/listings` (matris satırları), `GET /products/:productId/all` (8 kanalın hepsi), `PUT /products/:productId/:channelKey` (upsert), `POST /bulk` (filtre→kanallar→aksiyon sihirbazı). Bulk handler `onConflictDoUpdate` ile atomik (race-condition güvenli).
- Frontend: `/channels` (kanal kartları + istatistikler), `/channels/:channelKey` (matris + inline aktif toggle + ürün başına ayar dialog'u), `/channels/bulk` (3 adımlı sihirbaz: filtre → kanal seçimi → aksiyon). Sidebar'a "Satış Kanalları" (Radio ikonu) eklendi.
- E2E doğrulandı: PROSAN PAMUKKALE markası tek komutla 2 kanalda yayına alındı (9 ürün × 2 kanal = 18 affected, idempotent ikinci çalıştırma da çalışıyor). NİHAT, PROSAN'ın ürünlerine müdahale edemiyor (404).
- Not: Marketplace gerçek API entegrasyonları (Trendyol/Hepsiburada/N11/Amazon SP-API) ayrı sprint — gerçek kimlik bilgileri gerektiriyor; iskelet hazır, sync job'u eklendiğinde her kanalın kendi adapter'ı `effectivePrice/effectiveStock` çıktılarını kullanacak.

## Sprint 33 — B2B Katalog (TAMAMLANDI)

- Yeni tablo: `b2b_catalog_items` (companyId, sourceProductId, name/code/category, listPrice nullable, minOrderQty, leadDays, isPublished, sortOrder).
- API: `/api/b2b/catalog` altında `GET /mine`, `GET /by-subdomain/:sub` (yalnız `isPublished=true`), `POST /`, `POST /import-from-products` (max 200, kiracıya ait ürünleri `inArray` ile çeker), `PATCH /:id`, `POST /:id/toggle`, `DELETE /:id` — hepsi `companyId` ile sıkı izole.
- Frontend: `/b2b/catalog` (kart ızgarası, ekle/düzenle dialog'u, "Stoktan Aktar" çoklu seçim dialog'u, yayınla/gizle, sil), sidebar bağlantısı (`PackageOpen`).
- Network firma profilinde "Katalog" bölümü (firma katalog yayınlamışsa görünür) — alıcı kalem başına miktar girip "Teklif İste" butonuyla `sessionStorage["b2b:quote-prefill"]` üzerinden `/b2b/quotes/new` sayfasını ön-doldurur (subdomain doğrulanır, okunduktan sonra silinir).
- E2E doğrulandı: NİHAT katalog kalemi yayınladı → PROSAN profilden gördü → prefill ile teklif oluşturma akışı hazır. Tenant izolasyonu: PROSAN, NİHAT'ın kalemini PATCH/DELETE edemiyor (404).
- Ek küçük fix: `orders-list.tsx` API non-array dönerse `filtered.map` patlıyordu, `Array.isArray` ile sertleştirildi.

## Sprint 32 — B2B Sipariş Yönetimi (TAMAMLANDI)

- Yeni tablo: `b2b_orders` (kod, durum, toplam, sevkiyat adresi, kargo bilgisi, durum zaman damgaları).
- Akış: Alıcı bir teklifi `accepted` yaptığında otomatik olarak `b2b_orders` kaydı oluşturulur (kod `ORD-YYMMDD-XXXX`).
- Durum makinesi: `pending → confirmed → shipped → delivered → completed` ve `pending|confirmed → cancelled`.
  - Satıcı: pending→confirmed, confirmed→shipped (kargo no/firma ekler), shipped→delivered, delivered→completed.
  - Alıcı: shipped/delivered→completed; pending/confirmed iken iptal edebilir.
- API: `/api/b2b/orders/{inbox|outbox|stats}`, `GET /:id`, `PATCH /:id/status`.
- Frontend: `/b2b/orders` (sekmeli liste + istatistik chip'leri), `/b2b/orders/:id` (durum çizgisi, sevkiyat kartı, kargo dialog'u, iptal dialog'u). Sidebar'a "Siparişler" eklendi.
- Bildirimler: her durum değişikliğinde karşı tarafa `b2b_order_status` notification düşülür; otomatik sipariş oluşturulurken `b2b_quote_decision` mesajına sipariş kodu eklenir.

## Sprint 31 — B2B RFQ / Teklif Sistemi (TAMAMLANDI)

- Yeni tablolar: `b2b_quote_requests`, `b2b_quote_items`, `b2b_messages`.
- API: `/api/b2b/quotes` altında inbox/outbox/stats listeleri, oluşturma, satıcı yanıtı (`/respond`), alıcı kararı (`/decision`), iptal ve mesajlaşma (`GET/POST /:id/messages`).
- Frontend: PROSAN tarafında `/b2b/quotes`, `/b2b/quotes/new`, `/b2b/quotes/:id` sayfaları, sidebar bağlantısı, firma profilinden "Teklif İste" akışı.
- Bildirim entegrasyonu: her aşamada karşı tarafa `notifications` kaydı düşülür (`b2b_quote_request`, `b2b_quote_response`, `b2b_quote_decision`, `b2b_message`).
- Önemli not: `companies` tablosunda alanlar `primaryColor` / `logoUrl`'dır; B2B select'lerinde bu isimler kullanılmalı (yanlış alan adı `orderSelectedFields` patlamasına yol açıyor).

## Sprint 30 — B2B Tedarik Ağı (TAMAMLANDI)

### Yeni DB Tabloları
- `company_network_profiles` — Ağ profili (sektör, şehir, açıklama, telefon, görünürlük bayrakları, etiketler, güven puanı)
- `company_network_reviews` — Firmalar arası değerlendirmeler (puan 1-5, yorum, kiracı izolasyonu)

### Yeni API Endpoint'leri (`/api/network`)
- `GET /api/network` — Herkese açık firma listesi (şehir/sektör filtreleri, sayfalama)
- `GET /api/network/my-profile` — Giriş yapmış firmanın ağ profili (yoksa otomatik oluşturur)
- `PUT /api/network/my-profile` — Profil güncelleme (gizlilik bayrakları, etiketler, sektor, şehir vb.)
- `GET /api/network/companies/:subdomain` — Herkese açık firma profili (değerlendirmelerle)
- `POST /api/network/companies/:subdomain/reviews` — Değerlendirme gönder
- `GET /api/network/meta/sectors` — Sektör listesi
- `GET /api/network/meta/cities` — Şehir listesi

### Yeni Frontend Sayfaları (PROSAN)
- `/network` — B2B firma dizini (arama, şehir/sektör filtresi, kart grid, sayfalama)
- `/network/my-profile` — Ağ profili yönetimi (görünürlük, anonim mod, etiketler, izinler)
- `/network/:subdomain` — Firma profili detayı + değerlendirme formu

### Diğer Değişiklikler
- `artifacts/prosan/src/lib/api.ts` oluşturuldu (`apiBase = "/api"` export)
- Sidebar'a "B2B Ağı" (Network ikonu) menü öğesi eklendi
- `App.tsx`'e 3 yeni route eklendi

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