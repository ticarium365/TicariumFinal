# SMSYSTEMS — Rakip Konumlandırma (Sprint 71)

> İç paydaşlar için: satış, pazarlama, ürün ekipleri.
> Karşılaştırma sayfasının (`/karsilastir`) kaynak verisi.

## 1. Pazar haritası

| Rakip | Konum | Asıl güç |
|---|---|---|
| **Bizim Hesap** | Mikro / freemium ön muhasebe | Sıfır maliyet, en basit |
| **Paraşüt** | KOBİ ön muhasebe SaaS lideri | E-fatura + muhasebeci ekosistemi |
| **Logo İşbaşı** | Logo'nun KOBİ buluta açılımı | Resmi raporlar, marka güveni |
| **Mikro Jump** | Perakende / toptan KOBİ ERP | Stok hareket detayı |
| **Nebim küçük çözümler** | Moda/perakende dikey | POS olgunluğu, mağaza yönetimi |

## 2. Paket & fiyat (referans, 2025)

| Rakip | Paketler | Aylık (₺, KDV hariç) | Notlar |
|---|---|---|---|
| Bizim Hesap | Tek (freemium) | 0 – 199 | Modül kilitli; e-fatura ek |
| Paraşüt | Başlangıç / Şirket / Şirket Plus | 499 – 2.499 | Kullanıcı / fatura limitlerine göre |
| Logo İşbaşı | Mini / Standart / Plus | 599 – 2.999 + bayi marjı | Ek modüller ekstra |
| Mikro Jump | Başlangıç / Plus / Premium | 799 – 3.500 + danışmanlık | Kurulum + eğitim ücreti |
| Nebim SMB | V3 küçük çözüm paketleri | 2.000+ (proje bazlı) | Self-servis değil |

## 3. Güçlü yönleri

- **Bizim Hesap**: Ücretsiz başlangıç. Halkbank güveni. Çok basit UI.
- **Paraşüt**: Olgun e-fatura, açık API, mali müşavir paneli, güçlü topluluk.
- **Logo İşbaşı**: Logo markası, kurumsal raporlar, mali müşavir tanıdık.
- **Mikro Jump**: Perakende / toptan stok hareket detayı, tedarikçi ağı.
- **Nebim**: Mağaza POS olgunluğu, moda dikeyinde sektör kuralları.

## 4. Eksikleri (saha gözlemi)

| Rakip | Net eksik |
|---|---|
| Bizim Hesap | Stok / barkod yetersiz, pazaryeri yok, mobil yok, çok şube yok |
| Paraşüt | Pazaryeri sync 3. parti, barkod & POS akışı zayıf, fiş OCR sınırlı, çok şubeli gerçek zamanlı stok kısıtlı |
| Logo İşbaşı | Eski arayüz, modüler ek ücretler, mobil deneyim zayıf, pazaryeri yerleşik değil, bayi zorunluluğu |
| Mikro Jump | Modern web UX'i değil, danışman zorunluluğu hissi, fiyat şeffaflığı düşük |
| Nebim SMB | Genel KOBİ için ağır/pahalı, self-servis SaaS değil, B2B/pazaryeri ek maliyet |

## 5. SMSYSTEMS farkı (9 sebep)

1. **Tek platform, tek fatura** — stok/barkod/satış/e-fatura/pazaryeri/B2B/finans/kâr; modüler ek ücret yok.
2. **11 pazaryeri yerleşik** — Trendyol, HB, N11, Amazon TR, Çiçeksepeti, PTT AVM, Shopify, Woo, İdeaSoft, Ticimax + mock sandbox.
3. **Fiş OCR (AI)** — fotoğraf yükle, satıcı/VKN/fatura no/tutar/KDV otomatik dolsun (rakiplerde yok ya da çok sınırlı).
4. **Net Kâr Merkezi** — anlık ciro – COGS – gider – maaş – amortisman = net kâr; rakipler statik raporda kalıyor.
5. **Mobil-doğal** — iOS + Android her abonelikte dahil.
6. **Barkod + POS akışı** — bir tarama → satış + stok düşümü + e-fatura, 30 saniyede.
7. **Sağlayıcı bağımsız e-Fatura** — Paraşüt / QNB / Foriba / Logo / Mikro arasında geçiş yapabiliyor; vendor lock yok.
8. **Sıfır kurulum** — subdomain'i al, davet et, sat. Bayi/danışmanlık dayatması yok.
9. **Çok kiracılı izolasyon** — her firma kendi `companyId`'sinde, ownership doğrulaması zorunlu (cross-tenant koruma test edildi).

## 6. Konumlandırma cümlesi

> **"Paraşüt'ün ön muhasebesi, Mikro'nun perakende derinliği, Logo'nun resmi raporları, Nebim'in POS olgunluğu — hepsi tek bulutta, mobil dahil, eklentisiz."**

## 7. Hedef segment

| Segment | Önerilen mesaj |
|---|---|
| Tek mağazalı esnaf | "Bizim Hesap'tan çık, satış + stok + fatura aynı anda dönsün" |
| 2–10 şubeli perakende | "Mikro'nun danışmanı yerine 10 dakikada canlıya geç" |
| Online satıcı (pazaryeri) | "Trendyol/HB/Shopify entegrasyonları zaten dahil" |
| Toptan KOBİ | "Paraşüt'e B2B + RFQ ekle, ek ücret yok" |
| Personel maliyeti yöneten KOBİ | "Maaş + SGK + amortisman = net kâr, anlık" |

## 8. Eylem maddeleri

- [x] `/karsilastir` ve `/neden-smsystems` public landing sayfaları yayında.
- [ ] SEO: meta tags, sitemap, schema.org Product + Comparison.
- [ ] Vaka çalışması: PROSAN için ROI hikayesi (3 aylık fatura/sipariş hacmi).
- [ ] Gerçek pazaryeri credentials geldiğinde live demo videoları.
- [ ] Paraşüt → SMSYSTEMS göç aracı (CSV import wizard'ı).
