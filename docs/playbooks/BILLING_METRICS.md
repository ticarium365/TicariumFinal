# Faturalama metrikleri (super-admin)

## Endpoint

- `GET /api/subscriptions/admin/billing/metrics` — super-admin oturumu gerekir.

## İstemci önbelleği

- Prosan super-admin hub: `staleTime` varsayılan **180 saniye** (`billingMetricsPerformanceBundleV1.clientStaleTimeSuggestionSeconds` ile uyumlu).
- Ağır payload tek round-trip’ta gelir; daha sık yenilemek sunucu ve tarayıcıyı gereksiz yükler.

## Performans alanı

- `billingMetricsPerformanceBundleV1.serverDurationMs`: handler süresi (tüm metrik hesapları dahil).
- `parallelSqlSlotsFounderPack`: overnight pack içindeki paralel okuma slot sayısı (sabit referans).

## Yeni bundle anahtarları (özet)

| Anahtar | Amaç |
|--------|------|
| `churnPreventionBundleV1` | Churn / rescue / sessiz churn birleşik |
| `b2bOpsBundleV1` | B2B yaşlandırma + tekrar alıcı + koçluk |
| `founderIntelligenceV3` | Günlük aksiyon skoru |
| `docsPlaybooksBundleV1` | Repo playbook yolları + board playbook aynası |

Detaylı mimari: `docs/FOUNDER_INTELLIGENCE_AND_BACKLOG_SYSTEMS.md`.

## Ödeme dönüşü (`/api/billing/return`)

- iyzico `token` ile `retrieveCheckoutResult` sonrası oluşturulan **sentetik** webhook gövdesi, dış PSP imzası taşımaz.
- Bu yüzden `handleWebhookEvent` içinde **`x-billing-return-sig`** başlığı ile `HMAC-SHA256(IYZICO_SECRET_KEY, rawBody)` doğrulanır; doğrulanırsa PSP `verifyWebhookSignature` atlanır.
- Dış dünyadan gelen gerçek `/api/billing/webhook` çağrıları yalnızca PSP imzası ile kabul edilir (aynı handler, farklı güven kanalı).
