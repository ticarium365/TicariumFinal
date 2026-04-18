# Ticarium365 — Stratejik Analiz (Nisan 2026)

**Bakış:** Ürün sahibi + CTO + yatırımcı gözüyle. Dürüst, sert, filtresiz.

---

## 1. Executive Summary

Ticarium365 **özellik tarafında pazarın %80'inin önünde**. Logo/Mikro/Paraşüt/Akinsoft gibi yerleşik oyuncuların hiçbirinde aynı çatı altında yok: gerçek kâr motoru (holding cost), Ticarium Pazar (cross-tenant aggregator), unified e-ticaret merkezi, kanal bazlı net kâr karşılaştırma. Mimari prensipler doğru: provider-agnostic adapter, idempotent transaction'lar, at-rest credential şifreleme, partial unique index ile DB-level invariant'lar.

**Ama satışa hazır değil.** Üç kritik açık var:
1. **Multi-tenant izolasyon DB katmanında garanti edilmiyor** (sadece uygulama katmanı `WHERE company_id = ?`). Bir route'ta unutulan filtre = cross-tenant veri sızıntısı. Müşteriden önce çözülmesi şart.
2. **Operasyonel görünürlük yok** — Sentry yok, structured logging zayıf, alerting yok. İlk müşteride bir sorun çıkınca "neden çalışmadı?" sorusuna cevap veremezsin.
3. **Test kapsamı 41 integration test ile küçük.** 25+ tablo, 9+ ana modül, ~50 route var. Refactor güvenliği zayıf.

**Konum:** "Demo edilebilir, satılabilir, ama production'a alınamaz" — şu an tam burada. **3-4 hafta** disiplinli sertleştirme ile ilk 5-10 müşteriye **güvenle açılabilir**.

**Stratejik tehlike:** Özellik şişmeye devam ederse (bir sürü yeni sprint), kritik altyapı eksiği büyür ve ürün satılır ama **batar**. İlk müşteri kötü deneyim yaşarsa Türk KOBİ pazarında geri dönüşü olmaz.

---

## 2. Kırmızı Alarm Riskler

### 🚨 R1 — Tenant veri sızıntısı (KATASTROFİK)
- Tüm tenant izolasyonu uygulama katmanında. PostgreSQL **RLS (Row-Level Security) aktif değil**.
- Tek bir `WHERE companyId = ?` unutulursa: A firmasının çalışanı B firmasının ürünlerini/satışlarını/müşterilerini görebilir.
- Kanun karşılığı: **KVKK ihlali**, GDPR'da 4M EUR'a kadar ceza, müşteri davaları, marka ölümü.
- **Çözüm:** RLS politikaları (1 gün iş). Ertelenemez.

### 🚨 R2 — Operasyonel körlük
- **Sentry/Datadog yok.** Production'da hata olunca log dosyalarına bakmak zorundasın.
- **APM yok.** Hangi endpoint yavaşladı, hangi query N+1, görünmüyor.
- **Uptime monitor yok.** Müşteri "siteniz çökmüş" diye seni öğrettiği gün, hesap kaybedersin.
- **Çözüm:** Sentry (yarım gün) + Better Uptime / UptimeRobot (1 saat) + basit /healthz endpoint.

### 🚨 R3 — Backup stratejisi belirsiz
- Replit yönetimli PG var ama **point-in-time recovery? cross-region backup? felaket senaryosu testi?** Yok.
- Tek tenant 100K satır + ay sonu rapor üretirken DB silinirse → **müşteriyi kaybedersin**.
- **Çözüm:** Günlük otomatik dump (S3/R2'ye), 30 gün retention, ayda 1 restore drill.

### 🚨 R4 — Worker single-point-of-failure
- Pazaryeri worker `setInterval(5000)` tek instance. Replit deployment scale-out yapılınca **5 worker aynı job'u alır** → race condition.
- Retry/backoff/dead-letter yok. Trendyol API 30sn yavaşlasa worker tıkar.
- **Çözüm:** pg-boss (1 gün, ekstra altyapı yok, mevcut PG'yi kullanır).

### 🚨 R5 — Credential rotation prosedürü yok
- AES-256-GCM at-rest var (iyi). Ama `SESSION_SECRET` rotate edildiğinde **tüm encrypted credential okunamaz hale gelir**.
- **Çözüm:** Key versioning (`enc:v1:` zaten var, `enc:v2:` için fallback decrypt). Şu an dokümante edilmemiş.

### ⚠️ R6 — Mobil uygulama yüzeysel
- Sadece müşteri arama + bakiye. Asıl değer: barkod tarayıp stok bakma, hızlı satış, sipariş onay.
- KOBİ patronu mobile'da çalışmak ister. Şu haliyle "var ama kullanılmaz" kategorisinde.

### ⚠️ R7 — API key alınmadan canlıya çıkamayacak modüller
- Trendyol gerçek konnektör hazır (Sprint B). Ama Hepsiburada/N11/Amazon TR/Shopify hâlâ stub.
- Müşteri "Hepsiburada bağlanmıyor" deyince "yakında" demek **inanılırlığını sıfırlar**.
- **Çözüm:** ya stub'ları UI'da "Yakında - Q3 2026" disable et, ya hızlıca Sprint C ile bitir.

### ⚠️ R8 — Yedekli/atıl modüller
- **e-Ticarium Merkezi** (Sprint 73) — 9 sekmeli hub, ama 5'i "Yakında" placeholder. Müşteri açtığında bom boş bir sayfa görür → kalite algısı düşer.
- **Aggregator (Ticarium Pazar)** — vizyon güzel ama henüz tek tenant'ta bile gerçek satış akışı yok. Erken patlatılırsa "boş market" izlenimi yaratır.

---

## 3. Hızlı Para Getirecek Alanlar

Sıralı, **gerçekçi gelir potansiyeli**:

### 💰 P1 — Pazaryeri Sync (en yüksek)
**Pazar:** Türkiye'de 250K+ Trendyol satıcısı, 100K+ Hepsiburada. Mikro/Logo'da bile bu modül "ek paket" 500-2000 TL/ay.
**Bizdeki avantaj:** Provider-agnostic — müşteri sadece Trendyol'a kilitli kalmıyor.
**Aksiyon:** Sprint C (HSP+N11) bitince **"3 kanalda tek panelden stok+fiyat+sipariş"** USP'si tam oturur. Ayda 750 TL'den 100 müşteri = **75K/ay MRR** ulaşılabilir 6 ayda.

### 💰 P2 — E-Fatura
**Pazar:** GİB zorunluluğu — 5M TL ciro üstü tüm firmalar mecbur. 5M+ firma sayısı: ~700K.
**Rakip fiyat:** Paraşüt 200-500 TL/ay, Foriba 0.5-1 TL/fatura.
**Bizdeki avantaj:** Provider seçim özgürlüğü (vendor lock-in yok), ERP içine gömülü.
**Aksiyon:** QNB eFinans + Foriba gerçek konnektörleri öncelikli — Paraşüt zaten iyi. **Müşteri başına 100-150 TL ek MRR.**

### 💰 P3 — Gerçek Kâr Motoru (en farklılaştırıcı)
**Pazar:** Kimsede yok. Logo/Mikro "brüt kâr" gösterir, holding cost yok.
**Müşteri profili:** 50-500 SKU'lu mağazalar, 1000+ SKU'lu toptancılar.
**Aksiyon:** Bu modülü **landing sayfasında ana koz** yap. "Stoklarınız size her gün **kaç para yiyor**, biliyor musunuz?" sloganı. **Premium pakette tutulabilir.**

### 💰 P4 — Hazır Mağaza + POS Bundle
**Pazar:** Shopify TR'de yok, ideasoft 300+ TL/ay. POS terminal de istenir.
**Bizdeki avantaj:** Müşteri tek paketten (ERP + POS + e-ticaret + e-fatura) alır. Bundle indirimi.
**Aksiyon:** "Mağaza Açılış Paketi" — bir hafta içinde dijital satışa başlat. **Setup fee ile ek gelir** (5K TL kurulum).

### 💰 P5 — Mali Müşavir Paneli (B2B kanal)
**Pazar:** Türkiye'de ~80K mali müşavir. Her biri 20-50 mükellef yönetir.
**Strateji:** Müşaviri **satış kanalı** yap. "Müşaviriniz size Ticarium365 önerirse %10 komisyon." Müşavir 1 müşteriden 750 TL × 12 ay × %10 = 900 TL/yıl.
**Aksiyon:** Müşavir pazarlama programı + referral kodu sistemi.

### 💸 Değer üretmeyenler
- **Ticarium Pazar (aggregator)** — vizyon güzel ama 100+ tenant olmadan boş. Şu an dondur, sonra patlat.
- **B2B RFQ + Catalog** — niş, KOBİ %5'i kullanır. Geliştirmeye devam etme, mevcut hâliyle bırak.
- **Sadakat puan sistemi** — kafe/perakende için iyi ama ana satış argümanı değil. "Var" kalsın yeter.

---

## 4. Teknik Öncelikler (sıralı, atlanmaz)

### Hafta 1 — Güvenlik Sertleştirme
1. **PostgreSQL RLS** tüm tenant tablolarına (~25 tablo). Express middleware'de `SET LOCAL app.current_company_id`. (1 gün)
2. **Sentry DSN** + structured error tracking (frontend + backend). Secret scrubbing. (0.5 gün)
3. **Backup stratejisi:** günlük dump → object storage, 30 gün retention. Restore drill dokümante. (0.5 gün)
4. **Credential key versioning** dokümante + rotation prosedürü. (0.5 gün)

### Hafta 2 — Operasyonel Olgunluk
5. **pg-boss** worker queue. `marketplace_jobs`, `einvoice_outbox`, snapshot cron — hepsi tek queue'a. (1 gün)
6. **Healthz endpoint** + UptimeRobot ping. Alert e-mail/Telegram. (2 saat)
7. **API v1 prefix** (`/api/v1/...`). Mobile app için kontrat kilidi. (0.5 gün)
8. **Rate limit konsolidasyonu** — global default + endpoint override. (0.5 gün)
9. **Test kapsamı genişletme:** 41 → 80+. Öncelik: ürün CRUD, satış akışı, çok tenant izolasyon testleri (RLS bypass denemesi). (2 gün)

### Hafta 3 — Performans + UX
10. **Query analizi:** PROSAN'da 1700+ ürün listesi süresi ölç. Eksik index, N+1 düzelt. (1 gün)
11. **Frontend bundle audit:** code-splitting, lazy load. /eticarium-merkezi gibi büyük sayfaları lazy.
12. **Mobil derinleşme:** barkod tara → stok gör + hızlı satış akışı. (3 gün)

### Hafta 4 — Pazaryeri Tamamlama
13. **Sprint C:** Hepsiburada + N11 gerçek konnektör. (2 gün)
14. **WebSocket / SSE:** sipariş geldi / stok kritik bildirimi. (1 gün)
15. **"Yakında" temizliği:** kullanılmayan placeholder'ları gizle veya tamamla.

---

## 5. Ticari Öncelikler

### T1 — Pricing yeniden masaya
Şu an 5 paket var (Stok/Ticaret/İşletme/Büyüme/Kurumsal). **Çok karmaşık**. KOBİ patronu 30 saniyede karar veriyor.
**Öneri:**
- **Başlangıç:** 499 TL/ay (stok + POS + e-fatura)
- **Profesyonel:** 999 TL/ay (+ pazaryeri 3 kanal + gerçek kâr motoru)
- **İşletme:** 1.999 TL/ay (+ sınırsız kanal + mağaza + WhatsApp ticareti)
- **Enterprise:** Görüş — özel teklif

3 paket yeterli. 5 paket karar yorgunluğu.

### T2 — Free trial → 14 gün, kart istemeden
Mevcut trial var, ama **kart bilgisi şart mı?** KOBİ patronu kart vermez. Kart istemediğin trial → 3-5x daha çok kayıt.

### T3 — Onboarding: ilk 7 gün havuzu
Yeni müşteri kayıt olduktan sonra **48 saat içinde temas edilmezse** %70 kayıp. Otomatik:
- Gün 0: WhatsApp hoş geldin + ekran kaydı (3 dakika "ilk ürünü ekle")
- Gün 2: Sorun var mı? Demo randevusu butonu
- Gün 7: Trial bitiyor uyarısı + indirim kodu

### T4 — Müşaviri kanala dönüştür
Türk KOBİ'sinde **karar vericinin %50'si mali müşavir**. Ona referral programı + mali müşavir paneli ücretsiz.

### T5 — Case study üretimi
İlk 3 müşteriden video röportaj (15 dk her biri, 1 saatlik klip, 30sn/60sn/3dk versiyon). LinkedIn + Instagram + Google Ads landing.

### T6 — Türkçe SEO içerik
"trendyol stok takibi nasıl yapılır", "e-fatura geçişi", "pos sistemli kasa yönetimi" — 50+ blog yazısı. **Programmatic SEO** ile şehir bazlı sayfalar ("Konya'da E-Ticaret Yazılımı"). Bu trafik 6 ayda kompound olur.

---

## 6. İlk 10 Müşteri — Hangi Sektörler?

**Hedef profil:** 5-50M TL ciro, 1-3 lokasyon, 200-3000 SKU, sahibi 35-55 yaş, Logo/Mikro'dan şikayetçi veya hâlâ Excel'de.

### En verimli sektörler (sıralı)
1. **Yedek parça / endüstriyel malzeme toptancıları** (PROSAN tipi) — pazaryeri+B2B birlikte ihtiyaç, gerçek kâr motoru çok kıymetli.
2. **Hediyelik eşya / kozmetik / ev tekstili e-ticaret** — Trendyol+HSP+İnstagram satıyor, çok kanal yönetimi acı.
3. **Spor mağazaları + bisiklet/scooter** — orta SKU, satış sonrası takibi (servis geçmişi) kıymetli.
4. **Yapı market / nalbur** — bayilik ağı + B2B RFQ + kargo motoru avantaj.
5. **Bebek + oyuncak satıcıları** — multi-channel + sezonsallık → tahmin motoru ileride değerli.

### Atlanması gereken sektörler (şimdilik)
- **Restoran/kafe** → POS yetmez, masa yönetimi/sipariş ekranı yok. Niş ürünlerle (Adisyo) yarışırsın.
- **Eczane** → MEDULA entegrasyonu gerekli, çok özel.
- **Otomotiv galeri** → DOD/araba, çok özel.

### Edinme kanalı
- **LinkedIn outreach:** Ticaret odası üyesi e-ticaret sahipleri.
- **Trendyol satıcı grupları (Facebook/Telegram):** "stok dağıldı, ne yapmalı" yorumlarına direkt cevap.
- **Mali müşavir referral:** organik ama yavaş — paralel başlat.
- **Google Ads:** "trendyol stok programı", "e-ticaret stok takip" — yüksek niyet, pahalı ama kaliteli.

---

## 7. Bizi Rakiplerden Ayıran Özellikler

| Özellik | Ticarium365 | Logo | Mikro | Paraşüt | İdeasoft |
|---|---|---|---|---|---|
| Multi-channel pazaryeri (tek panel) | ✅ | ❌ | ❌ | ❌ | Kısmi |
| Gerçek kâr motoru (holding cost) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cross-tenant aggregator (Ticarium Pazar) | ✅ unique | ❌ | ❌ | ❌ | ❌ |
| Provider-agnostic e-fatura | ✅ | Kilitli | Kilitli | Kendi | ❌ |
| Kanal bazlı net kâr karşılaştırma | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hazır mağaza + POS + ERP tek pakette | ✅ | Ek modül | Ek modül | ❌ | Sadece mağaza |
| Mobil app | Temel | Yok | Yok | İyi | Yok |
| Bulut (true SaaS) | ✅ | Hibrit | Çoğu on-prem | ✅ | ✅ |
| TR'ye özgü tasarım (KDV/Mizan/Form Ba-Bs) | ✅ | ✅ | ✅ | ✅ | Kısmi |

**Konuşma argümanı (elevator pitch):**
> "Logo, Mikro, Paraşüt, ideasoft ve 4 farklı pazaryeri panelini açmak yerine **tek ekrandan yönetin**. Üstüne **stoklarınızın size kaç para yediğini gerçek zamanlı gösteriyoruz** — bunu kimse yapmıyor."

---

## 8. Ürünü Satın Almak İsteyen Firma Neye Bakar?

Türk SaaS pazarında çıkış senaryosu (Logo/Sovos/Vendr satın alır):

### Olumlu sinyaller (bizde var)
- ✅ Provider-agnostic mimari → büyük müşterilere "kendi entegratörlerini bağlayalım" diyebilirler.
- ✅ Multi-tenant temiz codebase → onboard maliyeti düşük.
- ✅ TypeScript + Drizzle + OpenAPI → modern, takım büyütülebilir.
- ✅ Test başlangıcı var (41 test) → CI/CD eklenebilir.

### Olumsuz sinyaller (bizde sıkıntı)
- ❌ **MRR yok / az müşteri** — alıcı en çok buna bakar. 100 ödeyen müşteri = $1M değerleme. 10 müşteri = "ürün çalışıyor mu?" şüphesi.
- ❌ **Churn rate ölçülmüyor** — analytics yok.
- ❌ **NPS / CSAT toplanmıyor** — müşteri memnuniyeti bilinmiyor.
- ❌ **Tek developer (sen)** — bus factor 1. Kod review pratiği şart, junior dev alımı yapılmalı.
- ❌ **Compliance dökümantasyonu yok** — KVKK aydınlatma metni, veri işleme sözleşmesi, ISO27001 hazırlık yok.
- ❌ **Yasal yapı?** — şirket kurulu mu, sözleşmeler var mı, hizmet seviyesi taahhütleri (SLA) yazılı mı?

### Eylem listesi (M&A öncesi 3-6 ay)
1. KVKK uyum dökümanları (aydınlatma metni, açık rıza, veri işleme sözleşmeleri)
2. SOC2 light (Vanta/Drata gibi platform + 90 gün audit log retention)
3. Müşteri sözleşmesi şablonları (SLA, fiyatlama, sona erme şartları)
4. Düzenli mali tablolar (3 ay aralıklı)
5. Müşteri başına unit economics (CAC, LTV, churn, payback period)

---

## 9. Yatırımcı Ne Sorar?

### Kaçınılmaz sorular ve şu anki cevaplar (dürüst)

| Soru | Cevap |
|---|---|
| MRR? Büyüme oranı? | **Henüz yok / belirsiz** ❌ |
| CAC / LTV / payback? | **Ölçülmüyor** ❌ |
| Churn? | **Veri yok** ❌ |
| Pazar büyüklüğü (TAM/SAM/SOM)? | TR e-ticaret SaaS ~₺3-5B/yıl, hedef SOM %5 = ₺150-250M ⭕ |
| Rekabet avantajı sürdürülebilir mi? | Gerçek kâr motoru + aggregator unique. Ama 6 ayda kopyalanabilir ⚠️ |
| Tek developer mi? | **Evet (bus factor 1)** ❌ |
| Teknoloji ölçeklenir mi? | Mimari sağlıkçı, 100K tenant'a 6 ayda hazırlanır ✅ |
| Hangi GTM kanalı çalışıyor? | **Henüz test edilmedi** ❌ |
| Patent / IP koruma? | Yok, ama kapalı kaynak + müşaviri kanala dönüştürme moat olabilir ⭕ |
| Çıkış senaryosu? | Logo/Sovos/Foriba alabilir, 5-7 yıl ⭕ |
| Burn rate / runway? | Replit altyapı tek kalem, en büyük gider ileride satış+destek ekibi ✅ |

**Yatırımcı verdikten önce 3 sayı ister:**
1. **Aylık aktif kullanıcı / MRR**
2. **Net Revenue Retention (NRR)**
3. **CAC payback period**

Bu üçü ölçülmeden seed fonu zor.

### Pre-seed (₺2-5M) için minimum şartlar
- 10-20 ödeyen müşteri, ₺50K MRR
- 3 ay sürdürülebilir büyüme grafiği (MoM ≥%20)
- Bir junior dev + bir satış/operasyon kişi alımı
- KVKK uyum dökümanları

---

## 10. 60 Günlük Net Plan

### Hafta 1-2: Güvenlik + İzleme (kritik altyapı)
- [ ] PostgreSQL RLS tüm tenant tablolarına
- [ ] Sentry entegrasyonu (frontend + backend)
- [ ] Günlük backup → object storage, 30 gün retention
- [ ] Healthz endpoint + UptimeRobot
- [ ] Credential rotation prosedürü dokümante
- [ ] KVKK aydınlatma metni + cookie banner

**Çıktı:** "Güvenle satabileceğim ürün" eşiği geçildi.

### Hafta 3-4: Operasyonel olgunluk + Pazaryeri tamamlama
- [ ] pg-boss queue (worker SPOF kaldır)
- [ ] API v1 prefix (mobile için kontrat kilidi)
- [ ] Test kapsamı 41 → 80+ (özellikle tenant izolasyon)
- [ ] Hepsiburada + N11 gerçek konnektör (Sprint C)
- [ ] "Yakında" placeholder'ları temizle
- [ ] Pricing 5 → 3 paket sadeleşmesi
- [ ] Trial kart istemeyecek şekilde değişti

**Çıktı:** Demo edilebilir + canlıya alınabilir + adil fiyatlandırma.

### Hafta 5-6: İlk müşteri kazanımı
- [ ] Landing sayfası yenileme — gerçek kâr motoru ana koz
- [ ] PROSAN ile ilk case study video
- [ ] LinkedIn outreach 100 hedef firma
- [ ] WhatsApp Business API → onboarding sequence
- [ ] Mali müşavir referral programı dokümante
- [ ] 3 SEO blog yazısı yayında

**Çıktı:** İlk 3-5 ödeyen müşteri, müşteri başına onboarding süresi ölçüldü.

### Hafta 7-8: Mobil derinleşme + analytics
- [ ] Mobil: barkod tara → stok gör + hızlı satış akışı
- [ ] Push notification (sipariş + stok alarm)
- [ ] Mixpanel/PostHog analytics — funnel + retention
- [ ] Müşteri başına unit economics dashboard
- [ ] WebSocket / SSE canlı bildirim

**Çıktı:** 5-10 müşteri, MRR ölçümü, churn izleme başladı.

### Yapılmayacaklar (60 gün içinde)
- ❌ Yeni özellik sprintleri (E-Tahmin motoru, B2B genişleme, vb.)
- ❌ Aggregator (Ticarium Pazar) tanıtımı — 100+ tenant olmadan boş
- ❌ İkinci dil (i18n) — TR pazarı yetmez
- ❌ Kompleks raporlama (BI dashboard ekstre)
- ❌ Yeni mobil platform (sadece iOS/Android Expo, web app değil)

---

## 11. "Ben Olsam Ne Yapardım?"

### İlk 7 gün
1. **PostgreSQL RLS** kurarım. Hiçbir şey daha önemli değil.
2. **Sentry hesabı** açıp DSN ekler, ilk hatayı yakalar 30 dakikada gösterirdim.
3. **Backup script** yazıp cron'a koyardım. 1 saat iş.
4. **KVKK aydınlatma metni** çıkartırdım. Avukata 5K TL verirdim.

### İkinci hafta
5. **Pricing sayfasını sadeleştirirdim** — 5 paket çok. 3 paket + Enterprise.
6. **Trial'dan kart isteme zorunluluğunu kaldırırdım**.
7. **Landing sayfasını "Gerçek Kâr Motoru"** odaklı yeniden tasarlardım.
8. **Logo/Mikro karşılaştırma sayfası** anonim ama keskin yazardım.

### Üçüncü-dördüncü hafta
9. **PROSAN'la 1 saatlik video röportaj** çekerdim. "3 ay önce şöyleydim, şimdi şöyleyim" formatı.
10. **LinkedIn'de günde 5 firma sahibine kişisel mesaj** atardım. 30 günde 150 mesaj. 5 demo. 1-2 müşteri.
11. **3 mali müşavire referral programı** ile yaklaşırdım. Onların müşterilerini sırayla onboard ederdim.

### Yapmazdım
- ❌ Yeni modül eklemezdim. Mevcut 9 modül zaten fazla.
- ❌ Aggregator pazar sayfasını anons etmezdim. 50+ tenant olmadan boş market kokar.
- ❌ Tahmin motoruna (Sprint E) zaman harcamazdım. Müşteri "bütçemi tahmin etsen ne olur" demiyor — "stok tut, fatura kes, satışım kaç para getirdi göster" diyor.

### Stratejik mantra
> **"Özellik ekleme. Sertleştir. Müşteri al. Geri bildirim öğren. O zaman özellik ekle."**

Şu an ürün **özellik bakımından zengin, müşteri bakımından fakir**. Dengeleme zamanı.

---

## 12. Sonuç & Çağrı

**Konum:** %80 ürün hazır, %20 production'a hazır.
**Risk:** Kritik altyapı tamamlanmadan müşteri alırsan ilk büyük olayda batarsın.
**Fırsat:** TR KOBİ pazarında **provider-agnostic + gerçek kâr motoru** kombinasyonu kimsede yok. 12 ayda 500+ müşteri, ₺3-5M ARR ulaşılabilir hedef.

**Net karar:**
1. **Sprint E (tahmin motoru) ertelendi.** Müşteri istemiyor, satış argümanı zayıf.
2. **Sprint C (HSP+N11) önemli ama 2. sıra.** Önce güvenlik + RLS + Sentry + backup.
3. **Yeni modül yok 60 gün.** Mevcut 9 modülü sertleştir, müşteri akıt.
4. **Pricing sadeleşsin, trial kartsız olsun, landing yenilensin.**
5. **İlk 5 müşteri PROSAN tipi: yedek parça, e-ticaret, spor.** LinkedIn + müşavir kanalı.

**Onay verirsen** Sprint D.1 (RLS) bugün başlıyorum.
