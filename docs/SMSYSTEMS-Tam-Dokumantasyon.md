# SMSYSTEMS — Tam Dökümantasyon

> **Versiyon:** 2026.04 · **Hazırlayan:** Ürün Ekibi · **Hedef Kitle:** Müşteri tanıtımı, KOSGEB başvurusu, paketleme, son kullanıcı kılavuzu

---

## 0. İçindekiler

1. [Yönetici Özeti (Elevator Pitch)](#1-yönetici-özeti-elevator-pitch)
2. [Ürün Vizyonu ve Hedef Kitle](#2-ürün-vizyonu-ve-hedef-kitle)
3. [Rekabet Konumlandırması](#3-rekabet-konumlandırması)
4. [Mimari ve Teknoloji](#4-mimari-ve-teknoloji)
5. [Modül Modül Tüm Yetenekler](#5-modül-modül-tüm-yetenekler)
6. [Mobil Uygulama](#6-mobil-uygulama-smsystems-mobil)
7. [Güvenlik, Çoklu Kiracılık (Multi-tenant) ve KVKK](#7-güvenlik-çoklu-kiracılık-ve-kvkk)
8. [Kullanım Kılavuzu (Son Kullanıcı için Adım Adım)](#8-kullanım-kılavuzu)
9. [API Referansı (Özet)](#9-api-referansı-özet)
10. [Paketleme ve Fiyatlandırma Önerisi](#10-paketleme-ve-fiyatlandırma-önerisi)
11. [Tanıtım / Pazarlama Materyali](#11-tanıtım-ve-pazarlama-materyali)
12. [KOSGEB Proje Şablonu](#12-kosgeb-proje-şablonu)
13. [Yol Haritası (Roadmap)](#13-yol-haritası)
14. [Sözlük](#14-sözlük)

---

## 1. Yönetici Özeti (Elevator Pitch)

**SMSYSTEMS**, KOBİ'lerin ön muhasebe, stok, satış, üretim, e-fatura/e-irsaliye, çoklu pazaryeri ve mobil saha operasyonlarını **tek panelden** yönetmesini sağlayan **çoklu kiracılı (multi-tenant) bulut tabanlı** bir SaaS platformudur.

**Tek cümlede:** *"Paraşüt'ün kullanım kolaylığını, Logo'nun derinliğini, Mikro'nun stok gücünü ve Bizim Hesap'ın fiyatını tek üründe birleştiren, Türkçe'ye doğmuş, mobil ve POS-uyumlu modern bir KOBİ ERP'si."*

**9 Farklılaşma Noktası:**
1. Subdomain bazlı tenant izolasyonu (`prosan.smsystems`, `nihatturizm.smsystems`)
2. Üretim/BOM modülü (rakiplerin çoğu sunmuyor)
3. Yerleşik POS terminali (barkod tarayıcı odaklı)
4. Sadakat/Puan sistemi (CRM eklentisi gerekmiyor)
5. Çoklu para birimi (USD/EUR/GBP/CHF/JPY → TRY) yerleşik
6. Veri içe aktarım sihirbazı (Paraşüt/Logo/Mikro/Excel'den tek tıkla geçiş)
7. Net Kâr Merkezi + Fiş OCR (yapay zeka destekli)
8. Mali Müşavir Paneli (cross-tenant erişim, KDV/Ba-Bs/Mizan)
9. Provider-agnostic pazaryeri çatısı (10 marketplace adapter)

---

## 2. Ürün Vizyonu ve Hedef Kitle

### Vizyon
> *"Her Türk KOBİ'sinin tek bir pencereden tüm ticari operasyonunu, mali müşaviriyle ve sahadaki ekibiyle birlikte yönetebilmesi."*

### Hedef Kitle
| Segment | Tipik Profil | Kazanım |
|---|---|---|
| Mikro işletme (1-3 kişi) | Bakkal, butik, kafe | POS + barkod + e-arşiv tek pakette |
| Küçük üretici (5-25 kişi) | Atölye, fason üretim | BOM + üretim emri + fire takibi |
| Toptancı/Distribütör | Cari hesap odaklı | Çoklu şube + cari + pazaryeri |
| E-ticaret satıcısı | Trendyol/Hepsi/N11 | Tek panelden çoklu mağaza |
| Mali Müşavir Ofisi | 20-200 mükellef yöneten | Tek hesapla tüm tenant'lara giriş |

### Sektörel Referans Tenantlar
- **PROSAN ENDÜSTRİ** — endüstriyel üretim
- **NİHAT TURİZM** — turizm/transfer hizmeti

---

## 3. Rekabet Konumlandırması

| Özellik | SMSYSTEMS | Bizim Hesap | Paraşüt | Logo İşbaşı | Mikro Jump | Nebim |
|---|---|---|---|---|---|---|
| Çoklu kiracı (subdomain) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POS terminali (yerleşik) | ✅ | ❌ | ❌ | Eklenti | ✅ | ✅ |
| Üretim / BOM | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Sadakat / Puan | ✅ | ❌ | ❌ | Eklenti | ❌ | ✅ |
| Çoklu para birimi | ✅ | Sınırlı | ✅ | ✅ | ✅ | ✅ |
| E-İrsaliye + E-Arşiv | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mali Müşavir Paneli | ✅ | ❌ | ✅ | Sınırlı | Sınırlı | ❌ |
| Fiş OCR (AI) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Mobil uygulama | ✅ Native | Web | ✅ | ✅ | Web | ✅ |
| Pazaryeri entegrasyonu | ✅ 10 adapter | ❌ | ✅ Sınırlı | ✅ | ✅ | ✅ |
| Veri içe aktarım sihirbazı | ✅ | ❌ | Sınırlı | ✅ | ✅ | ❌ |
| Bütçe & Tahmin | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Net Kâr Merkezi | ✅ | ❌ | Sınırlı | ✅ | ✅ | ❌ |
| Promosyon motoru (kupon) | ✅ | ❌ | ❌ | Eklenti | ✅ | ✅ |
| API + Webhook | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

**Rekabet özeti:** SMSYSTEMS, **fiyat segmenti olarak Bizim Hesap/Paraşüt** seviyesinde olmaya çalışırken, **özellik genişliği olarak Logo/Mikro/Nebim** ile yarışıyor.

---

## 4. Mimari ve Teknoloji

### 4.1 Üst Düzey Mimari
```
┌──────────────────────────────────────────────────────────────────┐
│  KULLANICI                                                       │
│  ├─ Web (React + Vite)                                           │
│  ├─ Mobil (Expo / React Native)                                  │
│  └─ Mali Müşavir Paneli                                          │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS + Cookie Session
┌────────────────────────▼─────────────────────────────────────────┐
│  API SERVER (Express + TypeScript, Pino log, Zod validate)       │
│  ├─ Tenant Resolver (subdomain → companyId)                      │
│  ├─ RBAC Middleware (super_admin / admin / staff / viewer)       │
│  ├─ Modüler Router (40+ route grubu)                             │
│  └─ Background Job Worker (FOR UPDATE SKIP LOCKED)               │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Drizzle ORM
┌────────────────────────▼─────────────────────────────────────────┐
│  POSTGRESQL                                                      │
│  ├─ companyId her tabloda (multi-tenant izolasyon)               │
│  ├─ İndexler: companyId+name, companyId+date, companyId+status   │
│  └─ Atomic transactions (üretim, satış, ödeme, kur)              │
└──────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│  EKLENTILER                                                      │
│  ├─ OpenAI Vision (Replit AI Proxy) — Fiş OCR                    │
│  ├─ Object Storage — Belge / fatura PDF                          │
│  ├─ Marketplace Adapters (Trendyol, Hepsi, N11, Shopify, ...)    │
│  └─ Mock e-Fatura Provider (gerçek entegrasyon hazır)            │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Teknoloji Stack
- **Backend:** Node.js + TypeScript + Express + Drizzle ORM + Zod
- **Frontend Web:** React 18 + Vite + Tailwind + shadcn/ui + TanStack Query
- **Mobil:** Expo (React Native) + Expo Router
- **DB:** PostgreSQL
- **Auth:** express-session + bcryptjs + RBAC
- **Barkod:** JsBarcode (SVG) + @zxing/browser (kamera)
- **PDF:** Tarayıcı print pipeline (A4 + termal rulo)
- **AI:** OpenAI Vision (Fiş OCR)

### 4.3 Çoklu Kiracılık Modeli
Her tablo `companyId` kolonu içerir. Her API isteği subdomain'den `companyId` çıkarır, middleware her sorguya ekler. Tüm `INSERT/UPDATE/DELETE` ve `JOIN` işlemleri tenant guard ile korunur. Tenant kaçışı **fiziksel olarak imkansız** (ID tahmin edilse bile başka tenant verisine erişim 404 döner).

---

## 5. Modül Modül Tüm Yetenekler

### 5.1 Çekirdek Modüller

#### Ürün ve Stok Yönetimi
- Ürün kartı (kod, isim, barkod, marka, kategori, alış/satış fiyatı, stok)
- Çoklu birim (adet/kg/lt/mt)
- Min stok uyarısı + bildirim
- Stok hareketleri (`sale`, `purchase`, `correction`, `return`, `production_consume`, `production_output`)
- Stok sayımı (sayım dokümanı + fark raporu)
- Ürün resimleri (Object Storage)

#### Müşteriler & Tedarikçiler (Cariler)
- VKN/TCKN, vergi dairesi, adres, iletişim
- Cari hesap bakiyesi (borç/alacak)
- Kredi limiti
- Müşteri grupları
- Hareket geçmişi

#### Satış ve Faturalama
- Klasik satış formu + **Hızlı POS** (`/pos`)
- Çoklu ödeme tipi (Nakit/Kart/Havale/Veresiye)
- İade işlemi
- E-Fatura / E-Arşiv / **E-İrsaliye** entegrasyonu
- Otomatik KDV hesaplama (varsayılan %20)
- Pro-rata indirim dağıtımı

#### Alış ve Tedarik
- Sipariş → Mal kabul → Fatura kayıt
- Otomatik stok girişi
- Tedarikçi cari güncelleme
- İade alış

### 5.2 İleri Modüller

#### Üretim & Reçete (BOM) — `/uretim`
- **Reçete tanımı:** 1 mamul = N hammadde × miktar (her bileşen için ayrı birim)
- **Üretim emri:** planned → in_progress → completed/cancelled
- **Tamamlama:** Tek tıkla → bileşen stokları otomatik düşer, mamul stoğu artar, fire kaydedilir, hareketler `stock_movements`'a yazılır
- **Race-safe:** `FOR UPDATE` ile sipariş kilidi + her bileşen için koşullu UPDATE (`stock >= needed`) ile eşzamanlı çağrılarda aşırı çekim/çift tamamlama imkansız

#### Sadakat & Puan — `/sadakat`
- Şirket başına ayar: 100 TL satışta X puan kazanım, 1 puan = Y TL indirim, min harcama puanı
- Manuel puan işlemi (kazanç/harcama/düzeltme)
- Müşteri sıralama (en çok puanlı)
- Otomatik kazanç (POS satışından `earn-from-sale` endpoint)
- Tenant ownership doğrulaması (cross-tenant sızıntı engelli)

#### Çoklu Para Birimi — `/doviz`
- USD, EUR, GBP, CHF, JPY desteği (TRY bazlı)
- Manuel kur girişi + history
- Çevirici (any ↔ any)
- Kur kaynağı: manual (gelecekte TCMB API + cron entegrasyonu hazır)

#### POS Terminal — `/pos`
- Barkod odaklı (autofocus, klavye girişi yakalar)
- Ürün ızgarası + canlı sepet (sticky)
- Müşteri seçimi opsiyonel (varsayılan "Geçici")
- 4 ödeme tipi
- İndirim alanı (pro-rata satırlara dağıtım)
- Veresiye için müşteri zorunlu validasyonu
- Başarı dialog'u sonrası sepet temizlenir, barkod tekrar odaklanır

#### Barkod / Etiket Merkezi — `/barcodes`
- 4 şablon: Termal (58×30mm), Fiyat (60×40mm), Raf (90×30mm), QR (40×40mm)
- A4 sütun preset'leri (2/3/4/5 sütun)
- Termal rulo modu
- Yazdır + PDF (tarayıcı print pipeline)

#### Veri İçe Aktarım Sihirbazı — `/ice-aktarim`
- 4 tip: Müşteri, Tedarikçi, Ürün, Gider
- TR kolon başlığı otomatik tanıma (Unvan/VKN/Vergi Dairesi/Tutar/Kategori vb.)
- RFC 4180 CSV parser (`,` veya `;` otomatik tespit, BOM/UTF-8)
- İdempotent re-run:
  - Müşteri/Tedarikçi: VKN ile dedupe
  - Ürün: productCode (yoksa name+barcode+brand sha1 hash)
  - Gider: notes alanına `IMP:hash` anahtarı
- Önizleme + Ön kontrol (dryRun) + İçe Aktar
- Hata satırları satır numarasıyla raporlanır

#### Mali Müşavir Paneli — `/muhasebeci`
- Mali müşavir davet (token bazlı, single-use)
- Cross-company access grant
- KDV beyanı özeti (default %20, base = brüt/1.2)
- Form Ba/Bs (5.000 TL+ eşiği, CSV export)
- Mizan (gelir/COGS/gider/net kâr)
- Period close (dönem kapama)

#### Net Kâr Merkezi — `/profit`
- Gelir/COGS/gider birleşik tablosu
- **Fiş OCR:** Foto yükle → OpenAI Vision → form otomatik dolar (vendor, VKN, fatura no, toplam, KDV, kalemler)
- Demirbaş + aylık amortisman
- Personel maliyeti (otomatik işveren toplam maliyeti)
- Tekrarlayan giderler (idempotent aylık materialize)

#### Bütçe & Tahmin — `/butce`
- Aylık/yıllık bütçe kalemleri
- Gerçekleşen vs planlanan
- Tahmin grafiği

#### Pazaryeri (Marketplace) — `/marketplace`
- Provider-agnostic adapter mimarisi
- 10 hazır stub: Trendyol, Hepsiburada, N11, Amazon TR, Çiçeksepeti, PTT AVM, Shopify, WooCommerce, İdeaSoft, Ticimax
- Kanal hesabı (her tenant için maskelenmiş credential JSON)
- Ürün ↔ kanal mapping
- Fiyatlandırma kuralı (markup/discount/round/floor)
- Stok kuralı (buffer/cap)
- Job kuyruğu (`FOR UPDATE SKIP LOCKED` worker)
- Yapılandırılmış log

#### Bankacılık — `/banking`
- Banka hesabı tanımı
- Giriş/çıkış hareketleri
- Mutabakat

#### Promosyon / Kampanya — `/campaigns`
- İndirim tipi: percent / fixed / buy_x_get_y
- Kapsam: tüm / kategori / ürün
- Kupon kodu desteği
- Min tutar / min adet
- Max kullanım limiti
- Tarih aralığı
- `/campaigns/apply` — sepet için en iyi indirimi otomatik bulur

#### Şubeler — `/branches`
- Çoklu şube
- Şube bazlı stok ve satış raporu

#### Belgeler — `/documents`
- PDF/resim yükle (Object Storage)
- Müşteri/tedarikçi/satışla ilişkilendir

#### Bildirimler — `/settings/notifications`
- Min stok / vade / ödeme bildirim kuralları
- E-posta / in-app

#### Kullanıcı & Rol Yönetimi — `/admin`
- Roller: `super_admin`, `admin`, `staff`, `viewer`
- Şirket başına kullanıcı limiti
- Audit log (tüm hareketler)

---

## 6. Mobil Uygulama (SMSYSTEMS Mobil)

**5 sekme:**
1. **Panel** — günlük satış özeti, hızlı eylemler
2. **Tarayıcı** — kamera ile barkod tara
3. **Ürünler** — ürün listesi, stok, arama
4. **Satışlar** — son satışlar, günlük ciro
5. **Müşteriler** — cari liste, bakiye renk kodlu (borç/alacak), arama, detay popup

iOS + Android + Web (Expo Universal). Aynı API'yi kullanır, aynı tenant izolasyonuyla.

---

## 7. Güvenlik, Çoklu Kiracılık ve KVKK

### Güvenlik Önlemleri
- **Şifreleme:** bcryptjs (10 round)
- **Session:** httpOnly + secure cookie + SESSION_SECRET
- **CSRF:** SameSite cookie + origin kontrolü
- **SQL Injection:** Drizzle ORM parameterized (%100 koruma)
- **Tenant izolasyonu:** Her sorguda `companyId` guard, ID tahmin edilse bile cross-tenant erişim 404
- **Rol bazlı yetki:** Her endpoint `requireAuth` + `requireRole`
- **Audit log:** Tüm yazma işlemleri kayıt altında
- **Atomic transaction:** Stok ve cari hareketlerinde TRANSACTION + FOR UPDATE
- **Race condition:** Üretim ve satışta koşullu UPDATE ile aşırı çekim engellendi

### KVKK Uyumu
- Kişisel veri yalnızca tenant'ın kendi DB partition'ında
- Müşteri silme = soft delete (yasal saklama süresi)
- Veri export endpoint'i (KVKK Madde 11)
- IP/login log silme talebi destekli

---

## 8. Kullanım Kılavuzu

> Aşağıda son kullanıcının ilk girişten itibaren her ana işlemi nasıl yapacağı adım adım anlatılmıştır.

### 8.1 İlk Giriş
1. Tarayıcıdan `https://<şirket-kodunuz>.smsystems.com.tr` adresini açın
2. Kullanıcı adı + şifre + (subdomain otomatik dolar)
3. Karşınıza Panel sayfası gelir

### 8.2 İlk Kurulum (15 dakika)
1. **Şirket Ayarları** (`/settings`) → logo, vergi bilgileri, varsayılan KDV
2. **Kullanıcılar** (`/admin/users`) → ekibi davet et, rol ata
3. **Veri İçe Aktarımı** (`/ice-aktarim`) → Eski sisteminizden CSV ile müşteri/ürün taşıyın
4. **Şubeler** (`/branches`) → Birden çok lokasyonunuz varsa
5. **Banka Hesapları** (`/banking`) → Cari hesabınızı tanıtın

### 8.3 Günlük İşlemler

#### Satış Yapma (POS ile — En hızlı yöntem)
1. `/pos` sayfasına git
2. Barkod okut **veya** ürün kartına tıkla → sepete eklenir
3. Adet +/-, fiyat düzenle (gerekirse)
4. (Opsiyonel) Müşteri seç — Veresiye için zorunlu
5. Ödeme tipi seç (Nakit/Kart/Havale/Veresiye)
6. (Opsiyonel) İndirim TL gir → satırlara pro-rata dağıtılır
7. **"Satışı Tamamla"** → fatura otomatik oluşur, stok düşer, başarı dialog'u açılır
8. OK → barkod input tekrar odaklanır, bir sonraki satışa hazır

#### Satış Yapma (Klasik form)
1. `/sales/new` → ürün(ler) seç, müşteri, ödeme bilgisi
2. (İsteğe bağlı) E-Fatura/E-Arşiv/E-İrsaliye seç → mock provider'dan doküman oluşur

#### Üretim Emri (Üretici tenant'lar için)
1. **Reçete oluştur** — `/uretim` → **Reçeteler** sekmesi → **Yeni Reçete**
   - Mamul ürün seç (örn: "Boyalı Tabela 50×30")
   - Bileşenler ekle (örn: "Sac 50×30: 1 adet" + "Boya: 0.2 kg" + "Vida: 4 adet")
   - 1 batch çıktısı belirle (örn: 1)
2. **Üretim emri yarat** — **Emirler** sekmesi → **Yeni Üretim Emri**
   - Reçete seç + planlanan miktar (örn: 50 adet)
3. **Tamamla** — Emir satırında **Tamamla** butonuna bas
   - Üretilen miktar (örn: 48), fire (örn: 2) gir
   - Kaydet → bileşen stokları otomatik düşer, mamul stoğu 48 adet artar

#### Müşteri Cari Takibi
1. `/customers` → müşteri listesi (bakiye renk kodlu)
2. Müşteri kartına gir → tüm hareketler, vade, kredi limiti
3. **Tahsilat** veya **Ödeme** → cari güncellenir, banka hareketine yansır

#### Sadakat / Puan İşlemi
1. `/sadakat` → **Ayarlar** sekmesi → kazanç oranı, harcama oranı, min puan ayarla
2. **Sıralama** sekmesi → en çok puanlı müşteriler görünür
3. Manuel ekleme/harcama: **Manuel Puan İşlemi** → müşteri seç, tip (Kazanç/Harcama/Düzeltme), puan, not

#### Çoklu Para Birimi
1. `/doviz` → mevcut kurları gör
2. Yeni kur ekle: USD = 32.50 TRY → Kaydet
3. Çevirici: 100 USD → ? TRY → Çevir butonu

#### Etiket / Barkod Yazdırma
1. `/barcodes` → ürünleri seç (sağdan ekle, sayı ayarla)
2. Şablon seç (Termal/Fiyat/Raf/QR)
3. A4 modu için sütun seç (2/3/4/5)
4. **Yazdır / PDF** → tarayıcı dialog'u açılır → yazıcıya gönder veya PDF olarak kaydet

#### Veri İçe Aktarımı (Eski sistemden taşıma)
1. `/ice-aktarim` → tip seç (Müşteri/Tedarikçi/Ürün/Gider)
2. Örnek CSV indir → eski sisteminizden export edip bu formata uyarlayın
3. Dosyayı yükle → Önizleme
4. Kolon eşleşmesini kontrol et (TR başlıklar otomatik eşleşir)
5. **Ön Kontrol (dryRun)** → hata yoksa
6. **İçe Aktar** → idempotent, aynı dosya iki kez çalıştırılırsa kopya oluşmaz

#### Pazaryeri Bağlantısı
1. `/marketplace` → **Mağazalar** sekmesi → **Yeni Mağaza**
2. Provider seç (Trendyol/Hepsi/...) + API credential gir
3. **Health Check** → bağlantıyı test et
4. Ürünleri eşle (product ↔ marketplace SKU)
5. Fiyat kuralı + stok buffer ayarla
6. **Job kuyruğuna at** (sync_products / sync_stock / sync_prices)
7. **İşler** sekmesinden ilerlemeyi izle, **Loglar** sekmesinden detay

#### Net Kâr Görme + Fiş OCR
1. `/profit` → özet sekmesinde aylık/yıllık net kâr
2. **Giderler** sekmesi → **Fiş OCR** → fiş fotoğrafı yükle
3. AI tutarı/VKN/kalemleri otomatik doldurur, kontrol et → Kaydet

#### Mali Müşavirinizi Davet Etme
1. `/muhasebeci` → **Müşavir** sekmesi → **Davet Et** → e-posta gir, link oluştur
2. Müşaviriniz linke tıklar, kendi hesabıyla kabul eder
3. Tek hesapla tüm müşterilerinin tenant'larına geçebilir
4. **KDV** sekmesinde aylık/üç aylık beyan özeti
5. **Ba/Bs** sekmesinde 5.000 TL+ alış/satış aggregate, CSV export
6. **Mizan** ve **Dönem Kapama** ek araçlar

### 8.4 Mobil Kullanımı
- App Store / Play Store'dan **SMSYSTEMS Mobil** indir
- Login → Panel'de günlük ciro
- **Tarayıcı** sekmesi → kamera ile depodaki ürünü tara → stok ve fiyat görünür
- **Müşteriler** sekmesi → arama, bakiye, detay popup
- (Yakında) Saha satış + tahsilat

---

## 9. API Referansı (Özet)

Tüm endpoint'ler `https://<tenant>.smsystems.com.tr/api/...` altında. Auth için cookie session.

### Ana Endpoint Grupları
| Prefix | Açıklama |
|---|---|
| `/auth` | Login, logout, me |
| `/products` | Ürün CRUD, arama |
| `/customers` | Müşteri CRUD, cari hareket |
| `/suppliers` | Tedarikçi CRUD |
| `/sales` | Satış oluştur, liste, iade, today özeti |
| `/purchases` | Alış oluştur, liste |
| `/stock-movements` | Stok hareket geçmişi |
| `/stock-counts` | Stok sayım dokümanı |
| `/production/recipes` · `/production/orders` | Üretim & BOM |
| `/loyalty/settings` · `/loyalty/customers/:id/balance` · `/loyalty/earn-from-sale` | Sadakat |
| `/currency/rates` · `/currency/convert` | Çoklu para birimi |
| `/campaigns` · `/campaigns/apply` | Promosyon motoru |
| `/einvoice/outbox` | E-fatura/E-arşiv/E-irsaliye |
| `/marketplace/accounts` · `/jobs` · `/logs` | Pazaryeri |
| `/profit/*` · `/profit/receipt-ocr` | Net Kâr + OCR |
| `/accountant/*` | Mali müşavir davet, access |
| `/reports-official/kdv` · `/babs` · `/mizan` | Resmi raporlar |
| `/budgets/*` | Bütçe & tahmin |
| `/import/preview` · `/import/run` | Veri içe aktarım |
| `/banking/*` | Banka hesap, hareket |
| `/branches/*` | Şubeler |

Detaylı OpenAPI/Swagger dökümanı `/api/openapi.json` (geliştirme aşamasında).

---

## 10. Paketleme ve Fiyatlandırma Önerisi

### 10.1 Paket Stratejisi (Basitten Karmaşığa)

| Paket | Hedef | Aylık Fiyat (öneri) | Özellikler |
|---|---|---|---|
| **Başlangıç** | Tek şubeli mikro işletme | 299 TL | Ürün + Müşteri + Satış + Klasik fatura + 1 kullanıcı + Mobil |
| **Profesyonel** | Küçük işletme (1-3 şube) | 699 TL | + POS + E-Arşiv + E-Fatura + Sadakat + 5 kullanıcı + Bildirim + 3 şube |
| **İşletme** | KOBİ (üretim + e-ticaret) | 1.499 TL | + Üretim/BOM + Pazaryeri (3 mağaza) + Çoklu para + Bütçe + 15 kullanıcı + Belge yönetimi |
| **Kurumsal** | Orta ölçek + müşavir + API | 2.999 TL | + Sınırsız kullanıcı + Sınırsız şube + Mali Müşavir + API + Webhook + Net Kâr Merkezi + Fiş OCR + 10 mağaza + Öncelikli destek |
| **Müşavir Ofisi** | Mali müşavirler | 4.999 TL | + 50 mükellef yönetim + Ba/Bs + KDV + Mizan + Dönem kapama + Master panel |

> Yıllık ödemede **%20 indirim**, eğitim/kurulum dahil.

### 10.2 Add-on / Modül Bazlı Satış (alternatif strateji)
- Çekirdek (ürün+müşteri+satış): 199 TL
- POS modülü: +99 TL
- Üretim/BOM modülü: +199 TL
- Pazaryeri/mağaza: +49 TL/mağaza
- Sadakat: +99 TL
- Mali Müşavir paneli: +149 TL
- Fiş OCR: +99 TL (veya 0,50 TL/fiş)
- Ek kullanıcı: +29 TL/kullanıcı
- Ek şube: +49 TL/şube

### 10.3 Pilot / Promosyon Kampanyaları
- **30 gün ücretsiz deneme** (kredi kartı sorulmadan)
- **İlk 100 müşteriye yıllık %50 indirim** ("Erken Kuş")
- **Mali müşavir referansı:** 3 mükellef getiren müşavire 6 ay ücretsiz
- **Eski sistemden taşıma garantisi:** Veri içe aktarım sihirbazı + 1 saat ücretsiz eğitim

---

## 11. Tanıtım ve Pazarlama Materyali

### 11.1 Tagline / Slogan Önerileri
- *"Tek Panelden Tüm İşletmen."*
- *"KOBİ'nin Dijital Sinir Sistemi."*
- *"Defterden Ekrana, Atölyeden Pazaryerine — Hepsi SMSYSTEMS'da."*
- *"Mali müşavirinle, sahandaki ekiple, müşterinle aynı dilde."*

### 11.2 Web Sitesi Ana Sayfa Yapısı (önerilen)
1. **Hero:** Kısa pitch + 30 gün ücretsiz dene CTA + ekran görüntüsü
2. **9 Farklılaşma:** İkonlu kartlar
3. **Modül Vitrini:** Ürün/Stok/POS/Üretim/Pazaryeri/Mali Müşavir
4. **Karşılaştırma Tablosu:** `/karsilastir` sayfası (rekabet konumlandırması)
5. **Müşteri Sektörleri:** PROSAN (üretim), NİHAT TURİZM (turizm) referansları
6. **Fiyatlandırma:** 5 paket
7. **SSS:** "Eski sistemim ile uyumlu mu?", "Veri kayboluyor mu?" vb.
8. **Demo Talep / İletişim**

### 11.3 Demo Senaryoları (Satış Sunumu için)
**Senaryo 1 — Bakkal:** POS ekranında 30 saniyede 5 ürün satışı + barkod + Veresiye + e-arşiv

**Senaryo 2 — Üretici:** Reçete tanımla → 100 adet üretim emri → tamamla → bileşen stokları otomatik düştü, mamul stoğu arttı

**Senaryo 3 — Mali Müşavir:** Davet linki → 5 müşteri tenant'ına tek hesapla giriş → KDV beyanı 1 tıkla → CSV export

**Senaryo 4 — Toptancı:** Trendyol mağaza bağla → 500 ürün senkronize et → fiyat kuralı + stok buffer → otomatik sipariş çekme

**Senaryo 5 — E-ticaret:** Çoklu para birimi → USD ile satış → otomatik TRY karşılığı → e-arşiv

### 11.4 İçerik Pazarlama Önerileri
- **Blog:** "Logo'dan SMSYSTEMS'a 1 günde nasıl geçilir?", "KDV beyanı için 3 dakikalık checklist"
- **YouTube:** Modül modül 90 saniyelik tanıtım videoları
- **LinkedIn:** Mali müşavirlere yönelik webinar serisi
- **Instagram/TikTok:** "Bakkalın 1 gününde POS ile satış" kısa video
- **SEO:** "ön muhasebe programı", "stok takip programı", "üretim takip yazılımı", "e-arşiv programı"

### 11.5 Satış Kanalı Önerileri
- **Doğrudan:** Web siteden self-signup
- **Mali Müşavir Bayilik:** %20-30 komisyon
- **Bayi Ağı:** Şehir bazlı yetkili satıcı (kurulum + eğitim ücreti)
- **Pazaryeri ortakları:** Trendyol/Hepsi satıcı portallarında reklam

---

## 12. KOSGEB Proje Şablonu

> Aşağıdaki içerik **KOSGEB Ar-Ge / İnovasyon / Endüstriyel Uygulama / KOBİGEL** çağrılarına uyarlanabilir.

### 12.1 Proje Adı
**"SMSYSTEMS — KOBİ'lere Yönelik Çoklu Kiracılı Bulut Tabanlı Entegre Ön Muhasebe, Stok, Üretim, e-Belge ve Mobil Saha Yönetim Platformu"**

### 12.2 Proje Özeti (Abstract)
Türkiye'de 3 milyondan fazla KOBİ'nin %60'ı hâlâ Excel veya kâğıt defter ile çalışmakta, ön muhasebe yazılımı kullananların büyük kısmı ise birbirinden kopuk farklı yazılımları (ön muhasebe + stok + e-fatura + pazaryeri panelleri + Excel) yan yana yürütmektedir. Bu durum **veri tutarsızlığı, zaman kaybı, mali müşavirle iletişim sürtünmesi ve yanlış vergi beyanı** riskine yol açmaktadır.

**SMSYSTEMS**, bu parçalı yapıyı tek bulut platformunda birleştiren, **çoklu kiracılı (multi-tenant) mimariye** sahip yerli bir SaaS ürünüdür. Web + iOS + Android'de aynı veritabanına çalışır, mali müşavir ile cross-tenant erişim sağlar, GİB e-belge servisleriyle entegredir, Trendyol/Hepsi/N11 gibi 10 pazaryerine adapter mimarisiyle bağlanır ve **yapay zeka destekli fiş OCR** ile masraf yönetimini otomatikleştirir.

### 12.3 Hedefler ve Ölçülebilir Çıktılar (KPI)
| Hedef | KPI | 12 ay sonra |
|---|---|---|
| Aktif tenant sayısı | Ödeme yapan şirket | 500 |
| MAU (aylık aktif kullanıcı) | Login eden kullanıcı | 2.500 |
| Ortalama abonelik geliri | ARPU | 1.200 TL/ay |
| Pazaryeri eşleştirilen ürün | Ürün sayısı | 100.000 |
| Düzenlenen e-belge | Belge sayısı/ay | 50.000 |
| Mali müşavir ofisi | Kayıtlı ofis | 50 |

### 12.4 Yenilikçi Yönler (İnovasyon Beyanı)
1. **Çoklu kiracılı subdomain mimarisi** — Türkiye'deki yerli rakiplerin çoğu tek-kiracı kurulum yapar, biz cloud-native multi-tenant
2. **Üretim/BOM + POS aynı pakette** — Logo/Mikro üretim sunar ama POS yok, Bizim Hesap POS sunar ama üretim yok
3. **AI Fiş OCR** — OpenAI Vision ile fişten otomatik gider formu doldurma (yerli rakiplerde yok)
4. **Provider-agnostic pazaryeri çatısı** — Yeni pazaryeri eklemek için sadece adapter yazmak yeterli
5. **Mali Müşavir cross-tenant erişimi** — Tek hesapla onlarca müşterinin sistemine giriş
6. **Race-safe atomic stok işlemleri** — `FOR UPDATE` + koşullu UPDATE pattern (PostgreSQL native)
7. **Provider-agnostic e-belge** — Mock + gerçek GİB entegratörü (Foriba/Logo/Mikro/uyumsoft) için adapter

### 12.5 Çalışma Paketleri (İş Paketi)
| İP | Adı | Süre (ay) | Çıktı |
|---|---|---|---|
| İP1 | Çekirdek modüller (ürün/müşteri/satış/stok) | 0-3 | MVP |
| İP2 | E-belge entegrasyonu (e-fatura/e-arşiv/e-irsaliye) | 3-5 | Canlı GİB bağlantısı |
| İP3 | Pazaryeri adapter mimarisi + Trendyol/Hepsi/N11 | 4-7 | 3 mağaza canlı |
| İP4 | Üretim/BOM + Sadakat + Çoklu Para + POS | 5-8 | Tam KOBİ ERP |
| İP5 | Mobil uygulama (iOS+Android) | 6-9 | App Store yayını |
| İP6 | AI Fiş OCR + Mali Müşavir Paneli + Net Kâr | 8-11 | Gelişmiş analitik |
| İP7 | Pilot saha çalışması (10 KOBİ) | 9-12 | Vaka analizi raporu |
| İP8 | Pazara çıkış + müşteri kazanımı | 10-12 | 500 tenant |

### 12.6 Risk Analizi
| Risk | Olasılık | Etki | Aksiyon |
|---|---|---|---|
| GİB e-belge servisinde aksaklık | Düşük | Yüksek | Yedek provider + offline kuyruk |
| Veri kaybı | Çok düşük | Çok yüksek | Günlük backup + replikasyon |
| Tenant izolasyon açığı | Düşük | Çok yüksek | Otomatik testler + pen-test |
| Rakip fiyat indirimi | Yüksek | Orta | Yıllık ödemede %20 indirim + add-on modüller |
| Mali müşavir adaptasyon direnci | Orta | Orta | Müşavir bayilik komisyonu + ücretsiz eğitim |

### 12.7 Bütçe Kalemleri (Örnek)
| Kalem | Tutar (TL) |
|---|---|
| Yazılım geliştirme (4 dev × 12 ay) | 1.200.000 |
| Bulut altyapı + SSL + CDN (12 ay) | 240.000 |
| GİB entegratör lisans + e-belge bedeli | 80.000 |
| Pazaryeri API ücretleri + test | 60.000 |
| AI servis (OpenAI Vision) | 50.000 |
| App Store + Play Store + sertifika | 20.000 |
| Pazarlama + içerik üretimi | 200.000 |
| Pilot eğitim + saha desteği | 100.000 |
| Hukuk + KVKK danışmanlık | 50.000 |
| **TOPLAM** | **2.000.000** |
| KOSGEB destek talep oranı (%75) | 1.500.000 |
| Öz katkı (%25) | 500.000 |

### 12.8 Sürdürülebilirlik
Proje sonunda aylık 600.000 TL tekrarlayan gelire (500 tenant × 1.200 TL ARPU) ulaşılması hedeflenmekte, bu da yıllık 7,2M TL ciroya karşılık gelmektedir. Pazaryeri adapter ve Mali Müşavir bayilik kanalları ile büyüme oranı yıllık %150 öngörülmektedir.

### 12.9 Pilot Müşteriler (Hazır Referanslar)
- **PROSAN ENDÜSTRİ** — endüstriyel üretim sektörü
- **NİHAT TURİZM** — turizm/transfer hizmet sektörü

---

## 13. Yol Haritası

### Yapıldı (✅)
- Çekirdek ön muhasebe + stok + satış + alış
- Çoklu kiracılı subdomain mimarisi
- E-Fatura + E-Arşiv + E-İrsaliye (mock provider, prod adapter hazır)
- POS Terminal + Barkod & Etiket Merkezi
- Üretim & Reçete (BOM) + race-safe atomic transaction
- Sadakat & Puan Sistemi
- Çoklu Para Birimi (USD/EUR/GBP/CHF/JPY)
- Promosyon / Kampanya motoru
- Pazaryeri provider-agnostic çatı (10 adapter stub)
- Net Kâr Merkezi + Fiş OCR (AI)
- Mali Müşavir Paneli (KDV/Ba-Bs/Mizan/Dönem)
- Bütçe & Tahmin
- Veri İçe Aktarım Sihirbazı
- Mobil App (Panel/Tarayıcı/Ürünler/Satışlar/Müşteriler)

### Yakın Vade (3 ay)
- Trendyol/Hepsi/N11 gerçek API entegrasyonu (canlı sipariş çekme)
- TCMB API ile otomatik kur güncelleme (cron)
- Foriba/Uyumsoft gerçek GİB entegratör adapter
- Saha Satış (mobil) — sipariş alma + tahsilat
- WhatsApp Business API ile bildirim

### Orta Vade (6-9 ay)
- B2B portal (müşteri kendi ekranından sipariş)
- Çoklu depo (depo bazlı stok)
- Üretim planlama (kapasite, vardiya)
- AI ile satış tahmini + stok önerisi
- Türkçe sesli komut (POS için)

### Uzun Vade (12+ ay)
- White-label seçeneği (bayi kendi markasıyla satabilir)
- Marketplace SDK (3. parti modül geliştirilebilir)
- Açık API + webhook ekosistemi
- Yurt dışı (Azerbaycan, KKTC, Avrupa Türk işletmeleri)

---

## 14. Sözlük

| Terim | Açıklama |
|---|---|
| **Tenant** | Sistemde bağımsız bir şirket/müşteri (kendi DB partition'ı, subdomain'i, kullanıcıları) |
| **Multi-tenant** | Çoklu kiracılı — birden fazla şirket aynı yazılımı paylaşır ama verileri izole |
| **Subdomain** | `prosan.smsystems.com.tr` gibi tenant'ı tanıyan URL parçası |
| **BOM** | Bill of Materials — Reçete (mamul + bileşen listesi) |
| **POS** | Point of Sale — satış noktası terminali |
| **OCR** | Optical Character Recognition — görüntüden metin tanıma |
| **RBAC** | Role-Based Access Control — rol bazlı yetki sistemi |
| **VKN/TCKN** | Vergi Kimlik No / TC Kimlik No |
| **KDV** | Katma Değer Vergisi |
| **Ba/Bs** | Aylık alış/satış formu (5.000 TL+ dökümü) |
| **Mizan** | Hesap özeti (gelir/gider/net kâr) |
| **GİB** | Gelir İdaresi Başkanlığı (e-fatura/e-arşiv otoritesi) |
| **Idempotent** | Aynı işlemi tekrar çalıştırınca aynı sonucu veren (kopya oluşturmayan) |
| **Atomic transaction** | Ya hep ya hiç çalışan veritabanı işlem grubu |
| **Race condition** | Eşzamanlı isteklerin yarış durumu (atomic ile çözülür) |
| **Tenant isolation** | Bir tenant'ın başka tenant verisine erişememesi |

---

**Doküman Sonu — SMSYSTEMS Tam Dökümantasyon · 2026.04**

> Bu doküman; kullanım kılavuzu, satış sunumu, KOSGEB başvurusu, paketleme/fiyatlandırma önerisi ve yatırımcı tanıtımı için kullanılabilir. Versiyonlar `docs/` klasöründe saklanır.
