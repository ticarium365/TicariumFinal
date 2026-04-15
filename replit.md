# PROSAN ENDÜSTRİ - Stok, Barkod ve Satış Yönetim Sistemi

## Proje Genel Bakış

PROSAN ENDÜSTRİ için web tabanlı, tam özellikli endüstriyel stok ve satış yönetim sistemi.

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
- **Auth**: express-session + bcryptjs (session-based)
- **Barcode scanning**: @zxing/browser (kamera ile)
- **QR code**: qrcode.react (IBAN için)
- **Build**: esbuild (CJS bundle)

## Klasör Yapısı

```
artifacts/
  prosan/              # Frontend React uygulaması
    src/
      pages/           # Sayfa bileşenleri (dashboard, products, sales, barcode, reports, settings, users)
      components/      # Paylaşılan bileşenler (layout, auth-context, ui/*)
      hooks/           # Custom React hooks
  api-server/          # Express.js backend
    src/
      routes/          # API route'ları (auth, users, products, sales, dashboard, reports, settings)
      middlewares/     # Auth middleware (requireAuth, requireAdmin)

lib/
  db/                  # Drizzle ORM schema ve bağlantı
    src/schema/        # users, products, sales, product_views, company_settings tabloları
  api-spec/            # OpenAPI spec (openapi.yaml)
  api-client-react/    # Orval tarafından üretilen React Query hooks
  api-zod/             # Orval tarafından üretilen Zod schemas

scripts/
  src/seed.ts          # Örnek veri seed scripti
```

## Kullanıcı Rolleri

- **admin**: Tam erişim (ürün CRUD, kullanıcı yönetimi, raporlar, IBAN)
- **staff**: Ürün görüntüleme/hızlı güncelleme, barkod okuma, satış
- **viewer**: Sadece görüntüleme

## Demo Kullanıcılar

| Kullanıcı | Şifre | Rol |
|-----------|-------|-----|
| admin | admin123 | Admin |
| personel | staff123 | Staff |
| goruntule | staff123 | Viewer |

## Veritabanı Tabloları

- `users` - Kullanıcılar ve roller
- `products` - Ürünler (kod, barkod, stok, fiyat, kar vb.)
- `sales` - Satış kayıtları
- `product_views` - Son 30 gün görüntülenme istatistikleri
- `company_settings` - Firma ayarları ve IBAN bilgisi

## Ana Özellikler

1. **Ürün Yönetimi**: CRUD, barkod (manuel/otomatik), kategori/marka filtreleme
2. **Barkod Sistemi**: Kamera ile tarama (@zxing/browser), manuel giriş, otomatik üretim
3. **Satış Sistemi**: Barkod/arama ile ürün bulma, stok otomatik düşme
4. **Dashboard**: Ciro, kar, kritik stok, günlük satış özeti
5. **Raporlar**: Satış raporu (tarih aralığı), stok raporu
6. **IBAN/QR**: Yazılı IBAN + QR kod (qrcode.react)
7. **Kullanıcı Yönetimi**: Admin paneli, rol atama

## Key Commands

- `pnpm run typecheck` — tam typecheck
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — API hook'larını yenile
- `pnpm --filter @workspace/db run push` — DB schema değişikliklerini uygula
- `pnpm --filter @workspace/api-server run dev` — API server başlat

## Fiyat ve Kar Hesaplama

Çift yönlü çalışır:
- Geliş fiyatı + Satış fiyatı → Kar %
- Geliş fiyatı + Kar % → Satış fiyatı

## Notlar

- Session-based auth (express-session)
- credentials: include ile cookie gönderilir
- API base path: /api
- Frontend port: 19971 (PORT env var)
- API server port: 8080
