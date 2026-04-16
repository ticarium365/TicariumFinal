# SMS — Stok Yönetim Sistemi (Multi-Tenant SaaS)

## Proje Genel Bakış

Subdomain-tabanlı çok kiracılı (multi-tenant) SaaS stok ve satış yönetim sistemi.
Her şirket kendi subdomain'i üzerinden sisteme erişir (ör. `prosan.smsystem.com`).
PROSAN ENDÜSTRİ ilk kiracı olarak seeded edilmiştir.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (artifacts/prosan)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: express-session + bcryptjs (session-based, company-scoped)
- **Barcode scanning**: @zxing/browser (kamera ile)
- **QR code**: qrcode.react (IBAN için)
- **Build**: esbuild (CJS bundle)

## Klasör Yapısı

```
artifacts/
  prosan/              # Frontend React uygulaması
    src/
      pages/           # dashboard, products, sales, barcode, reports, settings, users, admin/companies
      components/      # layout, auth-context, company-context, ui/*
      hooks/           # Custom React hooks
  api-server/          # Express.js backend
    src/
      routes/          # auth, users, products, sales, dashboard, reports, settings, catalog, stock, companies
      middlewares/     # tenant.ts (subdomain→company), auth.ts (requireAuth, requireAdmin, requireSuperAdmin)

lib/
  db/                  # Drizzle ORM schema ve bağlantı
    src/schema/        # companies, users, products, sales, stock_movements, product_views, company_settings
  api-spec/            # OpenAPI spec (openapi.yaml)
  api-client-react/    # Orval tarafından üretilen React Query hooks
  api-zod/             # Orval tarafından üretilen Zod schemas

scripts/
  src/seed.ts          # Örnek veri seed scripti
```

## Multi-Tenant Mimarisi

### Tenant Resolution
`tenant.ts` middleware her `/api` isteğinden önce çalışır:
1. `Host` header'ından subdomain çıkarır → `companies` tablosunda arar
2. Dev ortamı: `X-Tenant` header veya ilk aktif şirket (fallback)
3. `req.companyId` ve `req.company` set eder

### Şirket İzolasyonu
Tüm tablolarda `company_id` sütunu; tüm route'lar `eq(table.companyId, req.companyId)` filtresi uygular:
- products, sales, stock_movements, product_views, users, company_settings

### Auth
- Login: kullanıcı adı + şifre + company scope (farklı şirketler aynı kullanıcı adı kullanabilir)
- Session'a `companyId` eklenir
- `super_admin` rolü tüm şirketlere erişebilir

## Kullanıcı Rolleri

- **super_admin**: Tüm şirketlere erişim, firma yönetimi (`/admin/companies`)
- **admin**: Tam erişim kendi şirketinde (ürün CRUD, kullanıcı yönetimi, raporlar)
- **staff**: Ürün görüntüleme/güncelleme, barkod, satış, stok girişi
- **viewer**: Sadece görüntüleme

## Demo Kullanıcılar (company_id=1, subdomain=prosan)

| Kullanıcı | Şifre | Rol |
|-----------|-------|-----|
| cenan | cenan123 | Admin |
| talha | talha123 | Staff |
| nihat | nihat123 | Staff |
| goruntule | staff123 | Viewer |

## Veritabanı Tabloları

- `companies` - Kiracı şirketler (name, subdomain, primaryColor, logoUrl, isActive)
- `users` - Kullanıcılar ve roller (company_id ile izole)
- `products` - Ürünler (kod, barkod, stok, fiyat, kar, discountSalePct)
- `sales` - Satış kayıtları (returned, returnedAt, returnNote dahil)
- `stock_movements` - Stok hareketi geçmişi
- `product_views` - Son 30 gün görüntülenme istatistikleri
- `company_settings` - Firma ayarları ve IBAN bilgisi

## Ana Özellikler

1. **Multi-Tenant**: Subdomain-tabanlı izolasyon, her şirket kendi verisini görür
2. **Dinamik Marka**: Login sayfası ve sidebar şirket adını API'dan alır (`/api/auth/tenant`)
3. **Ürün Yönetimi**: CRUD, barkod, kategori/marka filtreleme, iskontolu fiyat
4. **Barkod Sistemi**: Kamera ile tarama, manuel giriş, otomatik üretim
5. **Satış Sistemi**: Çoklu ürün sepeti, barkod/arama ile ürün bulma
6. **Stok Girişi** (`/stock`): Depoya gelen ürünleri kaydet
7. **Stok Hareketi Geçmişi**: Satış/giriş/iade/düzeltme timeline'ı
8. **Satış İadesi**: Stok otomatik geri yüklenir
9. **Dashboard**: 30 günlük ciro/kar grafik, çok satanlar, kritik stok
10. **Raporlar**: Satış raporu (tarih aralığı), stok raporu
11. **Super Admin Paneli**: `/admin/companies` — firma ekleme, aktif/pasif etme

## Önemli Notlar

- `discountSalePct` → iskontolu satış fiyatı = `purchasePrice * (1 + discountSalePct/100)`
- Barkod lookup: önce `barcode` sonra `productCode` alanı aranır
- `sale.returned` TypeScript client'ta `(sale as any).returned` cast'i gerekebilir
- Dev ortamında tenant header olmadan ilk aktif şirket kullanılır (prosan)
- X-Tenant header ile farklı tenant test edilebilir: `-H "X-Tenant: prosan"`
