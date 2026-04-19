import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, ShadingType,
} from "docx";
import fs from "node:fs";
import path from "node:path";

// ───────────────────────── Yardımcılar ─────────────────────────

const FONT = "Calibri";
const COLOR_PRIMARY = "1E40AF";
const COLOR_ACCENT = "0EA5A4";
const COLOR_MUTED = "64748B";
const COLOR_BORDER = "CBD5E1";
const COLOR_HEAD_BG = "F1F5F9";

const tl = (n) => "₺" + Math.round(n).toLocaleString("tr-TR");

const P = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, line: 300 },
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts.size ?? 22,
        color: opts.color,
        bold: opts.bold,
        italics: opts.italic,
      }),
    ],
  });

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 180 },
  children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: COLOR_PRIMARY })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 140 },
  children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: "0F172A" })],
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: "0F172A" })],
});

const Bullet = (text) => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 80 },
  children: [new TextRun({ text, font: FONT, size: 22 })],
});

const Note = (text) => new Paragraph({
  spacing: { before: 80, after: 160 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "FEF3C7" },
  children: [new TextRun({
    text: "⚠ Varsayım: " + text,
    font: FONT, size: 20, italics: true, color: "78350F",
  })],
});

const Placeholder = (label) => new Paragraph({
  spacing: { after: 100 },
  children: [
    new TextRun({ text: "[doldurulacak: ", font: FONT, size: 20, color: "B91C1C", italics: true }),
    new TextRun({ text: label, font: FONT, size: 20, color: "B91C1C", italics: true, bold: true }),
    new TextRun({ text: "]", font: FONT, size: 20, color: "B91C1C", italics: true }),
  ],
});

const cell = (text, opts = {}) => new TableCell({
  shading: opts.head ? { type: ShadingType.CLEAR, color: "auto", fill: COLOR_HEAD_BG } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({
      text: String(text),
      font: FONT, size: 20, bold: opts.bold || opts.head,
      color: opts.color,
    })],
  })],
});

const tableBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
};

const buildTable = (headers, rows, opts = {}) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: tableBorder,
  rows: [
    new TableRow({
      tableHeader: true,
      children: headers.map((h) => cell(h, { head: true, align: AlignmentType.CENTER })),
    }),
    ...rows.map((r, i) => new TableRow({
      children: r.map((c, idx) => cell(c, {
        align: idx === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
        bold: opts.boldFirstCol && idx === 0,
      })),
    })),
  ],
});

// ───────────────────────── Plan & Projeksiyon Verisi ─────────────────────────

const PLANS = [
  { slug: "Envanter", monthly: 999, maxUsers: 2, mix: 0.15, persona: "Tek dükkân/küçük depo, sadece stok takibi" },
  { slug: "Ticaret", monthly: 1999, maxUsers: 5, mix: 0.50, persona: "POS + satış + cari + e-arşiv (en yaygın)" },
  { slug: "İşletme", monthly: 3499, maxUsers: 10, mix: 0.20, persona: "Banka, gider merkezi, OCR, demirbaş" },
  { slug: "Büyüme", monthly: 5999, maxUsers: 20, mix: 0.10, persona: "Pazaryeri, kampanya, sadakat, çoklu para" },
  { slug: "Kurumsal", monthly: 9999, maxUsers: -1, mix: 0.05, persona: "API + üretim + mali müşavir paneli" },
];

const YEARLY_RATIO = 0.20; // %20 müşteri yıllık ödüyor
const YEARLY_DISCOUNT_FACTOR = 10 / 12; // 2 ay bedava

const arpuMonthly = PLANS.reduce((s, p) => s + p.mix * p.monthly, 0);
const effectiveARPU = arpuMonthly * (1 - YEARLY_RATIO + YEARLY_RATIO * YEARLY_DISCOUNT_FACTOR);

// Maliyet varsayımları
const FX = 40; // ₺/USD
const SUPPORT_FTE_COST = 25000; // TL/ay/kişi
const PAYMENT_FEE = 0.03;

function projectScenario(N) {
  const mrr = N * effectiveARPU;
  const arr = mrr * 12;

  // Marjinal birim altyapı maliyeti — ölçek arttıkça düşer
  const infraPerCust = N <= 100 ? 2.0 : N <= 600 ? 1.20 : 0.80;
  const infra = N * infraPerCust * FX;
  const comm = N * 0.50 * FX;
  const monitoring = (N <= 100 ? 50 : N <= 600 ? 200 : 400) * FX;
  const supportFTE = Math.max(0.5, Math.ceil(N / 130));
  const support = supportFTE * SUPPORT_FTE_COST;
  const marketing = N <= 100 ? 15000 : N <= 600 ? 80000 : 150000;
  const payments = mrr * PAYMENT_FEE;

  const totalOpex = infra + comm + monitoring + support + marketing + payments;
  const grossProfit = mrr - totalOpex;
  const grossMargin = grossProfit / mrr;

  return {
    N, mrr, arr, infra, comm, monitoring, supportFTE, support,
    marketing, payments, totalOpex, grossProfit, grossMargin,
  };
}

const SCENARIOS = [50, 500, 1000].map(projectScenario);

// ───────────────────────── ANA DÖKÜMAN İÇERİĞİ ─────────────────────────

function buildMasterDoc() {
  const children = [];

  // ---- Kapak
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1800, after: 240 },
    children: [new TextRun({ text: "Ticarium365", font: FONT, size: 72, bold: true, color: COLOR_PRIMARY })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
    children: [new TextRun({ text: "Türkiye'nin tek panelli KOBİ işletim sistemi", font: FONT, size: 28, color: COLOR_MUTED })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Ürün, Strateji, Mimari ve Finansal Projeksiyon Dökümanı", font: FONT, size: 24, italics: true })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1600 },
    children: [new TextRun({ text: "Sürüm: Taslak v1 · Tarih: " + new Date().toLocaleDateString("tr-TR"), font: FONT, size: 22, color: COLOR_MUTED })],
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- Önemli Not
  children.push(H1("Bu Dökümanın Statüsü"));
  children.push(P("Bu döküman bir taslak iskelettir. Yatırımcıya, satın alma görüşmesine veya bankaya sunulmadan önce aşağıdakiler doldurulmalıdır:"));
  children.push(Bullet("Gerçek müşteri sayıları, MRR/ARR, churn (mevcut canlı müşteri verisi yok)"));
  children.push(Bullet("Birim ekonomisi (CAC, LTV) — ilk aktif müşterilerden ölçüldükçe girilecek"));
  children.push(Bullet("Gerçek altyapı faturası (Replit Reserved VM + DB + Object Storage gerçek tüketim)"));
  children.push(Bullet("Müşteri referansları, vaka çalışmaları"));
  children.push(P("Sayısal projeksiyonlar bölümünde her varsayım sarı kutu ile işaretlenmiştir. Bu varsayımlar değiştirilince tüm tablolar yeniden hesaplanmalıdır.", { italic: true, color: COLOR_MUTED }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 1. Executive Summary
  children.push(H1("1. Yönetici Özeti"));
  children.push(P("Ticarium365, Türkiye'deki küçük ve orta ölçekli işletmelerin (KOBİ) günlük işletme operasyonlarını tek bir panelde birleştiren çoklu kiracı (multi-tenant) bir SaaS platformudur. Ön muhasebe, stok, satış, pazaryeri entegrasyonları, gerçek kârlılık hesabı ve B2B ticaret ağı tek bir kullanıcı deneyiminde sunulur."));
  children.push(P("Pazardaki temel boşluk: KOBİ sahibi bugün ön muhasebe (Paraşüt/Bizim Hesap), pazaryeri panelleri, fiziksel POS yazılımı, e-fatura entegratörü ve gider takibini ayrı ayrı kullanıyor. Bu modüller arasında veri kopuk, gerçek kâr (komisyon, kargo, iade dahil) hiçbir araçta net görünmüyor."));
  children.push(H3("Stratejik Yıldız Modüller"));
  children.push(Bullet("Gerçek Karlılık Motoru — komisyon, kargo, iade, sermaye bağlama dahil ürün bazlı net kâr"));
  children.push(Bullet("e-Ticarium Merkezi — satış, reklam bütçesi, çok kanal yayını tek panelde"));
  children.push(Bullet("Akıllı Fiyatlandırma — kanal/maliyet bazlı, kâr koruyan otomatik öneriler"));
  children.push(Bullet("Firmalar Arası B2B Ağ — ürün/stok paylaşımı, teklif alma, ileride komisyonlu pazar (Ticarium Pazar)"));
  children.push(H3("Mevcut Durum"));
  children.push(Bullet("PROSAN ENDÜSTRİ ilk pilot müşteri olarak hazırlanıyor"));
  children.push(Bullet("NİHAT TURİZM ikinci pilot — turizm dikey segmenti için"));
  children.push(Bullet("5 katmanlı paketleme (Envanter, Ticaret, İşletme, Büyüme, Kurumsal)"));
  children.push(Placeholder("İlk 3 ay sonunda aktif müşteri sayısı, MRR, kullanım metrikleri"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 2. Problem Statement
  children.push(H1("2. Problem Tanımı"));
  children.push(P("Türkiye'de yaklaşık 3,4 milyon KOBİ bulunmaktadır. Bu işletmelerin büyük çoğunluğu dijital operasyonlarını parçalı bir araç yığınıyla yürütüyor:"));
  children.push(Bullet("Ön muhasebe → Paraşüt / Bizim Hesap / Logo / Mikro"));
  children.push(Bullet("Stok → Excel veya yerel POS yazılımı"));
  children.push(Bullet("Pazaryeri → Trendyol/Hepsiburada/N11 ayrı panelleri"));
  children.push(Bullet("E-fatura → Üçüncü parti entegratörler"));
  children.push(Bullet("CRM/cari hesap → kâğıt veya WhatsApp"));
  children.push(P("Sonuç: KOBİ sahibi her ay 5+ ayrı yazılım için ödeme yapıyor, veriler entegre değil, gerçek kârlılık hiçbir ekranda doğru görünmüyor (komisyon, iade, kargo, sermaye bağlama maliyeti hesap dışı kalıyor)."));
  children.push(H3("Acı Noktası 1 — Görünmez Maliyetler"));
  children.push(P("Pazaryerinde 100 TL'ye satılan bir ürün gerçekte ne kadar kâr getiriyor? Komisyon, KDV, kargo, iade riski, sermaye bağlama günleri hesaba katılınca rakam çoğu zaman negatif çıkıyor. Mevcut araçlar bunu hesaplamıyor."));
  children.push(H3("Acı Noktası 2 — Tekrarlanan Veri Girişi"));
  children.push(P("Aynı ürün, müşteri, fatura bilgisi 3-4 farklı sisteme tekrar tekrar giriliyor. Hem zaman kaybı hem hata kaynağı."));
  children.push(H3("Acı Noktası 3 — Yatay Ölçek Yok"));
  children.push(P("Mevcut çözümler tek tenant; KOBİ büyüdükçe (şube, kanal, personel) yazılım çöker veya pahalı kurumsal ERP'ye geçiş zorunluluğu doğar. Arada bir köprü yok."));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 3. Çözüm
  children.push(H1("3. Ticarium365 Çözümü"));
  children.push(P("Ticarium365, KOBİ'nin tüm operasyonel ihtiyacını tek bir multi-tenant SaaS panelinde birleştirir:"));
  children.push(Bullet("Tek veri modeli: ürün, müşteri, fatura, stok, gider — tek kayıt, her ekrandan görünür"));
  children.push(Bullet("Gerçek karlılık motoru: ürün bazında komisyon/kargo/iade dahil net kâr"));
  children.push(Bullet("Pazaryeri sync: tek ürün → tüm kanallarda yayında"));
  children.push(Bullet("E-Ticarium Merkezi: kendi vitriniz + ortak Ticarium Pazar tek arayüz"));
  children.push(Bullet("Multi-tenant + alt-domain izolasyonu: her firma kendi panelinde, paylaşımlı altyapı maliyeti"));
  children.push(Bullet("Türkçe ilk gün — KOBİ sahibinin kendi diliyle, basit terimlerle"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 4. Tamamlanan Modüller
  children.push(H1("4. Mevcut Tamamlanan Modüller"));
  children.push(P("Aşağıdaki modüller kod tabanında çalışır durumda; pilot müşteri tarafından kullanım doğrulaması beklenmektedir."));
  children.push(buildTable(
    ["Modül", "Durum", "Not"],
    [
      ["Ürün/Stok Yönetimi", "Hazır", "Çoklu birim, varyant, barkod"],
      ["Hızlı Satış (POS)", "Hazır", "Klavye + barkod tarayıcı uyumlu"],
      ["Satış & Fatura", "Hazır", "E-arşiv hazır; e-fatura entegratör hazır bekleniyor"],
      ["Müşteri / Cari Hesap", "Hazır", "Borç/alacak ekstre, ödeme takibi"],
      ["Tedarikçi & Alış", "Hazır", "Alış faturası, ödeme planı"],
      ["Gider Merkezi", "Hazır", "Kategori bazlı, otomatik dağıtım"],
      ["Banka Yönetimi", "Hazır", "Hesap, transfer, mutabakat"],
      ["Personel Kayıtları", "Hazır", "Bordro pkg_growth+ paketinde"],
      ["Demirbaş & Amortisman", "Hazır", "Doğrusal amortisman"],
      ["Belge Merkezi", "Hazır", "Object storage entegre"],
      ["Net Kâr Paneli", "Hazır", "Yıldız modül — gerçek karlılık"],
      ["Pazaryeri (Trendyol/Hepsi/N11)", "Hazır", "API key entegrasyonları sırada"],
      ["Kampanya & Kupon Motoru", "Hazır", "Yüzde, sabit, kategori bazlı"],
      ["Sadakat & Puan", "Hazır", "Üye kart sistemi"],
      ["Çoklu Para Birimi", "Hazır", "TCMB kurları"],
      ["Üretim & Reçete (BOM)", "Hazır", "Kurumsal pakette"],
      ["Çok Kiracılı Mimari", "Hazır", "Subdomain izolasyonu, PROSAN + NİHAT TURİZM ayrı tenant"],
      ["Rol Bazlı Yetkilendirme", "Hazır", "Owner / Admin / Staff / Viewer / Super Admin"],
      ["Komut Paleti (⌘K)", "Hazır", "Rol-filtreli global hızlı geçiş"],
      ["E-Ticarium Merkezi (UI)", "Hazır", "Ödeme/satış kanalı yönetimi UI hazır"],
    ],
  ));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 5. Devam Eden / Yapılacak
  children.push(H1("5. Devam Eden / Yapılacak Modüller"));
  children.push(buildTable(
    ["Modül", "Durum", "Engel / İhtiyaç"],
    [
      ["Sentry Hata İzleme", "%80", "DSN secret eklenecek"],
      ["E-mail Servisi (SMTP)", "Bekliyor", "Gmail SMTP veya SendGrid hesabı"],
      ["SMS Servisi (NetGSM)", "Bekliyor", "Ücretli — pilot sonrası"],
      ["Pazaryeri API Bağlantıları", "Hazır altyapı", "Trendyol/Hepsi API key/seller hesabı"],
      ["E-Fatura Entegratörü", "Hazır altyapı", "Entegratör seçimi + sözleşme"],
      ["Mali Müşavir Paneli", "Yapılacak", "Kurumsal pakette"],
      ["Akıllı Fiyat Önerisi (AI)", "Faz 5", "OpenAI tüketim modeli netleşmeli"],
      ["Rakip Fiyat İzleme", "Faz 3", "Web scraping altyapısı"],
      ["Mobil App (Expo)", "İskelet hazır", "SMSYSTEMS mobil — özellik açılımı"],
      ["Webhook Çıkışı", "Yapılacak", "Kurumsal pakette"],
      ["White Label / Mali Müşavir markası", "Yapılacak", "Faz 4-5"],
    ],
  ));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 6. Faz Faz Roadmap
  children.push(H1("6. Faz Faz Roadmap"));

  children.push(H2("Faz 1 — Çekirdek İşletme Sistemi (Tamamlandı)"));
  children.push(Bullet("Stok, satış, cari, fatura, gider, banka"));
  children.push(Bullet("Multi-tenant + rol bazlı yetki"));
  children.push(Bullet("E-arşiv hazırlığı"));
  children.push(Bullet("PROSAN + NİHAT TURİZM tenant kurulumu"));

  children.push(H2("Faz 2 — Ticaret Büyütme (Devam ediyor)"));
  children.push(Bullet("Pazaryeri sync canlı"));
  children.push(Bullet("E-Ticarium Merkezi reklam bütçesi yönetimi"));
  children.push(Bullet("Kampanya & sadakat aktif"));
  children.push(Bullet("Akıllı fiyatlandırma motoru ilk versiyon"));

  children.push(H2("Faz 3 — Entegrasyonlar"));
  children.push(Bullet("E-fatura entegratör (Logo, GİB)"));
  children.push(Bullet("Logo / Mikro / Paraşüt veri içe aktarım sihirbazı"));
  children.push(Bullet("Banka Open API bağlantıları"));
  children.push(Bullet("Kargo entegrasyonları (Yurtiçi, Aras, MNG, PTT)"));
  children.push(Bullet("Webhook çıkış altyapısı"));

  children.push(H2("Faz 4 — B2B Ağ"));
  children.push(Bullet("Firmalar arası teklif alma / verme"));
  children.push(Bullet("Stok / ürün paylaşımı"));
  children.push(Bullet("Ticarium Pazar — sektörel pazaryeri (komisyon modeli)"));
  children.push(Bullet("Ortaklar arası kapalı devre fiyat anlaşmaları"));

  children.push(H2("Faz 5 — AI / Veri Zekâsı"));
  children.push(Bullet("Fiş/fatura OCR (mevcut altyapı genişler)"));
  children.push(Bullet("Akıllı fiyat önerisi — kâr koruyan otomatik fiyat"));
  children.push(Bullet("Talep tahmini, stok devir hızı önerisi"));
  children.push(Bullet("Müşteri churn risk skoru"));

  children.push(H2("Faz 6 — Uluslararasılaşma"));
  children.push(Bullet("Çoklu dil (EN, DE, AR)"));
  children.push(Bullet("Çoklu para birimi tam entegre (mevcut altyapı genişler)"));
  children.push(Bullet("KKTC, Azerbaycan, Türk diasporası ilk hedef pazarlar"));
  children.push(Bullet("White label — yerel ortaklarla bayilik modeli"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 7. Teknik Mimari
  children.push(H1("7. Teknik Mimari"));
  children.push(H3("Stack"));
  children.push(Bullet("Frontend: React + Vite (web), Expo React Native (mobil)"));
  children.push(Bullet("Backend: Node.js + Express, TypeScript, OpenAPI sözleşme"));
  children.push(Bullet("Veritabanı: PostgreSQL (Drizzle ORM)"));
  children.push(Bullet("Object Storage: Replit App Storage (medya, döküman)"));
  children.push(Bullet("Hata İzleme: Sentry"));
  children.push(Bullet("Tek paket yöneticisi: pnpm monorepo"));
  children.push(Bullet("Hosting: Replit Reserved VM Deployment (üretimde)"));

  children.push(H3("Multi-Tenant Tasarımı"));
  children.push(Bullet("Her firma için companyId — tüm sorgular bu kolon ile filtrelenir"));
  children.push(Bullet("Subdomain izolasyonu (prosan.ticarium365.com gibi)"));
  children.push(Bullet("Özellik bayrağı (feature flag) — paket bazında modül erişimi"));
  children.push(Bullet("Plan limitleri (kullanıcı, ürün, depolama) tek noktadan kontrol"));

  children.push(H3("Rol Bazlı Yetki (RBAC)"));
  children.push(Bullet("Owner — firma sahibi, tüm yetkiler"));
  children.push(Bullet("Admin — operasyon yöneticisi"));
  children.push(Bullet("Staff — günlük işlem (POS, satış, stok)"));
  children.push(Bullet("Viewer — sadece raporlama"));
  children.push(Bullet("Super Admin — Ticarium365 ekibi, çapraz tenant destek"));

  children.push(H3("Ölçeklenebilirlik"));
  children.push(Bullet("Stateless API — yatay ölçeklenebilir"));
  children.push(Bullet("PostgreSQL — read replica eklenebilir"));
  children.push(Bullet("Object storage CDN ile servis"));
  children.push(Bullet("Ağır işler için kuyruk (queue) — Faz 3'te eklenecek"));

  children.push(H3("Güvenlik"));
  children.push(Bullet("Şifre hash'leme (bcrypt)"));
  children.push(Bullet("Session bazlı kimlik doğrulama, SESSION_SECRET ile imzalı cookie"));
  children.push(Bullet("HTTPS zorunlu (Replit deployment)"));
  children.push(Bullet("Rol bazlı API guard middleware"));
  children.push(Bullet("KVKK uyumu — veri sahipliği müşteride"));
  children.push(Bullet("Sentry ile gerçek zamanlı hata izleme"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 8. Gelir Modelleri
  children.push(H1("8. Gelir Modelleri"));
  children.push(buildTable(
    ["Model", "Açıklama", "Faz"],
    [
      ["Aylık abonelik", "5 paket: Envanter, Ticaret, İşletme, Büyüme, Kurumsal", "Faz 1+"],
      ["Yıllık abonelik", "%17 indirim (2 ay bedava) — nakit akışı önden", "Faz 1+"],
      ["Modül satışı", "Ek paket dışı modüller (örn. üretim, mali müşavir paneli)", "Faz 2+"],
      ["İşlem komisyonu", "Ticarium Pazar üzerinden satışlarda %1-3", "Faz 4"],
      ["Reklam yönetimi", "E-Ticarium Merkezi reklam ajansı hizmeti — managed budget", "Faz 2+"],
      ["White label", "Mali müşavir/ajans markasıyla satış — sabit lisans + revenue share", "Faz 4-5"],
      ["Enterprise lisans", "Kurumsal müşteriler için özel SLA + dedicated infra", "Faz 3+"],
      ["AI ek paketler", "Akıllı fiyat, churn skoru, talep tahmini — kullanım bazlı", "Faz 5"],
    ],
  ));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 9. Operasyonel Maliyet Analizi
  children.push(H1("9. Operasyonel Maliyet Analizi"));
  children.push(P("Aşağıdaki maliyet kalemleri, henüz canlı müşteri verisi olmadığından mantıksal varsayımlara dayanır. Her varsayım sarı kutu ile belirtilmiştir; gerçek faturalar geldikçe revize edilmelidir."));
  children.push(Note("USD/TL kuru: 40 (rapor tarihi)"));
  children.push(Note("Ödeme alma komisyonu: işlem hacminin %3'ü (kart işleme + işlemci payı)"));

  children.push(H3("Sabit Altyapı Kalemleri (Tüm Senaryolarda)"));
  children.push(buildTable(
    ["Kalem", "Açıklama"],
    [
      ["Hosting", "Replit Reserved VM Deployment — kullanım bazlı, ölçeğe göre büyür"],
      ["PostgreSQL", "Replit managed Postgres — bağlantı + depolama bazlı"],
      ["Object Storage", "Belge, fiş, ürün görseli — GB bazlı + bandwidth"],
      ["Sentry", "Free tier (5K event/ay) → büyüdükçe Team plan ($26/ay+)"],
      ["E-mail (SMTP)", "Düşük hacim: Gmail (ücretsiz). Yüksek: SendGrid/Postmark"],
      ["SMS (NetGSM)", "Mesaj başına ücret — sadece kritik bildirim"],
      ["AI (OpenAI)", "Token bazlı — sadece OCR / fiyat önerisi modüllerinde"],
      ["Domain + SSL", "Yıllık sabit, ihmal edilebilir"],
    ],
  ));

  children.push(H3("Müşteri Başına Aylık Maliyet (Tahmini)"));
  children.push(buildTable(
    ["Plan", "Ortalama yoğunluk", "Tahmini birim maliyet/ay"],
    [
      ["Envanter", "Düşük (sadece stok)", "$0.50 – $1.00"],
      ["Ticaret", "Orta (POS + fatura)", "$1.00 – $2.00"],
      ["İşletme", "Orta-yüksek (banka, OCR)", "$1.80 – $3.00"],
      ["Büyüme", "Yüksek (pazaryeri sync)", "$3.00 – $5.00"],
      ["Kurumsal", "Yoğun (üretim + API)", "$5.00 – $10.00+"],
    ],
  ));
  children.push(Note("Birim maliyetler ölçek arttıkça düşer (sabit Sentry/monitoring giderleri amortize olur). Yoğun pazaryeri sync ve OCR kullanan müşteriler aralığın üst bandında konumlanır."));

  children.push(H3("Yüksek Maliyet Doğurabilecek Kısımlar"));
  children.push(buildTable(
    ["Risk Alanı", "Risk", "Önerilen Çözüm"],
    [
      ["Pazaryeri canlı senkronizasyon", "API rate-limit + sürekli polling maliyeti", "Webhook + queue (BullMQ/SQS)"],
      ["Rapor / export", "Büyük tablolar UI'da çekiliyor, RAM patlar", "Async job + indir/email link"],
      ["Fiş OCR (AI)", "Token tüketimi yüksek", "Resim ön-işleme + cache + plan limiti"],
      ["Gerçek zamanlı dashboard", "Her client her saniye sorgu", "Polling yerine WebSocket / 30sn cache"],
      ["Medya depolama", "Belge/fotoğraf birikimi", "Cold storage + 90 gün sonra arşiv"],
      ["Multi-tenant büyük tablolar", "companyId index'siz sorgu = full scan", "Composite index zorunluluğu (CI'da kontrol)"],
      ["AI modülleri", "Token başı maliyet öngörülemez", "Plan-bazlı kotalama + kota aşımı uyarı"],
    ],
  ));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 10. Projeksiyon
  children.push(H1("10. Sayısal Projeksiyon — 50 / 500 / 1000 Müşteri"));
  children.push(P("Aşağıdaki hesap sitedeki güncel paket fiyatlarına ve aşağıdaki dağılım varsayımına dayanır:"));

  children.push(buildTable(
    ["Paket", "Aylık Fiyat", "Müşteri Dağılımı"],
    PLANS.map(p => [p.slug, tl(p.monthly), `%${(p.mix * 100).toFixed(0)}`]),
    { boldFirstCol: true },
  ));
  children.push(Note(`Müşteri dağılımı: çoğunluk en yaygın "Ticaret" paketinde. Pilot sonrası gerçek dağılım ölçülünce revize.`));
  children.push(Note(`Ödeme döngüsü: %${YEARLY_RATIO * 100} müşteri yıllık (10/12 katsayı), %${(1 - YEARLY_RATIO) * 100} aylık.`));
  children.push(Note(`Ortalama kullanıcı geliri (ARPU): ${tl(effectiveARPU)}/ay.`));

  children.push(H2("Senaryo Karşılaştırma Tablosu"));
  children.push(buildTable(
    ["Kalem", "50 Müşteri", "500 Müşteri", "1000 Müşteri"],
    [
      ["Müşteri sayısı", ...SCENARIOS.map(s => s.N.toLocaleString("tr-TR"))],
      ["Aylık MRR", ...SCENARIOS.map(s => tl(s.mrr))],
      ["Yıllık ARR", ...SCENARIOS.map(s => tl(s.arr))],
      ["—", "—", "—", "—"],
      ["Altyapı (hosting+DB+storage)", ...SCENARIOS.map(s => tl(s.infra))],
      ["İletişim (SMS+email)", ...SCENARIOS.map(s => tl(s.comm))],
      ["İzleme (Sentry+monitoring)", ...SCENARIOS.map(s => tl(s.monitoring))],
      ["Destek personeli (FTE)", ...SCENARIOS.map(s => s.supportFTE.toString())],
      ["Destek maliyeti", ...SCENARIOS.map(s => tl(s.support))],
      ["Pazarlama / CAC", ...SCENARIOS.map(s => tl(s.marketing))],
      ["Ödeme komisyonu (%3)", ...SCENARIOS.map(s => tl(s.payments))],
      ["Toplam OPEX", ...SCENARIOS.map(s => tl(s.totalOpex))],
      ["—", "—", "—", "—"],
      ["Brüt Kâr (R&D öncesi)", ...SCENARIOS.map(s => tl(s.grossProfit))],
      ["Brüt Marj", ...SCENARIOS.map(s => `%${(s.grossMargin * 100).toFixed(1)}`)],
    ],
    { boldFirstCol: true },
  ));

  children.push(Note("R&D / yazılım ekibi maliyeti müşteri sayısından bağımsız sabittir; yukarıdaki brüt kâra dahil değildir. Ekip maliyeti ayrı satırda hesaplanmalıdır."));
  children.push(Placeholder("R&D ekibi aylık toplam maliyeti (ör. 4 dev + 1 PM + 1 designer)"));

  children.push(H2("Senaryo Yorumları"));
  children.push(H3("50 Müşteri — Pilot / Erken Aşama"));
  children.push(P(`Aylık MRR ${tl(SCENARIOS[0].mrr)}, yıllık ARR ${tl(SCENARIOS[0].arr)}. Brüt marj sınırlı çünkü destek/pazarlama sabit giderleri henüz amortize olmadı. Bu aşamada hedef: ürün-pazar uyumunu doğrulamak, churn'ü ölçmek, NPS toplamak.`));

  children.push(H3("500 Müşteri — Sürdürülebilir Operasyon"));
  children.push(P(`Aylık MRR ${tl(SCENARIOS[1].mrr)}, yıllık ARR ${tl(SCENARIOS[1].arr)}. Brüt marj %${(SCENARIOS[1].grossMargin * 100).toFixed(0)} seviyesinde — sağlıklı SaaS bandı. Bu aşamada R&D ekibi tamamen iç finansmanla karşılanabilir hale gelir.`));

  children.push(H3("1000 Müşteri — Pazar Liderliği Hazırlık"));
  children.push(P(`Aylık MRR ${tl(SCENARIOS[2].mrr)}, yıllık ARR ${tl(SCENARIOS[2].arr)}. Brüt marj %${(SCENARIOS[2].grossMargin * 100).toFixed(0)}. Bu seviyede Ticarium Pazar (B2B komisyon modeli) ek gelir kanalı olarak devreye alınmalıdır — projeksiyona dahil edilmedi.`));

  children.push(Placeholder("Üç senaryo için müşteri kazanım takvimi (örn. ay 6 → 50, ay 18 → 500, ay 30 → 1000)"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 11. SWOT
  children.push(H1("11. SWOT Analizi"));

  children.push(H3("Güçlü Yönler (Strengths)"));
  children.push(Bullet("Türkçe-ilk tasarım — KOBİ sahibinin diliyle"));
  children.push(Bullet("Tek panelde 5+ ürünün işini birleştiren entegrasyon avantajı"));
  children.push(Bullet("Gerçek karlılık motoru — pazardaki rakiplerde yok"));
  children.push(Bullet("Multi-tenant + ölçeklenebilir mimari günden 1 hazır"));
  children.push(Bullet("Modern teknoloji stack'i — geliştirme hızı yüksek"));

  children.push(H3("Zayıf Yönler (Weaknesses)"));
  children.push(Bullet("Henüz canlı müşteri yok — kullanım verisi sıfır"));
  children.push(Bullet("Marka tanınırlığı yok — pazarlama yatırımı gerekli"));
  children.push(Bullet("E-fatura entegratör seçimi tamamlanmadı"));
  children.push(Bullet("Pazaryeri API sözleşmeleri henüz yok"));
  children.push(Bullet("Tek geliştirici / küçük ekip — bus factor riski"));

  children.push(H3("Fırsatlar (Opportunities)"));
  children.push(Bullet("Türkiye'de 3,4M+ KOBİ — devasa pazar"));
  children.push(Bullet("Mevcut çözümlerin parçalı yapısı — birleştirici fırsatı"));
  children.push(Bullet("Pazaryeri ekosistemi büyüyor — entegrasyon talebi artıyor"));
  children.push(Bullet("KKTC, Azerbaycan, Türk diasporası uluslararasılaşma fırsatı"));
  children.push(Bullet("Mali müşavir / muhasebeci kanalı — B2B2C dağıtım"));
  children.push(Bullet("AI ile gerçek karlılık önerisi farklılaşma alanı"));

  children.push(H3("Tehditler (Threats)"));
  children.push(Bullet("Logo, Mikro gibi köklü oyuncuların alt segmente inmesi"));
  children.push(Bullet("Paraşüt'ün modül genişletmesi"));
  children.push(Bullet("Pazaryerlerinin kendi seller paneli geliştirmesi"));
  children.push(Bullet("Regülasyon değişiklikleri (e-fatura, GİB)"));
  children.push(Bullet("Ekonomik daralma → KOBİ harcama kısıtı"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 12. Yatırımcı Bakışı
  children.push(H1("12. Yatırımcı Bakışı"));

  children.push(H3("Yatırımcı Neyi Sever"));
  children.push(Bullet("Büyük TAM (Türkiye 3,4M KOBİ × ortalama ARPU = 100+ milyar TL pazar)"));
  children.push(Bullet("SaaS metrikleri — recurring revenue, yüksek brüt marj"));
  children.push(Bullet("Multi-tenant teknik mimari — ölçek ekonomisi günden 1"));
  children.push(Bullet("Birden fazla gelir kolu (abonelik + komisyon + AI)"));
  children.push(Bullet("Türkiye-spesifik regülasyon (e-fatura, KVKK) yerel rakip avantajı"));

  children.push(H3("Yatırımcı Nerede Risk Görür"));
  children.push(Bullet("Sıfır müşteri trakcsiyonu — pazar uyumu kanıtlanmadı"));
  children.push(Bullet("Tek kurucu / küçük ekip"));
  children.push(Bullet("KOBİ pazarı yüksek churn"));
  children.push(Bullet("CAC belirsiz — pazarlama deneyi yok"));
  children.push(Bullet("Mevcut güçlü oyuncuların reaksiyon riski"));

  children.push(H3("Risk Azaltma Stratejisi"));
  children.push(Bullet("Pilot 3-5 müşteriden gerçek metrik (LTV, churn, NPS) çıkarmak"));
  children.push(Bullet("Mali müşavir / sektör derneği iş birlikleri ile düşük CAC"));
  children.push(Bullet("Annual prepay teşvik — cash conversion + churn azaltma"));
  children.push(Bullet("Kurumsal pakette yıllık sözleşme + SLA → öngörülebilir gelir"));
  children.push(Placeholder("Hedeflenen yatırım turu büyüklüğü ve kullanım planı"));
  children.push(Placeholder("Mevcut ekip CV / arka plan"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 13. Uzun Dönem Projeksiyon (placeholder iskelet)
  children.push(H1("13. Uzun Dönem Projeksiyon (1 / 3 / 5 Yıl)"));
  children.push(P("Aşağıdaki tablo iskeleti boş bırakılmıştır. Gerçek pazarlama kanalları, CAC, churn ve takım büyüme planı netleştikçe doldurulacaktır."));

  for (const sen of ["Muhafazakâr", "Gerçekçi", "Agresif"]) {
    children.push(H3("Senaryo: " + sen));
    children.push(buildTable(
      ["Metrik", "Yıl 1", "Yıl 3", "Yıl 5"],
      [
        ["Aktif müşteri", "[?]", "[?]", "[?]"],
        ["MRR", "[?]", "[?]", "[?]"],
        ["ARR", "[?]", "[?]", "[?]"],
        ["Brüt marj", "[?]", "[?]", "[?]"],
        ["Ekip büyüklüğü", "[?]", "[?]", "[?]"],
        ["Altyapı maliyeti / ay", "[?]", "[?]", "[?]"],
        ["EBITDA yaklaşımı", "[?]", "[?]", "[?]"],
      ],
      { boldFirstCol: true },
    ));
  }
  children.push(Placeholder("Pilot 3 ay sonunda gerçek CAC ve churn ile bu tablolar doldurulacak"));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 14. Görsel/Grafik Önerileri
  children.push(H1("14. Görsel & Grafik Önerileri"));
  children.push(Bullet("Pazar boyutu funnel'i — 3.4M KOBİ → adreslenebilir → hedef segmenti"));
  children.push(Bullet("Modül haritası — radar grafiği (Karlılık, e-Ticarium, Fiyat, B2B)"));
  children.push(Bullet("Müşteri başı maliyet grafiği — ölçek arttıkça düşen birim maliyet"));
  children.push(Bullet("3 senaryo MRR projeksiyonu — kümülatif çizgi grafik"));
  children.push(Bullet("Rakip karşılaştırma matrisi — Paraşüt, Logo, Mikro, Bizim Hesap"));
  children.push(Bullet("Mimari diyagramı — multi-tenant + tenant izolasyonu görsel"));

  return new Document({
    creator: "Ticarium365",
    title: "Ticarium365 — Master Pitch Doküman (Taslak)",
    description: "Yatırımcı / strateji / ürün master dökümanı — taslak v1",
    sections: [{ children }],
  });
}

// ───────────────────────── EXEC SUMMARY (KISA) ─────────────────────────

function buildSummaryDoc() {
  const c = [];

  c.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 800, after: 240 },
    children: [new TextRun({ text: "Ticarium365", font: FONT, size: 56, bold: true, color: COLOR_PRIMARY })],
  }));
  c.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: "Yatırımcı Özeti — Executive Summary", font: FONT, size: 28, color: COLOR_MUTED })],
  }));

  c.push(H2("Tek Cümlede"));
  c.push(P("Türkiye'deki 3,4 milyon KOBİ için ön muhasebe, stok, satış, pazaryeri ve gerçek karlılık hesabını tek panelde birleştiren multi-tenant SaaS işletim sistemi."));

  c.push(H2("Problem"));
  c.push(P("KOBİ sahibi bugün 5+ ayrı yazılım kullanıyor (Paraşüt, pazaryeri panelleri, POS, e-fatura, Excel). Veriler entegre değil, gerçek kâr — komisyon/iade/kargo/sermaye dahil — hiçbir araçta görünmüyor."));

  c.push(H2("Çözüm"));
  c.push(P("Tek veri modeli, tek panel, tek aboneliğe entegre edilmiş 25+ modül. Yıldız modüller: Gerçek Karlılık Motoru, e-Ticarium Merkezi, Akıllı Fiyatlandırma, Firmalar Arası B2B Ağ."));

  c.push(H2("Pazar"));
  c.push(P("Türkiye'de 3.4M+ KOBİ. Adreslenebilir hedef segmenti (e-ticaret yapan + en az 1 dijital araç kullanan): yaklaşık 400-500 bin işletme. Yıllık ortalama harcama 30-50K TL bandında."));
  c.push(Placeholder("TAM/SAM/SOM kesin sayıları — pazar araştırması"));

  c.push(H2("Ürün Durumu"));
  c.push(Bullet("20+ modül kod tabanında çalışır durumda"));
  c.push(Bullet("Multi-tenant + rol bazlı yetki + 5 paket katmanı hazır"));
  c.push(Bullet("PROSAN ENDÜSTRİ + NİHAT TURİZM ilk pilot tenant'lar"));
  c.push(Bullet("Pazaryeri / e-fatura entegrasyonları altyapısı hazır, API key bağlantı sırada"));

  c.push(H2("Birim Ekonomisi (Hedef)"));
  c.push(buildTable(
    ["Metrik", "Hedef Bant", "Not"],
    [
      ["ARPU (aylık)", tl(effectiveARPU), "Mevcut paket karması varsayımı"],
      ["Brüt marj", "%75 – %85", "500+ müşteri bandında SaaS standardı"],
      ["CAC payback", "<12 ay", "Mali müşavir kanalı + organik"],
      ["Net retention", ">%100", "Modül upsell + paket yükseltme"],
    ],
    { boldFirstCol: true },
  ));
  c.push(Note("Tüm metrikler hedef; pilot sonrası gerçek ölçüm yapılacak."));

  c.push(H2("Hızlı Projeksiyon"));
  c.push(buildTable(
    ["Müşteri", "MRR", "ARR", "Brüt Marj"],
    SCENARIOS.map(s => [s.N.toLocaleString("tr-TR"), tl(s.mrr), tl(s.arr), `%${(s.grossMargin * 100).toFixed(0)}`]),
    { boldFirstCol: true },
  ));

  c.push(H2("Yatırım İhtiyacı & Kullanım"));
  c.push(Placeholder("Yatırım turu büyüklüğü"));
  c.push(Placeholder("Kullanım dağılımı: ekip, pazarlama, altyapı, runway"));

  c.push(H2("Ekip"));
  c.push(Placeholder("Kurucu(lar) ve ekip CV özetleri"));

  c.push(H2("Niye Şimdi"));
  c.push(Bullet("E-fatura zorunluluğu KOBİ'leri dijital araç aramaya itiyor"));
  c.push(Bullet("Pazaryeri komisyonları artıyor → gerçek kâr önemli hale geldi"));
  c.push(Bullet("Mevcut çözümler 10+ yıllık — modern teknoloji ile yeniden yazma fırsatı"));

  return new Document({
    creator: "Ticarium365",
    title: "Ticarium365 — Yatırımcı Özeti",
    sections: [{ children: c }],
  });
}

// ───────────────────────── ÇIKTI ─────────────────────────

const outDir = path.resolve("outputs");
fs.mkdirSync(outDir, { recursive: true });

const masterPath = path.join(outDir, "Ticarium365-Master-Pitch.docx");
const summaryPath = path.join(outDir, "Ticarium365-Yatirimci-Ozeti.docx");

const masterBuf = await Packer.toBuffer(buildMasterDoc());
fs.writeFileSync(masterPath, masterBuf);

const sumBuf = await Packer.toBuffer(buildSummaryDoc());
fs.writeFileSync(summaryPath, sumBuf);

console.log("OK");
console.log("Master:", masterPath, (masterBuf.length / 1024).toFixed(1) + " KB");
console.log("Özet:  ", summaryPath, (sumBuf.length / 1024).toFixed(1) + " KB");
console.log("\nProjection özeti:");
console.log("ARPU efektif:", tl(effectiveARPU));
SCENARIOS.forEach(s => {
  console.log(`  ${s.N} müşteri  MRR=${tl(s.mrr)}  Brüt=${tl(s.grossProfit)}  Marj=${(s.grossMargin*100).toFixed(1)}%`);
});
