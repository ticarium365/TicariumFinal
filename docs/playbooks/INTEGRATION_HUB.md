# Entegrasyon merkezi (katalog + API hazırlığı)

## Endpoint’ler

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/integrations/catalog` | Admin | Birleşik katalog + kiracı bağlantı sayıları + önerilen sıra |
| POST | `/api/integrations/catalog/:entryId/ping` | Admin | Adapter ping (anahtar yoksa açıklayıcı no-op) |

## Tek kaynak

- Muhasebe / e-ticaret sağlayıcı listeleri `integration-hub-catalog.ts` üzerinden `ext-integrations` ile paylaşılır (çift liste riski yok).

## Gelen webhook (pazaryeri)

- Üretim uç: `POST /api/webhooks/:provider/:accountId` — `webhook-receivers.ts`, kanal hesabı `webhookSecret` ile HMAC.
- Katalogda `connectivity_marketplace_inbound` girdisi bu yolu ve kontrol listesini gösterir.

## Giden webhook / API anahtarı

- Ayarlar → Bağlantılar sekmeleri; katalog `connectivity_*` girdileri ile hizalanır.

## Yeni sağlayıcı eklerken

1. `integration-hub-catalog.ts` içinde ilgili `*_ROWS` veya einvoice `PROVIDER_META` kaynağını güncelleyin.
2. Gerçek API için domain `services/<domain>/factory.ts` adapter’ını ekleyin.
3. `services/integration-hub/registry.ts` içinde `resolveConnectionAdapter` eşlemesini (ileride) doldurun.
