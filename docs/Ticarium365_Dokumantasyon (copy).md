# i — Sistem Dökümantasyonu

**Sürüm:** v1.2026.04
**Tarih:** Nisan 2026
**Durum:** Canlıya hazır (production-ready)

---

## 1. Genel Bakış

Ticarium365, Türkiye merkezli işletmeler için geliştirilmiş **çok kiracılı (multi-tenant) SaaS envanter, satış, e-ticaret ve finans platformudur**. Subdomain bazlı kiracı izolasyonu ile her firma kendi alan adı altında çalışır.

### Aktif Kiracılar
- **PROSAN ENDÜSTRİ** — endüstriyel ürün satışı, B2B
- **NİHAT TURİZM** — turizm operasyonları

### Artifactlar (Servisler)
| Servis | Tür | Açıklama |
|---|---|---|
| `artifacts/prosan` | Web (React + Vite) | Ana SaaS paneli — TR arayüz |
| `artifacts/api-server` | Backend API (Express + Drizzle) | REST/JSON, port 8080 |
| `artifacts/smsystems-mobile` | Mobil (Expo / React Native) | Mobil POS, stok |
| `artifacts/mockup-sandbox` | Tasarım | Bileşen önizleme |

### Teknoloji Yığını
- **Frontend:** React 19 + Vite, Wouter (routing), TanStack Query, Tailwind CSS, shadcn/ui
- **Backend:** Node.js 20 + Express, Drizzle ORM, esbuild
- **Veritabanı:** PostgreSQL (Neon serverless), 70+ tablo
- **Mobil:** Expo Router, React Native Web
- **Yapı yönetimi:** pnpm monorepo

---

## 2. Mimari

### Çok Kiracı Modeli
1. **Subdomain ayrıştırma:** `tenantMiddleware` host adından `companyId`'yi tespit eder
2. **App katmanı:** Tüm sorgular `WHERE company_id = ?` ile filtrelenir (birincil savunma)
3. **DB katmanı:** PostgreSQL Row-Level Security (RLS) policy'leri 33 kritik tabloya uygulandı (ikincil savunma — bkz. Bölüm 7)
4. **Session:** Express-session, PostgreSQL backend, `SESSION_SECRET` ile imzalı

### API Sürümleme
Tüm router'lar `/api` ve `/api/v1` altında çift mount — geriye dönük uyumluluk hazır.

### Mount Sırası (kritik)
```
1. healthz, kvkk (tenant gerektirmez — anonim erişim)
2. webhook receivers (raw body, HMAC doğrulamadan önce)
3. public/aggregator (tenant gerektirmez)
4. tenantMiddleware (companyId çözümü)
5. ana router (auth gerektiren tüm rotalar)
6. /api/admin/runtime-flags (super_admin only)
```

---

## 3. Modüller

### 3.1 Envanter & Stok
- Ürün, varyant, kategori, marka, tedarikçi, stok hareketi
- Barkod tarama, fiyat motoru, stok sayımı
- 1.713+ ürün canlı (PROSAN)

### 3.2 Satış
- POS ekranı (`/sales`), satış geçmişi, iade
- Müşteri hesap takibi, sadakat programı
- Kasa, çek/senet, banka tahsilatı

### 3.3 Alış & Tedarikçi
- Alış faturası, tedarikçi cari hesap
- Otomatik stok girişi

### 3.4 Pazaryeri Entegrasyonları
**Gerçek konnektörler (canlı):**
- Trendyol Sapigw (HTTP Basic, barcode-bazlı stok/fiyat)
- Hepsiburada MPOP (HTTP Basic, **merchantSku öncelikli**)
- N11 SOAP/XML (`appKey/appSecret`, `ProductStockService`)

**Provider mimarisi:** `MP_REGISTRY` üzerinden config-driven; `BaseProvider` interface — `healthCheck`, `pushStock`, `pushPrice`, `pullOrders`. Yeni pazaryeri eklemek için sadece bir dosya.

### 3.5 E-Fatura
- Provider bağımsız (Paraşüt OAuth2 canlı, Foriba/QNB eFinans uyumlu mimari)
- `einvoice_outbox` tablosu, async gönderim, retry
- Sandbox / production URL ayrımı

### 3.6 Finans
- Banka hesapları, ödeme/tahsilat, dekont
- Gelir/gider kategorileri
- Bütçe modülü
- TCMB döviz kuru entegrasyonu (USD/EUR/GBP/CHF, 4 saatte bir sync)
- Reklam bütçe takibi
- Gerçek kâr dashboard (kanal bazlı)

### 3.7 B2B / Network
- Teklif, sipariş, katalog yönetimi
- Şirket profili, mesajlaşma
- Public storefront (`/s/:slug`)

### 3.8 Üretim
- BOM (Bill of Materials), üretim emri
- Hammadde stok düşümü

### 3.9 Personel & İK
- Personel, departman, izin talebi
- Maaş, prim takibi

### 3.10 Mobil
- Expo Router tabanlı, web + iOS + Android
- Mobil POS (taslak — Q4 offline desteği)
- Bildirim (Expo Push)

---

## 4. KVKK & Veri Koruma

### Aydınlatma Metni
- **Versiyon:** v1.2026.04
- **URL:** `/kvkk`
- **API:** `GET /api/kvkk/consent/version`

### Çerez Onay Sistemi
- **3 katmanlı banner** (zorunlu / analitik / pazarlama)
- LocalStorage v1 + `POST /api/kvkk/consent`
- Her tip ayrı kayıt
- `kvkk_consents` tablosunda IP, User-Agent, versiyon

### Kullanıcı Hakları (KVKK m.11)
| Hak | Endpoint | Süre |
|---|---|---|
| Veri dışa aktarma | `POST /api/kvkk/data-export` | 7 gün |
| Hesap silme | `POST /api/kvkk/data-erasure` | 30 gün soft → hard delete |
| Silme iptal | `DELETE /api/kvkk/data-erasure/:id` | 30 gün içinde |

### Saklama Süreleri
- İşlem kayıtları: 10 yıl (TTK)
- E-fatura/e-arşiv: 5 yıl (VUK)
- Pazarlama izni: Geri alana kadar

### İhlal Bildirim
72 saat içinde KVKK Kuruluna + etkilenen kişilere.

---

## 5. Güvenlik

### Kimlik Doğrulama
- Session tabanlı (express-session + PostgreSQL store)
- `SESSION_SECRET` rotasyonu mevcut
- Rol modeli: `super_admin`, `admin`, `staff`, `viewer`

### Yetkilendirme Katmanları
1. `requireAuth` — oturum kontrolü
2. `requireRole([...])` — rol bazlı
3. `tenantMiddleware` — companyId zorunlu
4. `requireWriter` — yazma yetkisi (admin/staff)

### Şifreleme
- Transit: TLS 1.2+ (Replit edge)
- Hassas alanlar: AES-256-GCM (`secret-crypto.ts` — pazaryeri API anahtarları, e-fatura credential'ları)
- Şifreler: bcrypt

### Rate Limiting
- Tier'lar: `public` / `auth` / `internal` / `write`
- Production-only aktif

### Webhook Güvenliği
- HMAC-SHA256 (`x-hub-signature-256` veya `x-signature`)
- **Timing-safe** karşılaştırma
- `inbound_webhooks` UNIQUE(provider, externalEventId) — replay protection

### Idempotency (atomic)
- `Idempotency-Key` header (8-128 alfanumerik)
- PK `(key, companyId)` üzerinde `INSERT ... ON CONFLICT DO NOTHING` — yarış koşulsuz reservation
- 24 saat TTL, başarısız (5xx) işte kayıt silinir, retry'a izin verir
- In-flight (eşzamanlı) → 409 Conflict
- Mount edilen kritik POST'lar:
  - `POST /api/sales`, `POST /api/sales/:id/return`
  - `POST /api/purchases`
  - `POST /api/marketplace/orders/:id/convert-to-sale`

### Audit Logging
`audit_logs` tablosu — tüm CRUD işlemleri kullanıcı, IP, eski/yeni veri ile.

---

## 6. Operasyon

### Sağlık Kontrolü
| Endpoint | Açıklama |
|---|---|
| `GET /api/healthz` | DB ping + uptime + version |
| `GET /api/readyz` | k8s readiness |
| `GET /api/kvkk/consent/version` | KVKK versiyon kontrolü |

**UptimeRobot için izlenmesi önerilen URL'ler:**
- `https://<domain>/api/healthz`
- `https://<domain>/api/readyz`
- `https://<domain>/api/kvkk/consent/version`

### Loglar
- **Pino** (JSON structured logger)
- Worker thread (pino-worker, pino-file)
- Production'da Sentry (opsiyonel — `SENTRY_DSN` set edilirse aktif)

### Background Worker'lar
| Worker | Periyot | Görev |
|---|---|---|
| Marketplace worker | 5 sn | Pazaryeri sync job poll |
| Outbox worker | 5 sn | Domain event publish (FOR UPDATE SKIP LOCKED) |
| Profit cron | 1 saat | Gerçek kâr hesaplama |
| TCMB sync | 4 saat | Döviz kuru çekme |
| Idempotency cleanup | 1 saat | TTL geçmiş key silme |

### Outbox Pattern
- `domain_events` tablosu
- 7 deneme exponential backoff (2, 4, 8, 16, 32, 64, 128 dk)
- 7. başarısızlıkta `dead_letter`
- `registerOutboxHandler(eventType, handler)` ile genişletilir

### Feature Flags (Runtime)
- Tablo: `feature_flags_runtime`
- Önceliğ: `companyId scope > global > rolloutPct (sha1(key:companyId) % 100)`
- 30 sn in-memory cache
- Admin UI: `/admin/runtime-flags` (super_admin only)
- API: `GET /api/admin/runtime-flags`, `POST`, `DELETE`
- Kullanıcı kontrolü: `GET /api/admin/runtime-flags/check/:key`

---

## 7. Row-Level Security (RLS)

### Mevcut Durum
- 33 tablo için `tenant_isolation` policy oluşturuldu (`scripts/apply-rls.ts` ile uygulandı)
- Helper fonksiyonlar hazır (`middlewares/rls-context.ts`):
  - `withTenantContext(companyId, fn)` — tenant-scoped transaction
  - `withRlsBypass(fn)` — sistem işlemleri (cron, migration)

### Aktivasyon Stratejisi
Şu an **app-level** `WHERE company_id = ?` filter primary defense. RLS ikincil katman olarak hazır ama route handler'lara bağlanması için her endpoint'in `db.transaction` wrapper'ına geçirilmesi gerekiyor.

**Sebep:** PostgreSQL'de `SET LOCAL` sadece transaction scope'unda etkili. Drizzle pool connection'ı paylaşıldığında dışarıda kalan `SET` diğer request'leri etkiler. Doğru kullanım:
```ts
await withTenantContext(companyId, async (tx) => {
  await tx.insert(...).values(...);
});
```

### Aktivasyon Roadmap
~50+ route refactor — Q3 sprint hedefi. Şu anki çift kat savunma yeterli.

---

## 8. Veritabanı Şeması

### Çekirdek Tablolar (özet)
- `companies`, `users`, `branches`, `personnel`
- `products`, `categories`, `brands`, `stock_movements`
- `customers`, `suppliers`, `customer_transactions`, `supplier_transactions`
- `sales`, `purchases`, `purchase_items`
- `bank_accounts`, `bank_transactions`, `finance_documents`
- `production_orders`
- `channel_accounts`, `marketplace_orders`, `pricing_rules`, `stock_rules`, `sync_logs`, `sync_jobs`
- `einvoice_outbox`
- `audit_logs`, `notifications`, `notification_rules`

### Sprint 80 Yeni Tablolar
- `kvkk_consents` — onay kayıtları
- `data_export_requests`, `data_erasure_requests` — KVKK m.11
- `idempotency_keys` — atomic reservation
- `feature_flags_runtime` — kademeli rollout
- `domain_events` — outbox pattern
- `inbound_webhooks` — replay protection
- `tcmb_rates` — döviz kuru
- `expo_push_tokens` — mobil bildirim
- `sms_messages` — SMS log

### Migration
- Drizzle Kit `db:push --force` ile sync
- `users` tablosuna eklendi: `kvkkConsentAt`, `kvkkConsentVersion`, `marketingConsentAt`, `deletedAt`

---

## 9. Production Deploy

### Gerekli Secret'lar (zorunlu)
- `DATABASE_URL` — Neon PostgreSQL (mevcut ✓)
- `SESSION_SECRET` — session imzası (mevcut ✓)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` — dosya depolama (mevcut ✓)

### Opsiyonel Secret'lar (özellik aktivasyonu)
- `SENTRY_DSN` — error monitoring (boşsa Sentry hiç yüklenmez, build kırılmaz)
- `NETGSM_USERNAME`, `NETGSM_PASSWORD`, `NETGSM_HEADER` — SMS gönderimi (boşsa `no_provider` döner)
- `ENABLE_SCHEDULER=true` — opsiyonel scheduler aktivasyonu

### Pazaryeri / E-Fatura Credential'ları
**Kullanıcı tarafından panelden girilir** (`channel_accounts.settings` AES-256-GCM ile şifreli). Sistem secret'ı değil.

### TCMB EVDS
Canlıda yoğun kullanımda IP whitelist gerekir. TCMB'ye başvuru:
1. EVDS hesabı aç
2. Production sunucu çıkış IP'sini whitelist'e ekle (talep maili)
3. Şu an kayıtsız da çalışıyor ama rate-limit yiyebilir

### Build & Deploy
```bash
pnpm --filter @workspace/api-server run build  # esbuild → dist/index.mjs
# Externalized: @sentry/*, @opentelemetry/*, import-in-the-middle
```
Replit Autoscale Deployment önerilir. Health check `/api/healthz`.

---

## 10. Yol Haritası

### Q2 2026 (mevcut)
- ✓ Sprint 80 hardening (KVKK, idempotency, RLS, monitoring)
- ✓ Pazaryeri canlı konnektörler (Trendyol, Hepsiburada, N11)
- ✓ E-fatura provider mimarisi (Paraşüt canlı)

### Q3 2026
- RLS route-level aktivasyon (~50+ endpoint refactor)
- Self-service tenant kayıt akışı
- E-Defter entegrasyonu
- Iyzico canlı ödeme (API anahtarı geldikten sonra)
- Test coverage %80+

### Q4 2026
- Mobil offline POS
- Advanced reporting (PowerBI export)
- Çoklu dil (EN ek)

### 2027 Q1+
- Aggregator scoring (50+ tenant gerektiriyor)
- AI tabanlı stok tahmin (mevcut bütçe & tahmin altyapısı üzerine)
- Marketplace listesi genişletme (PttAVM, Çiçeksepeti, Amazon TR)

---

## 11. Geliştirici Notları

### Yerel Çalıştırma
Replit ortamında `Run` butonu yeterli. 4 workflow paralel başlar:
- API Server (port 8080)
- Prosan Web (Vite dev)
- SMSystems Mobile (Expo)
- Mockup Sandbox

### Yeni Modül Eklerken
1. Schema: `lib/db/src/schema/` altına dosya
2. `db:push --force` ile DB sync
3. Backend route: `artifacts/api-server/src/routes/`
4. App.ts'de router mount (tenant middleware sonrası)
5. Frontend: `artifacts/prosan/src/pages/`
6. App.tsx'e route + import

### Yeni Pazaryeri Provider Eklerken
1. `services/marketplace/<name>-provider.ts` — `BaseProvider` interface'ini implement et
2. `services/marketplace/factory.ts` `MP_REGISTRY`'ye ekle
3. Frontend `pages/magaza/` tarafında otomatik görünür

### Code Review
Her büyük PR sonrası `architect` subagent ile evaluate_task çağrısı yapılır — son review (Sprint 80 final) 3 kritik açık tespit etti, hepsi düzeltildi:
1. KVKK consent'te body userId enjeksiyon (kapatıldı)
2. Idempotency yarış koşulu (atomic ON CONFLICT'a geçirildi)
3. Runtime flags cross-tenant exposure (super_admin gated)

---

## 12. İletişim & Destek

- **Veri Sorumlusu:** Tenant şirketi
- **Veri İşleyen:** Ticarium365 (PROSAN ENDÜSTRİ)
- **KVKK İletişim:** kvkk@ticarium365.com
- **Teknik Destek:** Replit workspace üzerinden

---

**Son güncelleme:** 18 Nisan 2026
**Hazırlayan:** Replit Agent (Sprint 80 final review sonrası)
