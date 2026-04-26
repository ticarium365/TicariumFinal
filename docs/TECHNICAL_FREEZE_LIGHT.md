# Technical Freeze Light — Ticarium365

**Durum:** Gerçek launch odaklı çalışma. Yeni ürün yüzeyi veya mimari genişleme **yok**; yalnızca aşağıdaki dar kapsam serbest.

**Sert filtre (önce şu):** `docs/STRATEGIC_LAUNCH_CLASSIFICATION.md` — her istek sınıflandırılır; **§1 (MUST_BUILD_OR_FIX_BEFORE_LAUNCH) değilse şimdi uygulama yok**. Odak: güven, dönüşüm sürtünmesi (küçük), launch blokajı, operasyon, söylem.

**Öncelik:** Canlıya güvenli çıkış, prova ve operasyon.

---

## İzinli (sadece bunlar)

| # | Kategori | Örnek |
|---|----------|--------|
| 1 | Gerçek deployment desteği | Host env, sıra, rollback, smoke, runbook adımlarına uyum |
| 2 | Hata düzeltmeleri | Üretim/staging’i etkileyen bug; regresyon riski düşük yamalar |
| 3 | Ortam / yapılandırma | `.env` panelleri, DNS, CORS, `SESSION_*`, `IYZICO_*`, `SENTRY_*`, Node sürümü |
| 4 | Credential entegrasyonları | Iyzico, Sentry DSN, SMTP, DB URL, üçüncü taraf anahtarları (gizlilik: repoya sızma yok) |
| 5 | Küçük dönüşüm cilası | Metin, CTA, güven kopyası; mevcut sayfalarda sınırlı UI ince ayarı (yeni sayfa/rota yok) |
| 6 | Launch prova desteği | `smoke:staging`, checklist, dokümantasyon netleştirme, ölçüm notları |

---

## Yasak (freeze süresince)

- Yeni sistemler, yeni servisler, yeni veri modelleri “fikir olarak” bile genişletme
- Yeni dashboard’lar, yeni analitik yüzeyleri, yeni raporlar
- Refactor (dosya bölme, soyutlama turu, “temizlik” PR’ları) — **bloklayıcı bug değilse yapılmaz**
- Kapsam genişletme: yeni entegrasyon kanalları, yeni ödeme sağlaycı, yeni marketplace özelliği
- Vanity metrik / mimari tiyatro

---

## İstisna

**Sadece** launch blocker veya güvenlik/ödeme/tenant veri riski için minimum değişiklik; her PR’da gerekçe tek cümle.

---

## Bağlantılı belgeler

- Yürütme: `docs/FINAL_LAUNCH_EXECUTION_ROUNDS.md`
- **Staging ilk deploy (sıra, env, smoke, GO/BLOCKED):** `docs/STAGING_DEPLOY_EXECUTION.md`
- **Fikir sınıflandırma (launch vs sonra vs red):** `docs/STRATEGIC_LAUNCH_CLASSIFICATION.md`
- Hazırlık: `docs/PRODUCTION_READINESS_CHECKLIST.md`
- Staging/prod: `docs/STAGING_PRODUCTION_EXECUTION_RUNBOOK.md`, `docs/DEPLOYMENT_RUNBOOK.md`
