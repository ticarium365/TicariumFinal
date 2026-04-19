import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  PageBreak, ImageRun, ShadingType, Table, TableRow, TableCell,
  WidthType, BorderStyle,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const FONT = "Calibri";
const NAVY = "0F172A";
const PRIMARY = "1E40AF";
const ACCENT = "0EA5A4";
const MUTED = "64748B";

const SHOTS = path.resolve("outputs/screenshots");

// Sayfa başlığı
const PageTitle = (n, total, txt) => [
  new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [new TextRun({
      text: `Adım ${n} / ${total}`,
      font: FONT, size: 18, color: PRIMARY, bold: true,
    })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { color: PRIMARY, space: 4, style: BorderStyle.SINGLE, size: 12 } },
    children: [new TextRun({
      text: txt, font: FONT, size: 40, bold: true, color: NAVY,
    })],
  }),
];

const Lead = (txt) => new Paragraph({
  spacing: { before: 80, after: 200 },
  children: [new TextRun({
    text: txt, font: FONT, size: 24, color: NAVY, italics: true,
  })],
});

const Body = (txt) => new Paragraph({
  spacing: { after: 100, line: 300 },
  children: [new TextRun({ text: txt, font: FONT, size: 22, color: NAVY })],
});

const Bullet = (txt, label) => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 80 },
  children: [
    label ? new TextRun({ text: label + " ", font: FONT, size: 22, bold: true, color: PRIMARY }) : null,
    new TextRun({ text: txt, font: FONT, size: 22, color: NAVY }),
  ].filter(Boolean),
});

const Tip = (txt) => new Paragraph({
  spacing: { before: 120, after: 200 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "FEF3C7" },
  children: [new TextRun({
    text: "İpucu: " + txt,
    font: FONT, size: 22, color: "78350F", italics: true,
  })],
});

const Action = (txt) => new Paragraph({
  spacing: { before: 120, after: 100 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "DBEAFE" },
  children: [new TextRun({
    text: "→ " + txt,
    font: FONT, size: 22, color: "1E3A8A", bold: true,
  })],
});

function imageOf(file, widthPx = 620) {
  const buf = fs.readFileSync(path.join(SHOTS, file));
  const heightPx = Math.round(widthPx * 900 / 1440);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 200 },
    children: [new ImageRun({
      data: buf,
      transformation: { width: widthPx, height: heightPx },
      type: "png",
    })],
  });
}

const Caption = (txt) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({
    text: txt, font: FONT, size: 18, italics: true, color: MUTED,
  })],
});

// ──────────── İÇERİK ────────────

const TOTAL = 12;
const pages = [];

// KAPAK
pages.push([
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1600, after: 200 },
    children: [new TextRun({ text: "Ticarium365", font: FONT, size: 84, bold: true, color: PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({
      text: "Müşterimiz Sistemi Nasıl Kullanır?",
      font: FONT, size: 36, color: NAVY, bold: true,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({
      text: "Uçtan uca, ekran ekran, sade dille bir tur",
      font: FONT, size: 24, color: MUTED, italics: true,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200 },
    children: [new TextRun({
      text: "12 Adım · " + new Date().toLocaleDateString("tr-TR"),
      font: FONT, size: 20, color: MUTED,
    })],
  }),
]);

// TURUN HARİTASI
pages.push([
  new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { color: PRIMARY, space: 4, style: BorderStyle.SINGLE, size: 12 } },
    children: [new TextRun({ text: "Turun Haritası", font: FONT, size: 40, bold: true, color: NAVY })],
  }),
  Lead("Aşağıdaki 12 adım, KOBİ sahibinin Ticarium365 ile geçirdiği tipik bir günün uçtan uca akışıdır. Her adım ayrı bir sayfa: önce ne yapmak istediğini, sonra hangi ekranı göreceğini, son olarak ne yapacağını anlatıyoruz."),

  Body("Bölüm A — Sisteme Giriş"),
  Bullet("Sistemine güvenli giriş.", "Adım 1 — Giriş Ekranı:"),
  Bullet("İşletmesinin günlük özetiyle karşılaşır.", "Adım 2 — Ana Pano:"),

  Body("Bölüm B — Sistemi Kurmak"),
  Bullet("Kataloğunu sisteme tanımlar.", "Adım 3 — Ürünler:"),
  Bullet("Depodaki gerçek miktarları görür ve düzenler.", "Adım 4 — Stok:"),
  Bullet("Müşterilerini ve cari hesaplarını yönetir.", "Adım 5 — Müşteriler:"),

  Body("Bölüm C — Günlük Operasyon"),
  Bullet("Mağazada barkodla satış yapar.", "Adım 6 — Hızlı Satış (POS):"),
  Bullet("Kestiği tüm faturaları tek listeden görür.", "Adım 7 — E-Fatura:"),
  Bullet("Aylık giderlerini girer ve sınıflandırır.", "Adım 8 — Giderler:"),
  Bullet("Banka hareketlerini takip eder.", "Adım 9 — Banka:"),

  Body("Bölüm D — Karar Verme"),
  Bullet("İşletmesinin gerçek net kârını ilk kez net görür.", "Adım 10 — Gerçek Kâr:"),
  Bullet("Pazaryerlerini tek panelden yönetir.", "Adım 11 — Pazaryeri:"),
  Bullet("Yöneticiye uygun özet raporları indirir.", "Adım 12 — Raporlar:"),
]);

// ── ADIM 1 — LOGIN
pages.push([
  ...PageTitle(1, TOTAL, "Giriş Ekranı"),
  Lead("İşletme sahibi sabah masaya oturur, tarayıcısından kendi alan adına girer (örn. firmaadi.ticarium365.com)."),
  imageOf("01-login.png"),
  Caption("Karşılama ekranı: tek bir kullanıcı adı + şifre, başka hiçbir şey."),
  Action("Kullanıcı adınızı ve şifrenizi yazın, ‘Giriş Yap’ butonuna basın."),
  Tip("Şifresini unuttuğunda, hemen alttaki ‘Şifremi unuttum’ bağlantısı bir e-posta ile sıfırlama akışını başlatır. Hiçbir şekilde teknik destek beklemesi gerekmez."),
  Body("Her firma kendi alan adında çalışır. Verileri başka bir firmanın çalışanı asla görmez. Bu yapı sistemin günden 1 mimarisinde gelir."),
]);

// ── ADIM 2 — DASHBOARD
pages.push([
  ...PageTitle(2, TOTAL, "Ana Pano (Dashboard)"),
  Lead("Giriş yapar yapmaz işletme sahibi günü tek bakışta görür: bugün ne sattım, ne kadar tahsilat var, hangi stoklar tükeniyor?"),
  imageOf("02-dashboard.png"),
  Caption("Ana pano — günün özet kartları, hızlı işlem alanı, sol menüde tüm modüller."),
  Body("Solda 30+ modülün düzenli menüsü var. Üstte günü özetleyen kartlar: bugünkü ciro, tahsilat, açık siparişler, stok uyarıları."),
  Action("Sol menüden çalışmak istediği modüle tek tıkla geçer. Veya klavyede Ctrl+K ile arama paletini açıp aradığı sayfayı doğrudan yazar."),
  Tip("Komut Paleti (Ctrl+K) profesyonel kullanıcının sürati için: ‘müşteri ekle’ yazıp Enter — direkt ilgili formu açar."),
]);

// ── ADIM 3 — ÜRÜNLER
pages.push([
  ...PageTitle(3, TOTAL, "Ürünler — Kataloğunu Tanıt"),
  Lead("İşletme sisteme alıştığında ilk yapacağı şey: sattığı ürünleri tanımlamak."),
  imageOf("03-products.png"),
  Caption("Ürünler listesi — arama, filtre, hızlı düzenleme, stok seviyesi tek tabloda."),
  Action("Sağ üstteki ‘Yeni Ürün’ butonuna basar. Açılan formda ad, barkod, satış fiyatı, alış fiyatı, KDV, kategori bilgisi girilir."),
  Body("Aynı ürünün varyantlarını (renk, beden, ölçü) tek kayıt altında yönetebilir. Bir kez tanımlanan ürün; satış, e-fatura, pazaryeri, üretim ve stok modüllerinde aynı kayıt olarak görünür."),
  Tip("Toplu ürün eklemek için Excel’den yapıştırma desteklenir. Yüzlerce kalemi dakikalar içinde sisteme alır."),
]);

// ── ADIM 4 — STOK
pages.push([
  ...PageTitle(4, TOTAL, "Stok — Depoda Ne Var, Ne Kadar?"),
  Lead("Tüm satış ve alışların sonucu burada birikir. İşletme sahibi anlık doğru stoğu burada görür."),
  imageOf("06-stock.png"),
  Caption("Stok ekranı — depo bazında miktar, hareket geçmişi ve kritik seviye uyarıları."),
  Body("Her ürün için anlık stok, geçmiş hareketler ve kritik seviye eşiği takip edilir. Bir ürünün miktarı eşiğin altına düşerse sistem ana panoda uyarır."),
  Action("Sayım yapmak için ‘Stok Sayımı’ butonu; el terminali / barkod ile alanı dolaşır, sayımı kaydeder, fark otomatik düzeltilir."),
  Tip("Çoklu depo: birden fazla şube veya antrepo için ayrı stok takibi yapılır. Şubeler arası transfer tek tıkla."),
]);

// ── ADIM 5 — MÜŞTERİLER
pages.push([
  ...PageTitle(5, TOTAL, "Müşteriler — Cari Hesap Yönetimi"),
  Lead("Bütün satışlar bir kişiye ya da firmaya yapılır. Ticarium365 herkes için ayrı bir cari hesap tutar."),
  imageOf("05-customers.png"),
  Caption("Müşteriler listesi — vergi bilgileri, borç/alacak bakiyesi ve son işlem tarihi tek bakışta."),
  Body("Her müşterinin profilinde: iletişim bilgileri, vergi numarası, borç/alacak ekstresi, geçmiş satışlar, ortalama ödeme süresi gibi davranışsal veriler."),
  Action("‘Yeni Müşteri’ ile hızlı kayıt; vergi numarasından otomatik ünvan/adres çekilir."),
  Tip("Tedarikçiler de aynı mantıkla ayrı bir menüden yönetilir. Bir kişi hem müşteri hem tedarikçi olabilir; sistem tek kişi altında her iki bakiyeyi tutar."),
]);

// ── ADIM 6 — POS
pages.push([
  ...PageTitle(6, TOTAL, "Hızlı Satış (POS) — Mağazada Müşteriye Satış"),
  Lead("Kasanın başındaki personel: müşteri ürünü uzatır, barkodu okutur, ödeme alınır, fiş çıkar."),
  imageOf("04-pos.png"),
  Caption("POS — soldaki ürün arama, ortadaki sepet, sağdaki ödeme paneli. Klavye + barkod tarayıcı uyumlu."),
  Action("Barkodu okutun → ürün otomatik sepete eklenir. Ödeme tipini (nakit, kart, krediyle) seçin → satış kaydedilir."),
  Body("Aynı ekranda kampanya ve sadakat puanı otomatik uygulanır: bir müşterinin kart numarası girildiğinde indirim ya da puan kazanımı eş zamanlı görünür."),
  Tip("İnternet kesilse de yerel modda çalışmaya devam eder. Bağlantı geri geldiğinde tüm satışlar buluta otomatik yazılır."),
]);

// ── ADIM 7 — E-FATURA
pages.push([
  ...PageTitle(7, TOTAL, "E-Fatura / Faturalar"),
  Lead("Müşteriye yapılan her satış, kuralına göre fatura ister. Burada hepsi tek listede."),
  imageOf("07-einvoice.png"),
  Caption("Faturalar — tarihe ve müşteriye göre filtre, durum (onaylı / iptal / bekliyor) ve tek tıkla yeniden gönderim."),
  Body("Sistem, satış olduğu anda otomatik e-arşiv veya e-fatura olarak hazırlar. Mali müşaviriniz isterse aynı paneli kendi kullanıcı hesabıyla görüp dönemsel kontrolünü yapar."),
  Action("Bir faturayı tek tıkla PDF indirir, müşteriye e-posta atar veya yeniden gönderir."),
  Tip("E-fatura entegrasyon onayı GİB ile birlikte yapılır. Sistem tüm zorunlu alanları doğrular; eksik bilgiyle fatura kesilmesini engeller."),
]);

// ── ADIM 8 — GİDERLER
pages.push([
  ...PageTitle(8, TOTAL, "Giderler — Aylık Faturaları Sisteme Al"),
  Lead("Kira, elektrik, internet, danışmanlık... işletmenin her ay yüzleştiği giderler buradan girilir."),
  imageOf("08-finance.png"),
  Caption("Giderler — kategori bazında listeleme, ay/yıl bazlı toplam, hızlı kayıt."),
  Action("‘Yeni Gider’ butonuyla tutar, kategori, tedarikçi ve ödeme yöntemi girilir. İsterse fişin / faturanın fotoğrafı eklenir."),
  Body("Giderler kategori bazında otomatik gruplanır (kira, ulaşım, personel, ofis vb.). Bu sayede ay sonu rapor 1 saniyede çıkar."),
  Tip("Fişin fotoğrafını yüklediğinizde sistem üzerinden otomatik tutar/tarih okuma (OCR) yakında devreye giriyor — manuel veri girişi tamamen ortadan kalkacak."),
]);

// ── ADIM 9 — BANKA
pages.push([
  ...PageTitle(9, TOTAL, "Banka — Para Trafiğini Tek Yerden İzle"),
  Lead("İşletmenin bütün hesapları (TL, USD, POS, çek/senet) burada tek panelde."),
  imageOf("09-banking.png"),
  Caption("Banka — hesaplar, hareketler, hesaplar arası transfer, mutabakat."),
  Body("Her banka hesabı için ayrı bakiye ve hareket geçmişi tutulur. POS tahsilatları otomatik olarak ilgili hesaba düşer; mutabakat ekranı ay sonunda farkı kalemler bazında gösterir."),
  Action("Hesaplar arası transfer butonu ile bir hesaptan diğerine para aktarımı tek tıkla; sistem her iki tarafı da otomatik kaydeder."),
  Tip("Banka açık API entegrasyonları sırada — hesap hareketlerinin manuel girişine bile gerek kalmayacak."),
]);

// ── ADIM 10 — GERÇEK KÂR
pages.push([
  ...PageTitle(10, TOTAL, "Gerçek Kâr — İşletmenin Asıl Sayısı"),
  Lead("İşte sistemin ‘yıldız’ ekranı: ay sonunda işletme sahibi ilk kez gerçek net kârını görür."),
  imageOf("10-gercekkar.png"),
  Caption("Gerçek Kâr — ürün/kanal bazında komisyon, kargo, iade, sermaye dahil net kâr."),
  Body("Pazardaki çoğu yazılım sadece satış cirosu gösterir. Ticarium365 her satış için: pazaryeri komisyonu, kargo bedeli, iade riski, sermaye bağlama günleri ve KDV’yi otomatik düşer. Sonuç: ürün bazında, kanal bazında, müşteri bazında gerçek kâr."),
  Action("Bir ürüne tıklayın → kanal bazında karlılık dağılımını görün. Negatif kalan satışları renkli olarak işaretler — hangi ürünü/kanalı kapatmanız gerektiğini sistem söyler."),
  Tip("Bu ekran, işletme sahibinin Ticarium365’i bırakamadığı tek ekrandır. Çünkü hiçbir başka araçta bu sayı bu netlikle görünmez."),
]);

// ── ADIM 11 — PAZARYERİ
pages.push([
  ...PageTitle(11, TOTAL, "Pazaryeri Yönetimi"),
  Lead("Birden fazla pazaryerinde satıyorsa, hepsini bu tek panelden yönetir."),
  imageOf("11-marketplace.png"),
  Caption("Pazaryeri — bağlı kanallar, eş zamanlı stok ve fiyat senkronizasyonu, sipariş havuzu."),
  Body("Bir kez tanımladığınız ürün, tek tıkla bağladığınız tüm pazaryerlerinde anında yayında. Stok bir yerde düşerse, diğer kanallarda otomatik güncellenir; çift satış riski sıfır."),
  Action("Sağdaki ‘Kanal Bağla’ butonu ile yeni bir pazaryeri eklersiniz; API anahtarınızı tek seferlik girersiniz, bu kadar."),
  Tip("Tüm kanal siparişleri tek havuza düşer; aynı kargo yazılımı ile etiket basılır. Pazaryeri başına ayrı panel açma derdi tarihte kalır."),
]);

// ── ADIM 12 — RAPORLAR
pages.push([
  ...PageTitle(12, TOTAL, "Raporlar — Yöneticiye / Mali Müşavire Çıktı"),
  Lead("Ay sonu, dönem sonu veya bir yatırımcı toplantısı öncesi: tüm rakamlar tek ekranda."),
  imageOf("12-reports.png"),
  Caption("Raporlar — satış, kar, kategori bazlı analiz, müşteri/ürün ABC analizi, dönem karşılaştırma."),
  Body("Mali müşavir kendi kullanıcısı ile aynı veriyi indirir. Yönetim için PDF/Excel çıktıları hazır şablonda. Yatırımcı için ‘Yönetici Özeti’ tek sayfada KPI ile."),
  Action("‘Bu Ayı Geç Aya Karşılaştır’ — tek tıkla iki dönemi yan yana görür; büyüme/azalma kalemleri renkli olarak işaretlenir."),
  Tip("Tüm raporlar otomatik olarak e-posta ile zamanlanabilir: her ayın 1’inde mali müşavirinize, her pazartesi yöneticinize."),
]);

// KAPANIŞ
pages.push([
  new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { color: PRIMARY, space: 4, style: BorderStyle.SINGLE, size: 12 } },
    children: [new TextRun({ text: "Özet — Müşteriniz İçin Ne Değişiyor?", font: FONT, size: 36, bold: true, color: NAVY })],
  }),
  Lead("12 adımın hepsini tek bir araç. Tek bir kayıt. Tek bir ödeme."),

  Body("Eskiden:"),
  Bullet("Ön muhasebe yazılımı ayrı (aylık ücret)", "✗"),
  Bullet("Pazaryeri yönetim aracı ayrı (aylık ücret)", "✗"),
  Bullet("POS yazılımı ayrı (aylık ücret)", "✗"),
  Bullet("E-fatura entegratörü ayrı (aylık ücret)", "✗"),
  Bullet("Gider takibi Excel’de — gerçek kâr asla net değil", "✗"),

  Body("Ticarium365 ile:"),
  Bullet("Tüm modüller tek panelde, tek aboneliğe dahil.", "✓"),
  Bullet("Aynı ürün/müşteri/fatura kaydı her ekranda.", "✓"),
  Bullet("Komisyon, kargo, iade dahil gerçek net kâr ilk kez net.", "✓"),
  Bullet("Mali müşavir aynı sisteme kendi rolüyle bağlanır.", "✓"),
  Bullet("Mağaza, depo, online — hepsi senkron.", "✓"),

  Tip("Müşteriniz Ticarium365’i kullanmaya başladığı ilk haftada en az 3 farklı yazılım aboneliğini iptal eder. Aylık toplam yazılım gideri düşer; gerçek kârını ilk kez görür."),

  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
    children: [new TextRun({
      text: "Ticarium365 — Türkiye'nin tek panelli KOBİ işletim sistemi.",
      font: FONT, size: 24, bold: true, color: PRIMARY,
    })],
  }),
]);

// ──────────── DÖKÜMAN ÇIKTI ────────────

const doc = new Document({
  creator: "Ticarium365",
  title: "Ticarium365 — Müşteri Kullanım Turu",
  description: "Müşteri ve yatırımcı için ekran görüntülü uçtan uca kullanım turu",
  sections: pages.map((children) => ({
    properties: {
      page: {
        margin: { top: 720, right: 720, bottom: 720, left: 720 },
      },
    },
    children,
  })),
});

const outDir = path.resolve("outputs");
const outPath = path.join(outDir, "Ticarium365-Musteri-Kullanim-Turu.docx");
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buf);

console.log("OK:", outPath);
console.log("Boyut:", (buf.length / 1024).toFixed(1) + " KB");
console.log("Sayfa sayısı:", pages.length);
