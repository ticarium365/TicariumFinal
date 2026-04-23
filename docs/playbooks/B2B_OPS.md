# B2B operasyon playbook

`b2bOpsBundleV1` ile uyumlu; teklif yaşlandırma, satıcı kapanış oranı ve tekrar alıcı ilişkileri.

## 1. Bekleyen teklif SLA

1. `pendingQuoteAgingBuckets` içinde 7g+ kovası yüksekse satıcı bazında sıralayın.
2. İlk yanıt süresi hedefi (ör. 4 iş saati) ekranda sabit gösterin.
3. 2 kez SLA aşımında yöneticiye eskalasyon.

## 2. Satıcı koçluğu

1. `sellerQuoteAcceptanceLeaders` alt uçta ve karar sayısı yüksek satıcıları seçin.
2. Red / kabul şablonlarını ve fiyat şeffaflığını gözden geçirin.

## 3. Tekrar alan alıcılar

1. `repeatBuyerRelationships`: aynı alıcı–satıcı çiftinde 90 günde birden fazla kabul varsa hacim indirimi veya sabit SLA teklif edin.
2. Bu segmenti aylık “hesap sağlığı” görüşmesine bağlayın.

İlgili kod: `computeB2bOpsSupplementV1`, `buildB2bOpsBundleV1` (`founder-overnight-pack.ts`).
