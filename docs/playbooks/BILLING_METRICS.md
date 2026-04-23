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
