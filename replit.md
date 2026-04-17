# SMS — Stok Yönetim Sistemi (Multi-Tenant SaaS)

## Proje Genel Bakış

Subdomain-tabanlı çok kiracılı (multi-tenant) SaaS stok, barkod ve satış yönetim platformu.
Her şirket kendi subdomain'i üzerinden sisteme erişir (ör. `prosan.smsystem.com`).
Platform markası **SMSYSTEMS**; kiracı markası dinamik olarak API'dan çekilir.

---

## Test Komutu

```bash
# API integration testleri (56 test, 13 suite) — server çalışırken çalıştırın
pnpm --filter @workspace/api-server run test
```

Testler `artifacts/api-server/tests/integration.test.mjs` dosyasındadır. Node.js `node:test` + native `fetch` kullanır, ek bağımlılık gerekmez. Çalışan sunucuya (port 8080) gerçek HTTP istekleri atar.

**Not:** Rate limiter production dışında devre dışı (`skip: () => NODE_ENV !== "production"`). Test çalıştırmadan önce kullanıcıların `is_active=true` olduğundan emin olun.

**Suite'ler (13):**
1. Auth · 2. Ürünler · 3. Satış ve Stok · 4. Soft Delete & Restore · 5. Tenant İzolasyonu · 6. Düşük Stok Alarmları · 7. Toplu Stok Güncellemesi · 8. Günlük Kapanış Özeti · 9. Super Admin
10. Ayarlar · 11. Onboarding · 12. Logo Yükleme · 13. Demo Sıfırlama

---

## Teknoloji Stack

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces |
| Node.js | v24 |
| TypeScript | 5.9 |
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |
| Backend | Express 5 |
| Veritabanı | PostgreSQL + Drizzle ORM |
| Doğrulama | Zod (v4), drizzle-zod |
| API Codegen | Orval (OpenAPI → React Query hooks + Zod) |
| Auth | express-session + bcryptjs (session tabanlı, şirket kapsamlı) |
| Barkod | @zxing/browser (kamera ile tarama) |
| QR Kod | qrcode.react |
| Build | esbuild (ESM bundle) |

---

## Klasör Yapısı

```
artifacts/
  prosan/                      # Frontend React uygulaması
    src/
      pages/
        dashboard.tsx          # Ana panel (grafikler, istatistikler)
        products.tsx           # Ürün listesi ve yönetimi
        product-detail.tsx     # Ürün detay / düzenleme
        barcode.tsx            # Barkod tarama ve arama
        sales.tsx              # Yeni satış (sepet)
        sales-history.tsx      # Satış geçmişi ve iadeler
        stock.tsx              # Stok girişi
        reports.tsx            # Satış ve stok raporları
        reports/
          daily-summary.tsx    # Günlük kapanış özeti (KPI + ödeme kırılımı + top 5 ürün)
        settings.tsx           # Şirket ve kullanıcı ayarları
        users.tsx              # Kullanıcı yönetimi
        payment.tsx            # Ödeme / abonelik sayfası (IBAN + havale formu)
        admin/
          companies.tsx        # Super admin — firma listesi ve ekleme
          users.tsx            # Super admin — tüm kullanıcılar
          payments.tsx         # Super admin — havale bildirimleri yönetimi
          platform-settings.tsx# Super admin — IBAN ayarları
      components/
        layout.tsx             # Sidebar, header, TrialBanner
        auth-context.tsx       # Oturum durumu (React Context)
        company-context.tsx    # Aktif şirket (React Context)
        trial-gateway.tsx      # Trial süresi dolmuşsa ödeme sayfasına yönlendir
        low-stock-bell.tsx     # Düşük stok alarm zili (60s polling, sidebar + mobil)
        bulk-stock-modal.tsx   # Toplu stok güncelleme (XLSX drag-drop + dry-run preview)
        ui/                    # shadcn bileşenleri

  api-server/                  # Express.js backend
    src/
      routes/
        auth.ts                # Giriş, çıkış, session, /me, /tenant
        users.ts               # Kullanıcı CRUD (admin)
        products.ts            # Ürün CRUD
        sales.ts               # Satış kayıtları, iade
        dashboard.ts           # İstatistikler
        reports.ts             # Raporlar
        stock.ts               # Stok hareketleri
        settings.ts            # Şirket ayarları
        catalog.ts             # Herkese açık ürün kataloğu (auth olmadan)
        companies.ts           # Firma CRUD + trial yönetimi (super admin)
        payment.ts             # Abonelik durumu, havale bildirimi, admin onay
      middlewares/
        tenant.ts              # Host/X-Tenant → company_id çözümü + trial kontrolü
        auth.ts                # requireAuth, requireAdmin, requireSuperAdmin

lib/
  db/
    src/
      schema/
        companies.ts           # Kiracı şirketler (plan_type, trial_ends_at dahil)
        users.ts               # Kullanıcılar
        products.ts            # Ürünler
        sales.ts               # Satışlar
        stock_movements.ts     # Stok hareketleri
        product_views.ts       # Görüntülenme istatistikleri
        company_settings.ts    # Şirket ayarları
        bank_payments.ts       # Havale bildirimleri
        platform_settings.ts   # IBAN ve platform ayarları
      index.ts                 # db bağlantısı ve tüm export'lar
  api-spec/
    openapi.yaml               # OpenAPI 3.0 spec
  api-client-react/            # Orval üretimi: React Query hooks
  api-zod/                     # Orval üretimi: Zod şemaları

scripts/
  src/seed.ts                  # Örnek veri seed scripti
```

---

## Multi-Tenant Mimari

### Tenant Resolution (tenant.ts)

Her `/api` isteğinden önce çalışır:

1. `Host` header'ından subdomain çıkarır → `companies` tablosunda arar
2. `X-Tenant` header varsa onu kullanır (geliştirme ortamı kolaylığı)
3. Hiçbiri yoksa en düşük id'li aktif şirketi döndürür (dev fallback, `ORDER BY id ASC`)
4. `req.companyId` ve `req.company` set eder — tüm route'lar bu değerleri kullanır

### Muaf Yollar (trial kontrolü bypass)

Trial süresi dolmuş olsa bile şu yollara erişim açıktır:
- `/auth/` — giriş/çıkış
- `/payment/` — abonelik durumu ve havale bildirimi
- `/catalog` — herkese açık ürün kataloğu
- `/health` — sağlık kontrolü

> Not: Express'te `app.use("/api", middleware)` kullanıldığında `req.path`, `/api` prefix'i olmadan gelir (`/auth/login` gibi). Bu nedenle muaf yol listesi `/api` olmadan yazılmıştır.

### Şirket İzolasyonu

Tüm tablolarda `company_id` sütunu mevcut. Her route:
- SELECT: `WHERE company_id = req.companyId`
- INSERT: `company_id = req.companyId` otomatik eklenir
- UPDATE/DELETE: önce company_id kontrolü yapılır

---

## Abonelik / Trial / Ödeme Sistemi

### Plan Tipleri

| Plan | Açıklama |
|---|---|
| `trial` | Deneme süresi; `trial_ends_at` dolduğunda 402 döner |
| `active` | Ödeme onaylanmış, aktif abonelik |
| `suspended` | Askıya alınmış hesap |

### Trial Akışı

1. Super admin `PATCH /api/companies/:id` ile `trialDays` gönderir
2. Backend `trial_ends_at = now + trialDays` hesaplar
3. Süre dolunca tenant middleware `402 Payment Required` döner
4. Frontend `TrialGateway` 402 algıladığında kullanıcıyı `/payment` sayfasına yönlendirir
5. Sidebar'da kalan gün sayacı (`TrialBanner`) görünür

### Havale (Banka Transferi) Akışı

1. Müşteri `/payment` sayfasında IBAN bilgisini görür, formu doldurur
2. `POST /api/payment/bank-transfer` — `bank_payments` tablosuna `pending` kaydı oluşur
3. Super admin `/admin/payments` sayfasında bildirimleri listeler, onaylar veya reddeder
4. Onaylandığında şirketin `plan_type = active`, `trial_ends_at = now + N ay` olarak güncellenir

### İlgili API Endpoint'leri

| Endpoint | Yetki | Açıklama |
|---|---|---|
| `GET /api/payment/status` | Herkese açık (tenant bazlı) | Plan durumu, kalan gün |
| `POST /api/payment/bank-transfer` | Giriş yapmış kullanıcı | Havale bildirimi gönder |
| `GET /api/payment/my-payments` | Giriş yapmış kullanıcı | Kendi bildirimlerini gör |
| `GET /api/admin/payments` | super_admin | Tüm bildirimler |
| `PATCH /api/admin/payments/:id` | super_admin | Onayla / reddet |
| `GET /api/admin/platform-settings` | super_admin | IBAN bilgisini oku |
| `PUT /api/admin/platform-settings` | super_admin | IBAN bilgisini güncelle |

---

## Kullanıcı Rolleri

| Rol | Erişim |
|---|---|
| `super_admin` | Tüm şirketler; firma yönetimi, ödeme onayı, platform ayarları |
| `admin` | Kendi şirketinde tam erişim (ürün, satış, kullanıcı, raporlar) |
| `staff` | Ürün görüntüleme/güncelleme, barkod, satış, stok girişi |
| `viewer` | Sadece görüntüleme |

---

## Demo Hesaplar

### PROSAN ENDÜSTRİ (company_id=1, subdomain=prosan)

| Kullanıcı | Şifre | Rol |
|---|---|---|
| cenan | cenan123 | admin |
| talha | talha123 | staff |
| nihat | nihat123 | staff |
| goruntule | staff123 | viewer |

### NİHAT TURİZM (company_id=2, subdomain=nihatturizm)

| Kullanıcı | Şifre | Rol |
|---|---|---|
| nihat_admin | nihat123 | admin |

### Super Admin (platform geneli)

| Kullanıcı | Şifre | Rol |
|---|---|---|
| superadmin | superadmin123 | super_admin |

---

## Veritabanı Şeması

### companies

```
id, name, subdomain, logo_url, primary_color, is_active,
plan_type (trial|active|suspended), trial_ends_at, created_at
```

### users

```
id, company_id, username, password_hash, full_name,
role (super_admin|admin|staff|viewer), is_active, created_at
unique: (username, company_id)
```

### products

```
id, company_id, product_code, barcode, name, category, brand,
purchase_price, sale_price, discount_sale_pct, stock_quantity,
min_stock_level, unit, description, is_active, created_at, updated_at
```

### sales

```
id, company_id, user_id, total_amount, payment_method (cash|card|transfer|other), note,
returned, returned_at, return_note, created_at
+ sale_items: sale_id, product_id, quantity, unit_price, total_price
```

### stock_movements

```
id, company_id, product_id, user_id, movement_type (purchase|sale|return|adjustment|initial),
quantity, unit_cost, note, created_at
```

### bank_payments

```
id, company_id, amount, sender_name, bank_name, transfer_date,
description, receipt_url, status (pending|confirmed|rejected),
confirmed_by, confirmed_at, notes, created_at
```

### platform_settings

```
id, key, value (jsonb), updated_at
-- IBAN bilgisi: key="iban_info", value={ bankName, iban, accountHolder, description }
```

---

## İş Kuralları

### Stok Yönetimi
- **Stok negatife düşemez**: Satış sırasında `product.stock < quantity` kontrolü yapılır → `400 INSUFFICIENT_STOCK`. DB seviyesinde `CHECK (stock >= 0)` constraint ikinci güvencedir.
- **İade stoku geri yükler**: `POST /api/sales/:id/return` çağrıldığında `product.stock += sale.quantity` otomatik uygulanır ve `stock_movements` tablosuna `type="return"` kaydı düşer.
- **Aynı satış iki kez iade edilemez**: `sale.returned === true` ise `400 ALREADY_RETURNED` döner.

### Ürün Tekliği
- **Barkod** şirket bazlı benzersizdir: `(barcode, company_id)` unique index. Aynı barkod farklı şirketlerde olabilir, aynı şirkette olamaz. `NULL` barkod bu kuraldan muaftır.
- **Ürün kodu** şirket bazlı benzersizdir: `(product_code, company_id)` unique index.
- Çakışma durumunda `409 DUPLICATE_BARCODE` veya `409 DUPLICATE_PRODUCT_CODE` döner.

### Kullanıcı Tekliği
- `(username, company_id)` composite unique: aynı kullanıcı adı farklı şirketlerde var olabilir.

### Ürün Pasifleştirme
- `isActive: false` yapılan ürün API listelerinden çıkar (`WHERE is_active = true`).
- Pasif ürünün geçmiş satış kayıtları korunur; satış geçmişinde görünmeye devam eder.
- Pasif ürüne yeni satış yapılamaz (ürün bulunamaz → `404`).

### Satış Kuralları
- `viewer` rolü satış yapamaz; yalnızca `admin` ve `staff` satış oluşturabilir.
- Satış silinmez; iade mekanizması kullanılır.
- İade edilmiş satış stok hareketleri geçmişinde görünür.

### Ödeme / Abonelik
- `pending → confirmed` veya `pending → rejected`: tek yönlü geçiş. Onaylanmış veya reddedilmiş ödeme tekrar işleme alınamaz (`409 PAYMENT_ALREADY_PROCESSED`).
- `confirmed` işlem sonrası şirketin `plan_type = "active"`, `trial_ends_at = now + N ay` olarak güncellenir.
- `suspended` firmada tüm API istekleri (muaf yollar hariç) `402` döner.

### API Hata Formatı (Standart)

Tüm hata yanıtları şu formattadır:
```json
{
  "error": {
    "code": "HATA_KODU",
    "message": "Kullanıcıya gösterilecek mesaj",
    "details": null
  }
}
```

| HTTP | Kod | Durum |
|---|---|---|
| 400 | `BAD_REQUEST` | Eksik veya geçersiz alan |
| 400 | `INSUFFICIENT_STOCK` | Yetersiz stok; `details.available` mevcut stok |
| 400 | `ALREADY_RETURNED` | Satış zaten iade edilmiş |
| 401 | `UNAUTHORIZED` | Giriş yapılmamış veya şifre hatalı |
| 402 | `PAYMENT_REQUIRED` | Trial süresi dolmuş veya hesap askıda |
| 403 | `FORBIDDEN` | Rol yetersiz |
| 404 | `NOT_FOUND` | Kayıt bulunamadı |
| 409 | `DUPLICATE_BARCODE` | Aynı barkod şirkette var |
| 409 | `DUPLICATE_PRODUCT_CODE` | Aynı ürün kodu şirkette var |
| 409 | `PAYMENT_ALREADY_PROCESSED` | Ödeme zaten işlenmiş |
| 429 | `TOO_MANY_REQUESTS` | Rate limit aşıldı |
| 500 | `INTERNAL_ERROR` | Sunucu hatası |

### Audit Log

`audit_logs` tablosuna şu işlemlerde kayıt düşer:

| Eylem | Ne zaman |
|---|---|
| `LOGIN` | Başarılı giriş |
| `LOGIN_FAILED` | Başarısız giriş denemesi |
| `LOGOUT` | Çıkış |
| `SALE_CREATE` | Yeni satış |
| `SALE_RETURN` | Satış iadesi |
| `PAYMENT_SUBMIT` | Havale bildirimi gönderildi |
| `PAYMENT_CONFIRM` | Havale onaylandı |
| `PAYMENT_REJECT` | Havale reddedildi |
| `COMPANY_PLAN_CHANGE` | Şirket planı değişti |
| `PLATFORM_SETTINGS_UPDATE` | Platform ayarları güncellendi |

Her kayıtta: `company_id, user_id, username, action, entity, entity_id, details (JSON), ip_address, created_at`

---

## Güvenlik

### Oturum (Cookie)
- `httpOnly: true` — JavaScript ile erişilemez
- `secure: true` — yalnızca production'da, HTTPS üzerinden
- `sameSite: "strict"` — production'da; geliştirmede `"lax"`

### Rate Limiting
- Login endpoint (`POST /api/auth/login`): 15 dakikada maksimum 20 başarısız deneme
- Aşılırsa `429 Too Many Requests` döner
- Başarılı girişler sayaca dahil edilmez (`skipSuccessfulRequests: true`)

### Tenant Güvenliği
- `X-Tenant` header yalnızca `NODE_ENV !== "production"` ortamında kabul edilir
- Subdomain çözümlenemezse production'da `400 Bad Request` döner; geliştirmede ilk aktif şirkete fallback yapılır
- **ÖNEMLİ**: "En düşük id'li firma" fallback'i yalnızca geliştirme için tasarlanmıştır. Production deployment'ta subdomain daima çözülmeli; fallback asla çalışmamalıdır.

### Ödeme Idempotency
- Onaylanmış veya reddedilmiş ödemeler tekrar işleme alınamaz
- İkinci işlem denemesi `409 Conflict` döner
- `bank_payments.status` → `pending` → `confirmed | rejected` tek yönlü geçiş

### İş Kuralı Güvenceleri
- Stok negatife düşemez: satış sırasında `product.stock < quantity` kontrolü yapılır, `400` döner
- İade ikinci kez yapılamaz: `sale.returned === true` ise `400` döner
- Kullanıcılar yalnızca kendi şirket kapsamındaki verilere erişebilir

---

## Sprint İlerleme Durumu

| Sprint | Başlık | Durum |
|--------|--------|-------|
| Sprint 1 | Temel Altyapı (Bulk stok, Günlük kapanış, Ödeme yöntemi) | ✅ TAMAMLANDI |
| Sprint 2 | Onboarding Paketi (Sihirbaz, Logo, Tema, Demo reset, WelcomeTour) | ✅ TAMAMLANDI |
| Sprint 3–18 | Gelecek sprintler (AI stok tahmini → E-ticaret katalog) | ⏳ BEKLIYOR |

### Sprint 2 Özeti
- **DB**: `company_settings` genişletildi — `logo_url`, `primary_color`, `onboarding_completed`, `currency`, `tax_rate`, `website`, `tax_number`
- **Backend**: `/api/settings` PUT (yeni alanlar), `/api/settings/onboarding-status`, `/api/settings/onboarding-complete`, `/api/settings/logo` (POST/DELETE base64), `/api/settings/reset-demo`
- **Frontend**: 4 adımlı Onboarding wizard (`/onboarding`), `WelcomeTour` (localStorage tabanlı 4 adım), Settings sayfası (logo yükleme + tema rengi seçici + demo reset + QR)
- **Testler**: 56/56 geçiyor (13 suite: +4 yeni Sprint 2 suite'i)
- **Rate Limiter**: Development ortamında devre dışı (production'da aktif)

---

## Önemli Uygulama Notları

- `discountSalePct` → iskontolu fiyat = `purchasePrice × (1 + discountSalePct / 100)`
- Barkod arama sırası: önce `barcode` sonra `productCode` alanına bakar
- `sale.returned` TypeScript client'ta `(sale as any).returned` cast'i gerekebilir (Orval tip eksikliği)
- Dev ortamında X-Tenant header ile farklı tenant test edilir: `-H "X-Tenant: nihatturizm"`
- Frontend'de `BASE_URL` (Vite `import.meta.env.BASE_URL`) API çağrılarına prefix olarak eklenir
- Super admin giriş yaptığında sidebar "SMSYSTEMS" gösterir; normal kullanıcıda kendi şirket adı
- Trial banner yalnızca `trial` planda ve `trial_ends_at` dolmadan gösterilir; 3 gün altında kırmızıya döner

---

## Geliştirme Komutları

```bash
# Tüm servisleri başlat
pnpm dev

# Sadece API sunucusu
pnpm --filter @workspace/api-server run dev

# Sadece frontend
pnpm --filter @workspace/prosan run dev

# Veritabanı şemasını güncelle
pnpm --filter @workspace/db run push

# Örnek veri yükle
pnpm --filter @workspace/scripts run seed

# API client kodlarını yeniden üret (OpenAPI → Orval)
pnpm --filter @workspace/api-client-react run generate
```
