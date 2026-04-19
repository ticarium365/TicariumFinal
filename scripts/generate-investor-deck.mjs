import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak,
  ShadingType, PageOrientation,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const FONT = "Calibri";
const NAVY = "0F172A";
const PRIMARY = "1E40AF";
const ACCENT = "0EA5A4";
const MUTED = "64748B";
const HEAD_BG = "F1F5F9";
const HILITE = "FEF3C7";

const tl = (n) => "₺" + Math.round(n).toLocaleString("tr-TR");

// ── Slide yardımcıları ──────────────────────────────────────────
const SlideTitle = (n, total, txt) => [
  new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({
      text: `Slayt ${n} / ${total}`, font: FONT, size: 18, color: MUTED, bold: true,
    })],
  }),
  new Paragraph({
    spacing: { after: 240 },
    border: {
      bottom: { color: PRIMARY, space: 6, style: BorderStyle.SINGLE, size: 18 },
    },
    children: [new TextRun({
      text: txt, font: FONT, size: 48, bold: true, color: NAVY,
    })],
  }),
];

const Lead = (txt) => new Paragraph({
  spacing: { before: 120, after: 240 },
  children: [new TextRun({
    text: txt, font: FONT, size: 28, color: PRIMARY, bold: true,
  })],
});

const Body = (txt) => new Paragraph({
  spacing: { after: 140, line: 320 },
  children: [new TextRun({ text: txt, font: FONT, size: 22, color: NAVY })],
});

const Punch = (txt) => new Paragraph({
  spacing: { before: 120, after: 200 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: HILITE },
  children: [new TextRun({
    text: "→ " + txt, font: FONT, size: 24, bold: true, color: "78350F",
  })],
});

const Bullet = (txt, opts = {}) => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 100 },
  children: [
    opts.label
      ? new TextRun({ text: opts.label + " ", font: FONT, size: 22, bold: true, color: PRIMARY })
      : null,
    new TextRun({ text: txt, font: FONT, size: 22, color: NAVY }),
  ].filter(Boolean),
});

const cell = (text, opts = {}) => new TableCell({
  shading: opts.head ? { type: ShadingType.CLEAR, color: "auto", fill: HEAD_BG } : undefined,
  margins: { top: 100, bottom: 100, left: 140, right: 140 },
  children: [new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({
      text: String(text), font: FONT, size: 20,
      bold: opts.bold || opts.head, color: opts.color ?? NAVY,
    })],
  })],
});

const tBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
};

const Tbl = (headers, rows, opts = {}) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: tBorder,
  rows: [
    new TableRow({
      tableHeader: true,
      children: headers.map(h => cell(h, { head: true, align: AlignmentType.CENTER })),
    }),
    ...rows.map(r => new TableRow({
      children: r.map((c, i) => cell(c, {
        align: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
        bold: opts.boldFirst && i === 0,
      })),
    })),
  ],
});

const Break = () => new Paragraph({ children: [new PageBreak()] });

// ── Projeksiyon (master ile aynı varsayımlar) ────────────────────
const PLANS = [
  { slug: "Paket 1", monthly: 999, mix: 0.15 },
  { slug: "Paket 2", monthly: 1999, mix: 0.50 },
  { slug: "Paket 3", monthly: 3499, mix: 0.20 },
  { slug: "Paket 4", monthly: 5999, mix: 0.10 },
  { slug: "Paket 5", monthly: 9999, mix: 0.05 },
];
const YEARLY = 0.20;
const arpu = PLANS.reduce((s, p) => s + p.mix * p.monthly, 0)
  * (1 - YEARLY + YEARLY * (10 / 12));

function proj(N) {
  const mrr = N * arpu;
  const arr = mrr * 12;
  const FX = 40;
  const infra = N * (N <= 100 ? 2.0 : N <= 600 ? 1.20 : 0.80) * FX;
  const comm = N * 0.50 * FX;
  const monit = (N <= 100 ? 50 : N <= 600 ? 200 : 400) * FX;
  const supportFTE = Math.max(0.5, Math.ceil(N / 130));
  const support = supportFTE * 25000;
  const marketing = N <= 100 ? 15000 : N <= 600 ? 80000 : 150000;
  const payments = mrr * 0.03;
  const opex = infra + comm + monit + support + marketing + payments;
  const gp = mrr - opex;
  return { N, mrr, arr, opex, gp, margin: gp / mrr };
}
const S = [50, 500, 1000].map(proj);

// ── 10 SLAYT ─────────────────────────────────────────────────────

const TOTAL = 10;
const slides = [];

// SLIDE 1 — KAPAK
slides.push([
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 200 },
    children: [new TextRun({ text: "Ticarium365", font: FONT, size: 96, bold: true, color: PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({
      text: "Türkiye'nin tek panelli KOBİ işletim sistemi",
      font: FONT, size: 36, color: NAVY,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "Beş ayrı yazılımı, tek panele indiriyoruz. Üstüne gerçek kâr koyuyoruz.",
      font: FONT, size: 24, italics: true, color: MUTED,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1400 },
    children: [new TextRun({
      text: "Yatırımcı Sunumu · Taslak v1 · " + new Date().toLocaleDateString("tr-TR"),
      font: FONT, size: 20, color: MUTED,
    })],
  }),
]);

// SLIDE 2 — PROBLEM
slides.push([
  ...SlideTitle(2, TOTAL, "Problem"),
  Lead("KOBİ sahibi her ay 5+ ayrı yazılıma para ödüyor — ve hâlâ gerçek kârını bilmiyor."),
  Bullet("Ön muhasebe ayrı, pazaryeri panelleri ayrı, POS yazılımı ayrı, e-fatura ayrı, gider takibi Excel'de.", { label: "Parçalı:" }),
  Bullet("Aynı ürün, müşteri, fatura 3-4 sisteme tekrar tekrar giriliyor.", { label: "Tekrarlı:" }),
  Bullet("Komisyon, kargo, iade, sermaye bağlama hesap dışı; pazaryerinde \"satıyorum\" sandığı ürün aslında zarar.", { label: "Yanıltıcı:" }),
  Bullet("Büyüyen KOBİ aniden pahalı kurumsal ERP'ye atlamak zorunda kalıyor — arada köprü yok.", { label: "Tıkanan:" }),
  Punch("KOBİ sahibi ayda 3-5 bin TL yazılım gideri ödüyor, kâr ekranı hâlâ yok."),
]);

// SLIDE 3 — ÇÖZÜM
slides.push([
  ...SlideTitle(3, TOTAL, "Çözüm"),
  Lead("Tek veri modeli, tek panel, tek abonelik. Üstüne gerçek karlılık motoru."),
  Bullet("Ürün, müşteri, fatura, stok, gider — tek kayıt, her ekrandan görünür.", { label: "Birleşik veri:" }),
  Bullet("Komisyon + kargo + iade + sermaye bağlama dahil ürün bazlı net kâr.", { label: "Gerçek kâr motoru:" }),
  Bullet("Tek ürün — kendi vitrin + ortak vitrin + dış kanallar.", { label: "Tek tıkla çoklu satış:" }),
  Bullet("Maliyet/kanal/rakip bazlı, kâr koruyan otomatik fiyat önerisi.", { label: "Akıllı fiyat:" }),
  Bullet("Firmalar arası ürün/stok paylaşımı, teklif alma, ileride komisyonlu pazar.", { label: "B2B ağ:" }),
  Punch("KOBİ ayda ödediği toplam yazılım giderini düşürür, kârını ilk kez net görür."),
]);

// SLIDE 4 — NEDEN ŞİMDİ
slides.push([
  ...SlideTitle(4, TOTAL, "Neden Şimdi"),
  Lead("Üç dalga aynı anda kırılıyor: regülasyon, AI, ağ ekonomisi."),
  Bullet("E-fatura ve dijitalleşme zorunlulukları her yıl daha küçük ciroya iniyor — KOBİ'ler dijital araç aramaya itiliyor.", { label: "Regülasyon:" }),
  Bullet("Pazaryeri komisyonları ve reklam maliyetleri yükseliyor — KOBİ artık \"gerçek kârı\" görmek zorunda.", { label: "Komisyon baskısı:" }),
  Bullet("Genel amaçlı modeller hızlandı; OCR, fiyat önerisi, talep tahmini ilk kez KOBİ bütçesinde.", { label: "AI olgunlaştı:" }),
  Bullet("Yalnız operasyon yetmiyor; firmalar arası ortak stok, ortak teklif, ortak vitrin yeni bir gelir katmanı.", { label: "Ağ etkisi:" }),
  Bullet("KOBİ tarafında baskın çözümler 10+ yıllık eski mimaride — modern stack ile yeniden yazma penceresi açık.", { label: "Modernizasyon penceresi:" }),
  Punch("Bu üç dalga bir arada 10 yılda bir gelir."),
]);

// SLIDE 5 — ÜRÜN
slides.push([
  ...SlideTitle(5, TOTAL, "Ürün"),
  Lead("20+ modül kod tabanında çalışıyor. Beş paket katmanında sunuluyor."),
  Tbl(
    ["Katman", "Hedef İşletme", "Çekirdek Modüller"],
    [
      ["Paket 1 — Envanter", "Tek dükkân / küçük depo", "Stok, sayım, barkod"],
      ["Paket 2 — Ticaret", "Yaygın KOBİ (en büyük segment)", "POS, satış, cari, e-arşiv"],
      ["Paket 3 — İşletme", "Çok şubeli, banka kullanan", "Banka, gider, OCR, demirbaş, bordro"],
      ["Paket 4 — Büyüme", "Çok kanallı satıcı", "Pazaryeri sync, kampanya, sadakat, çoklu para"],
      ["Paket 5 — Kurumsal", "Üretici / kurumsal", "Üretim, API, mali müşavir paneli, webhook"],
    ],
  ),
  Body(""),
  Bullet("Multi-tenant, rol bazlı yetki, alt-domain izolasyonu — günden 1 ölçek.", { label: "Mimari:" }),
  Bullet("Türkçe-ilk arayüz, KOBİ sahibinin diliyle. Komut paleti, mobil uyumlu.", { label: "UX:" }),
]);

// SLIDE 6 — PAZAR & İLK HEDEF SEKTÖRLER
slides.push([
  ...SlideTitle(6, TOTAL, "Pazar ve İlk Hedef Sektörler"),
  Lead("Türkiye'de 3,4 milyon KOBİ. Adreslenebilir hedef ~400-500 bin işletme."),

  Tbl(
    ["Pazar", "Tahmini Boyut", "Yıllık Yazılım Harcaması"],
    [
      ["TAM — Türkiye'deki tüm KOBİ", "3,4 milyon", "Yüksek değişkenlik"],
      ["SAM — En az 1 dijital araç + e-ticaret", "400 – 500 bin", "₺30K – ₺50K / işletme"],
      ["SOM — İlk 3 yıl ulaşılabilir", "5 – 10 bin", "Hedef ARR potansiyeli yüksek"],
    ],
    { boldFirst: true },
  ),
  Body(""),
  Lead("İlk dalgada odaklanılacak 5 dikey:"),
  Bullet("Hızlı ürün dönüşü, çok sayıda SKU, pazaryeri ağırlıklı satış.", { label: "1) Endüstriyel & Hırdavat:" }),
  Bullet("Çok kanallı (mağaza + online), kampanya yoğun.", { label: "2) Tekstil & Moda Aksesuar:" }),
  Bullet("Acente operasyonu, müşteri yönetimi, dönemsel kampanya.", { label: "3) Turizm & Acente:" }),
  Bullet("Stok devir hızı kritik, raf ömrü maliyeti gerçek karlılığı yiyor.", { label: "4) Gıda & Bakkaliye:" }),
  Bullet("Üretim reçetesi (BOM), ham madde maliyeti, fason süreci.", { label: "5) Mobilya & Küçük Üretici:" }),
  Punch("İlk iki tenant zaten bu segmentlerden — referans + vaka çalışması üreten dikey strateji."),
]);

// SLIDE 7 — GTM & İLK 12 AY
slides.push([
  ...SlideTitle(7, TOTAL, "GTM Planı ve İlk 12 Ay Müşteri Kazanımı"),
  Lead("Üç kanaldan paralel: dikey vaka çalışması, mali müşavir ortaklığı, sektör derneği iş birliği."),

  Tbl(
    ["Kanal", "Mantık", "12 Ay Hedef Pay"],
    [
      ["Mali müşavir ortaklığı", "Müşavir 50-300 KOBİ'ye günlük temas. White-label panel ile dağıtım.", "%40"],
      ["Sektör dernekleri", "Hırdavatçı, tekstilci, turizm acente birlikleri — toplu demo, üye indirimi.", "%25"],
      ["Dikey vaka çalışması", "İlk pilot başarısı → aynı sektörde organic referans + içerik.", "%20"],
      ["Performans pazarlama", "Google + sosyal — sadece doğrulanmış mesajlar için.", "%15"],
    ],
    { boldFirst: true },
  ),
  Body(""),

  Lead("12 aylık takvim:"),
  Tbl(
    ["Çeyrek", "Müşteri (Kümülatif)", "Odak", "Kilit Çıktı"],
    [
      ["Ay 1-3", "5 – 10", "Pilot derinleştirme", "İlk 2 vaka çalışması, NPS ölçümü"],
      ["Ay 4-6", "20 – 35", "Müşavir programı", "10 müşavir partner, ilk white-label"],
      ["Ay 7-9", "60 – 90", "Dernek kanal açılımı", "2 sektör derneği anlaşma"],
      ["Ay 10-12", "120 – 180", "Ölçek + ücretli kanal", "Tekrarlanabilir CAC, ilk yıl ARR taban"],
    ],
    { boldFirst: true },
  ),
  Punch("Hedef yıl sonu: 120-180 ödeyen müşteri, doğrulanmış birim ekonomi, 2 sektörde lider referans."),
]);

// SLIDE 8 — MOAT
slides.push([
  ...SlideTitle(8, TOTAL, "Rakiplere Karşı Moat"),
  Lead("Pazardaki çözümlerin hiçbiri dört avantajı bir arada sunmuyor."),

  Tbl(
    ["Boyut", "Pazardaki Tipik Çözüm", "Ticarium365 Avantajı"],
    [
      ["Kapsam", "Tek modülde derin, diğer modüllerde yok", "Tek panelde 25+ modül entegre"],
      ["Kâr motoru", "Sadece satış cirosu görünür", "Komisyon/iade/kargo/sermaye dahil net kâr"],
      ["Çok kanal", "Her pazaryeri için ayrı panel", "Tek ürün → tüm kanallar tek tıkla"],
      ["Mimari", "Eski monolitik, tek tenant", "Multi-tenant, modern stack, günden 1 ölçek"],
      ["Ağ etkisi", "Yok", "Firmalar arası B2B ağı + ortak vitrin"],
      ["Türkiye'ye özgü", "Çoğu yabancı menşeli, geç adapte", "E-fatura/KVKK günden 1, Türkçe-ilk"],
    ],
  ),
  Body(""),
  Lead("Zamanla derinleşen üç moat:"),
  Bullet("Müşteri verisi büyüdükçe karlılık önerileri sektör benchmarklarına dönüşür.", { label: "Veri:" }),
  Bullet("Müşavir + dernek kanalları kurulduğunda taklit etmesi yıllar süren dağıtım yapısı.", { label: "Dağıtım:" }),
  Bullet("Firma sayısı arttıkça B2B ağı her yeni üye için daha değerli hale gelir.", { label: "Ağ:" }),
]);

// SLIDE 9 — SAYILAR
slides.push([
  ...SlideTitle(9, TOTAL, "Sayılar"),
  Lead(`Ortalama kullanıcı geliri (ARPU): ${tl(arpu)} / ay`),
  Body(`Varsayım: paket karması Paket 2 ağırlıklı (%50). %20 müşteri yıllık ödüyor (2 ay bedava).`),

  Tbl(
    ["Müşteri", "MRR", "ARR", "Brüt Marj"],
    S.map(s => [
      s.N.toLocaleString("tr-TR"),
      tl(s.mrr),
      tl(s.arr),
      `%${(s.margin * 100).toFixed(0)}`,
    ]),
    { boldFirst: true },
  ),
  Body(""),
  Bullet("Erken aşama; sabit destek/pazarlama henüz amortize değil.", { label: "50 müşteri:" }),
  Bullet("Sağlıklı SaaS bandı; R&D iç finansmanla karşılanabilir.", { label: "500 müşteri:" }),
  Bullet("B2B komisyon kanalı henüz dahil değil — yukarı potansiyel.", { label: "1000 müşteri:" }),
  Punch("Her senaryoda brüt marj %60+ — SaaS standardının üzerinde."),
]);

// SLIDE 10 — FOUNDER STORY + ASK + AI/B2B FIRSAT
slides.push([
  ...SlideTitle(10, TOTAL, "Kurucu Hikâyesi · AI/B2B Fırsatı · Yatırım Talebi"),

  Lead("Kurucu hikâyesi"),
  Body("[doldurulacak: kurucunun KOBİ dünyasındaki birikimi, neden bu probleme girdiği, daha önce çözmeye çalıştığı somut deneyim. 4-6 cümle.]"),
  Body("[doldurulacak: ilk pilot tenant'ın (PROSAN ENDÜSTRİ) gerçek operasyon ihtiyacından doğan ürün geri bildirim döngüsü.]"),

  Lead("Niye AI bu ürün için büyük fırsat"),
  Bullet("KOBİ'de fiyat kararı sezgisel veriliyor; maliyet + kanal komisyonu + rakip + stok devir hızı hesabını insan yapamaz, model yapar.", { label: "Akıllı fiyat:" }),
  Bullet("Manuel veri girişi en büyük sürtünme; fatura/fiş OCR ile saniyede sisteme akıyor.", { label: "OCR:" }),
  Bullet("Hangi ürün ne kadar bekleyecek, hangi müşteri kaybedilmek üzere — soruları sektör verisiyle yanıtlanır.", { label: "Tahmin:" }),

  Lead("Niye B2B network büyük fırsat"),
  Bullet("Aynı sektördeki bin firma aynı tedarikçiden alıyor; ortak teklif gücü doğar.", { label: "Toplu güç:" }),
  Bullet("Bir firmanın fazla stoğu, diğerinin acil ihtiyacı; ağ içi pazar bunu eşleştirir.", { label: "Stok eşleşmesi:" }),
  Bullet("Sektör dikey pazarı kurulduğunda işlem komisyonu — abonelikten bağımsız ikinci gelir kolu.", { label: "Yeni gelir:" }),
  Bullet("Network etkisi: her yeni firma sistemin tüm üyeleri için değeri artırır — taklit edilemez moat.", { label: "Compounding:" }),

  Lead("Yatırım talebi"),
  Body("[doldurulacak: tur büyüklüğü, post-money beklentisi]"),
  Body("[doldurulacak: 18 aylık runway dağılımı — ekip / pazarlama / altyapı / yedek]"),
  Body("[doldurulacak: bu turun sonunda ulaşılacak metrikler — müşteri sayısı, ARR, kanal kanıtı]"),

  Punch("Doğru zamanda, doğru pazara, doğru mimariyle. Türkiye KOBİ işletim sistemini kuruyoruz."),
]);

// ── DÖKÜMAN ─────────────────────────────────────────────────────
const doc = new Document({
  creator: "Ticarium365",
  title: "Ticarium365 — Yatırımcı Sunumu (10 Slayt)",
  sections: slides.map(slideChildren => ({
    properties: {
      page: {
        size: {
          orientation: PageOrientation.LANDSCAPE,
          width: 16838,
          height: 10630,
        },
        margin: { top: 720, right: 1080, bottom: 720, left: 1080 },
      },
    },
    children: slideChildren,
  })),
});

const outDir = path.resolve("outputs");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "Ticarium365-Yatirimci-Sunumu.docx");
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buf);

console.log("OK:", outPath, (buf.length / 1024).toFixed(1) + " KB");
console.log("Slayt sayısı:", slides.length);
console.log("ARPU:", tl(arpu));
