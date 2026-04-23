# Churn önleme playbook

Bu playbook, `churnPreventionBundleV1` (super-admin billing metrics) ile aynı temayı operasyonel adımlara çevirir. **Heuristikler tahmin modeli değildir.**

## 1. Sessiz churn (ödüyor, kullanmıyor)

1. `silentChurnWatchlist` içindeki her firma için son 30 gün satış ve son girişi kontrol edin.
2. Tek müşteri başına bir “geri kazanım” mesajı şablonu seçin (fiyat değil, değer hatırlatması önce).
3. 48 saat içinde sonuç yoksa plan limiti / eğitim teklifine geçin.

## 2. İptal nedeni histogramı

1. `cancelReasons30d` üst iki kodu seçin; ürün veya SLA sahibi atayın.
2. Aynı hafta içinde müşteri görüşmesi notunu CRM veya dahili nota bağlayın.

## 3. Rescue hunisi

1. `rescueFunnelSignals`: comeback görüntüsü yüksek, tıklama düşükse CTA ve sayfa metnini sadeleştirin.
2. `churnGraceSavesThisMonth` ile `comebackOfferClicks30d` karşılaştırın; teklif URL’si ve kopyayı hizalayın.

## 4. Haftalık ritim

- Pazartesi: watchlist + save tetikleyicileri.
- Perşembe: iptal nedeni aksiyonlarının durumu.

İlgili kod: `artifacts/api-server/src/lib/founder-overnight-pack.ts` (`buildChurnPreventionBundleV1`).
