# Ticarium365 — Teknik Dokümantasyon
**Tarih:** 18 Nisan 2026
**Sürüm:** v1.0 (canlı yayın öncesi)

---

## 1. Sistem Mimarisi

### 1.1 Teknoloji Yığını
| Katman | Teknoloji |
|---|---|
| Backend API | Node.js 20 + Express + TypeScript (ESM) |
| ORM / DB | Drizzle ORM + PostgreSQL 16 (Replit-managed) |
| Web Frontend | React 18 + Vite + TailwindCSS + shadcn/ui + Wouter |
| Mobil | Expo React Native (SMSYSTEMS Mobil) |
| Auth | Express-session + scrypt parolalar + role-based (RBAC) |
| Multi-tenant | Subdomain bazlı (`firmaadi.ticarium365.com`) + `companyId` tenant izolasyonu |
| Şifreleme | AES-256-GCM (SESSION_SECRET → scrypt 32-byte key, `enc:v1:` prefix) |
| Object Storage | Replit App Storage |
| Job/Idempotency | PostgreSQL advisory locks (`pg_advisory_xact_lock`) + reserve-first pattern |

### 1.2 Monorepo Yapısı
```
artifacts/
  api-server/        → Express backend (PORT 8080)
  prosan/            → React web app (PROSAN tenant + super admin UI)
  smsystems-mobile/  → Expo mobil
  mockup-sandbox/    → Tasarım önizleme
lib/
  db/                → Drizzle schema + migrations (43 tablo)
  feature-flags/     → Plan bazlı özellik kontrolü
  notifications/     → Bildirim altyapısı
  shared-utils/      → Ortak helper'lar
```

---

## 2. Tamamlanan Modüller (Production-Ready)

### 2.1 Çekirdek (Core)
| Modül | Endpoint Prefix | Özellik Bayrağı | Durum |
|---|---|---|---|
| Auth + Session | `/api/auth` | — | ✅ |
| Kullanıcı/Rol | `/api/users` | — | ✅ |
| Şirket/Multi-tenant | `/api/companies` | — | ✅ |
| Şube | `/api/branches` | — | ✅ |
| Personel | `/api/personnel` | `hr.staff` | ✅ |
| Dashboard | `/api/dashboard` | — | ✅ |
| Bildirimler | `/api/notifications` + rules | — | ✅ |
| Object Storage | `/api/storage` | — | ✅ |
| Dokümanlar | `/api/documents` | — | ✅ |

### 2.2 Stok & Ürün
| Modül | Endpoint | Durum |
|---|---|---|
| Ürün CRUD | `/api/products` | ✅ |
| Barkod | `/api/products` (barcode unique per company) | ✅ |
| Stok hareketleri | `/api/stock` | ✅ |
| Stok sayımı | `/api/stock-counts` | ✅ |
| Tedarikçi | `/api/suppliers` | ✅ |
| Alış | `/api/purchases` | ✅ |
| Üretim & Reçete (BOM) | `/api/production` | `production.bom` ✅ |
| Veri içe aktarımı (CSV/Excel) | `/api/import` | ✅ |

### 2.3 Satış & Müşteri
| Modül | Endpoint | Durum |
|---|---|---|
| Satış | `/api/sales` | ✅ |
| POS hızlı satış | `/api/sales` + `/pos` page | ✅ |
| Müşteri | `/api/customers` | ✅ |
| Müşteri grupları | `/api/customer-groups` | ✅ |
| Sadakat puanı | `/api/loyalty` | `loyalty.points` ✅ |
| Kampanyalar | `/api/campaigns` | ✅ |
| Çoklu döviz | `/api/currency` | `currency.multi` ✅ |

### 2.4 Finans & Muhasebe
| Modül | Endpoint | Durum |
|---|---|---|
| Finans hareketleri | `/api/finance` | ✅ |
| Banka entegrasyonu | `/api/banking` | `finance.banking` ✅ |
| Bordro / Mali müşavir | `/api/accountant` | `accountant.panel` ✅ |
| Resmi raporlar (BA-BS, KDV) | `/api/reports-official` | `accountant.panel` ✅ |
| Kâr motoru | `/api/profit-engine` | ✅ |
| Kanal kârlılık kıyas | `/api/profit-engine/by-channel` | ✅ |
| Bütçe & Tahmin | `/api/budgets` | `profit.dashboard` ✅ |
| **Reklam Bütçesi (Sprint 73.6)** | `/api/ad-budgets` | `profit.dashboard` ✅ |
| Finans dashboard | `/api/finance-dashboard` | `profit.dashboard` ✅ |

### 2.5 e-Ticarium Merkezi (Sprint 73.x)
| Modül | Endpoint | Durum |
|---|---|---|
| Hub UI | `/eticarium-merkezi` | ✅ |
| Fiyat motoru | `/api/pricing-rules` | ✅ |
| Kargo motoru | `/api/shipping` | ✅ |
| Hazır mağaza (3 tip) | `/api/storefronts` | ✅ |
| Mağaza public render | `/api/public/v1/storefronts/:slug` | ✅ |
| **Ticarium Pazar (Sprint 73.7)** | `/api/aggregator` + `/api/public/v1/pazar` | ✅ |
| Kanal yönetimi | `/api/channels` | ✅ |
| B2B sipariş | `/api/b2b/orders`, `/api/b2b/catalog` | ✅ |
| Sipariş yönetim | `/api/orders-manage` | ✅ |
| Sipariş analitik | `/api/order-analytics` | ✅ |

### 2.6 E-Fatura (Sprint 62 — Hardened)
| Sağlayıcı | Durum |
|---|---|
| `mock` (sandbox) | ✅ Tam çalışır (in-memory ETTN) |
| `parasut` | ⚠️ Stub (config kabul eder, HTTP entegrasyonu API key bekliyor) |
| `qnb_efinans` | ⚠️ Stub |
| `foriba` | ⚠️ Stub |
| `logo_eflow` | ⚠️ Stub |
| `mikro` | ⚠️ Stub |

**Hardening:**
- AES-256-GCM at-rest şifreleme (recursive — nested credential alanları da)
- Reserve-first idempotency: 5 paralel POST → DB'de 1 satır, tek ETTN
- Cancel/Send state machine guard (atomic koşullu UPDATE)
- 23505 unique violation → 200 with existing row

### 2.7 Pazaryeri (Sprint 51-55 — Stub)
| Sağlayıcı | Durum |
|---|---|
| Trendyol | ⚠️ Stub (encryption + config kabul eder) |
| Hepsiburada | ⚠️ Stub |
| n11 | ⚠️ Stub |
| Çiçeksepeti | ⚠️ Stub |
| Pazarama | ⚠️ Stub |

### 2.8 Süper Admin
| Modül | Endpoint | Durum |
|---|---|---|
| Firma yönetimi | `/api/companies` (super_admin) | ✅ |
| Ödeme bildirimleri | `/api/payment` | ✅ |
| Platform ayarları | `/api/settings/platform` | ✅ |
| Abonelik yönetimi | `/api/subscriptions` | ✅ |
| **İletişim talepleri** | `/api/contact/admin` | ✅ |

### 2.9 Public API (auth'suz)
| Endpoint | Açıklama |
|---|---|
| `POST /api/contact` | Landing "Sizi arayalım" formu |
| `GET /api/public/v1/storefronts/:slug` | Müşteri mağazası |
| `POST /api/public/v1/storefronts/:slug/orders` | Müşteri sipariş |
| `GET /api/public/v1/pazar` | Cross-tenant pazar (Ticarium Pazar) |
| `/api/public/v1/*` (API key ile) | 3rd party entegrasyon |

---

## 3. Eksik / Bekleyen İşler

### 3.1 Kritik Eksikler (Canlıya çıkmadan ÖNCE yapılmalı)

#### 3.1.1 Domain & Hosting
- [ ] **Domain satın alma**: `ticarium365.com` (önerilen)
- [ ] **Subdomain wildcard DNS**: `*.ticarium365.com` → app sunucusu (multi-tenant için zorunlu)
- [ ] **SSL sertifikası**: Let's Encrypt wildcard (Replit Deployments otomatik halleder)
- [ ] **Replit Deployment yayını** (Reserved VM önerilir — session/state için)

#### 3.1.2 Production Secrets
| Secret | Durum | Açıklama |
|---|---|---|
| `SESSION_SECRET` | ✅ Set | AES-256-GCM key türetiminde kullanılıyor |
| `DATABASE_URL` | ✅ Set | Production DB |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | ✅ Set | App Storage |
| `PUBLIC_OBJECT_SEARCH_PATHS` | ✅ Set | — |
| `PRIVATE_OBJECT_DIR` | ✅ Set | — |
| **E-Fatura sağlayıcı API key'leri** | ❌ Eksik | Parasut/QNB/Foriba/Logo/Mikro müşteri talebine göre |
| **Pazaryeri API key'leri** | ❌ Eksik | Trendyol/Hepsiburada/n11/Çiçeksepeti/Pazarama müşteri talebine göre |
| **SMS sağlayıcı (NetGSM/Iletimerkezi)** | ❌ Eksik | OTP/bildirim için (opsiyonel) |
| **E-mail SMTP** | ❌ Eksik | Bildirim e-postaları için (Replit Mail veya SendGrid) |
| **Stripe / İyzico** | ❌ Eksik | SaaS aboneliği tahsilatı için |

### 3.2 Yarım Kalan / Stub Modüller

#### 3.2.1 E-Fatura Sağlayıcıları
**Konum:** `artifacts/api-server/src/services/einvoice/stub-providers.ts`
**Durum:** Tüm 5 sağlayıcı (Parasut, QNB eFinans, Foriba, Logo eFlow, Mikro) için interface tanımlı, config şifreleniyor, ancak `createInvoice/sendInvoice/cancelInvoice` çağrıları "henüz uygulanmadı" hatası fırlatıyor.

**Yapılacak (her sağlayıcı için ~1-2 gün):**
- [ ] HTTP istek/cevap mapping (sağlayıcının REST/SOAP API'sine UBL XML üret)
- [ ] OAuth2 token refresh (Parasut için)
- [ ] WSDL → SOAP client (QNB eFinans/Foriba için)
- [ ] Health check gerçek endpoint çağrısı
- [ ] Sandbox test hesabı ile e2e test

**Bypass:** `mock` sağlayıcısı tam çalışır. Müşteri henüz fatura kesmiyorsa (B2C odaklı), `mock` ile başlanabilir. İlk B2B müşterisi geldiğinde gerçek sağlayıcıyı bağla.

#### 3.2.2 Pazaryeri Adapterleri
**Konum:** `artifacts/api-server/src/services/marketplace/stub-providers.ts`
**Durum:** Trendyol/Hepsiburada/n11/Çiçeksepeti/Pazarama için interface + encryption hazır, `pushProduct/pushStock/pushPrice/fetchOrders` "henüz uygulanmadı".

**Yapılacak (her sağlayıcı için ~2-3 gün):**
- [ ] REST API client (Trendyol Seller API, Hepsiburada Marketplace API, n11 SOAP)
- [ ] Ürün push → barkod/stok/fiyat sync
- [ ] Sipariş poll cron (15 dk aralık)
- [ ] Komisyon hesabı (kanal kârlılık ile entegre)
- [ ] İade & iptal callback'leri

**Bypass:** Müşteri pazaryeri kullanmıyorsa zaten gerek yok. İlk talep geldiğinde o sağlayıcı önce yapılır.

### 3.3 İyileştirme Önerileri (Architect tarafından önerildi)

| Konu | Öncelik | Açıklama |
|---|---|---|
| Aggregator concurrent regression test | Orta | activate/pause/update/delete + scan paralel senaryoları için integration test |
| `recomputeChosen` SQL parametreli `ANY($1::text[])` | Düşük | Şu an `sql.raw` ile string interpolation (escape'li, güvenli ama daha temiz olabilir) |
| Recompute lock metrik logging | Düşük | Production'da lock bekleme süresi/conflict oranı gözlemi |
| Rate limiting (public endpoints) | **Yüksek** | `/api/public/v1/pazar`, `/api/contact`, `/api/public/v1/storefronts/:slug/orders` için per-IP rate limit |
| CSP / Security headers (helmet) | **Yüksek** | XSS/clickjacking koruması |
| Backup stratejisi | **Yüksek** | DB günlük otomatik snapshot (Replit DB built-in PITR var) |
| Sentry / hata izleme | Orta | Production hata izleme |
| OpenAPI / Swagger doc | Düşük | API entegrasyonu yapacak 3rd party'ler için |

### 3.4 Henüz Tasarlanmamış Modüller (Backlog)

| Modül | Not |
|---|---|
| Mobil uygulama (SMSYSTEMS) eksik özellikler | Web'deki tüm modüllere mobil paritesi |
| Çoklu dil (i18n) | Şu an sadece TR; EN/AR ileride |
| WhatsApp Business API entegrasyonu | Sipariş bildirimi, ödeme linki |
| Yapay zeka ürün açıklama yazıcı | OpenAI/Anthropic ile auto-fill |
| OCR fatura okuyucu | Kâğıt fatura → otomatik gider girişi |
| Müşteri segmentasyonu (RFM) | Otomatik segment + push kampanya |
| A/B test motoru (storefront için) | — |

---

## 4. API Referansı (Özet)

**Base URL (dev):** `http://localhost:8080/api`
**Base URL (prod):** `https://api.ticarium365.com` (deploy sonrası)

### 4.1 Auth
```
POST /auth/login         {username, password} → session cookie
POST /auth/logout
GET  /auth/me            → kullanıcı + companyId + role
POST /auth/register      (super_admin only)
```

### 4.2 Reklam Bütçesi (Sprint 73.6)
```
GET    /ad-budgets/presets                         → 10 platform preset
GET    /ad-budgets/channels                        → şirketin kanalları
POST   /ad-budgets/channels    {code, name, platform}
PUT    /ad-budgets/channels/:id
DELETE /ad-budgets/channels/:id
GET    /ad-budgets/spends?period=YYYY-MM
POST   /ad-budgets/spends      {channelId, period, budgetAmount, spendAmount, ...}
                               → ON CONFLICT atomic upsert
DELETE /ad-budgets/spends/:id
GET    /ad-budgets/summary?period=YYYY-MM          → ROAS/CPA/CPC/profit/budgetUsedPct
GET    /ad-budgets/trend?months=6                  → 6-aylık seri
```

### 4.3 Ticarium Pazar (Sprint 73.7)
```
POST   /aggregator/scan        {marginPct, minStock}  → ürünleri pazara aktarır
GET    /aggregator/listings?status=candidate|active|paused
PUT    /aggregator/listings/:id    {marginPct}        → recompute chosen
POST   /aggregator/listings/:id/activate              → recompute chosen
POST   /aggregator/listings/:id/pause                 → recompute chosen
DELETE /aggregator/listings/:id                       → recompute chosen
GET    /aggregator/stats        → {candidate, active, paused, chosen}

# PUBLIC (auth'suz, cross-tenant)
GET    /public/v1/pazar?q=<arama>&limit=60
       → {count, items: [{id, name, brand, barcode, stock, price, seller, ...}]}
```

### 4.4 İletişim
```
POST   /contact                {fullName, phone, email, companyName?}  → public
GET    /contact/admin          (super_admin)                            → tüm talepler
PATCH  /contact/admin/:id      {status: new|contacted|archived, notes?}
```

(Diğer 50+ endpoint için: `artifacts/api-server/src/routes/` dizini)

---

## 5. Veritabanı Şeması (43 tablo)

### 5.1 Yeni Eklenen (Bu sürüm)
| Tablo | Açıklama |
|---|---|
| `ad_channels` | Reklam kanalları (companyId+code unique) |
| `ad_spends` | Aylık reklam harcama (channelId+period unique, ON CONFLICT atomic) |
| `aggregator_listings` | Pazar listeleri — partial unique `WHERE chosen=true`, source unique `(companyId,productId)` |
| `contact_requests` | Landing iletişim talepleri |

### 5.2 Önemli Invariantlar
- `aggregator_chosen_per_key_uniq UNIQUE (match_key) WHERE chosen=true` → her ürün için tek seçilen tedarikçi (DB seviyesinde garantili)
- `aggregator_source_uniq UNIQUE (sourceCompanyId, sourceProductId)` → duplicate listing yok
- `einvoice_outbox` partial unique `(companyId, idempotencyKey) WHERE NOT NULL` → çift fatura imkânsız
- `products_barcode_company_idx UNIQUE (barcode, companyId)` → şirket içinde tek barkod
- `storefronts.slug UNIQUE` → URL çakışması yok

---

## 6. Güvenlik Modeli

### 6.1 Tenant İzolasyonu
- `tenantMiddleware` her authenticated request'te `req.companyId` set eder
- TÜM business endpoint'leri `WHERE companyId = req.companyId` filtresi uygular
- Public endpoint'ler (`/api/public/v1/*`) tenantMiddleware'den ÖNCE mount edilir → bilerek bypass

### 6.2 RBAC Rolleri
| Rol | Yetki |
|---|---|
| `super_admin` | Tüm tenant'lara erişim, platform yönetimi |
| `admin` | Kendi tenant'ında tam yetki |
| `staff` | Operasyonel (satış/stok), finans yok |
| `viewer` | Salt okunur |

### 6.3 Şifreleme
- Parolalar: scrypt (N=16384, r=8, p=1)
- E-Fatura/Pazaryeri credentials: AES-256-GCM (recursive nested)
- Session: HTTP-only cookie + Secure (production) + SameSite=Lax

### 6.4 Idempotency
- E-Fatura: reserve-first DB pattern + `Idempotency-Key` header
- Reklam bütçesi: ON CONFLICT atomic upsert
- Aggregator chosen: `pg_advisory_xact_lock(7390737)` + transaction

---

## 7. Yayına Çıkış (Deployment) Adımları

1. **Domain satın al** (`ticarium365.com`) ve wildcard DNS'i Replit Deployment IP'sine yönlendir
2. **Replit'te Publish** butonuna bas → Reserved VM (önerilen) seç
3. Production secrets'ı doğrula (yukarıdaki tablo)
4. **Custom domain** ekle (Deployment ayarlarından `*.ticarium365.com`)
5. İlk admin kullanıcısı oluştur (DB'de manuel veya `/auth/register` ile)
6. Test tenant'ı oluştur (PROSAN), sample data import et
7. SSL doğrula → `https://prosan.ticarium365.com` açılmalı
8. **Performans testi**: 100+ paralel scan, 1000+ ürün catalog, public pazar load test
9. **Backup**: Replit DB otomatik PITR + haftalık manuel snapshot
10. **Monitoring**: Sentry/LogRocket entegrasyonu (opsiyonel, sonra)

---

## 8. Bilinen Sınırlamalar

1. **Sub-second precision** finansal alanlarda yok (JS `Number` kullanılıyor); ileride `Decimal.js` migrasyonu gerekebilir
2. **Aggregator scan** O(N) tarama (1221 ürün ~2 sn) — 10000+ ürün için chunked + background queue gerekir
3. **Public pazar** rate limit yok — DDoS koruması için Cloudflare/nginx önerilir
4. **WebSocket / real-time bildirim** yok (polling kullanılıyor)
5. **Dosya yükleme limiti** 50MB (App Storage default)

---

## 9. İletişim & Sorumlular

- **Geliştirme:** Replit Agent (autonomous)
- **Ürün sahibi:** Talha (PROSAN ENDÜSTRİ)
- **Test credential (dev):** `talha` / `talha123` (admin, PROSAN tenant)
- **Süper admin:** Ayrı kullanıcı (DB'de seed edilmeli prod öncesi)

---

**Son not:** Bu doküman 18 Nisan 2026 itibariyle geçerlidir. Her sprint sonrası `replit.md` ve bu dosya güncellenmelidir.
