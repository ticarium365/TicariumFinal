# Competitive capability audit — benchmark vs Ticarium365

**Benchmark (bağlam):** Pazar araştırmasıyla verilen Qukasoft profili — hazır vitrin paketleri, çok sayıda pazaryeri, ödeme/kargo/muhasebe entegrasyonları, XML, pazarlama araçları, tema mağazası, 7/24 destek, hızlı kurulum iddiası, geniş özellik tabloları.

**Ticarium365 değerlendirmesi:** Kod, route’lar ve şema temel alındı; **UI metinleri tek başına kanıt sayılmadı** (bazı entegrasyon kartları backend’den daha iddialı olabilir).

**Sınıflandırma anahtarı**

| Sınıf | Anlam |
|-------|--------|
| EXISTS_READY | Üretimde kullanılabilir; anlamlı uç + veri akışı var |
| EXISTS_PARTIAL | Parçalı: stub, sandbox-only, pilot, veya UI/backend uyumsuzluğu |
| NOT_BUILT_HIGH_VALUE | Yok; KOBİ için değerli olurdu |
| NOT_BUILT_LOW_VALUE | Yok; şimdilik düşük öncelik |
| SHOULD_IGNORE_FOR_NOW | Bilinçli olarak takip etmeyin (launch / odak) |

---

## A. Core stock / sales / POS

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Ürün / kategori / barkod, stok hareketi | EXISTS_READY | Var | `products`, `stock` routes, `lib/db` şema | P0 | P0 (çekirdek) | Launch’ta duman test |
| Stok sayım | EXISTS_READY | Feature bayraklı | `FEATURES.STOCK_COUNTS` | P1 | P1 | — |
| Satış / fatura (iç) | EXISTS_READY | Var | `sales` + `SALES_INVOICES` | P0 | P0 | — |
| POS (perakende) | EXISTS_PARTIAL / READY | Bayrak: `SALES_POS` | `feature-codes`, satış modülleri | P0 | P0 | Yeni müşteride akış provası |
| Şube, şube stoku, transfer | EXISTS_READY | Var | `routes/branches.ts`, şema | P1 | P1 | — |
| 24 saatte mağaza vitrin kurulumu (Qukasoft iddiası) | NOT_BUILT_HIGH_VALUE | Ticarium vitrin-odaklı “paket kurulum” ürünü değil; katalog/mağaza parçaları ayrı | `catalog`, public storefront parçaları | P2 | Ignore (launch) | Mesajda “hazır e-ticaret paketi değiliz” |
| Dükkan adına tam “legacy e-comm migration” hizmeti | NOT_BUILT_LOW_VALUE | Otomasyon yok; operasyonel hizmet ayrı | — | P3 | Ignore | — |

---

## B. Marketplace integrations

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Trendyol / Hepsiburada / N11 (HTTP, gerçek API yolu) | EXISTS_READY* | *Prod’da gerçek uç: `*RealProvider` sınıfları; sandbox dışı push/pull yolları yürür | `trendyol-provider.ts`, `hepsiburada-provider.ts`, `n11-provider.ts`, `factory.ts` | P0 | P0 | 2–3 kanal canlı sözle sınırla |
| Diğer MP (Amazon TR, Çiçeksepeti, PTT AVM, Shopify, WC, Ideasoft, Ticimax) | EXISTS_PARTIAL | **Stub:** prod’da sandbox kapalıyken `notImpl`; sandbox’ta mock | `stub-providers.ts` (BaseStub yorumları) | P1 | P1 | Yol haritasında gerçek transport sırası |
| UI’da “Pazarama available” + şema notu | EXISTS_PARTIAL / risk | **E-ticaret platform listesinde pazarama** var; `MP_REGISTRY` içinde `pazarama` **yok** (worker yok) | `entegrasyonlar.tsx`, `ext_integrations` şema, `marketplace/factory.ts` | P1 | P1 | Uyum: ya pilot etiketi ya implementasyon; launch metninde abartma |
| Qukasoft listesindeki tüm markalar (LCW, Modanisa, vb.) | NOT_BUILT_HIGH_VALUE (çoğu) | Bu isimlere özel sağlayıcı yok | `MARKETPLACE_PROVIDERS` listesi | P2+ | P2 | İhtiyaç pazarlı: stub’dan “real”a |

---

## C. Cargo / shipping

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Kargo bölge / kural (iç) | EXISTS_READY | Var | `routes/shipping.ts`, `shippingZones` vs. | P1 | P1 | — |
| Yurtiçi/Aras/MNG/PTT API, otomatik etiket (Qukasoft benzeri) | NOT_BUILT_HIGH_VALUE | **Entegrasyon hub’da “coming_soon”**; taşıyıcı adapter sadece hazırlık sinyali | `entegrasyonlar.tsx`, `integration-hub-catalog` (kargo notları) | P0 pazar e-tic| P2 | Post-launch ürün |
| Otomatik kargo etiketi baskı | NOT_BUILT_LOW_VALUE | Yok | — | P2 | Ignore | — |

---

## D. Payments / checkout / collections

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Iyzico (checkout, return, webhook, abonelik akışı) | EXISTS_READY | Var | `billing/billing-iyzico-flow.ts`, env gate | P0 | P0 | Staging + sandbox provası |
| “Çoklu sanal POS / banka ailesi” vitrin (Param, Garanti OB…) | NOT_BUILT_LOW_VALUE / roadmap | UI’da çoğunlukla **coming_soon** / pilot | `entegrasyonlar.tsx` | P2 | Ignore | Iyzico ile net kal |
| Havale / banka bildirimi | EXISTS_READY | `payment/bank-transfer` | `payment.ts` | P1 | P1 | — |

---

## E. Accounting / e-invoice / ERP

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| e-Fatura / Paraşüt gerçek HTTP | EXISTS_READY (Paraşüt) | OAuth + REST; stub değil | `parasut-provider.ts` | P0 | P1 | Sözleşmeli musteride test |
| QNB/Foriba/Logo/Mikro (e-fatura) | EXISTS_PARTIAL | **Registry’de sınıf var;** çoğunluk `stub-providers` pattern | `einvoice/factory.ts` | P1 | P2 | Pilot müşteri ile doğrula |
| Paraşüt / Logo / … “muhasebe senk” (cari) | EXISTS_PARTIAL | `ext-integrations` muhasebe, sync uçları; katalog “live”/“pilot” karışık | `ext-integrations.ts`, `integration-hub-catalog` | P1 | P1 | Dökümantasyon: hangi yön canlı |
| “Bizim Hesap, Dia, BirFatura” açık konektör (Qukasoft) | NOT_BUILT_HIGH_VALUE | Katalog yok / farklı isim seti | `integration-hub-catalog` (Paraşüt, Logo, Mikro, Luca, Netsis) | P1 | P2 | Talebe göre |

---

## F. XML / import-export / bulk

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Excel/CSV ürün toplu içe aktarma | EXISTS_READY | `POST /api/products/import`, şablon | `products.ts`, XLSX | P0 | P0 | — |
| Günün “XML katalog feed” (Google/FB) üretimi | NOT_BUILT_HIGH_VALUE | Sistemik feed üretimi yok (Qukasoft pazarlama ayağı) | — | P1 | P2 | İstenirse 90 gün |
| Dış sistemden sürekli XML import | NOT_BUILT_LOW_VALUE | Standart değil | — | P2 | Ignore | — |

---

## G. Marketing / pixels / analytics

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Kampanya, reklam bütçe ekranları (iç) | EXISTS_PARTIAL | Rota/veri vardır | `ad-budgets` | P2 | P2 | Değer ölç |
| Google Ads / Meta Pixel (otomatik enjekte) | NOT_BUILT_HIGH_VALUE | `entegrasyonlar.tsx` **coming_soon**; GA4/Meta kartları | Tic sütunu | P1 (pazarlama e-tic) | P2 | Launch’ta “coming” dürüst söyle |
| GA4 yerleşik | NOT_BUILT_LOW_VALUE | — | — | P1 | P2 | İstemci GTM/GA elle |

---

## H. Themes / public store / website builder

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Tema marketi, vitrin “paket” seçimi (Qukasoft) | NOT_BUILT_LOW_VALUE** | Ticarium **açık tema mağazası** değil | `artifacts/prosan` tek UI kod tabanı | — | **Ignore** | Konumlandır: işletim sistemi, vitrin dükkan değil |
| Public katalog / vitrin, RFQ, storefront sipariş | EXISTS_PARTIAL / READY | Public rotalar, B2B katalog; tam “Shopify alternatifi” değil | `public-storefront`, `catalog`, public API | P1 | P1 | Sınırları anlat |

---

## I. B2B network / supplier–buyer

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| B2B teklif, gelen-giden, mesaj | EXISTS_READY | `b2b` quotes, messages | `b2b.ts` | P1 | P1 | Niche fark |
| Tedarikçi ağı “pazar yeri gibi açık ağ” (Qukasoft ölçeğinde) | NOT_BUILT_HIGH_VALUE** | Ticariumda **B2B modül** var, **Türkiye geneli açık network** yok | — | P2 | P2 | Abartma |

---

## J. Profit engine / pricing intelligence

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Kâr / gider / kanal, maliyet | EXISTS_READY | Geniş; feature bayraklı | `profit` routes, `FEATURES.PROFIT_*` | P0 | P1 | Çekirdek fark: “kâr” vurgu |
| Pazaryeri fiyat/stok kuralları, worker + autopilot | EXISTS_PARTIAL / READY | Fiyat kuralı, job, autopilot; gerçek satıcı sözü | `marketplace-*`, `marketplace-autopilot` | P0 | P0 | 2–3 kanal ile sınırla |
| Qukasoft kadar “paket fiyat + otomasyon vitrini” | — | Ticarium daha “operasyon + marj” ağırlıklı | — | — | — | Fark mesajı |

---

## K. Support / livechat / onboarding

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| E-posta (SMTP) | EXISTS_READY* | *SMTP varsa; yoksa sessiz/uyarı | `nodemailer`, .env | P0 | P0 | Staging’de test |
| NetGSM SMS (OTP) | EXISTS_READY* | *Env doluysa; UI “coming_soon” ile çelişebilir | `services/sms/factory.ts` | P0 | P0 | Entegrasyon sayfası metnini hizala |
| WhatsApp / canlı sohbet ürünü | NOT_BUILT_LOW_VALUE | CTA/placeholder, ürün yok | `iletisim`, public | P2 | P2 | Harici link |
| 7/24 bilet (ticketing sistemi) | NOT_BUILT_LOW_VALUE | — | — | P2 | Ignore | İnsan süreci + e-posta |
| Onboarding akış | EXISTS_READY | Sihirli değil ama var | `onboarding` | P0 | P0 | — |

---

## L. Admin / roles / operations

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| roller, `super_admin`, tenant | EXISTS_READY | `auth`, `tenant` | — | P0 | P0 | — |
| Super-admin faturalandırma metrikleri | EXISTS_READY | Ayrı modül | `subscriptions-admin-billing-metrics` | P0 | P0 (operasyon) | — |

---

## M. Security / trust / operations

| Capability | Sınıf | Ticarium365 durumu | Kanıt | Değer | Launch priority | Aksiyon |
|------------|--------|-------------------|--------|--------|-----------------|----------|
| Multi-tenant, session, tenant sınırı | EXISTS_READY | P0 sertleştirilmiş | `tenant-boundary`, `session-config` | P0 | P0 | Runbook |
| Sentry, healthz, oran sınırı | EXISTS_READY | | `sentry`, `app.ts` | P0 | P0 | Staging/Prod |
| R2 / yedek runbook | EXISTS_PARTIAL (dok) | Depolama sürücü + runbook; otomatik taşıyıcı yok | `PRODUCTION_READINESS` | P1 | P1 | — |

---

# Özet üretimler (istenen 6 madde)

## 1. Launch-critical missing capabilities (dürüst)

- **Taşıyıcı API’leri (etiket) yok** — e-ticaret beklentisi yüksek müşteride hayal kırıklığı riski; mesaj veya sınıflı hedef kitle.
- **Bazı pazaryerleri sadece stub** — “kanal açık” demeden önce hangi 3’ün gerçek olduğunu sözle.
- **Entegrasyon ekranı ile backend kayıt uyumu** (ör. pazarama, Iyzico kartı) — **güven** riski; düzeltme: copy veya pilot etiket (Freeze Light: küçük metin, kod genişleme yok).
- **Pazarlama piksel sihirli kurulumu yok** — launch’ta söyle, sonra roadmap.

## 2. 90 gün product roadmap (pre-launch genişleme yok; sonrası)

| Dönem | Odak |
|--------|------|
| 0–30 gün | Iyzico production + 2–3 MP gerçek kanal; tenant + smoke; kopya düzelt; SMS/UI tutarlılığı |
| 30–60 gün | 1 e-fatura + 1 muhasebe (Paraşüt) “referans vaka”; 1 kargo taşıyıcı pilot |
| 60–90 gün | 2. MP gerçek; feed/XML veya 1 piksel entegrasyonu; stub’dan “real” sıradaki 1 adet |

## 3. Qukasoft türü özellikler — ignore (şimdilik)

- Tema marketi, sınırsız “paket kıyas tablosu” yarışı
- Tüm kargo + tüm e-ticaret + tüm bankalar vitrin iddiası
- 7/24 ürün içi bilet/çağrı merkezi (insan dışı)
- “Her markaya MP” aynı anda

## 4. Ticarium365 güçlü tükendiğinde (Qukasoft tarzı “her şey”e karşı)

- **Tek uygulamada** stok, satış, **gerçek kâr** ve **pazaryeri operasyonu** (seçili kanal derinliği)
- **Kiracı sınırı** ve abonelik/ödeme olgunlukları (Iyzico, webhook) — **kontrol** söylemi
- **B2B teklif** ve tedarik hattı — “sadece vitrin değil”
- Ağır “legacy vitrin dükkan” yerine **işletim modeli** (SME, çok kanal, marj)

## 5. Mesaj (homepage / pricing) önerileri

- “En çok entegrasyon listesi” değil: **“Stok, satış, pazaryeri, B2B ve kâr — tek sade operasyon.”**
- Pazaryerinde: **“Seçili kanallarda derin; hepsinde yüzeysel değil.”** veya 3 isim: Trendyol, HB, N11 (kodla uyumlu)
- Açık: **Hazır vitrin pazaryeri dükkanı değil**; büyük e-ticaret katalog migrasyonu iddiası yok
- Iyzico / e-belge: “Abonelik ve tahsilat” düzeyinde, **banka ailesi yarışı yok** de

## 6. Temiz paket konumlandırma

| Paket felsefesi | Açıklama |
|-----------------|----------|
| **Core** | Stok, satış, belge, temel kâr |
| **Connect** | Iyzico + 2–3 pazaryeri + 1 muhasebe hattı (sözle) |
| **Pro** | Daha çok kâr, B2B, ileri entegrasyon — **sınırlar dokümante** |

**Prensip (tekrar):** Qukasoft “çok özellik ve entegrasyon” satar. Ticarium365: **“Net iş kontrolü: stok, satış, pazaryerleri, B2B ve gerçek kâr, daha sade bir işletim sisteminde.”**

---

*Son güncelleme: repo içi tarama; ürün yönetimi pazar kararlarını değiştirebilir.*
