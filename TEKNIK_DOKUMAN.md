# Ticarium365 — Teknik Dokümantasyon

**Sürüm:** 1.0.0 — Canlıya Hazır  
**Son Güncelleme:** 18 Nisan 2026  
**Mimari:** Multi-tenant SaaS, subdomain bazlı izolasyon

---

## 1. Proje Genel Bakış

**Ticarium365**, Türkiye'nin esnafı ve KOBİ'leri için tasarlanmış bulut tabanlı çoklu kiracı (multi-tenant) bir SaaS platformudur. Her şirket kendi alt-alan adından (`prosan.ticarium365.com`, `nihatturizm.ticarium365.com` gibi) erişir; veriler tenant bazında tamamen izoledir.

### 1.1 Aktif Tenant'lar
| ID | Şirket Adı | Subdomain | Sektör |
|----|-----------|-----------|--------|
| 1 | PROSAN ENDÜSTRİ | `prosan` | Endüstriyel ürün satışı |
| 2 | NİHAT TURİZM | `nihatturizm` | Turizm hizmetleri |

### 1.2 Hedef Kitle ve Değer Önerisi
- **Tek platform, tam kontrol:** Stok, satış, fatura ve cari takibi tek yerde
- **Gerçek kâr analizi:** Komisyon, kargo, stok maliyetleri dahil
- **Bulut tabanlı, güvenli:** Banka standartlarında veri koruması, otomatik yedekleme
- **Pazaryeri entegrasyonu:** Trendyol, Hepsiburada, N11, Amazon TR, Çiçeksepeti, vb.
- **E-Fatura/E-Arşiv:** Parasüt, QNB Finans, Logo, Mikro entegrasyonları
- **Mobil uygulama:** SMSYSTEMS Mobil (Expo/React Native)

---

## 2. Teknoloji Yığını

### 2.1 Backend (`artifacts/api-server`)
- **Runtime:** Node.js 20+
- **Framework:** Express.js 5
- **Dil:** TypeScript (strict)
- **ORM:** Drizzle ORM (PostgreSQL)
- **Auth:** Express-session (cookie tabanlı), bcryptjs şifre hashleme
- **Güvenlik:** helmet (HSTS, CSP, Referrer-Policy), express-rate-limit, CORS, trust proxy
- **E-mail:** nodemailer (SMTP, graceful degradation)
- **Logging:** pino (structured JSON)
- **Object Storage:** @replit/object-storage (yedekleme)

### 2.2 Frontend (`artifacts/prosan`)
- **Framework:** React 19 + Vite 7
- **Routing:** wouter (lightweight)
- **State:** TanStack Query 5
- **Styling:** Tailwind CSS 4, shadcn/ui bileşenleri
- **Animasyon:** Framer Motion 12
- **PWA:** Manifest, theme-color, Apple Touch Icon

### 2.3 Mobil (`artifacts/smsystems-mobile`)
- **Framework:** Expo + React Native (yeni mimari)
- **Routing:** expo-router
- **Stil:** Native komponent + custom theme

### 2.4 Veritabanı
- **DBMS:** PostgreSQL 16
- **Şema:** 44 tablo (Drizzle ORM)
- **Migration:** Drizzle Kit (`db:push`)

### 2.5 Monorepo
- **Yönetim:** pnpm workspace
- **Paylaşılan:** `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `scripts`

---

## 3. Mimari ve Çoklu Kiracı (Multi-Tenant) Modeli

### 3.1 Tenant Çözümleme
```
İstek → tenantMiddleware → req.subdomain → companyId çözer → req.companyId set eder
```
- Subdomain `prosan` → `companies.subdomain = 'prosan'` → `companyId = 1`
- Tüm DB sorgularında `WHERE company_id = req.companyId` zorunlu (Drizzle helper'larda enforce)

### 3.2 Rol Hiyerarşisi
```
super_admin   → Tüm tenant'ları yönetir, /super-admin/* sayfalarına erişir
admin         → Kendi şirketinin tüm yönetimi
staff         → Satış, stok, müşteri (yönetim hariç)
viewer        → Sadece okuma
```
Roller `lib/db/src/schema/users.ts` içinde `userRoleEnum` olarak tanımlı.

### 3.3 Public Endpoint'ler (Tenant Gerektirmez)
- `/api/public/v1/pazar` — Aggregator (Ticarium Pazar)
- `/api/public/v1/storefronts/:slug/...` — B2C mağaza vitrini
- `/api/contact` — İletişim formu
- `/api/healthz` ve `/api/healthz/deep` — Sağlık kontrolü

---

## 4. Klasör Yapısı

```
workspace/
├── artifacts/
│   ├── api-server/          # Express API (port 8080)
│   │   ├── src/
│   │   │   ├── app.ts       # Express konfigürasyonu, middleware zinciri
│   │   │   ├── index.ts     # Bootstrap (admin/seed)
│   │   │   ├── middlewares/ # auth, tenant, features, api-key-auth
│   │   │   ├── routes/      # 61 route dosyası
│   │   │   ├── lib/         # audit, email, errors, logger, objectStorage, secret-crypto
│   │   │   └── services/    # marketplace/, einvoice/, channels/, profitEngine
│   │   └── tests/integration.test.mjs   # ~4250 satır integration test
│   ├── prosan/              # React + Vite web (PROSAN/NİHAT panel)
│   │   ├── public/          # favicon, manifest.webmanifest, OG image
│   │   └── src/
│   │       ├── pages/       # 60+ sayfa (admin, super-admin, dashboard, satış vs.)
│   │       ├── components/  # layout, ui (shadcn), forms
│   │       └── hooks/       # useAuth, useToast vb.
│   ├── api-server/          # (yukarıda)
│   ├── mockup-sandbox/      # Tasarım prototipleri (canvas)
│   └── smsystems-mobile/    # Expo mobil
├── lib/
│   ├── db/src/schema/       # 44 Drizzle tablo şeması
│   ├── api-spec/            # OpenAPI spec
│   ├── api-zod/             # Zod validation şemaları
│   └── api-client-react/    # TanStack Query hooks
├── scripts/
│   └── src/
│       ├── seed.ts          # Demo veri seed
│       ├── import-products.ts
│       └── db-backup.ts     # YENİ: pg_dump → Object Storage
├── replit.md                # Proje hafıza dosyası
└── TEKNIK_DOKUMAN.md        # (bu dosya)
```

---

## 5. Veri Modeli — Önemli Tablolar

### 5.1 Çekirdek Tenant Tabloları
| Tablo | Açıklama |
|-------|----------|
| `companies` | Tenant kayıtları (id, name, subdomain, primaryColor, logoUrl, isActive) |
| `users` | Kullanıcılar (companyId, username, passwordHash, role) — `(username, companyId)` unique |
| `audit_logs` | Tüm önemli aksiyonlar (companyId, userId, action, entity, entityId, details, ipAddress) |

### 5.2 İşletme Tabloları
- `products` (companyId, productCode, barcode, name, brand, category, stock, salePrice, purchasePrice, profitPercent)
- `customers` (companyId, code, type [individual/corporate], name, currentBalance, creditLimit)
- `suppliers`, `purchases`
- `sales` (productId, quantity, totalPrice, profit, customerId, channelKey)
- `stock_movements`, `stock_counts`
- `branches`, `personnel`

### 5.3 Pazaryeri & Kanal
- `channel_accounts` (provider, credentials [şifrelenmiş], settings)
- `product_channel_mappings`
- `pricing_rules`, `stock_rules`
- `sync_jobs`, `sync_logs`

### 5.4 E-Fatura
- `einvoice_settings` (provider, sandbox, config [şifrelenmiş])
- `einvoice_outbox`, `einvoice_inbox`, `einvoice_events`

### 5.5 Diğer
- `subscriptions` (plan abonelikleri), `notifications`, `notification_rules`
- `b2b_*` tabloları (B2B katalog/sipariş)
- `loyalty_*`, `campaigns`, `ad_budgets`
- `finance_documents`, `bank_payments`, `banking`
- `production` (üretim modülü)
- `storefronts` (B2C mağaza vitrini)

---

## 6. API Endpoints — Genel Bakış

61 route dosyası, ~250+ endpoint. Önemli gruplar:

| Prefix | İşlev |
|--------|-------|
| `/api/auth/*` | Login, logout, session, şifre değişimi |
| `/api/products` | CRUD, toplu Excel import, barkod oluşturma |
| `/api/sales` | Satış oluşturma, iade, müşteri linkleme |
| `/api/customers`, `/api/suppliers` | Cari yönetimi, ödemeler |
| `/api/stock` | Stok hareketleri, sayım, düzeltme |
| `/api/marketplace` | Pazaryeri hesapları, sync, ürün eşleme |
| `/api/einvoice` | E-fatura ayarları, gönderim, gelen kutusu |
| `/api/finance` | Mali tablolar, kasa, banka |
| `/api/profit` | Kâr motoru, kanal kârlılık karşılaştırma |
| `/api/companies` | Şirket CRUD (super_admin) |
| `/api/audit-logs` | Audit log viewer (super_admin) |
| `/api/subscriptions` | Plan abonelikleri |
| `/api/storefronts` | B2C mağaza yönetimi |
| `/api/public/*` | Auth gerektirmeyen public uçlar |

---

## 7. Güvenlik

### 7.1 Aktif Önlemler
- **helmet** — HSTS preload + maxAge 1 yıl, CSP, X-Frame-Options, Referrer-Policy `strict-origin-when-cross-origin`
- **trust proxy 1** — Replit edge proxy arkasında doğru IP tespiti
- **CORS** — Whitelist edilmiş origin'ler
- **express-session** — `httpOnly`, `secure` (prod), `sameSite=lax`, 30 günlük cookie
- **bcryptjs** — Şifre hash (cost 10)
- **secret-crypto** — Pazaryeri/E-fatura kimlik bilgileri AES-256-GCM ile şifreli (`enc:v1:` prefix)
- **Mask response** — Kimlik alanları (`password`, `secret`, `token`, `apikey`) response'larda `********`

### 7.2 Rate Limiting
| Endpoint | Limit | Pencere |
|----------|-------|---------|
| `/api/auth/login` | 5 deneme | 15 dk |
| `/api/contact` | 3 mesaj | 60 dk |
| `/api/public/v1/pazar` | 60 istek | 1 dk |
| `/api/public/v1/storefronts` POST | 10 sipariş | 10 dk |
| `/api/public/*` (genel) | 120 istek | 1 dk |

### 7.3 Audit Log Kapsamı
Otomatik kaydedilen aksiyonlar:
- **Auth:** `LOGIN`, `LOGIN_FAILED`, `LOGOUT`
- **Kullanıcı:** `USER_CREATE`, `USER_UPDATE`, `USER_DELETE`
- **Ürün:** `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DELETE`
- **Satış:** `SALE_CREATE`, `SALE_RETURN`, `SALE_LINKED_CUSTOMER`
- **Stok:** `STOCK_ADJUSTMENT`
- **Cari:** `CUSTOMER_*`, `SUPPLIER_*` (ödeme, düzeltme, geri yükleme)
- **Şirket:** `COMPANY_UPDATE`, `COMPANY_PLAN_CHANGE`, `PLATFORM_SETTINGS_UPDATE`

Görüntüleme: **Süper admin** → `/super-admin/audit-logs`  
Filtre: action, kullanıcı adı, şirket, tarih aralığı  
İstatistik: günlük dağılım grafiği

### 7.4 Hata Yönetimi
- **Global error handler** — Stack trace loglanır, prod'da generic 5xx döner
- **unhandledRejection / uncaughtException** — Loglanır, process devam eder
- **audit() / sendMail()** — Hata fırlatmaz, ana akışı bloke etmez

---

## 8. Yedekleme ve Felaket Kurtarma

### 8.1 Otomatik DB Yedek
**Komut:**
```bash
pnpm --filter @workspace/scripts run backup
```

**Akış:**
1. `pg_dump` → tam DB dump (clean + if-exists ile restore-edilebilir)
2. `gzip -9` → sıkıştırma
3. **Replit Object Storage** → `/private/backups/YYYY-MM-DD/db-HH-mm.sql.gz`
4. **Otomatik temizlik** → 30 günden eski yedekler silinir

**Performans (mevcut):**
- DB boyutu: ~20 MB
- Yedek boyutu: 1.24 MB (gzip)
- Süre: ~3.2 saniye

**Cron önerisi:** Replit Scheduled Deployment ile her gece 03:00 (TSI) çalıştırılabilir.

### 8.2 Replit Checkpoint Sistemi
Her kod değişikliği otomatik checkpoint olarak kaydedilir; geri dönüş mümkün.

---

## 9. Pazaryeri ve E-Fatura Entegrasyonları

### 9.1 Mimari
- **Provider Registry pattern** — `MP_REGISTRY[provider]` ve `PROVIDER_REGISTRY[provider]` üzerinden seçim
- **Credential şifreleme** — `secret-crypto` ile AES-256-GCM, response'larda otomatik mask
- **Health check** — Her provider için `/health-check` endpoint (kimlik var mı, API erişilebilir mi)

### 9.2 Mevcut Durum
**Pazaryeri (10 sağlayıcı stub):**
- Trendyol, Hepsiburada, N11, Amazon TR, Çiçeksepeti, PTT AVM
- Shopify, WooCommerce, İdeaSoft, Ticimax

**E-Fatura (4 sağlayıcı stub):**
- Parasüt, QNB Finans, Logo, Mikro

**Not:** Tüm provider'lar şu an *stub* — kimlik bilgisi şeması ve UI hazır, gerçek HTTP çağrıları sandbox kimlikleri eklenince devreye girecek. Interface aynı kaldığı için entegrasyon sonrası UI/iş mantığı değişmez.

---

## 10. Test Altyapısı

### 10.1 Integration Tests
**Dosya:** `artifacts/api-server/tests/integration.test.mjs` (~4250 satır)  
**Çalıştırma:** `cd artifacts/api-server && node --test tests/integration.test.mjs`

**Kapsamlı test grupları:**
- Sprint 1-27: Temel fonksiyonlar (CRUD, tenant izolasyon, satış akışı)
- Sprint 73.6: Reklam bütçesi atomic upsert
- Sprint 73.7: Ticarium Pazar concurrent regression
- Canlı Öncesi: Rate limit, güvenlik header'ları
- Süper Admin & Audit Log: Login, endpoint erişimi, action listesi
- PWA & SEO: Manifest doğrulama

### 10.2 Önemli Not
Mevcut test paketinin bir kısmı (Sprint 5, 6, 8, 9, 10, 11, 13, 15) önceden yazılmış ve test DB durumuna bağlı — yeni eklenen test grupları %100 yeşil.

---

## 11. Frontend Sayfa Haritası

### 11.1 Genel Erişim (Login Gerekli)
- `/dashboard` — Ana özet
- `/products`, `/products/new`, `/products/:id`
- `/sales`, `/sales/new`
- `/customers`, `/customers/:id`
- `/suppliers`, `/purchases`
- `/stock`, `/stock-counts`
- `/finance`, `/finance-dashboard`, `/finance-documents`
- `/profit-engine`, `/karlilik-kanal`
- `/branches`, `/personnel`
- `/einvoice`, `/einvoice-providers`
- `/marketplace`, `/marketplace/:id`
- `/storefronts`, `/storefronts/:id`
- `/b2b`, `/b2b/orders`, `/b2b/catalog`
- `/campaigns`, `/loyalty`, `/notifications`
- `/banking`, `/doviz`
- `/raporlar` (resmi raporlar)
- `/ayarlar` (kullanıcı/şirket ayarları)

### 11.2 Süper Admin (Sadece super_admin)
- `/super-admin/firmalar` — Tüm tenant listesi
- `/super-admin/yeni-firma` — 3 adımlı yeni tenant sihirbazı
- `/super-admin/audit-logs` — Audit log viewer (filtre + istatistik)
- `/super-admin/talepler` — İletişim/demo talepleri

### 11.3 Public (Anasayfa)
- `/` — Pazarlama sayfası (Ticarium365 tanıtımı)
- `/hakkimizda`, `/amacimiz`, `/paketler`, `/iletisim`
- `/karsilastir`, `/login`

---

## 12. PWA (Progressive Web App)

`artifacts/prosan/public/manifest.webmanifest` ile:
- **Yüklenebilir:** Telefonda "Ana ekrana ekle" → ikon görünür
- **Standalone:** Tarayıcı arayüzü olmadan tam ekran açılır
- **Theme color:** `#10b981` (yeşil)
- **Background:** `#0f172a` (koyu navy splash)
- **Lang:** `tr-TR`

`index.html` meta etiketleri:
- Open Graph + Twitter Card (sosyal paylaşımda zengin önizleme)
- Apple Touch Icon, apple-mobile-web-app-capable

---

## 13. Ortam Değişkenleri (Secrets)

| Değişken | Açıklama | Zorunlu |
|----------|----------|---------|
| `DATABASE_URL` | PostgreSQL bağlantısı | ✅ |
| `SESSION_SECRET` | Session imzası | ✅ |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Replit Object Storage | ✅ (yedek için) |
| `PRIVATE_OBJECT_DIR` | Private upload dizini | ✅ |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public asset arama yolu | ✅ |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | E-mail | ❌ (yoksa graceful degrade) |
| `NODE_ENV` | `production` / `development` | ✅ |
| `PORT` | API server portu (varsayılan 8080) | ❌ |

**Not:** SMTP konfigüre değilse mail gönderim çağrıları sessizce atlanır, uygulama çökmez.

---

## 14. Kullanıcı Hesapları (Mevcut)

| Kullanıcı | Rol | Şirket | Amaç |
|-----------|-----|--------|------|
| `superadmin` | super_admin | (tüm) | Platform yönetimi |
| `talha` | admin | PROSAN | Geliştirici/test |
| `nihat` | admin | PROSAN | Yönetici |
| `cenan` | admin | PROSAN | Yönetici |
| `goruntule` | viewer | PROSAN | Sadece okuma |
| `personel` | staff | PROSAN | Personel |
| `nihat_admin` | admin | NİHAT TURİZM | Tenant admin |

---

## 15. Demo Veri Durumu

| Tenant | Ürün | Müşteri | Satış |
|--------|------|---------|-------|
| PROSAN ENDÜSTRİ | 1276 | 153 | 160 |
| NİHAT TURİZM | 10 | 5 | 5 (son 15 gün) |

NİHAT'a turizm ürünleri eklendi (Kapadokya tur paketi, transfer, vize, uçak bileti, yaz kampı, otel konaklama vb.).

---

## 16. Workflow ve Geliştirme

### 16.1 Aktif Workflow'lar
| Workflow | Komut | Port |
|----------|-------|------|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/prosan: web` | `pnpm --filter @workspace/prosan run dev` | 80 (proxy) |
| `artifacts/smsystems-mobile: expo` | `pnpm --filter @workspace/smsystems-mobile run dev` | (Expo) |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` | (preview) |

### 16.2 Sık Kullanılan Komutlar
```bash
# Geliştirme
pnpm install                                  # Bağımlılıkları yükle
pnpm --filter @workspace/api-server run dev   # API
pnpm --filter @workspace/prosan run dev       # Web

# Veritabanı
pnpm --filter @workspace/db run db:push       # Şema senkronu
pnpm --filter @workspace/scripts run seed     # Demo veri

# Yedekleme
pnpm --filter @workspace/scripts run backup   # DB yedek → Object Storage

# Test
cd artifacts/api-server && node --test tests/integration.test.mjs

# Build (deployment için)
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/prosan run build
```

---

## 17. Yayınlama (Publishing) ve Canlıya Çıkış

### 17.1 Replit Deployment
- Web Service tipinde deploy edilir
- Build: workspace build script'leri
- Run: API server + frontend statik servisi
- HTTPS otomatik (Let's Encrypt)
- Custom domain bağlama: DNS A/CNAME kaydı

### 17.2 Canlı Öncesi Kontrol Listesi (Tamamlananlar ✅)
- [x] Rate limit (login, contact, public)
- [x] helmet güvenlik header'ları (HSTS, CSP, Referrer-Policy)
- [x] Trust proxy (gerçek IP)
- [x] Global error handler + unhandledRejection
- [x] Health check endpoint (`/api/healthz`, `/api/healthz/deep`)
- [x] Audit log viewer (super_admin)
- [x] Tenant onboarding sihirbazı
- [x] E-mail altyapısı (graceful degradation)
- [x] DB yedek script (Object Storage)
- [x] Süper admin kullanıcı
- [x] PWA manifest + meta tag'ler
- [x] Demo veri (her iki tenant için)
- [x] Regression test paketi

### 17.3 Müşteri-Talep Bekleyenler
- [ ] Pazaryeri gerçek HTTP entegrasyonu (sandbox kimlik bilgisi gerek)
- [ ] E-fatura gerçek HTTP entegrasyonu (sandbox kimlik bilgisi gerek)
- [ ] Domain alımı + DNS yönlendirmesi
- [ ] SMTP servisi seçimi (Gmail / SendGrid / Mailgun / kendi SMTP)
- [ ] Online ödeme (Iyzico/PayTR) — abonelik ücretleri için

---

## 18. Sözleşmesel ve Yasal

- **Veri konumu:** Replit (Google Cloud altyapısı)
- **KVKK:** Veri işleme aydınlatma metni eklenmeli (frontend'e politika sayfası eklenebilir)
- **Yedekleme:** 30 günlük rolling backup + Replit checkpoint sistemi
- **SSL:** Production'da otomatik (Let's Encrypt)

---

## 19. Tipik Akışlar (User Journey)

### 19.1 Yeni Tenant Açma (Süper Admin)
1. `superadmin` ile giriş
2. `/super-admin/yeni-firma` → 3 adım sihirbaz
   - Firma bilgileri (ad, subdomain, renk, logo)
   - Admin kullanıcı (ad, e-posta, şifre)
   - Onay
3. Otomatik: `companies` + `users` (admin role) kayıtları oluşur, audit log yazılır

### 19.2 Satış Yapma
1. `/sales/new` → ürün barkod okut / ara
2. Müşteri seç (opsiyonel)
3. Adet, fiyat, indirim
4. Ödeme yöntemi seç (nakit, kart, transfer, açık hesap)
5. Kaydet → stok düşer, kâr hesaplanır, audit log
6. Fiş yazıcıya gönder (POS) veya e-fatura kes

### 19.3 Pazaryeri Bağlama
1. `/marketplace` → "Yeni mağaza"
2. Sağlayıcı seç (ör. Trendyol)
3. Sandbox / Production seç
4. Kimlik bilgileri (sellerId, apiKey, apiSecret) — şifreli kaydedilir
5. Health check
6. Ürün eşleme + sync

---

## 20. İletişim ve Geliştirici Notları

### 20.1 Kod Stili
- TypeScript strict mode
- Türkçe yorum + Türkçe UI metinleri
- Mesajlar Türkçe (`Errors.unauthorized("Kullanıcı adı veya şifre hatalı")`)
- Audit log'larda ve console log'larda anahtar değerler yapılı (pino structured logging)

### 20.2 Klavye Kısayolları
- POS satış sayfasında F-tuşları (geliştirme aşamasında)

### 20.3 Önemli Konvansiyonlar
- Tüm DB sorguları `companyId` filtreli
- Soft delete (`isActive=false`) tercih edilir
- Şifreli alanlar `enc:v1:` prefix'i ile saklanır
- Response'larda `********` mask'i hassas alanlar için

---

## 21. Sürüm Geçmişi (Özet)

| Sürüm | Tarih | Önemli Değişiklikler |
|-------|-------|----------------------|
| 1.0.0 | 2026-04-18 | Canlı Öncesi Sertleştirme: rate limit, helmet, audit kapsamı, super admin, backup script, PWA |
| 0.9.x | 2026-04 | Sprint 73.6 (atomic upsert), 73.7 (concurrent), Sprint 70'ler |
| 0.8.x | 2026-03 | Pazaryeri stub'ları, e-fatura altyapısı |
| 0.7.x | 2026-02 | B2B modülü, storefront vitrin |
| 0.6.x | 2026-01 | Kâr motoru, kanal kârlılık karşılaştırma |
| 0.5.x | 2025-12 | Multi-tenant geçiş, NİHAT TURİZM eklendi |

---

**Sonu**

Bu doküman, herhangi bir yeni geliştirici/operatörün projeyi hızla anlayabilmesi için yazılmıştır. Güncel kalmak için her büyük değişiklikte güncellenmesi önerilir.
