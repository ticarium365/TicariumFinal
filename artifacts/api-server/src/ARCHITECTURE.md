# Ticarium365 API — Mimari Haritası

> **Hedef kitle:** Yeni geliştirici, code review eden mühendis, yatırımcı tech-due-diligence.
> **Okuma süresi:** 2 dk. Bu dosyayı her büyük değişiklikte güncelleyin.

Backend monorepo `pnpm` workspace yapısındadır. Schema `lib/db`, runtime `artifacts/api-server` altındadır.

---

## 1) Klasör Haritası (özet)

```
artifacts/api-server/src/
├── routes/                # HTTP endpoint'leri (~80 dosya, ~27k satır)
├── services/              # İş mantığı (provider adapter'ları, worker'lar)
│   ├── finance/ledger.ts  # CANONICAL gelir/gider/nakit kaynağı (Sprint 65 fdn)
│   ├── marketplace/       # Pazaryeri provider adapter + sync_jobs worker
│   ├── einvoice/          # E-Fatura provider adapter (Sprint 62)
│   ├── sms/               # SMS provider adapter
│   ├── channels/          # (DEPRECATED bridge — bkz. §3)
│   ├── push/              # Web push notification
│   ├── currency/          # Döviz kuru servisi
│   └── queue/             # Outbox worker (idempotent webhook delivery)
├── lib/                   # Helper'lar (secret-crypto, errors, scheduler vb.)
├── middlewares/           # auth, tenant resolution, rate-limit
└── ARCHITECTURE.md        # ← bu dosya
```

---

## 2) 5 Entegrasyon Hattı

> **TLDR:** Yeni bir pazaryeri/muhasebe entegrasyonu mu yazıyorsun? `services/marketplace`
> veya `services/einvoice` adapter pattern'ini izle, `routes/marketplace.ts` veya
> `routes/einvoice.ts` üzerine ekle. Aşağıdaki diğer 3 hat **legacy/bridge** rolündedir.

| Route | Tablo(lar) | Rol | Durum |
|---|---|---|---|
| **`/marketplace`** | `marketplace_accounts`, `marketplace_orders`, `sync_jobs` | **CANONICAL** pazaryeri hattı. Provider adapter + queue worker + idempotent push/pull. Trendyol/Hepsiburada/N11 production. | ✅ Aktif, geliştirilebilir |
| `/channels` | `marketplace_*` (aynı tablolar) | UI bridge — eski "Kanal Yönetimi" sayfaları için ince wrapper. `MARKETPLACE_PRO` feature flag arkasında. | ⚠️ Frontend hâlâ kullanıyor; yeni endpoint **EKLEME**. Yeni iş `/marketplace`'e yazılır. |
| `/ext-integrations` | `accounting_integrations`, `ecommerce_integrations` | LEGACY — Sprint 14/15'te muhasebe + e-ticaret CRUD'u için yazıldı, mock sync. Credentials artık AES-256-GCM şifreli (Sprint 70). Yerini `/marketplace` ve müstakil muhasebe entegrasyonları alıyor. | 🟡 Bakımda; yeni provider eklemeyin. |
| `/integrations` | `webhooks`, `api_keys`, **`GET /catalog`** (birleşik katalog + kiracı sayıları), `POST /catalog/:entryId/ping` | Tenant admin: giden webhook, API anahtarı; katalog `integration-hub-catalog` + `ext-integrations` ile tek kaynaklı sağlayıcı listesi. | ✅ Aktif |
| `/aggregator` | `network_*` (cross-tenant) | Sprint 30+ "Ticarium Network" — tenant'lar arası tedarik/satış hattı. Pazaryeri **değil**, B2B network'tür. | ✅ Aktif, kapsam farklı |

---

## 3) Adapter Pattern Standardı

3 servis (`marketplace`, `einvoice`, `sms`) aynı kalıbı izler. Yeni bir provider eklerken bu kalıba uyun:

```
services/<domain>/
├── types.ts              # Sözleşme — Provider interface, payload tipleri
├── factory.ts            # getProviderForAccount(companyId, accountId) → Provider
├── mock-provider.ts      # API key gelmeden geliştirme/test için
├── <name>-provider.ts    # Gerçek implementasyon (her platform için bir dosya)
└── worker.ts             # (varsa) sync_jobs kuyruğu işleyici
```

**Capability Gate**: provider `capabilities` döner; worker desteklenmeyen iş tipini retry yapmadan `skipped` işaretler. Yeni iş tipi eklerken hem `types.ts` hem worker `requiredCap` map'i güncellenmeli.

**Idempotency**: e-fatura/marketplace order pull'da `externalOrderId` veya `idempotencyKey` ile RESERVE-FIRST + atomik lock.

---

## 4) Worker / Background Job Pattern

3 ayrı worker, 3 farklı sorumluluk:

| Worker | Konum | Tablo | Görev |
|---|---|---|---|
| **Marketplace Worker** | `services/marketplace/worker.ts` | `sync_jobs` | Provider push/pull işleri. `FOR UPDATE SKIP LOCKED` ile atomik claim, capability gate, retry/backoff. |
| **Outbox Worker** | `services/queue/outbox-worker.ts` | `outbox_events` | Idempotent webhook/event delivery. |
| **Scheduler** | `lib/scheduler.ts` | (cron'lar in-memory) | Periyodik görevler (ENV `ENABLE_SCHEDULER=true`). |

> **Yeni cron job nereye?** Tek seferlik queue işi → `sync_jobs`. Periyodik (saatlik/günlük) → `scheduler.ts`. Webhook fan-out → outbox. **`profitEngine.ts`'in eski `setInterval` kalıbını kopyalamayın** (legacy).

---

## 5) Canonical Finance Ledger (Sprint 65)

Tarihsel olarak gelir/gider 5 farklı tabloya dağılmıştı (`sales`, `purchases`, `expenses`, `cash_movements`, `bank_transactions`) ve her route kendi sorgusunu yazıyordu → tahmin motoru için tutarsızlık riski.

**Çözüm:** `services/finance/ledger.ts` — tek normalize API:

```ts
import { getLedger, getSummary, getRevenueTotal,
         getExpenseTotal, getExpenseByCategory } from "../services/finance/ledger.js";

const summary = await getSummary(companyId, { from, to });
// summary.bySource.{sales|purchases|expenses|cash_movements|bank_transactions}
//   .{income, expense, count}
// summary.{totalIncome, totalExpense, net}
```

Mevcut kullanıcılar: `routes/finance-dashboard.ts` (KPI'lar), `routes/budgets.ts` (plan vs gerçekleşen + cashflow forecast). Yeni finansal feature **mutlaka** ledger üzerinden okumalı; doğrudan tablo sorgusu eklememeli.

---

## 6) Güvenlik Notları (Sprint 70)

- **Credential encryption-at-rest**: `lib/secret-crypto.ts` — AES-256-GCM, `enc:v1:` prefix.
  Aktif kullanım: `routes/ext-integrations.ts` (accounting + ecommerce credentials),
  `routes/finance-documents.ts` (mailbox imapPassword), `services/einvoice/*` (provider settings).
  Yeni bir credential alanı eklerken `encryptString` veya `encryptSecrets` ile sarın.
- **CORS allowlist + CSP + reserved subdomains**: `app.ts` ve `lib/reserved-subdomains.ts`.
- **SESSION_SECRET prod kontrolü**: weak/default değerler runtime'da reddedilir.

---

## 7) "X tablosu nerede?" Hızlı Lookup

| İhtiyaç | Schema dosyası |
|---|---|
| Satış/sipariş | `lib/db/src/schema/sales.ts` |
| Alış faturaları | `lib/db/src/schema/purchases.ts` (içinde `purchasesTable`) |
| Genel gider + kasa | `lib/db/src/schema/finance.ts` |
| Gelen belgeler / mailbox | `lib/db/src/schema/finance_documents.ts` |
| Bütçe + tahmin | `lib/db/src/schema/budgets.ts` |
| Pazaryeri (canonical) | `lib/db/src/schema/marketplace.ts` |
| Reklam bütçesi (Meta/Google ads) | `lib/db/src/schema/ad_budgets.ts` (≠ genel bütçe) |
| Muhasebe + e-ticaret legacy | `lib/db/src/schema/ext_integrations.ts` |
| Banka | `lib/db/src/schema/banking.ts` |
| Kanal/marketplace ortak | `lib/db/src/schema/channels.ts` (legacy bridge tabloları) |

---

## 8) Sprint Geçmişi (kısa)

- **Sprint 14–15**: Muhasebe + e-ticaret entegrasyonları (legacy `/ext-integrations`).
- **Sprint 19**: In-app integrations (feature toggle'lar).
- **Sprint 30+**: Ticarium Network (tenant'lar arası B2B).
- **Sprint 51–55**: Pazaryeri canonical adapter + worker (`/marketplace`, `services/marketplace/`).
- **Sprint 56–57**: Finance documents + OCR pipeline.
- **Sprint 61**: Finance dashboard + AI CFO.
- **Sprint 62**: E-Fatura provider adapter (Paraşüt + 4 stub) — production-ready.
- **Sprint 63–64**: Mali müşavir XLSX export, AI CFO derinleştirme.
- **Sprint 65 (devam ediyor)**: Bütçe & tahmin motoru. Canonical finance ledger altyapısı hazır
  (`services/finance/ledger.ts`); tahmin motoru bu kaynak üzerinden geliştirilecek.
- **Sprint 70**: Güvenlik sıkılaştırma (CSP, reserved subdomains, credential encryption-at-rest, finance ledger refactor).
