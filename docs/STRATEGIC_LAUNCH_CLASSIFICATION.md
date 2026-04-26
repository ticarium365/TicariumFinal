# Strategic launch classification — Ticarium365

**Mod:** Stratejik düzeltme. Rakip özellik sayısında yarış yok. Karmaşıklık istemiyoruz.  
**Hedef:** Yağsız, kârlı, kontrol edilebilir launch; sadece **launch-kritik boşluklar** ürün/operasyon inşasına açılır.

---

## Hard filter (tüm yeni istekler)

1. **Önce sınıflandır** — her talep aşağıdaki **§1–4** sınıflarından birine girer.  
2. **Uygulama (kod/ürün) şimdi sadece** `## 1. MUST_BUILD_OR_FIX_BEFORE_LAUNCH` ile uyumlu maddeler için.  
3. **§2, §3, §4** için: **şimdi uygulama yok** — dokümantasyon, backlog veya “hayır” yeter.  
4. **İstisna yok** “küçük sürer” / “hızlı ekleriz” / “rekabet için” diye: yine sınıflandır; §1 değilse **creep = red**.

**Odak döneminde izinli çalışma türleri** (hepsi §1 sınırı içinde kalmalı; yeni özellik = değil):

| Odak | Ne zaman MUST sayılır | Ne creep sayılır (red) |
|------|------------------------|-------------------------|
| **Güven boşlukları** | Ödeme, tenant, çevre, izleme, yanıltıcı iddia (metin düzeltme) | Yeni “güvenlik ürünü”, geniş RLS, yeni sağlayıcı |
| **Dönüşüm sürtünmesi** | Mevcut sayfalarda kopya/CTA/küçük UX; onboarding netliği (var olan akış) | Yeni pazar sayfası, yeni form, yeni rota, A/B altyapısı |
| **Launch blokajları** | Pipeline, env, duman, şema, geri dönüş | Yeni “dashboard blocker” kavrayışı, geniş refaktör |
| **Operasyonel hazır** | Runbook, smoke, DNS, yedek bilinci, destek cevabı (süreç) | Otomasyon ürünü, bilet sistemi, çoklu araç |
| **Söylem hizalaması** | UI metni, fiyat/entegrasyon tablosu etiketleri, legal ton | Yeni pazarlama sitesi, çok dilli, SEO sprint |

`docs/TECHNICAL_FREEZE_LIGHT.md` bu dosyayla **birlikte** çalışır: freeze türü listeler, **strategic filter** “şimdi yapılır mı?”yı keser.

**Prensipler (sırayla hatırla):**  
1) **Sadelik** — tek akış, az yüzey.  
2) **Güven** — söz = kod; ödeme, tenant, veri.  
3) **Dönüşüm** — net söz, deneme, onboarding.  
4) **Kurucu işletilebilir** — senaryolar founder + küçük ekip.  
5) **Düşük destek yükü** — az varyant, az edge-case, az “nasıl entegre ederim” sorusu.

Aşağıdaki sınıflar **ürün/operasyon fikirleri** içindir. Konumlandırma metni, runbook, müşteri sözleşmesi ayrı çalışır ama aynı prensiple hizalanmalı.

---

## 1. MUST_BUILD_OR_FIX_BEFORE_LAUNCH

*Launch’e müşteri koyacaksan bunlar: ya para/güven riski, ya yasal/operasyonel “hayır” sınırı, ya sözle çelişen düzeyde hata riski.*

| Fikir | Gerekçe (kısa) |
|--------|-----------------|
| Ödeme yolu (Iyzico) staging + canlı prova, webhook/return, mock kapalı | Para — güven |
| `ci:gate` / şema / kritik env doğrulama (mevcut pipeline) | Dağıtım güveni |
| Tenant + oturum sınırı duman testi (bilinen davranış) | Veri izolasyonu |
| Sentry + `RELEASE_VERSION` (canlı) | 5xx körlüğü = destek fırtınası |
| **Metin/UX hizalama** (entegrasyon ekranı vs gerçek transport: “yakında / pilot / var”) | Güven; kodda büyük özellik değil, **yanıltıcı iddia** riski |
| Uptime/health (mevcut uç) + yedek runbook bildiği | Operasyonel GO |
| İlk 5–20 müşteri için destek cevabı: **1 kanal (e-posta veya açık hat)** + SLA beklentisi | Destek yükü kontrolü (*yeni bilet ürünü = değil*; net süreç) |

**Not:** “Build” = çoğunlukla **sertleştirme, duman, metin, env**; yeni pazaryeri / kargo / tema **buraya konmaz**.

---

## 2. SHOULD_BUILD_AFTER_FIRST_20_CUSTOMERS

*Ödeme akmaya ve gerçek destek/feedback gelmeye başlayınca; ispat gelmeden büyütme yok.*

| Fikir | Gerekçe |
|--------|---------|
| Paylaşımlı **session store** (Redis / PG) yalnız **çok replika** gerekirse | Tek replikada MemoryStore; çoğalma sinyali olunca |
| 4. pazaryeri “gerçek transport” (stub’dan çıkma) | Talep + mühendislik bütçesi |
| 1 büyük kargo taşıyıcı API (etiket) — **tek** | Destek: “kargo niye olmuyor” yükü yükse |
| 1 muhasebe hattı “referans vaka” derinleştirme (ör. Paraşüt cari) | Tek müşteri tekrarlanabilir olunca |
| Basit ürün feed / piksel (1 kanal) | Pazarlama eki baskı ve ölçülebilir ROİ isteyince |
| A/B veya paket ayrıntısı (sadece fiyat/özellik netliği) | Fiyat sinyali; **yeni modül yığını değil** |

---

## 3. NICE_TO_HAVE_IGNORE_NOW

*İyi görünür; launch’e maliyet / dikkat dağıtır. Şimdi yok say.*

| Fikir | Neden şimdi değil |
|--------|---------------------|
| Tema mağazası, vitrin “paket” yarışı | Konumlandırma dışı; Qukasoft alanı değil |
| “Tüm pazaryerleri aynı seviye” yol haritası | Özellik listesi büyütür; destek artar |
| 7/24 ürün içi bilet, canlı sohbet ürünü | Kurucu + e-posta + telefon; ürün sonra |
| R2/çoklu sürücü “akıllı failover” (otomatik) | Runbook + tek sürücü yeter |
| İkinci ödeme sağlayıcı (tam) | Iyzico stabil + müşteri talebi önce |
| GA4 + Meta + Google Ads sihirli sihirbaz | Elle/script; ürün değil |
| Geniş XML/EDI import sözleri | Operasyon: Excel zaten var |
| Süs rapor, vanity dashboard | dönüşüm değil |

---

## 4. DANGEROUS_COMPLEXITY_REJECT

*Eski borç veya ileri güvenlik tiyatörü: launch penceresinde “hayır”.*

| Fikir | Neden red |
|--------|-----------|
| RLS (satır bazlı) **tam rollout** yedek/audit olmadan | Şema, test, hata sınıfı; launch felci |
| Monolit route’ları tekrar birleştirip “büyük refactor” | Davranış riski; freeze ile çelişir |
| eşzamanlı 5 entegratör e-fatura + 5 kargo canlı | Entegrasyon matrisi = destek cehennemi |
| “Herkes için otomatik migrasyon” eski e-ticaretten | Hizmet değil ürün; sınır aşımı |
| Feature flag yığını, çok ortamlı deneysel ödeme | Operasyonel karmaşıklık |
| Rakip özellik tablosu ile **aynı hızda** parity chase | Prensip ihlali |

---

## Özet karar ağacı

```
Yeni istek geldi → önce §1-4 sınıfını yaz (tek cümle)
  ├─ §1 MUST → uygulamaya (veya metne) açık, minimal
  ├─ §2 → backlog; şimdi yok
  ├─ §3 veya §4 → dur; implement yok
Yeni fikir geldi (içerik aynı)
  ├─ Ödeme / tenant / veri güveni mi?  → 1, minimal patch
  ├─ İlk 20'de sinyal yok mı?          → 3 veya 2
  ├─ Entegrasyon sayısı / süre uçuşu?  → 3 veya 4
  └─ Sadece “rakip de yapıyor” mu?     → 3 veya 4
```

**İlgili:** `docs/TECHNICAL_FREEZE_LIGHT.md` · `docs/COMPETITIVE_CAPABILITY_AUDIT_QUKASOFT.md` · `docs/PRODUCTION_READINESS_CHECKLIST.md`

*Bu dosya: stratejik; kanonik operasyon değil — çelişen ürün kararında founder kararı geçer.*
