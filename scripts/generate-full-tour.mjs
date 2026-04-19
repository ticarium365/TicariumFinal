import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
  ShadingType, BorderStyle, PageBreak,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const FONT = "Calibri";
const NAVY = "0F172A";
const PRIMARY = "1E40AF";
const MUTED = "64748B";
const SHOTS = path.resolve("outputs/screenshots-all");

// ───────── helpers ─────────
const T = (text, opts = {}) => new TextRun({
  text, font: FONT, size: 22, color: NAVY, ...opts,
});
const P = (children, opts = {}) => new Paragraph({
  spacing: { after: 100, line: 290 }, children, ...opts,
});
const Body = (txt) => P([T(txt)]);
const Bullet = (txt, lbl) => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 60 },
  children: [
    lbl ? T(lbl + " ", { bold: true, color: PRIMARY }) : null,
    T(txt),
  ].filter(Boolean),
});
const Crumb = (txt) => new Paragraph({
  spacing: { after: 100 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "EFF6FF" },
  children: [T("📍 Menü Yolu: ", { bold: true, color: "1E3A8A" }), T(txt, { color: "1E3A8A" })],
});
const Action = (txt) => new Paragraph({
  spacing: { before: 80, after: 80 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "DBEAFE" },
  children: [T("→ ", { bold: true, color: "1E3A8A" }), T(txt, { color: "1E3A8A" })],
});
const Tip = (txt) => new Paragraph({
  spacing: { before: 80, after: 160 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "FEF3C7" },
  children: [T("İpucu: ", { bold: true, color: "78350F" }), T(txt, { color: "78350F", italics: true })],
});
const Caption = (txt) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text: txt, font: FONT, size: 18, italics: true, color: MUTED })],
});
function imageOf(file, widthPx = 620) {
  const buf = fs.readFileSync(path.join(SHOTS, file));
  // viewport 1440x1100 → ratio ≈ 0.764
  const heightPx = Math.round(widthPx * 1100 / 1440);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new ImageRun({ data: buf, transformation: { width: widthPx, height: heightPx }, type: "png" })],
  });
}
const Title = (n, total, txt) => [
  new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [T(`Sayfa ${n} / ${total}`, { color: PRIMARY, bold: true, size: 18 })],
  }),
  new Paragraph({
    spacing: { after: 120 },
    border: { bottom: { color: PRIMARY, space: 4, style: BorderStyle.SINGLE, size: 12 } },
    children: [T(txt, { size: 36, bold: true, color: NAVY })],
  }),
];
const Lead = (txt) => P([T(txt, { italics: true, size: 24 })], { spacing: { before: 60, after: 160 } });
const SectionH = (txt) => new Paragraph({
  spacing: { before: 200, after: 80 },
  children: [T(txt, { bold: true, color: PRIMARY, size: 24 })],
});

// ───────── İÇERİK: her sayfa için tanım ─────────

const COVER = [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 1600, after: 200 },
    children: [T("Ticarium365", { size: 84, bold: true, color: PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [T("Uçtan Uca Kullanım Kılavuzu", { size: 34, bold: true, color: NAVY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 300 },
    children: [T("Tüm sayfalar · tüm fonksiyonlar · menü yolu, ne işe yarar, nasıl kullanılır", { size: 22, color: MUTED, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 1000 },
    children: [T(`52 sayfa · ${new Date().toLocaleDateString("tr-TR")}`, { size: 20, color: MUTED })],
  }),
];

// 52 sayfanın her biri:
// { file, crumb, title, lead, what:[bullet...], how:[action...], tips:[tip...] }
const PAGES = [
  // 0 — Login
  {
    file: "00-login.png",
    crumb: "(Giriş ekranı — sistemden çıkışta veya ilk açılışta otomatik gelir)",
    title: "Giriş Ekranı",
    lead: "Tarayıcıdan kendi alan adınıza girdiğinizde sizi karşılayan ekran. Tek bir kullanıcı adı + şifre ile sistem açılır.",
    what: [
      ["Ne işe yarar:", "Çok kiracılı (multi-tenant) yapı sayesinde her firma kendi alan adında izole çalışır; başka bir firmanın verisi asla görünmez."],
      ["Roller:", "admin, staff (personel), viewer (sadece okur), super_admin (platform yöneticisi)."],
    ],
    how: [
      "Kullanıcı adınızı yazın, şifreyi yazın, ‘Giriş Yap’ butonuna basın.",
      "Şifreyi unuttuysanız sağ alttaki ‘Şifremi unuttum’ bağlantısını kullanın — sıfırlama e-postası gelir.",
    ],
    tips: ["İlk girişte sistem sizi otomatik olarak ‘Onboarding’ ekranına yönlendirir; firma bilgilerini ve birkaç ürünü ekleyince ana panele geçersiniz."],
  },

  // 1 — Dashboard
  {
    file: "01-dashboard.png",
    crumb: "Sol menüde en üst → ‘Ana Panel’",
    title: "Ana Panel (Dashboard)",
    lead: "Giriş yapar yapmaz işletmenin gününü tek bakışta gösteren karşılama ekranı.",
    what: [
      ["Üst kartlar:", "Bugünün cirosu, tahsilat, açık siparişler, kritik stok uyarıları."],
      ["Hızlı işlem:", "Yeni satış, yeni müşteri, yeni ürün gibi sık kullanılan butonlar."],
      ["Aktivite akışı:", "Son satışlar, son ödemeler, son stok hareketleri."],
    ],
    how: [
      "Sol menüden istediğiniz modüle tek tıkla geçin.",
      "Klavyeden Ctrl + K ile Komut Paleti’ni açın, aradığınız sayfanın adını yazıp Enter — direkt o sayfaya gider.",
    ],
    tips: ["Ana panel kartları klavyeyle de erişilebilir — ekran okuyucuyla uyumludur."],
  },

  // 2 — e-Ticarium Merkezi
  {
    file: "02-eticarium-merkezi.png",
    crumb: "Sol menüde üst → ‘e-Ticarium Merkezi’",
    title: "e-Ticarium Merkezi",
    lead: "E-ticaret kanallarının (pazaryeri, mağaza, B2B) tek panelden komuta merkezi.",
    what: [
      ["Tek bakış:", "Bağlı tüm kanalların sipariş sayısı, ciro ve stok eşzamanlama durumu."],
      ["Hızlı geçiş:", "Pazaryeri, Hazır Mağaza, B2B Vitrin gibi alt modüllere bir tıkla."],
    ],
    how: [
      "Üstteki kanal kartına tıklayın → ilgili kanalın detay yönetim ekranı açılır.",
      "‘Yeni kanal bağla’ butonu ile bir pazaryeri / mağaza eklersiniz."
    ],
    tips: ["Stok ve fiyat tüm bağlı kanallarda otomatik senkron olur — çift satış riski sıfırdır."],
  },

  // SATIŞ ─────────────────────────
  {
    file: "10-sales.png",
    crumb: "Sol menü → ‘Satış’ grubu → ‘Satış Ekranı’",
    title: "Satış Ekranı",
    lead: "B2B / kurumsal satışlar için klasik fatura tarzı satış formu.",
    what: [
      ["Müşteri seçimi:", "Cari listesinden müşteri seç veya yeni müşteri ekle."],
      ["Ürün satırları:", "Birden çok ürün, miktar, KDV, iskonto satır satır girilir."],
      ["Belge:", "Satış sonunda otomatik fatura/irsaliye/teklif olarak kaydedilir."],
    ],
    how: [
      "Müşteri kutusuna yazın veya ‘+’ ile yeni müşteri açın.",
      "Ürün satırı ekleyin: barkod yazıp Enter veya arama ile.",
      "Vade, ödeme yöntemi ve belge türünü seçip ‘Kaydet’e basın.",
    ],
    tips: ["Hızlı / kasiyer satışı için Satış Ekranı yerine ‘Hızlı Satış (POS)’ı kullanın."],
  },
  {
    file: "11-pos.png",
    crumb: "Sol menü → ‘Satış’ → ‘Hızlı Satış (POS)’",
    title: "Hızlı Satış (POS)",
    lead: "Mağaza kasası için tasarlanmış tek ekranlı dokunmatik / barkod tarayıcı uyumlu satış.",
    what: [
      ["Sepet:", "Ortada anlık sepet ve toplam."],
      ["Ödeme paneli:", "Sağda nakit / kart / krediyle / parçalı ödeme."],
      ["Çevrimdışı mod:", "İnternet kesilse de yerel modda çalışır; bağlantı dönünce buluta yazar."],
    ],
    how: [
      "Barkodu okutun → ürün otomatik sepete eklenir.",
      "Müşteri kart numarasını girerseniz indirim/sadakat puanı otomatik uygulanır.",
      "Ödeme tipini seçin → satışı kaydedin → fiş yazıcısından çıkar.",
    ],
    tips: ["Klavye kısayolları: F1-yardım, F2-müşteri, F4-iskonto, Esc-iptal."],
  },
  {
    file: "12-sales-history.png",
    crumb: "Sol menü → ‘Satış’ → ‘Satış Geçmişi’",
    title: "Satış Geçmişi",
    lead: "Yapılmış tüm satışların aranabilir / filtrelenebilir listesi.",
    what: [
      ["Filtreler:", "Tarih aralığı, müşteri, kanal (mağaza / online / pazaryeri), kullanıcı."],
      ["Detay:", "Bir satışa tıklayınca kalemler, ödeme, fatura ve iade durumu açılır."],
    ],
    how: [
      "Üstteki tarih aralığını seçin → liste filtrelenir.",
      "Bir satıra tıklayın → detay çekmecesi açılır; iade, iptal, PDF indir, yeniden gönder.",
    ],
    tips: ["Satışları Excel / PDF olarak dışa aktarmak için sağ üstteki ‘Dışa Aktar’ butonu."],
  },
  {
    file: "13-customers.png",
    crumb: "Sol menü → ‘Satış’ → ‘Müşteriler’",
    title: "Müşteriler",
    lead: "Cari hesap defteri — tüm müşterilerin borç / alacak bakiyesi, geçmiş işlemleri ve iletişimi.",
    what: [
      ["Profil:", "İletişim, vergi bilgileri, segment, geçmiş satışlar, ortalama ödeme süresi."],
      ["Bakiye:", "Anlık borç / alacak; alt sekmeden ekstre indirilir."],
    ],
    how: [
      "‘Yeni Müşteri’ → vergi numarasından unvan / adres otomatik çekilir.",
      "Müşteriye tıklayın → ‘Tahsilat Yap’ butonu ile ödeme alın.",
    ],
    tips: ["Aynı kişi hem müşteri hem tedarikçi olabilir; sistem tek kart altında her iki bakiyeyi tutar."],
  },
  {
    file: "14-b2b-quotes.png",
    crumb: "Sol menü → ‘Satış’ → ‘Teklifler’",
    title: "Teklifler (B2B)",
    lead: "B2B kurumsal müşteri için fiyat teklifi hazırla, onay sürecini takip et.",
    what: [
      ["Durumlar:", "Taslak → Gönderildi → Görüldü → Onay / Red."],
      ["Şablon:", "Şirket logo + KVKK + teslim/ödeme şartları içeren PDF çıktısı."],
    ],
    how: [
      "‘Yeni Teklif’ → müşteri ve ürünleri seçin, vade ve geçerlilik girin.",
      "‘E-posta Gönder’ ile müşteriye link gönderin → açıldığını sistem işaretler.",
      "Müşteri onayladığında tek tıkla siparişe çevrilir.",
    ],
    tips: ["Aynı tekliften revize üret: ‘Versiyon Aç’ butonu eski teklifi kilitleyip yeni versiyonu açar."],
  },
  {
    file: "15-b2b-orders.png",
    crumb: "Sol menü → ‘Satış’ → ‘Siparişler’",
    title: "Siparişler (B2B)",
    lead: "Onaylanmış teklifler ve doğrudan sipariş girişlerinin takibi.",
    what: [
      ["Aşamalar:", "Hazırlanıyor → Sevkiyatta → Teslim Edildi → Faturalandı."],
      ["Bağlantılar:", "Her sipariş; teklif, irsaliye, fatura ve tahsilat ile zincirleme bağlı."],
    ],
    how: [
      "Sipariş satırını açın → ‘Sevk Et’ ile irsaliye, ‘Faturala’ ile fatura kesin.",
      "‘Parçalı sevk’ destekli — bir siparişten birden çok irsaliye çıkar.",
    ],
    tips: ["Stok düşmüşse sistem sipariş anında uyarır ve alternatif ürün önerir."],
  },
  {
    file: "16-sadakat.png",
    crumb: "Sol menü → ‘Satış’ → ‘Sadakat & Puan’",
    title: "Sadakat & Puan",
    lead: "Müşteri sadakat programı: alışveriş başına puan, harcamada indirim.",
    what: [
      ["Puan kuralları:", "TL başına X puan; özel kategoride çarpan."],
      ["Üyelik seviyeleri:", "Bronz / Gümüş / Altın — otomatik atanır."],
    ],
    how: [
      "‘Yeni Kural’ ile puan kazanım/harcama oranlarını tanımlayın.",
      "POS’ta müşteri tanındığında puan otomatik birikir / harcanır.",
    ],
    tips: ["Doğum günü / yıl dönümü kampanyası tanımlarsanız sistem otomatik bonus puan verir."],
  },
  {
    file: "17-campaigns.png",
    crumb: "Sol menü → ‘Satış’ → ‘Kampanyalar’",
    title: "Kampanyalar",
    lead: "Belirli ürün / kategori / müşteri segmentine yönelik indirim ve hediye kuralları.",
    what: [
      ["Tipler:", "% indirim, sabit tutar, 2 al 1 öde, ücretsiz kargo, hediye ürün."],
      ["Hedefleme:", "Tarih aralığı, kanal, müşteri segmenti, minimum sepet tutarı."],
    ],
    how: [
      "‘Yeni Kampanya’ → tipi seçin, koşulları ve geçerlilik tarihini girin.",
      "Aktive edilen kampanya POS, online satış ve pazaryeri kanallarında otomatik uygulanır.",
    ],
    tips: ["Kampanya çakışması durumunda ‘Müşteri lehine olan uygulanır’ ayarı varsayılan açıktır."],
  },

  // ÜRÜN & STOK ─────────────────────────
  {
    file: "20-products.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Ürünler’",
    title: "Ürünler",
    lead: "Sattığınız tüm ürünlerin (mal/hizmet) ana kataloğu.",
    what: [
      ["Bilgiler:", "Ad, barkod, kategori, alış / satış fiyatı, KDV, stok, görseller."],
      ["Varyantlar:", "Renk / beden / ölçü tek kart altında yönetilir."],
    ],
    how: [
      "‘Yeni Ürün’ → bilgileri girin, görsel yükleyin, kaydedin.",
      "Toplu ürün için Excel’den yapıştır veya ‘Veri İçe Aktarımı’ kullanın.",
      "Ürüne tıklayın → satış geçmişi, stok hareketi ve kanal yayını görünür.",
    ],
    tips: ["Aynı ürün; satış, e-fatura, pazaryeri ve üretim modüllerinde tek kayıt olarak görünür."],
  },
  {
    file: "21-stock.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Stok Girişi’",
    title: "Stok Girişi",
    lead: "Depoya gelen mallar, fire / sayım düzeltmeleri ve transferler buradan girilir.",
    what: [
      ["İşlem tipleri:", "Giriş, çıkış, transfer, fire/iade, üretim girdi/çıktı."],
      ["Belge:", "Her hareket bir belge ile bağlanır (irsaliye, fatura no)."],
    ],
    how: [
      "‘Yeni Hareket’ → tipi (giriş/çıkış/transfer) seçin, depo, ürün ve miktarı girin.",
      "Çoklu satır destekli — bir irsaliyedeki tüm kalemleri tek formla girersiniz.",
    ],
    tips: ["Üretim modülünden ürün üretildiğinde stok girişi otomatik oluşur."],
  },
  {
    file: "22-stock-counts.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Stok Sayım’",
    title: "Stok Sayım",
    lead: "Periyodik sayımları (ay sonu, yıl sonu, ani) sistematik yapma ekranı.",
    what: [
      ["Sayım açma:", "Hangi depo, hangi kategori; sistem o anki teorik stoğu donduruyor."],
      ["Toleranslar:", "Belirli yüzdenin altındaki farkları otomatik kabul ettirme."],
    ],
    how: [
      "‘Yeni Sayım’ → kapsamı seçin (depo / kategori).",
      "El terminali / barkodla sayın; sistem fark raporu çıkarır.",
      "‘Onayla’ ile farklar otomatik düzeltici hareket olarak işlenir.",
    ],
    tips: ["Sayım sırasında satış engellenmez — sistem zaman damgasıyla farkı netleştirir."],
  },
  {
    file: "23-barcode.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Barkod Tarama’",
    title: "Barkod Tarama",
    lead: "El terminali olmayan operatörler için — tarayıcıdan kameralı / USB barkod ile sayım.",
    what: [
      ["Hızlı tarama:", "Her okutma anında miktar +1; çoklu modda peş peşe ürün."],
      ["Eşleşmeyen barkod:", "Sistem yeni ürün açma teklif eder."],
    ],
    how: [
      "Modu seçin (sayım / giriş / çıkış).",
      "Tarayın — ekranda sayım listesi anlık güncellenir.",
      "Bitti → ‘Sayım Oluştur’ ile resmi belgeye dönüşür.",
    ],
    tips: ["Telefonun arka kamerasını da barkod tarayıcı olarak kullanabilirsiniz."],
  },
  {
    file: "24-barcodes.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Etiket Merkezi’",
    title: "Etiket Merkezi",
    lead: "Raf etiketi, fiyat etiketi, ürün barkodu basma.",
    what: [
      ["Şablonlar:", "Termal yazıcı, A4 sticker, raf etiketi şablonları hazır."],
      ["Toplu basım:", "Bir kategori veya seçili ürünler için tek hamle yüzlerce etiket."],
    ],
    how: [
      "Ürünleri seçin → şablon seçin → ‘Yazdır’.",
      "Fiyat değiştiğinde sistem hangi etiketlerin güncellenmesi gerektiğini gösterir.",
    ],
    tips: ["Yeni ürün açtığınızda barkodu otomatik üretilir; manuel girmek zorunda değilsiniz."],
  },
  {
    file: "25-purchases.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Alış Faturaları’",
    title: "Alış Faturaları",
    lead: "Tedarikçilerden gelen alış faturalarını sisteme alın.",
    what: [
      ["Otomatik etki:", "Alış faturası girince stok yükselir, tedarikçi borcunuz oluşur."],
      ["E-fatura entegrasyonu:", "GİB üzerinden gelen e-faturalar otomatik düşer; tek tıkla onaylanır."],
    ],
    how: [
      "‘Yeni Alış’ → tedarikçi seç, fatura no, tarih, ürün satırlarını gir.",
      "Vade ve ödeme planını tanımlayın — finans modülü otomatik nakit akışı gösterir.",
    ],
    tips: ["Mali müşaviriniz aynı listeyi kendi rolünden inceleyebilir."],
  },
  {
    file: "26-suppliers.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Tedarikçiler’",
    title: "Tedarikçiler",
    lead: "Mal / hizmet aldığınız firmaların kart defteri.",
    what: [
      ["Profil:", "İletişim, vergi, bakiye, ortalama vade, performans."],
      ["Geçmiş:", "Tüm alış faturaları, ödemeler, mutabakat."],
    ],
    how: [
      "‘Yeni Tedarikçi’ → vergi no’dan otomatik bilgi çekme.",
      "Profilinde ‘Ödeme Yap’ butonu ile borcu kapatın.",
    ],
    tips: ["Aynı kart hem müşteri hem tedarikçi rolünde kullanılabilir."],
  },
  {
    file: "27-ice-aktarim.png",
    crumb: "Sol menü → ‘Ürün & Stok’ → ‘Veri İçe Aktarımı’",
    title: "Veri İçe Aktarımı",
    lead: "Eski sistemden / Excel’den toplu veri (ürün, müşteri, stok, fatura) yükleme.",
    what: [
      ["Şablonlar:", "Sistem Excel şablonunu indirir; doldurup geri yüklersiniz."],
      ["Doğrulama:", "Hatalı satırlar renkli olarak işaretlenir; düzeltip yeniden yüklersiniz."],
    ],
    how: [
      "Şablonu indirin → doldurun → ‘Yükle’ butonuna basın.",
      "Önizleme ekranında onayladıktan sonra veriler sisteme işlenir.",
    ],
    tips: ["Geçiş esnasında eski yazılımdan iki firmamız da burada hızlıca taşındı."],
  },

  // FİNANS ─────────────────────────
  {
    file: "30-finance.png",
    crumb: "Sol menü → ‘Finans’ → ‘Kasa / Finans’",
    title: "Kasa / Finans",
    lead: "Günlük nakit hareketleri, gider girişi ve kasa bakiyeleri.",
    what: [
      ["Kasalar:", "TL, USD, EUR ayrı kasalar; günlük açılış/kapanış."],
      ["Hareketler:", "Tahsilat, ödeme, gider, masraf, kasaya para alma/koyma."],
    ],
    how: [
      "‘Yeni Hareket’ → tipi seçin (gelir/gider), kasa, tutar ve açıklama girin.",
      "Fişin fotoğrafını ekleyin — denetimde kanıt olur.",
    ],
    tips: ["Ay sonu kasa kapanışı: sistem teorik bakiye ile fiziki saymanın farkını gösterir."],
  },
  {
    file: "31-banking.png",
    crumb: "Sol menü → ‘Finans’ → ‘Bankacılık’",
    title: "Bankacılık",
    lead: "Tüm banka hesapları (TL/döviz/POS) tek panelde.",
    what: [
      ["Hesap kartı:", "Bakiye, son 30 gün hareket, mutabakat durumu."],
      ["Transfer:", "Hesaplar arası havale tek tıkla."],
    ],
    how: [
      "‘Yeni Hesap’ ile banka hesabı tanımlayın (IBAN, döviz, POS).",
      "Hareket girin veya bankadan ekstre yükleyin.",
      "Mutabakat ekranında banka ekstresiyle kayıt arasındaki farkları görün.",
    ],
    tips: ["Banka açık API entegrasyonları yol haritasında — manuel giriş ortadan kalkacak."],
  },
  {
    file: "32-finance-dashboard.png",
    crumb: "Sol menü → ‘Finans’ → ‘Finans Paneli’",
    title: "Finans Paneli",
    lead: "Yöneticinin tek bakışta finansal durumu gördüğü konsol.",
    what: [
      ["KPI’lar:", "Aylık ciro, brüt kâr, net kâr, alacak yaşı, borç yaşı."],
      ["Trend:", "12 aylık satış / kâr / nakit grafiği."],
      ["Uyarılar:", "Vade gelmiş alacak, kritik nakit, beklenen ödeme."],
    ],
    how: [
      "Dönem seçici ile karşılaştırma yapın (bu ay vs geçen ay).",
      "Bir KPI kartına tıklayın → detay raporu açılır.",
    ],
    tips: ["Bu ekran genelde yönetici / ortak rolüne özel açılır."],
  },
  {
    file: "33-profit.png",
    crumb: "Sol menü → ‘Finans’ → ‘Net Kâr’",
    title: "Net Kâr",
    lead: "Klasik kâr-zarar tablosu: gelir – maliyet – gider = net kâr.",
    what: [
      ["Dönem bazlı:", "Aylık, üç aylık, yıllık karşılaştırma."],
      ["Detaylar:", "Tıklanan satır kalem dökümünü açar."],
    ],
    how: [
      "Dönem seçin → tabloyu görün.",
      "Excel’e veya PDF’e dışa aktarın — mali müşavire yollayın.",
    ],
    tips: ["‘Net Kâr’ klasik raporken ‘Gerçek Kâr’ kanal/ürün bazında daha detaylıdır."],
  },
  {
    file: "34-gercek-kar.png",
    crumb: "Sol menü → ‘Finans’ → ‘Gerçek Kâr’",
    title: "Gerçek Kâr",
    lead: "Sistemin yıldız ekranı: pazaryeri komisyonu, kargo, iade, sermaye dahil ürün/kanal bazında gerçek kâr.",
    what: [
      ["Gerçek hesap:", "Her satıştan; komisyon + kargo + iade + KDV otomatik düşülür."],
      ["Negatif uyarı:", "Ürün veya kanal zarar ediyorsa kırmızıyla işaretlenir."],
    ],
    how: [
      "Bir kanal kartına tıklayın → o kanaldaki ürün bazlı kârlılığa inin.",
      "Sıralama ‘En çok kazandıran’ / ‘En çok kaybettiren’ olarak değiştirilebilir.",
    ],
    tips: ["KOBİ’nin Ticarium365’i bırakamamasının asıl sebebi bu ekran."],
  },
  {
    file: "35-butce.png",
    crumb: "Sol menü → ‘Finans’ → ‘Bütçe’",
    title: "Bütçe",
    lead: "Yıllık / aylık bütçe planlama ve gerçekleşme karşılaştırma.",
    what: [
      ["Plan:", "Gelir kalemleri, gider kalemleri, hedef kâr."],
      ["Gerçekleşme:", "Sistem otomatik karşılaştırır; sapma renkli görünür."],
    ],
    how: [
      "‘Yeni Bütçe’ → dönem ve kalemleri girin.",
      "Aylık ‘Bütçe vs Gerçek’ raporundan sapmaları takip edin.",
    ],
    tips: ["Sapmanın belli yüzdeyi aşması durumunda otomatik e-posta uyarısı kurabilirsiniz."],
  },
  {
    file: "36-muhasebeci.png",
    crumb: "Sol menü → ‘Finans’ → ‘Mali Müşavir’",
    title: "Mali Müşavir Portalı",
    lead: "Mali müşavirinizin sisteme kendi rolüyle girip dönemsel kontrol yaptığı sade ekran.",
    what: [
      ["Sınırlı yetki:", "Yalnızca okur / dışa aktarır; veri değiştirmez."],
      ["Dönem indirme:", "Aylık fatura, gider, banka ekstresi tek tıkla ZIP."],
    ],
    how: [
      "‘Yeni Müşavir Davet Et’ ile e-posta gönderin → kendi şifresini oluşturup girer.",
      "Dönem seçip ‘Hepsini İndir’ butonuyla muhasebe paketini alır.",
    ],
    tips: ["Müşaviriniz sayesinde ay sonları artık dosya gönderme telefonu kalkıyor."],
  },
  {
    file: "37-einvoice.png",
    crumb: "Sol menü → ‘Finans’ → ‘e-Fatura’",
    title: "e-Fatura / e-Arşiv",
    lead: "Tüm kesilen faturaların durumlu listesi.",
    what: [
      ["Durumlar:", "Hazırlanıyor → Gönderildi → GİB Onayı → İptal / İade."],
      ["Tipi:", "e-Fatura (mükellef arası), e-Arşiv (son kullanıcıya)."],
    ],
    how: [
      "Filtre ile bir dönemi seçin.",
      "Faturaya tıklayın → PDF indir, e-posta gönder, iptal et.",
      "Yeni satışta sistem otomatik kuralı belirler (mükellef ise e-Fatura, değilse e-Arşiv).",
    ],
    tips: ["GİB ile entegrasyon onayı tek seferdir; ondan sonra tüm faturalar otomatik akar."],
  },
  {
    file: "38-documents.png",
    crumb: "Sol menü → ‘Finans’ → ‘Evrak’",
    title: "Evrak (Belge Yönetimi)",
    lead: "Sözleşme, fatura görseli, fiş, çek/senet PDF gibi tüm evrakın merkezi arşivi.",
    what: [
      ["Klasörler:", "Müşteri, tedarikçi, dönem, etiket bazlı klasörleme."],
      ["Bağlama:", "Bir evrakı bir faturaya / müşteriye bağlayın — ileride otomatik bulunur."],
    ],
    how: [
      "‘Yükle’ → dosyayı sürükleyip bırakın.",
      "Etiket ve kategori atayın; aramada anında çıkar.",
    ],
    tips: ["Mali denetim/inceleme zamanı tüm evrak burada hazır — kâğıt aramak tarihte kalır."],
  },
  {
    file: "39-doviz.png",
    crumb: "Sol menü → ‘Finans’ → ‘Çoklu Para’",
    title: "Çoklu Para Birimi",
    lead: "TL dışında USD / EUR / GBP işlemler için kur takibi ve çoklu para muhasebesi.",
    what: [
      ["Otomatik kur:", "TCMB efektif satış kuru günlük çekilir."],
      ["Kur farkı:", "Tahsilat / ödeme anında kur farkı otomatik kayda alınır."],
    ],
    how: [
      "Yeni para birimi tanımlayın (varsayılan: TRY, USD, EUR).",
      "Kur kaynağını seçin (TCMB, manuel).",
    ],
    tips: ["İhracat / ithalat yapan firmalar için ay sonu kur değerleme raporu otomatik çıkar."],
  },

  // ONLINE SATIŞ ─────────────────────────
  {
    file: "40-marketplace.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Pazaryeri’",
    title: "Pazaryeri",
    lead: "Bağlı tüm pazaryerlerinin (Trendyol vb.) ürün, sipariş ve stok yönetimi.",
    what: [
      ["Ürün eşleştirme:", "Sizdeki ürün karşılığında pazaryerindeki listing’i eşleştirir."],
      ["Stok / fiyat sync:", "Stok düşerse tüm kanallarda anında düşer; çift satış yok."],
      ["Sipariş havuzu:", "Tüm pazaryerlerinin siparişi aynı havuza düşer."],
    ],
    how: [
      "‘Kanal Bağla’ → pazaryeri API anahtarını tek seferlik girin.",
      "Ürünleri toplu yayına alın → ‘Yayında’ kolonunda görünür.",
      "Siparişleri tek listeden işleyin: hazırla → kargo etiketi bas → kargoya ver.",
    ],
    tips: ["Komisyon ve kargo Gerçek Kâr ekranından otomatik düşülür — gerçek kazancınızı görürsünüz."],
  },
  {
    file: "41-channels.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Satış Kanalları’",
    title: "Satış Kanalları",
    lead: "Bağlı tüm satış kanallarının (mağaza, online, pazaryeri, B2B) konsolide listesi.",
    what: [
      ["Durumlar:", "Aktif, askıda, bağlantı hatası."],
      ["Toplu işlem:", "Bir ürünü tek formda birden çok kanalda yayına al."],
    ],
    how: [
      "Bir kanala tıklayın → ayrı yönetim ekranı açılır.",
      "‘Toplu’ butonu ile çoklu kanal işlemi yapın.",
    ],
    tips: ["Kanal hatası varsa sistem ana panelden uyarı gösterir."],
  },
  {
    file: "42-magaza.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Hazır Mağaza’",
    title: "Hazır Mağaza",
    lead: "Kendi alan adınız altında kullanıma hazır B2C / B2B vitrini.",
    what: [
      ["Tema:", "Hazır profesyonel temalar; logo + renk düzenle yeter."],
      ["Otomatik içerik:", "Ürün katalogu, stok, fiyat, kampanya — sistemden otomatik."],
    ],
    how: [
      "‘Mağazayı Aç’ → alan adı / logo / renk seçimi.",
      "Yayına al → site canlıya çıkar; tüm değişiklikler eş zamanlı yansır.",
    ],
    tips: ["Ödeme entegrasyonu (sanal POS) ‘Entegrasyonlar’ sayfasından bağlanır."],
  },
  {
    file: "43-b2b-vitrin.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘B2B Vitrin’",
    title: "B2B Vitrin",
    lead: "Bayi/dağıtıcı müşterilerinizin kendi şifresiyle girip sipariş geçtiği özel portal.",
    what: [
      ["Özel fiyat:", "Her bayiye farklı fiyat listesi atayabilirsiniz."],
      ["Limit kontrol:", "Cari limiti dolan bayiye sipariş engeli."],
    ],
    how: [
      "Bayi davet et → bayi girişi yapar → kendi katalogunu görür.",
      "Bayi sipariş geçer → sizin ‘Siparişler’ ekranınıza otomatik düşer.",
    ],
    tips: ["Klasik telefon / WhatsApp sipariş alımı tarihte kalır."],
  },
  {
    file: "44-network.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘B2B Ağı’",
    title: "B2B Ağı",
    lead: "Ticarium365 üzerinde diğer firmaları keşfedin, B2B alıcı/satıcı ağı kurun.",
    what: [
      ["Profil:", "Şirketinizin halka açık profili (ürün, hizmet, sertifika)."],
      ["Mesajlaşma:", "Diğer firmalarla doğrudan teklif/sipariş iletişimi."],
    ],
    how: [
      "Profilinizi tamamlayın → arama sonuçlarında çıkın.",
      "Bir firmayı ‘Tedarikçim Olarak Ekle’ → siparişler doğrudan akar.",
    ],
    tips: ["Bu modül büyüyen ağ etkisinin (network effect) kalbidir."],
  },
  {
    file: "45-aggregator.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Ticarium Pazar’",
    title: "Ticarium Pazar (Aggregator)",
    lead: "Tüm Ticarium365 firmalarının ürünlerinin sergilendiği ortak pazar.",
    what: [
      ["Geniş kitle:", "Sisteme dahil tüm firmaların müşterilerine ulaşırsınız."],
      ["Tek panel:", "Siparişler kendi sisteminize otomatik düşer."],
    ],
    how: [
      "‘Pazara Ürün Ekle’ → ürünleri seçin, fiyat ve kampanya tanımlayın.",
      "Sipariş geldiğinde normal pazaryeri akışıyla işleyin.",
    ],
    tips: ["Komisyon yapısı Trendyol vb’den belirgin avantajlıdır — Gerçek Kâr ekranında karşılaştırın."],
  },
  {
    file: "46-fiyat-motoru.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Fiyat Motoru’",
    title: "Fiyat Motoru",
    lead: "Pazaryerlerinde rakip fiyat takip + otomatik fiyat optimizasyonu.",
    what: [
      ["Rakip izleme:", "Aynı ürün için rakiplerin pazaryerindeki fiyatı."],
      ["Kural bazlı:", "Min/max sınır içinde otomatik aşağı/yukarı yönlendirme."],
    ],
    how: [
      "Ürün için min satış fiyatı (alt limit) ve hedef margin tanımlayın.",
      "Otomatik mod açıkken sistem rakibe göre fiyatı optimize eder.",
    ],
    tips: ["Karlılığa zarar vermeyecek alt limit zorunlu — sistem alt limitin altına düşmez."],
  },
  {
    file: "47-karlilik-kanal.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Kanal Karlılığı’",
    title: "Kanal Karlılığı",
    lead: "Hangi kanal en çok kazandırıyor, hangi kanal aslında zarar?",
    what: [
      ["Kanal sıralama:", "Trendyol vb / Mağaza / Online / B2B karşılaştırma."],
      ["Komisyon dahil:", "Komisyon, kargo, iade, sermaye bağlama gibi maliyetler dahil."],
    ],
    how: [
      "Dönem seçin → kanal performans tablosunu görün.",
      "Bir kanala tıklayın → o kanaldaki en kazandıran/kaybettiren ürünleri görün.",
    ],
    tips: ["Sistem ‘bu kanaldan çekilseniz X TL kâra geçersiniz’ uyarısı verebilir."],
  },
  {
    file: "48-kargo.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Kargo’",
    title: "Kargo",
    lead: "Kargo firmaları entegrasyonu, etiket basma ve takip.",
    what: [
      ["Firmalar:", "MNG, Yurtiçi, Aras, Sürat, PTT vb."],
      ["Toplu etiket:", "Onlarca siparişe tek formda etiket."],
    ],
    how: [
      "Kargo firmasını ‘Entegrasyonlar’dan bağlayın.",
      "Sipariş hazır → ‘Etiket Bas’ → kargo barkodu PDF olarak gelir.",
      "Müşteri takip linkini otomatik mail/SMS ile alır.",
    ],
    tips: ["Sözleşmeli kargo ile özel indirimi tek tıkla sisteme tanımlayabilirsiniz."],
  },
  {
    file: "49-reklam-butce.png",
    crumb: "Sol menü → ‘Online Satış’ → ‘Reklam Bütçesi’",
    title: "Reklam Bütçesi",
    lead: "Pazaryeri / Google / Meta reklam harcamalarını ürün-kâr seviyesinde takip.",
    what: [
      ["Bütçe:", "Kanal başına aylık üst sınır."],
      ["ROAS:", "Her reklam için satış karşılığı / harcama (Return on Ad Spend)."],
    ],
    how: [
      "Bütçe tanımlayın → kampanya açın → harcama otomatik düşülür.",
      "Sistem Gerçek Kâr ekranında reklam maliyetini de düşer; gerçek net kâr kalır.",
    ],
    tips: ["ROAS düşen reklamı sistem önerir, durdurabilirsiniz."],
  },

  // RAPORLAR ─────────────────────────
  {
    file: "50-reports.png",
    crumb: "Sol menü → ‘Raporlar’ → ‘Genel Raporlar’",
    title: "Genel Raporlar",
    lead: "Standart finansal ve operasyonel raporlar.",
    what: [
      ["Şablonlar:", "Satış, kâr-zarar, müşteri ABC, ürün ABC, dönem karşılaştırma."],
      ["Çıktı:", "PDF, Excel, doğrudan e-posta gönderim."],
    ],
    how: [
      "Şablon seçin → dönem seçin → ‘Oluştur’.",
      "Raporu kaydedin / gönderin / programlı tekrar tanımlayın.",
    ],
    tips: ["Aylık otomatik gönderim ile her ayın 1’inde mali müşavire / yöneticiye gider."],
  },
  {
    file: "51-daily-summary.png",
    crumb: "Sol menü → ‘Raporlar’ → ‘Günlük Kapanış’",
    title: "Günlük Kapanış",
    lead: "Mağaza akşam kapanışında alınan günlük özet rapor.",
    what: [
      ["İçerik:", "Bugünkü satış (kanal başına), tahsilat, iade, kasa farkı."],
      ["Personel:", "Kim ne kadar sattı detayı."],
    ],
    how: [
      "Gün sonunda ‘Kapanışı Yap’ butonuna basın.",
      "Sistem PDF olarak kapanış raporunu üretir; otomatik arşive kaydeder.",
    ],
    tips: ["Akşam kapanışta kasada beklenenden farklı para varsa sistem hangi işlemden olduğunu işaretler."],
  },
  {
    file: "52-oneriler.png",
    crumb: "Sol menü → ‘Raporlar’ → ‘Akıllı Öneriler’",
    title: "Akıllı Öneriler",
    lead: "Yapay zekanın verilerinizden çıkardığı eyleme dönük öneriler.",
    what: [
      ["Örnekler:", "‘X ürünü 40 gündür hareketsiz, %20 indirim ile likitleştir.’ ‘Y kanalı zarar ediyor, çekilmeyi düşün.’"],
      ["Zaman kazandırır:", "Manuel rapor okuma yerine direkt eylem."],
    ],
    how: [
      "Listeye bakın → bir öneriye tıklayın → ‘Uygula’ ile direkt aksiyon alın.",
      "Onaylamadığınız öneriyi ‘Yoksay’ ile geçin; sistem öğrenir.",
    ],
    tips: ["Bu modül sürekli zenginleşiyor — yeni öneri tipleri sürüm sürüm geliyor."],
  },

  // YÖNETİM ─────────────────────────
  {
    file: "60-personnel.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Personel’",
    title: "Personel",
    lead: "Personel kayıtları, vardiya, prim, maliyet bilgileri.",
    what: [
      ["Kart:", "Kişisel bilgi, görev, maaş, prim oranı, izin günleri."],
      ["Performans:", "Personel başına satış / işlem performansı."],
    ],
    how: [
      "‘Yeni Personel’ → bilgileri girin, role atayın.",
      "POS satış ekranında personel kim olduğu otomatik kaydedilir.",
    ],
    tips: ["Maaş/prim hesaplaması Finans modülüyle entegre çalışır."],
  },
  {
    file: "61-branches.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Şubeler’",
    title: "Şubeler",
    lead: "Birden çok mağaza / depo / ofis için şube tanımı ve kontrolü.",
    what: [
      ["Stok:", "Şube başına ayrı stok bakiyesi."],
      ["Kullanıcı:", "Personel sadece kendi şubesini görsün diye yetkilendirme."],
    ],
    how: [
      "‘Yeni Şube’ → ad, adres, depo bağla, varsayılan kasa.",
      "Personeli şubeye atayın; raporlar şube bazında kırılır.",
    ],
    tips: ["Şubeler arası transfer tek tıkladır; kayıt çift hesaplanmaz."],
  },
  {
    file: "62-uretim.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Üretim & Reçete’",
    title: "Üretim & Reçete",
    lead: "Üretim yapan firmalar için reçete (BOM), iş emri, fire takibi.",
    what: [
      ["Reçete:", "Bir ürün için hangi hammaddeden ne kadar gerekli."],
      ["İş emri:", "Üretim siparişi → hammadde otomatik düşer, ürün otomatik girer."],
    ],
    how: [
      "Reçete tanımlayın → ‘Üret’ butonuyla iş emri açın.",
      "Üretim bittiğinde stok hareketi otomatik kaydedilir.",
    ],
    tips: ["Fire ve atık otomatik maliyet hesaplamasında dikkate alınır."],
  },
  {
    file: "63-users.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Kullanıcılar’ (yalnızca admin)",
    title: "Kullanıcılar",
    lead: "Sisteme giren tüm kullanıcı hesapları ve rol/yetki kontrolü.",
    what: [
      ["Roller:", "admin, staff, viewer; özelleştirilebilir izin matrisi."],
      ["Aktif/Pasif:", "Bir kullanıcıyı dondurmak veya silmeden askıya almak."],
    ],
    how: [
      "‘Yeni Kullanıcı’ → e-posta, rol, başlangıç şifresi.",
      "Kullanıcıya tıklayın → tek modüller bazında detaylı izin verin.",
    ],
    tips: ["Şifre sıfırlama linki kullanıcıya otomatik gönderilir."],
  },
  {
    file: "64-settings.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Genel Ayarlar’",
    title: "Genel Ayarlar",
    lead: "Firma logosu, vergi bilgileri, fatura şablonu, varsayılan KDV oranı, e-posta görünümü.",
    what: [
      ["Marka:", "Logo, ana renk, çıktı şablonu."],
      ["Operasyon:", "KDV oranları, para birimi, dil, tarih formatı."],
    ],
    how: [
      "Sekmeyi seçin → değişikliği yapın → ‘Kaydet’.",
      "Logo yüklediğinizde tüm fatura/PDF çıktıları otomatik güncellenir.",
    ],
    tips: ["Mali müşavirinizin görmesi gereken alanları ‘Müşavir’ rolüne özel açabilirsiniz."],
  },
  {
    file: "65-integrations.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Entegrasyonlar’",
    title: "Entegrasyonlar",
    lead: "Pazaryeri, kargo, e-fatura, sanal POS, e-posta, SMS sağlayıcıları.",
    what: [
      ["Sağlayıcılar:", "Trendyol vb pazaryerleri, MNG/Yurtiçi/Aras vb kargo, GİB e-fatura, sanal POS bankaları."],
      ["Durum:", "Bağlı / hata / askıda göstergesi."],
    ],
    how: [
      "Sağlayıcıyı seçin → API anahtarı / kullanıcı adı / şifre girin.",
      "‘Test Et’ → bağlantıyı doğrulayın → ‘Kaydet’.",
    ],
    tips: ["API key’ler şifrelenmiş şekilde saklanır, ekranda asla açık görünmez."],
  },
  {
    file: "66-notifications.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Bildirim Ayarları’",
    title: "Bildirim Ayarları",
    lead: "Hangi olayda kim, nasıl uyarılsın?",
    what: [
      ["Kanallar:", "E-posta, SMS, Web Push, Telegram, Slack."],
      ["Olaylar:", "Kritik stok, vade gelmiş tahsilat, yüksek tutarlı satış, başarısız entegrasyon."],
    ],
    how: [
      "Olayı seçin → kanalı seçin → kimler alsın işaretleyin.",
      "Frekansı ayarlayın (anlık / günlük özet / haftalık özet).",
    ],
    tips: ["Aşırı bildirim yorgunluğunu önlemek için ‘sessiz saatler’ tanımlanabilir."],
  },
  {
    file: "67-subscription.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Abonelik’",
    title: "Abonelik",
    lead: "Mevcut paket, ödeme yöntemi, fatura geçmişi.",
    what: [
      ["Mevcut paket:", "Aylık / yıllık tutar, kullanıcı sayısı, dahil modüller."],
      ["Yükseltme/düşürme:", "Tek tıkla pakete geçiş; fark prorate edilir."],
    ],
    how: [
      "‘Paketi Yükselt/Değiştir’ → yeni paketi seçin → ödeme.",
      "Geçmiş faturalarınızı PDF olarak indirebilirsiniz.",
    ],
    tips: ["Ödeme bilgisi otomatik yenileme için kart üzerinde tutulur (PCI uyumlu)."],
  },
  {
    file: "68-pricing.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Paketler & Fiyatlar’",
    title: "Paketler & Fiyatlar",
    lead: "Tüm Ticarium365 paketlerini, içerdiği özellikleri ve fiyatlarını kıyaslama.",
    what: [
      ["Paketler:", "Başlangıç, Standart, Profesyonel, Kurumsal."],
      ["Özellik tablosu:", "Hangi paket hangi modülü kapsıyor."],
    ],
    how: [
      "Paket kartına tıklayın → ‘Bu pakete geç’ akışı açılır.",
      "Yıllık ödemede %X indirim otomatik uygulanır.",
    ],
    tips: ["Bir özellik gerekiyorsa ‘Bu özellik şu paketlerde var’ diyerek doğru pakete yönlendirir."],
  },
  {
    file: "69-finance-documents.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘Belge Merkezi’",
    title: "Belge Merkezi",
    lead: "Faturalarınızın, ödeme dekontlarınızın ve sözleşmelerinizin merkezi arşivi.",
    what: [
      ["Bağlantılar:", "Her belge ilgili müşteri / fatura / hareketle bağlı."],
      ["Arama:", "Tarih, etiket, anahtar kelime."],
    ],
    how: [
      "‘Yükle’ → dosyayı sürükleyin, etiketleyin.",
      "Belgenin ayrıntısında ‘Bağla’ ile bir hareket / cari ile ilişkilendirin.",
    ],
    tips: ["Mali denetim sırasında tüm belge buradan çıkar."],
  },
  {
    file: "70-b2b-catalog.png",
    crumb: "Sol menü → ‘Yönetim’ → ‘B2B Katalogum’",
    title: "B2B Katalogum",
    lead: "B2B Vitrin’de bayilere gösterilecek özel katalog: hangi ürünler, hangi fiyatla, kim için.",
    what: [
      ["Bayi grubu:", "Bayileri segmentlere ayırın (A grup, B grup vs)."],
      ["Fiyat listesi:", "Her segmente farklı fiyat / ödeme koşulu."],
    ],
    how: [
      "Yeni katalog oluşturun → ürünleri seçin → fiyat listesi atayın.",
      "Bayiyi katalog ile eşleştirin.",
    ],
    tips: ["Bayinin kendi vitrini sadece kendi katalogunu görür — gizlilik korunur."],
  },
];

// İçindekiler sayfası (özet liste)
function tocPage() {
  const items = [];
  PAGES.forEach((p, i) => {
    items.push(new Paragraph({
      spacing: { after: 30 },
      children: [
        T(`${i + 1}. `, { bold: true, color: PRIMARY }),
        T(p.title, { bold: true }),
        T(`  —  ${p.crumb}`, { color: MUTED }),
      ],
    }));
  });
  return [
    new Paragraph({
      spacing: { before: 200, after: 120 },
      border: { bottom: { color: PRIMARY, space: 4, style: BorderStyle.SINGLE, size: 12 } },
      children: [T("İçindekiler — Tüm Sayfalar", { size: 36, bold: true, color: NAVY })],
    }),
    Lead("Aşağıdaki sırayla tüm sayfaları gezeceğiz. Her sayfada: nereden açılır, ne işe yarar, nasıl kullanılır."),
    ...items,
  ];
}

// Bir sayfa bloğu üret
function pageBlock(p, idx, total) {
  const items = [
    ...Title(idx + 1, total, p.title),
    Crumb(p.crumb),
    Lead(p.lead),
    imageOf(p.file),
    Caption(`${p.title} — ekran görüntüsü (sol menüde aktif öğe mavi çerçeveyle işaretli).`),
    SectionH("Bu sayfada ne var?"),
    ...p.what.map(([lbl, txt]) => Bullet(txt, lbl)),
    SectionH("Nasıl kullanılır?"),
    ...p.how.map((h) => Action(h)),
  ];
  if (p.tips && p.tips.length) {
    items.push(SectionH("İpuçları"));
    p.tips.forEach((t) => items.push(Tip(t)));
  }
  return items;
}

// ────────── Doc oluştur ──────────
const total = PAGES.length;
const sections = [];
sections.push({ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: COVER });
sections.push({ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: tocPage() });
PAGES.forEach((p, i) => {
  sections.push({
    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
    children: pageBlock(p, i, total),
  });
});

const doc = new Document({
  creator: "Ticarium365",
  title: "Ticarium365 — Uçtan Uca Kullanım Kılavuzu",
  description: "Tüm sayfalar için menü yolu, ne işe yarar, nasıl kullanılır",
  sections,
});

const out = path.resolve("outputs/Ticarium365-Tum-Sayfalar-Kullanim-Kilavuzu.docx");
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(out, buf);
console.log("OK:", out);
console.log("Boyut:", (buf.length / 1024 / 1024).toFixed(2), "MB");
console.log("Toplam sayfa:", PAGES.length);
