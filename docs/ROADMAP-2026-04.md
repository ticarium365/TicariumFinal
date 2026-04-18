# Ticarium365 — Teknik Yol Haritası (Nisan 2026)

## 0. Mevcut Durum (kapanan sprintler)

| Sprint | Konu | Durum |
|---|---|---|
| 27 | DevOps & İzleme | ✅ |
| 51-55 | Pazaryeri altyapı çekirdeği (`channel_accounts`, `marketplace_orders`, mappings, pricing/stock rules, queue worker) | ✅ |
| 55 | Sipariş→Satış otomasyonu (idempotent, all-or-nothing, frontend "Siparişler" sekmesi) | ✅ |
| 62 | E-Fatura provider-bağımsız adapter + Paraşüt gerçek OAuth2 konnektörü | ✅ |
| 65 | Bütçe & Tahmin zemini (14 default TR gider kategorisi, race-safe seed) | ✅ |
| 73.6 | Reklam bütçesi | ✅ |
| 73.7 | Ticarium Pazar (Aggregator) | ✅ |
| **B** | **Trendyol gerçek HTTP konnektörü** | ✅ (yeni) |

**Test kapsamı:** 41/41 hedef test yeşil. Mimari prensipler dokümante edildi (provider adapter pattern, `xmax=0` MVCC tekniği, `pg_advisory_xact_lock` ile race-safe seed, AES-256-GCM at-rest credential şifreleme).

Kullanıcının "API beklerken altyapıyı bitirelim" prensibi ile uyumlu: tüm tabanlar oturdu, artık **gerçek konnektör genişlemesi** ve **production hardening** öne çıkıyor.

---

## 1. Sıradaki sprintler — önerilen sıra ve gerekçe

### 🥇 Sprint C — Hepsiburada + N11 gerçek konnektörler (1-2 gün)

**Neden ilk:** Trendyol pattern'i taze, HSP/N11 endpoint'leri benzer (REST, basic/header auth). Aynı `MarketplaceProvider` interface, sadece transport farklı. Müşteri talep yoğunluğu en yüksek 3 kanaldan diğer ikisi.

**Yapılacaklar:**
- `services/marketplace/hepsiburada-provider.ts`
  - Auth: HTTP Basic (username:password base64)
  - Base: `https://mpop.hepsiburada.com` (prod), `https://mpop-sit.hepsiburada.com` (sandbox)
  - `healthCheck`: `/listing/merchantid/{merchantId}` veya `/product/api/products`
  - `pushStock+pushPrice`: `/ams/api/inventory-uploads/stock-uploads` ve `/price-uploads`
  - `pullOrders`: `/order/api/orders?merchantId=...&offset=...`
- `services/marketplace/n11-provider.ts`
  - Auth: SOAP üzerinden geçiş veya yeni REST API (Sellers API)
  - `OrderService`, `ProductService`, `ProductStockService`, `ProductSellingService`
- Factory kayıtları + 2x integration test (geçersiz creds → graceful)
- Status mapping fonksiyonu sağlayıcılar arası tutarlı olsun (created/paid/shipped/delivered/cancelled/returned)

**Risk:** N11 SOAP/XML; isterseniz şimdilik stub bırakıp Trendyol/Hepsiburada ile gidebiliriz.

---

### 🥈 Sprint D — Production Hardening (3-4 gün)

**Neden:** Müşteriye açılmadan önce veri güvenliği ve operasyonel görünürlük şart. Mimaride birkaç kritik açık var:

#### D.1. PostgreSQL Row-Level Security (RLS) — multi-tenant izolasyonu sertleştirme
Şu an tenant izolasyonu yalnız uygulama katmanında (`WHERE company_id = ?`). Bir route'ta unutulan filtre cross-tenant veri sızıntısı yaratır. RLS = veritabanı düzeyinde garanti.

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (company_id = current_setting('app.current_company_id')::int);
```
Express middleware'de her request başında `SET LOCAL app.current_company_id = ?`. ~25 tabloda uygulanmalı.

#### D.2. pg-boss → Background Job Queue
Mevcut marketplace worker basit `setInterval(5000)`. Çok kanallı yüksek hacimde:
- Tek-instance bottleneck (deployment scale-out yok)
- Retry/backoff/dead-letter yok
- Job görünürlüğü zayıf

`pg-boss` Postgres üzerine kurulu, ekstra altyapı yok. Mevcut `sync_jobs` tablosunu yerinde bırakıp pg-boss'u arkada kullanırız.

#### D.3. Sentry DSN + structured error tracking
`SENTRY_DSN` env (entegrasyonlardan), Express error handler + Vite client. `req.companyId/userId` tag, secret scrubbing.

#### D.4. API v1 prefix + OpenAPI sürüm yönetimi
Tüm route'lar `/api/v1/...` altına alınsın. Mobile uygulama kontratlarını v1'e kilitle, breaking change'ler v2'ye.

#### D.5. Rate-limit konsolidasyonu
`Canlı Öncesi — Rate Limit & Güvenlik` testleri var ama çoğu route'a uygulanmamış. Per-tenant + per-endpoint config.

#### D.6. WebSocket / SSE — canlı bildirim
Marketplace sipariş geldiğinde, e-fatura statüsü değiştiğinde, stok kritiğe düştüğünde push. Şu an polling.

---

### 🥉 Sprint E — Bütçe Tahmin Motoru (2-3 gün)

Sprint 65 zemini tamamlandı (kategoriler, gerçekleşen veri toplandı). Şimdi:
- **Holt-Winters / SES** gibi basit time-series forecast (kategori başına 12 ay gelecek tahmini)
- Sapma uyarısı: gerçekleşen gider tahminin %X üstündeyse alarm
- Frontend `/butce` sayfası: tahmin grafiği + sapma highlight
- Test: bilinen sentetik seri ile beklenen değere ±%5 yaklaşma

**Neden 3.:** Gerçek müşteri verisi gerekiyor; pazaryeri+e-fatura gerçek konnektörler aktif olunca anlamlı gelir/gider akışı oturur.

---

### Sprint F — Çapraz konular (sürekli)

- **Backup stratejisi**: günlük dump + point-in-time recovery
- **Audit log retention policy**: 90 gün +, eski kayıtlar S3'e arşiv
- **Performance**: 1700+ ürünlü PROSAN'da product list sayfası ölçülmemiş; index review
- **i18n hazırlığı**: TR sabit, ileride EN için sözlük dosyası ayrımı
- **Test kapsamı genişletme**: integration testleri 41 → 80+ hedef (ürün CRUD, B2B akışları, PWA offline)

---

## 2. Önerilen sıralama — KARAR

| Öncelik | Sprint | Süre | Bağımlılık |
|---|---|---|---|
| 🥇 | **C — Hepsiburada+N11 konnektörler** | 1-2 gün | Trendyol pattern (var) |
| 🥈 | **D.1 — RLS** | 1 gün | — (independent) |
| 🥈 | **D.2 — pg-boss** | 1 gün | — |
| 🥈 | **D.3 — Sentry** | 0.5 gün | env var |
| 🥈 | **D.4 — API v1 prefix** | 0.5 gün | mobile koordinasyon |
| 🥉 | **E — Tahmin motoru** | 2-3 gün | gerçek veri akışı |
| ↻ | F — sürekli | sprint dışı | — |

---

## 3. Kullanıcıya soru — kararınızı alıp ilerleyeceğim

**A.** Direkt **Sprint C** (Hepsiburada+N11 konnektör) ile devam edeyim mi? — paralel kanallar müşteri görünürlüğü açısından en kıymetlisi.

**B.** Yoksa **Sprint D Production Hardening** (RLS + pg-boss + Sentry) önce mi gelsin? — Müşteriye açılmadan önce güvenlik ve operasyonel görünürlük.

**C.** Ya da **karışık plan**: D.1 (RLS) + C (HSP/N11) bir sprint kabul edilip ikisi birlikte mi?

**Tavsiyem:** **C → D.1 → D.2** sırası. Konnektörler taze pattern'le hızlı bitirilir, sonra RLS müşteriye açılmadan önce devreye girer.

Onayınızla otomatik devam ederim. (Yetki verildiyse "C" ile başlıyorum.)
