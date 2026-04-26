# Ticarium365 — First 100 Launch Operations Runbook

**Üretim öncesi teknik kontrol listesi:** `docs/PRODUCTION_READINESS_CHECKLIST.md`  
**Son yürütme turları (Sentry, yedek, staging, Iyzico, DNS/mail):** `docs/FINAL_LAUNCH_EXECUTION_ROUNDS.md`

Bu doküman, ilk 10 beta işletmeden ilk 100 kapalı beta işletmeye geçişte operasyonu sade ve güvenli tutmak içindir.

## 1. En Yüksek Öncelik

Launch öncesi sadece şu işler yapılır:

- güven artıran işler
- ödeme ve abonelik güvenliği
- tenant veri sınırı
- staging/prod deploy doğrulaması
- ilk müşteri onboarding başarısı
- destek/incident operasyonu

Launch öncesi yapılmaz:

- legacy workspace rename
- gösteriş dashboard’ları
- ikinci ödeme sağlayıcı implementasyonu
- büyük mimari temizlik
- fake müşteri yorumu / fake metrik

## 2. Staging Topology

Önerilen yapı:

| Amaç | Host |
|------|------|
| Staging web app | `app.staging.<domain>` |
| Staging API | `api.staging.<domain>` |
| Production web app | `app.<domain>` |
| Production API | `api.<domain>` |
| Future admin | `admin.<domain>` |

Staging ayrı Neon DB kullanmalıdır. Production DB ile aynı DB, schema veya credential kullanılmamalıdır.

## 3. Production Env Gate

Production deploy için:

```bash
pnpm run ci:deploy
```

Bu kapı şunları durdurur:

- eksik `DATABASE_URL`
- eksik veya zayıf `SESSION_SECRET`
- eksik `IYZICO_API_KEY` / `IYZICO_SECRET_KEY`
- eksik `SENTRY_DSN`
- eksik `RELEASE_VERSION`
- `SKIP_SCHEMA_VERIFY=1`
- `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`
- wildcard/localhost CORS

Prod runtime ayrıca startup sırasında env validation yapar ve kritik hata varsa process başlamaz.

## 4. Cloudflare / DNS / Mail

DNS kayıtları:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `app` | frontend host | Proxied |
| CNAME | `api` | backend host | Proxied |
| CNAME | `app.staging` | staging frontend host | Proxied |
| CNAME | `api.staging` | staging backend host | Proxied |
| CNAME | `admin` | future/placeholder | Proxied |

Cloudflare:

- SSL/TLS: Full (strict)
- Always Use HTTPS: On
- API cache: bypass
- Basic WAF/bot protection: On

Mail:

- Support mailbox: `destek@<domain>`
- Billing/help mailbox: `fatura@<domain>` veya `destek@<domain>` alias
- SPF/DKIM/DMARC kayıtları mail provider’dan alınır.
- DMARC başlangıç: `p=none`, sonra gözlem sonrası sıkılaştırılır.

## 5. Uptime Monitoring

Monitörler:

- `GET https://api.<domain>/api/healthz`
- `GET https://api.<domain>/api/readyz`

Öneri:

- Her 60 saniye kontrol
- 2 ardışık hata sonrası alarm
- Alarm: founder + teknik sorumlu

Alarmda kontrol edilecekler:

1. Son deploy release
2. API process canlı mı
3. DB bağlantısı var mı
4. Cloudflare SSL/proxy hatası var mı
5. Sentry 5xx var mı

## 6. Payment Readiness

Production’da mock billing kullanılmaz.

Kontrol:

- `IYZICO_API_KEY` dolu
- `IYZICO_SECRET_KEY` dolu
- `IYZICO_MODE` mock değil
- `BILLING_ALLOW_MOCK_IN_PRODUCTION` unset
- `POST /api/billing/checkout` canlı sağlayıcıya yönleniyor
- `/api/billing/return` ödeme sonucunu işliyor
- `/api/billing/webhook` imzasız payload reddediyor
- duplicate webhook ikinci kez uygulama yapmıyor

Alarm eşikleri:

- 5 dakikada 2+ billing webhook 5xx → ödeme akışı durdurup incele
- 30 dakikadan eski 5+ pending payment → callback/webhook sorunu
- production’da `BILLING_MOCK_DISABLED` görülürse env yanlış

## 7. Tenant Boundary Smoke

Staging’de her deploy sonrası:

1. Tenant A ile giriş yap.
2. Aynı browser’da Tenant B host’una git.
3. Beklenen: temiz login veya `TENANT_SESSION_MISMATCH`.
4. `tenant_default_company_fallback_used` normal prod DNS altında görülmemeli.

Super admin tenant hizalama logları ayrıca izlenmeli.

## 8. Backup / Restore

Neon için:

- Günlük backup açık
- PITR varsa aktif
- Restore yetkisi kimde belli
- Restore kararı founder + teknik sorumlu onaylı

Restore drill:

1. Son backup’tan ayrı restore DB oluştur.
2. Restore DB için `DATABASE_URL` ayarla.
3. `node scripts/verify-production-schema.mjs` çalıştır.
4. Smoke: login, `/healthz`, `/readyz`, subscription current.
5. Restore süresini kaydet.

Hedef:

- RPO: en fazla 24 saat veri kaybı
- RTO: ilk beta için 4 saat içinde restore

## 9. Support Operations

İlk 100 işletme için destek kanalları:

- `destek@<domain>`
- WhatsApp hattı hazır olduğunda public contact sayfasına gerçek numara girilir
- Kritik ödeme sorunu için founder doğrudan bilgilendirilir

SLA metni:

- Kritik ödeme/giriş sorunu: aynı gün
- Normal kullanım sorusu: 1 iş günü
- Özellik talebi: kayıt altına alınır, launch sonrası değerlendirilir

## 10. First 10 Beta Motion

İlk 10 işletme concierge onboarding ile alınır:

1. 15 dakikalık demo
2. Firma kaydı
3. İlk ürün veya örnek veri
4. İlk satış/stok akışı
5. Pazaryeri varsa health check
6. Paket/ödeme netleştirme
7. 3 gün sonra geri dönüş

Her müşteri için not alınacaklar:

- kayıt nerede zorlandı
- fiyat itirazı
- eksik entegrasyon
- ilk değer anı
- destek ihtiyacı

## 11. First 100 Scale Rules

İlk 10 sağlıklı değilse 100’e çıkılmaz.

100’e çıkma koşulları:

- ödeme akışı stabil
- login/tenant hatası yok
- Sentry’de tekrar eden 5xx yok
- onboarding soruları azalmış
- destek yanıt süresi yönetilebilir

## 12. P2 Post-Launch Technical Debt

Launch sonrası:

- `artifacts/prosan` / `@workspace/prosan` legacy workspace rename
- staged RLS rollout
- second payment provider adapter
- deeper load tests
- pentest
- dead code cleanup
- founder cockpit simplification

