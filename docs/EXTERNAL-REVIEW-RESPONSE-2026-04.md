# Ticarium365 — Dış Mimari Değerlendirme Cevabı (Nisan 2026)

**Bağlam:** Kvable mimari değerlendirme talebine kod tabanı taranarak hazırlanan dürüst cevap.
**Yöntem:** Her başlık (a) mevcut durum doğrulaması — kodda var mı/yok mu, (b) eksikse efor tahmini, (c) önerilen teknik yaklaşım.
**Genel kanı:** Değerlendirme sertçe doğru. Önerilen sıralama (KVKK → RLS → C → Webhook → Iyzico → pg-boss+outbox → Müşavir → Sentry) bizim Sprint C-D-E sıramızdan **daha sağlam**. Aşağıda gerekçeleri ve sapma önerilerimi yazdım.

---

## 🔴 BÖLÜM 1 — Canlı Öncesi Kritik

### 1.1 KVKK Uyum Paketi

**(a) Mevcut durum — DOĞRULAMA:**
Kodda KVKK ile ilgili **hiçbir uygulama yok**. Tarama sonuçları:
- `kvkk` / `aydinlatma` / `consent` / `VERBIS` keyword'lerinin geçtiği yerler sadece `karsilastir.tsx` (rakip karşılaştırma sayfası, anonimleştirme bağlamında) ve UI sidebar bileşenleri (alakasız, "consent" CSS prop'u).
- `data-export` / `data-erasure` endpoint'leri yok.
- Cookie consent banner yok.
- Aydınlatma metni sayfası yok.
- Açık rıza checkbox'ı yok.
- VERBIS kayıt durumu **bilinmiyor** (kullanıcının yanıtlaması gerekir).

**(b) Efor:** **3-4 gün** + 1 hafta hukuki dökümantasyon süreci.

**(c) Önerilen teknik yaklaşım:**

| İş | Teknik | Süre |
|---|---|---|
| Aydınlatma metni `/kvkk-aydinlatma` | Public route, Markdown render. Avukat metni hazırlayacak. | 0.5 gün |
| Çerez politikası + cookie banner | `react-cookie-consent` paketi, sadece zorunlu çerezler default açık. Tercih localStorage'a kaydedilir. | 0.5 gün |
| Açık rıza checkbox (signup) | Ayrı 2 checkbox: (1) KVKK aydınlatma onayı **zorunlu**, (2) pazarlama iletişimi **opsiyonel**. `users.kvkkConsentAt`, `users.marketingConsentAt` timestamp kolonları. | 0.5 gün |
| Veri dışa aktarma | `POST /api/account/data-export` → background job (pg-boss) → ZIP (JSON tablolar) → object storage signed URL → e-mail. KVKK Md.11. | 1 gün |
| Veri silme | `DELETE /api/account/data-erasure` → tüm kullanıcı tabloları `deletedAt` set, 30 gün soft-delete, sonra hard-delete cron. Audit log'ta sebep + kim. | 1 gün |
| DPA şablonu | Hukuki — yeni tenant sözleşmesinin parçası. Self-service signup'ta tıklayarak onay. | 0.5 gün (template render) |
| Veri yurtdışı transferi açık rızası | Replit GCP US bölgesinde. Aydınlatma metninde açıkça beyan + signup checkbox'ında "verilerimin AB/ABD'de işlenmesini kabul ediyorum". | 0.5 gün |
| VERBIS kayıt | İdari iş, kullanıcı sorumluluğu. SaaS sağlayıcı olarak biz **veri sorumlusu** rolündeyiz (kendi DB'mizde tenant verisini tutuyoruz), her tenant kendi müşterileri için kayıt yapacak. | Hukuk |

**KRİTİK NOT:** Biz **hem veri sorumlusu hem de veri işleyen** (joint controller). Tenant kullanıcıları kendi müşteri verilerini bize teslim ediyor → biz işliyoruz → bu pozisyon **DPA imzası şart**.

---

### 1.2 Backup & Disaster Recovery

**(a) Mevcut durum — DOĞRULAMA:**
- `pg_dump` cron'u **yok**.
- Offsite backup **yok**.
- PITR — Replit yönetimli Postgres (Neon altyapısı) **PITR destekliyor** (genellikle 7 gün retention free tier, 30 gün ücretli) ama bizim tarafta dokümante edilmedi.
- DR Runbook **yok**.
- Backup encryption — Neon at-rest encryption sağlar (LUKS) ama bizim çıkardığımız dump'larda manuel encrypt etmiyoruz.
- RPO/RTO **yazılı değil**.

**(b) Efor:** **1.5-2 gün**.

**(c) Önerilen teknik yaklaşım:**

```bash
# 1. Günlük dump cron (1 saat)
0 3 * * * pg_dump $DATABASE_URL --format=custom --compress=9 \
  | openssl enc -aes-256-cbc -salt -pass env:BACKUP_KEY \
  | aws s3 cp - s3://ticarium365-backups/$(date +%F).dump.enc

# 2. Retention policy (S3 lifecycle): 30 gün standart, sonra Glacier
# 3. Cross-region replication: eu-west-1 → eu-central-1
```

**Hedefler:**
- **RPO (Recovery Point Objective):** ≤ 1 saat (Neon PITR ile)
- **RTO (Recovery Time Objective):** ≤ 30 dakika (latest dump'tan restore)
- **Restore drill:** Ayda 1 kez staging DB'ye restore + sanity check, dokümante.

**Object storage tercihi:**
1. **Cloudflare R2** (en ucuz, egress free) — önerilen
2. AWS S3 (alternatif)
3. **Replit Object Storage'a backup tutma** — aynı sağlayıcıda backup tutmak DR mantığını çiğner.

**DR Runbook (`docs/DR-RUNBOOK.md`):**
- Bölüm 1: PITR ile son commit'e dönüş (Neon dashboard adımları)
- Bölüm 2: Tam veri kaybında dump'tan restore (komut, beklenen süre, doğrulama checklist)
- Bölüm 3: Tek tenant restore (yeni DB → SELECT WHERE company_id → eski DB'ye INSERT)
- Bölüm 4: Communication template (müşterilere "down" duyurusu)

---

### 1.3 Tenant İzolasyon — RLS

**(a) Mevcut durum — DOĞRULAMA:**
- RLS aktif değil. Tüm izolasyon `WHERE companyId = ?` uygulama katmanında.
- Bu Sprint D.1 olarak roadmap'te vardı ama **C'den (Hepsiburada/N11) sonraya bırakılmıştı**.

**(b) Efor:** **1 gün** (~25 ana tablo).

**(c) Önerilen teknik yaklaşım — KABUL EDİYORUM, C'DEN ÖNCE GELMELİ:**

```sql
-- Her tenant tablosu için
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY; -- süper kullanıcı bile bypass etmesin

CREATE POLICY tenant_isolation ON products
  USING (company_id = current_setting('app.current_company_id', true)::int)
  WITH CHECK (company_id = current_setting('app.current_company_id', true)::int);
```

Express middleware:
```typescript
// her request başında, tenantMiddleware'den hemen sonra
await db.execute(sql`SET LOCAL app.current_company_id = ${req.companyId}`);
```

**Drizzle entegrasyonu:** `db.transaction()` her request için açılmalı veya connection-pool seviyesinde `SET` kalıcı yapılmalı. Önerilen pattern:

```typescript
app.use(async (req, res, next) => {
  if (!req.companyId) return next();
  // request-scoped transaction
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_company_id = ${req.companyId}`);
    (req as any).db = tx;
    next();
  });
});
```

**Test (zorunlu):**
```typescript
// Kasıtlı RLS bypass testi
const otherCompanyData = await db.execute(sql`SELECT * FROM products`);
expect(otherCompanyData.rows.filter(r => r.company_id !== req.companyId)).toHaveLength(0);
```

**Public router'lar (`/api/public/v1/*`)** — `app.current_company_id` set EDİLMEDEN okuma yapacak. RLS politikası bu durumda **boş set** döner. Public endpoint'ler için ayrı policy gerekir:

```sql
CREATE POLICY public_pazar_read ON aggregator_listings
  FOR SELECT USING (chosen = true AND status = 'active');
```

**SAPMA ÖNERİSİ:** Kvable haklı, RLS C'den önce. Roadmap revize edilmeli:
**Yeni sıra:** KVKK temel + Backup → RLS → C → ...

---

## 🟡 BÖLÜM 2 — Mimari Boşluklar

### 2.1 Webhook Receiver Altyapısı

**(a) Mevcut durum — DOĞRULAMA:**
- `routes/integrations.ts`'de **outbound webhook** sistemi var (biz dış sistemlere event gönderiyoruz: `webhooks` config tablosu, `webhook_events` log, test endpoint).
- **Inbound webhook receiver yok** — Trendyol/Hepsiburada/Paraşüt'ten gelen event'leri kabul eden `POST /api/webhooks/:provider` endpoint'i yok.
- Marketplace worker hâlâ 5sn polling.
- HMAC signature doğrulama altyapısı yok.

**(b) Efor:** **2 gün** (4 sağlayıcı için: Trendyol, Hepsiburada, Paraşüt, generic).

**(c) Önerilen teknik yaklaşım:**

```typescript
// routes/webhook-receivers.ts (tenantMiddleware'den ÖNCE mount edilir!)
router.post('/api/webhooks/:provider/:accountId',
  express.raw({ type: '*/*' }),  // body raw — signature doğrulama için
  async (req, res) => {
    const { provider, accountId } = req.params;
    const account = await db.query.marketplaceAccounts.findFirst({
      where: eq(marketplaceAccounts.id, +accountId)
    });
    if (!account) return res.status(404).end();

    // Provider-specific signature verify
    const verified = verifyHmac(provider, req.body, req.headers, account.webhookSecret);
    if (!verified) return res.status(401).end();

    const eventId = extractEventId(provider, req.body);

    // Replay protection
    try {
      await db.insert(webhookEventsTable).values({
        provider, accountId: +accountId, externalEventId: eventId,
        payload: req.body, receivedAt: new Date()
      });
    } catch (e: any) {
      if (e.code === '23505') return res.status(200).end(); // already processed
      throw e;
    }

    // Async işle (pg-boss)
    await boss.send(`webhook:${provider}`, { eventId, accountId });
    res.status(200).end();
  }
);
```

**Tablo:** `webhook_events (id, provider, account_id, external_event_id, payload jsonb, status, received_at, processed_at)` + `UNIQUE (provider, account_id, external_event_id)`.

**Polling fallback:** Webhook'lar kayıp gönderilebilir. Polling worker kapatılmamalı, **5sn → 5 dakika**'ya düşürülmeli. Webhook + polling = "at-least-once" garantisi.

---

### 2.2 Outbox Pattern (Genel)

**(a) Mevcut durum — DOĞRULAMA:**
- `einvoice_outbox` var (sadece e-fatura için).
- Genel `domain_events` tablosu **yok**.
- Pazaryeri stok push ve bildirim gönderimi şu an: DB commit → external API çağrısı, arada fail = tutarsızlık.

**(b) Efor:** **1.5 gün**.

**(c) Önerilen teknik yaklaşım:**

```sql
CREATE TABLE domain_events (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  aggregate_type TEXT NOT NULL,  -- 'sale', 'product', 'invoice'
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,       -- 'created', 'stock_changed', 'price_updated'
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending|published|failed
  attempts INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX idx_domain_events_pending ON domain_events (next_retry_at) WHERE status = 'pending';
```

**Pattern:**
```typescript
await db.transaction(async (tx) => {
  await tx.update(products).set({ stock: newStock });
  await tx.insert(domainEvents).values({
    aggregateType: 'product', aggregateId: productId,
    eventType: 'stock_changed', payload: { delta, newStock }
  });
}); // tek commit

// Ayrı worker (pg-boss):
boss.work('domain_events', async () => {
  const events = await db.select().from(domainEvents)
    .where(and(eq(status, 'pending'), lte(nextRetryAt, now)))
    .limit(100).for('update', { skipLocked: true });
  for (const e of events) await dispatch(e);
});
```

---

### 2.3 Idempotency-Key Header Standardı

**(a) Mevcut durum — DOĞRULAMA:**
- `idempotency` keyword sadece `einvoice.ts`'de geçiyor (e-fatura outbox seviyesinde).
- Genel `Idempotency-Key` header desteği **yok**.
- Mobil offline → online sync'te duplicate satış riski **gerçek**.

**(b) Efor:** **0.5 gün** (middleware + tablo).

**(c) Önerilen teknik yaklaşım:**

```typescript
// middleware/idempotency.ts
export async function idempotencyMiddleware(req, res, next) {
  const key = req.header('Idempotency-Key');
  if (!key || !['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

  const existing = await db.query.idempotencyKeys.findFirst({
    where: and(eq(key, key), eq(companyId, req.companyId))
  });
  if (existing) {
    return res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
  }

  // intercept response
  const origJson = res.json.bind(res);
  res.json = (body) => {
    db.insert(idempotencyKeys).values({
      key, companyId: req.companyId, statusCode: res.statusCode,
      responseBody: JSON.stringify(body), expiresAt: new Date(Date.now() + 24*60*60*1000)
    }).catch(() => {});
    return origJson(body);
  };
  next();
}
```

Mobil app her satış oluştururken UUID üretip `Idempotency-Key` header'ında gönderir. Offline → online'da retry duplicate üretmez.

---

### 2.4 Feature Flag Runtime Toggle

**(a) Mevcut durum — DOĞRULAMA:**
- `replit.md`'de "subscription-based feature flag system with 60-second in-memory cache" deniyor.
- Pakete bağlı (statik) — runtime toggle / A-B test / kill switch **yok**.
- Tablo yapısı: feature_codes pakete bağlı tutuluyor, runtime override yok.

**(b) Efor:** **1 gün**.

**(c) Önerilen:** Önerinizdeki tablo yapısı doğru.
```sql
CREATE TABLE feature_flags (
  key TEXT NOT NULL,
  company_id INT NULL,           -- NULL = global default
  enabled BOOLEAN DEFAULT FALSE,
  rollout_pct INT DEFAULT 100,   -- 0-100, hash(companyId) % 100 < rollout_pct
  expires_at TIMESTAMPTZ,        -- otomatik off
  PRIMARY KEY (key, company_id)
);
```

**Önemli:** Mevcut subscription-tied flag'ler (profit.holding_cost vb) **korunmalı** — bu tablo override katmanı olur. Karar zinciri: `feature_flags(company)` → `feature_flags(global)` → `subscription_features` → default false.

---

### 2.5 Multi-Currency Detayları

**(a) Mevcut durum — DOĞRULAMA:**
- `lib/db/src/schema/currency.ts` var, `routes/currency.ts` var.
- Tüm tablolarda `currency` kolonu default 'TRY' (subscriptions, banking, finance_documents, b2b, profit, einvoice, marketplace).
- **TCMB EVDS API entegrasyonu YOK** — kur kaynağı manuel veya bilinmiyor.
- Historical rate snapshot satış anında **saklanıyor mu belirsiz** — sale tablosuna bakılmalı.
- Kâr motoru farklı currency handling **dokümante değil**.

**(b) Efor:** **2 gün** (TCMB EVDS + snapshot pattern).

**(c) Önerilen teknik yaklaşım:**
```typescript
// services/currency/tcmb-fetcher.ts
// Her gün 15:30 (TCMB rate publish saati) + ekstra her 4 saatte bir
const url = 'https://www.tcmb.gov.tr/kurlar/today.xml';  // veya EVDS API key ile
// Parse XML → currency_rates(date, currency, buy_rate, sell_rate, source='tcmb')
```

**Snapshot pattern (muhasebe için zorunlu):**
```typescript
// Her satış/fatura/ödeme oluşturulurken
await db.insert(sales).values({
  amount, currency, exchangeRateAtSale: currentTryRate,  // historical lock
  amountInBaseCurrency: amount * currentTryRate
});
```

Bu yapılmadıysa eski satışlarda kur değişince muhasebe rakamları **kayar**. Acil düzeltilmeli.

---

### 2.6 Search Altyapısı

**(a) Mevcut durum — DOĞRULAMA:**
- `pg_trgm` extension **kullanılmıyor**.
- Mevcut arama: `ILIKE '%query%'` (büyük tablolarda full table scan).
- 1276 ürünlü PROSAN'da şu an OK, 50K SKU'lu tenant'ta saniyeler sürer.

**(b) Efor:** **0.5 gün** (pg_trgm + GIN index, Meilisearch'e gerek yok henüz).

**(c) Önerilen:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
CREATE INDEX idx_products_code_trgm ON products USING GIN (product_code gin_trgm_ops);
-- query: WHERE name % 'samsung' (similarity) veya name ILIKE '%samsung%' (artık GIN kullanır)
```

Meilisearch/Typesense **2027'ye ertelenebilir** — 100K SKU + tenant başına 5K+ aktif query/saat olunca anlamlı.

---

### 2.7 Real-time

**(a) Mevcut durum:** Roadmap D.6'da. Henüz kod yok.

**Kvable'ın saydığı use case'ler doğru:**
1. POS multi-cashier stok sync (kritik)
2. Marketplace yeni sipariş bildirimi
3. Multi-device session invalidation (şifre değişince)

**(b) Efor:** **1 gün** (SSE temel) veya **2 gün** (WebSocket + reconnect).

**(c) Önerilen yaklaşım:**
- **SSE (Server-Sent Events) önce** — tek yön (server→client) yeterli. WebSocket'tan basit, proxy-friendly, otomatik reconnect.
- WebSocket sadece bidirectional gerekirse (POS canlı düzenleme, gelecekte chat).

---

## 🟢 BÖLÜM 3 — Fonksiyonel Eksikler

### 3.1 Mali Müşavir Modülü

**(a) Mevcut durum — DOĞRULAMA:**
- `routes/accountant.ts` + `routes/reports-official.ts` var.
- Önceki dokümanda: KDV beyanı, Form Ba/Bs, Mizan **var** denmiş.
- e-Defter XBRL-GL **yok** (kontrol edildi, kod tabanında XBRL/GL keyword'ü kayıtlı değil).
- Cross-tenant müşavir rolü mevcut (invite token sistemi var).

**(b) Efor:**
- e-Defter XBRL-GL: **5-7 gün** (XML schema kompleks, GİB doğrulama servisleri, test ortamı entegrasyonu)
- BA/BS otomatik üretim: **1 gün** (mevcut data var, format çıkartmak)
- KDV beyannamesi ön hazırlık: **1 gün** (büyük olasılıkla mevcut, dokümante değil)

**(c) Önerilen teknik yaklaşım:**
e-Defter modülü **müşteriye satılırken büyük diferansiyatör**. Ama:
- GİB'in e-Defter doğrulama portalına test gönderimleri yapılmalı
- XBRL-GL Türkiye taksonomisi (TR taksonomi) güncellemeleri takip edilmeli
- Ayrı sprint olarak ele alınmalı (E-DEFTER), kabaca **2 hafta full**

**STRATEJİK ÖNERİ:** e-Defter v1'i **6-12 ay sonraya** bırakalım. Şimdi BA/BS otomatik üretimi + KDV ön hazırlık dokümante çıkartılması yeterli. e-Defter zorunluluğu sadece bilanço esasına geçmiş şirketlerde — KOBİ pazarımızın küçük bir kısmı.

---

### 3.2 POS Donanım Entegrasyonu

**(a) Mevcut durum:** Yazılım POS var, donanım entegrasyonu **yok**.

**(b) Efor:**
- ESC/POS termal yazıcı (browser üzerinden WebUSB veya yerel HTTP bridge): **2 gün**
- Para çekmecesi (yazıcı ile aynı protokol): **0.5 gün**
- Barkod terazi: **2-3 gün** (her marka farklı protokol — Aclas, Avery)
- Yeni Nesil ÖKC (GİB sertifikalı): **çok zorlu** — sertifikasyon süreci var, üretici ortaklıkları gerekli (Verifone, Ingenico, Beko vb). Tek başına 1-2 ay.

**(c) Önerilen yaklaşım:**
- Termal yazıcı + para çekmecesi öncelik (her POS müşterisi ister).
- Barkod terazi sadece manav/kasap segmentine girersek (şimdilik öncelik değil).
- Yeni Nesil ÖKC: **Q4 2026** roadmap'e koy. Şimdi entegrasyon yapmayı vaat etmek riskli.

---

### 3.3, 3.4 (B2B RFQ + Üretim/BOM derinleşme)

**Mevcut durum:** Temel akışlar var, kvable'ın saydığı detaylar (multi-level BOM, contract pricing, fire takibi) **yok**.

**STRATEJİK ÖNERİ:** Bu modüller **dondurulmalı** — gerçek müşteri talebi gelene kadar geliştirme yapma. Yatay genişleme yerine var olan akışları sertleştir. Geliştirilirse her biri 3-5 gün ek iş.

---

### 3.5 Bildirim Kanalları (WhatsApp / SMS / Push)

**(a) Mevcut durum — DOĞRULAMA:**
- `routes/notifications.ts` + `routes/notification-rules.ts` **var**.
- WhatsApp Business API **yok** (Meta direct veya Twilio entegrasyonu yok).
- SMS provider **yok** (NetGSM/İletimerkezi).
- Expo Push **yok** (mobil app push notification yok).

**(b) Efor:**
- WhatsApp Business Cloud API (Meta direct): **2 gün** + Meta business hesap onayı 1-2 hafta
- NetGSM SMS: **0.5 gün** (basit REST API)
- Expo Push: **1 gün**

**(c) Önerilen yaklaşım:**
- **NetGSM önce** — Türk müşteri için SMS hâlâ çok kullanışlı, hızlı entegre. Maliyet: ~0.05 TL/SMS.
- **WhatsApp ikinci** — Meta business onay süresi var. Şablon mesajları önceden onaylatılmalı (sipariş hazır, stok kritik vb).
- **Expo Push üçüncü** — mobil app derinleşmesiyle (Sprint 60g hafta 7-8) birlikte.

`notification_rules` tablosu (event_type, channel, template_id) zaten mevcut yapıyı genişletecek şekilde — tasarım doğru.

---

### 3.6 Self-Service Onboarding + Ödeme

**(a) Mevcut durum — DOĞRULAMA:**
- Sadece `/super-admin/yeni-firma` (manuel admin tarafından).
- **Self-service signup yok**.
- **Iyzico/PayTR/Stripe entegrasyonu yok** (kontrol edildi, hiçbir keyword bulunamadı).
- `routes/subscriptions.ts` var ama internal billing tablosu, payment gateway bağlı değil.

**(b) Efor:**
- Self-service signup + subdomain seçimi: **2 gün**
- Iyzico abonelik entegrasyonu: **3 gün** (recurring billing API'leri biraz çetin, sandbox test var)
- E-mail (zaten lib/email.ts hazır — SMTP_* env'leri ile aktive)
- Welcome onboarding sequence: **1 gün**

**(c) Iyzico vs PayTR — KARAR:**

| Kriter | Iyzico | PayTR |
|---|---|---|
| Abonelik (recurring) API | ✅ Subscription ürünü var, gelişmiş | ⚠️ Manuel kart saklama gerekli, recurring sınırlı |
| Komisyon | %2.49 + 0.25 TL (yurtiçi) | %2.49 + 0.20 TL |
| BDDK uyumu | ✅ Lisanslı | ✅ Lisanslı |
| Entegrasyon dokümantasyonu | ✅ Çok iyi (NodeJS SDK var) | ⚠️ Orta |
| 3D Secure | ✅ | ✅ |
| Refund / iptal API | ✅ | ✅ |
| KOBİ adoption (Türk SaaS dünyasında) | %70 (Paraşüt, Vbt, Logo Cloud kullanıyor) | %30 |
| Marketplace özellikleri (sub-merchant) | ✅ (Ticarium Pazar için ileride lazım olur) | Kısıtlı |

**ÖNERİ: Iyzico**. Subscription API olgun, NodeJS SDK iyi, marketplace sub-merchant yapısı **Ticarium Pazar** ileride aktive olunca direkt kullanılır.

---

## 🔵 BÖLÜM 4 — Kalite & Operasyon

### 4.1 Test Genişletme

**Mevcut durum:** 41 integration test (api-server). E2E yok. Load test yok. Chaos test yok.

**Efor:** Roadmap F kapsamında, **sürekli iş**.

**Öneri:**
- **Playwright E2E** — POS satış→fatura→stok zinciri için kritik (5 ana akış). **3 gün** kurulum + ilk testler.
- **k6 load test** — production'a çıkmadan önce 1 gün, hangi endpoint'in ölçeklenmediğini bulmak için.
- **Chaos test** (Postgres down, Trendyol timeout) — şimdi değil, 100+ tenant olunca anlamlı.

### 4.2 Observability

**Mevcut durum:** Basic logging var (`lib/logger.ts`). Sentry/OpenTelemetry/Grafana **yok**.

**Öneri sıralı:**
1. Sentry (Hafta 1, 0.5 gün)
2. Better Uptime (1 saat)
3. OpenTelemetry — **3 ay sonraya ertele**, şu an Sentry yeterli
4. Tenant başına SLA dashboard — 50+ tenant olunca anlamlı

### 4.3 Developer Portal

**Mevcut durum:** OpenAPI spec var (`lib/api-spec/openapi.yaml`) ama **public yayında değil**.

**Efor:** **0.5 gün** (Redoc veya Stoplight Elements ile `/docs` endpoint).

**Öneri:** Kurumsal pakete kadar bekle. İlk 50 müşteri custom API entegrasyonu istemez. Q3 2026'da yayınla.

---

## ❓ KVABLE'IN 7 SORUSUNA NET CEVAPLAR

### S1: Bu başlıkların hangileri zaten yapılmış ama dokümantasyona yansımamış?

| Başlık | Durum |
|---|---|
| 1.1 KVKK | ❌ Hiçbir şey yapılmamış |
| 1.2 Backup/DR | ❌ Yapılmamış (Neon PITR muhtemel ama doğrulanmadı) |
| 1.3 RLS | ❌ Yapılmamış |
| 2.1 Webhook receiver | ❌ Sadece outbound webhook config var; inbound yok |
| 2.2 Outbox pattern | ⚠️ Sadece e-fatura için var, generic yok |
| 2.3 Idempotency-Key | ⚠️ Sadece e-fatura için var |
| 2.4 Feature flag runtime | ⚠️ Sadece subscription-bound var, runtime override yok |
| 2.5 Multi-currency | ⚠️ Schema var, TCMB entegrasyonu yok, snapshot belirsiz |
| 2.6 pg_trgm search | ❌ Kullanılmıyor |
| 2.7 Real-time | ❌ Yok |
| 3.1 Mali müşavir (KDV/BA-BS/Mizan) | ✅ Var (`routes/accountant.ts` + `reports-official.ts`); e-Defter ❌ yok |
| 3.2 POS donanım | ❌ Yazılım POS var, donanım yok |
| 3.3, 3.4 B2B / BOM derinleşme | ⚠️ Temel akışlar var, kvable'ın detayları yok |
| 3.5 Bildirim (WhatsApp/SMS/Push) | ⚠️ `notification_rules` tablosu var, **gerçek provider entegrasyonu yok** |
| 3.6 Self-service onboarding + ödeme | ❌ Sadece super admin manuel; payment gateway yok |

### S2: KVKK + Backup/DR durumu?
**Açıkça eksik.** Production'a çıkmadan önce **şart**. 1. öncelik haline getirildi.

### S3: RLS C'den önce gelsin mi?
**EVET.** Kvable'ın gerekçesi doğru. Tek bir unutulan filter = veri ihlali = şirket biter. 1 günlük iş, ertelemenin mantığı yok. Roadmap revize ediliyor: **KVKK temel + Backup → RLS → C → ...**

### S4: Webhook + Outbox + pg-boss tek sprint olur mu?
**EVET, mantıklı.** Birlikte tasarlanırsa:
- pg-boss kuruldu → consumer mantığı oturdu
- Outbox events pg-boss üzerinden dispatch edilir
- Webhook receiver'lar pg-boss queue'ya enqueue eder
- Marketplace polling worker'ı pg-boss job'una taşır
**Tek sprint = 4-5 gün, "Sprint D-Combined".**

### S5: Mali müşavir modülü (e-Defter XBRL-GL) efor?
- KDV/BA-BS/Mizan üretim derinleşme: **2-3 gün**
- e-Defter XBRL-GL: **2 hafta full** (GİB test ortamı + TR taksonomi + sertifikasyon hazırlık)

**Öneri:** Şimdi **BA/BS + KDV ön hazırlık dokümante çıkartılması** yapılsın (3 gün). e-Defter Q3 2026'ya planlansın — gerçek müşteri talebi gelince başla.

### S6: Iyzico vs PayTR?
**Iyzico.** Subscription API olgun, NodeJS SDK iyi, KOBİ adoption %70, marketplace sub-merchant Ticarium Pazar için hazır.

### S7: Replit Postgres'te PITR var mı?
- Replit yönetimli Postgres = **Neon altyapısı**.
- **Neon PITR destekliyor:** Free tier 7 gün retention; Scale plan 30 gün; Business plan 90 gün. Branching/restore arayüzde mevcut.
- **Doğrulama gerekli:** Replit'in hangi plan üzerinden bizim DB'yi sağladığı kontrol edilmeli (genellikle Free → Scale arasında).
- **Neon'a doğrudan geçiş gerekirse:** standart Postgres URL formatı, taşıma 30 dakika. Maliyet: $19/ay Scale plan başlangıç.
- **Supabase alternatifi:** PITR var, $25/ay başlangıç, ek olarak auth/realtime özellikleri (kullanmıyoruz).

**KARAR:** Mevcut Replit Postgres ile devam, **PITR retention süresini Replit panelinden doğrula**. 7 günden azsa direkt Neon Scale ($19/ay) plan al. Ek olarak günlük dump → R2 yedekleme (offsite, KVKK için zorunlu).

---

## 🎯 REVİZE ROADMAP — Kvable önerisi + Bizim sapmalarımız

| Sıra | Sprint | Süre | Sebep |
|---|---|---|---|
| **1** | **KVKK Temel + Backup/DR Runbook** | 4 gün | Yasal zorunluluk |
| **2** | **RLS (Sprint D.1)** | 1 gün | Veri ihlali katastrofik |
| **3** | **Sentry + Healthz + UptimeRobot (D.3 light)** | 1 gün | Production blind flying olmaz |
| **4** | **Sprint C — Hepsiburada + N11 gerçek konnektör** | 2 gün | Müşteri vaadi |
| **5** | **Sprint D-Combined: pg-boss + Outbox + Webhook receiver** | 4-5 gün | Tek seferde altyapı |
| **6** | **Iyzico + Self-service signup + onboarding** | 4 gün | Gelir akışı |
| **7** | **Mali müşavir derinleşme (BA/BS + KDV ön hazırlık)** | 3 gün | Pazar diferansiyatörü, e-Defter sonra |
| **8** | **NetGSM SMS + WhatsApp Business + Expo Push** | 3 gün | Türk müşteri bekliyor |
| **9** | **Idempotency-Key + Multi-currency snapshot + pg_trgm** | 2 gün | Reliability + scale prep |
| **10** | **Test 41→80+ + Playwright E2E** | 3 gün | Refactor güvenliği |

**Toplam: ~30 iş günü = 6 hafta.** Bu süre içinde **production-ready** ve **ilk müşteri kabul** noktasına geliriz.

**Ertelenecekler (en az 6 ay):**
- ❌ E-Defter XBRL-GL (gerçek talep gelince)
- ❌ POS donanım (termal yazıcı hariç)
- ❌ Yeni Nesil ÖKC sertifikasyon
- ❌ B2B RFQ derinleşme + Multi-level BOM
- ❌ OpenTelemetry / Grafana
- ❌ Meilisearch / Typesense
- ❌ Developer portal public

---

## 🔑 KRİTİK İTİRAFLAR (Dürüstçe)

1. **KVKK uyumumuz sıfır.** Bunu örtbas etmek tehlikeli — şu an ilk müşteri verisi alınırsa ihlal.
2. **DR planımız yok.** Production DB silinirse "elimizde ne var" sorusuna cevap "Replit Neon umarım yedekliyordur" — bu güven verici değil.
3. **Worker single-instance.** Replit deployment scale-out yapınca race condition kesin.
4. **41 test az.** Sprint 73 sonrası 9 ana modül var — modül başına ortalama 4.5 test. Refactor riskli.
5. **Pazaryeri stub'larının çoğu canlıya alındı izlenimi veriyor.** Müşteri "Hepsiburada bağlanmıyor" dediğinde inanılırlık çöker.

---

## ✅ SONUÇ

**Kvable'ın değerlendirmesi sıkıntılı bir gerçeği yüze çarpıyor:** Özellik tarafında çok ilerideyiz ama **production-readiness tarafında 4-6 hafta gerideyiz**. Yeni özellik (Sprint E tahmin motoru, B2B derinleşme, üretim derinleşme) eklemek **tehlikeli** — çünkü altyapı zayıfken yüzey alanı büyür.

**Önerim:** Yukarıdaki 10 maddelik revize roadmap'i kabul et, sırayla yürüt. Her sprint sonu test green + production deploy + smoke test. 6 hafta sonra ilk 5 müşteriyi güvenle al.

**Onayınla** Sprint 1 (KVKK Temel + Backup/DR Runbook) bugün başlıyorum.
