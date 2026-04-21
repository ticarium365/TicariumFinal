import { Fragment } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import { Check, Minus, ArrowRight, Boxes, ShoppingCart, Briefcase, TrendingUp, Building2 } from "lucide-react";

type Pkg = {
  slug: string;
  name: string;
  tagline: string;
  icon: typeof Boxes;
  highlights: string[];
  best?: boolean;
};

const packages: Pkg[] = [
  {
    slug: "stok",
    name: "Stok",
    tagline: "Sayım, barkod ve stok takibi ile başla",
    icon: Boxes,
    highlights: [
      "Ürün, kategori, varyant yönetimi",
      "Barkod okuma + etiket basımı",
      "Çok şubeli stok hareketleri",
      "Sayım ve düzeltme",
      "Düşük stok uyarıları",
    ],
  },
  {
    slug: "ticaret",
    name: "Ticaret",
    tagline: "Stok + satış + müşteri/cari yönetimi",
    icon: ShoppingCart,
    highlights: [
      "Stok paketinin tüm özellikleri",
      "Hızlı satış ekranı + POS akışı",
      "Müşteri / tedarikçi cari hesapları",
      "Tahsilat ve ödeme takibi",
      "Satış geçmişi ve raporları",
    ],
    best: true,
  },
  {
    slug: "isletme",
    name: "İşletme",
    tagline: "Tam KOBİ paketi: e-fatura, finans, personel",
    icon: Briefcase,
    highlights: [
      "Ticaret paketinin tüm özellikleri",
      "e-Fatura / e-Arşiv (sağlayıcı seçilebilir)",
      "Banka entegrasyonu, çek/senet",
      "Personel + maaş + SGK gider takibi",
      "Demirbaş ve amortisman",
      "Finans dashboard + nakit akışı",
    ],
  },
  {
    slug: "buyume",
    name: "Büyüme",
    tagline: "Pazaryerleri, B2B ağı, gerçek kâr motoru",
    icon: TrendingUp,
    highlights: [
      "İşletme paketinin tüm özellikleri",
      "11 pazaryeri yerleşik (Trendyol, HB, N11...)",
      "B2B ağ + RFQ teklif sistemi",
      "Gerçek Kâr Motoru (anlık kâr)",
      "Fiş OCR + akıllı kategorizasyon",
      "Sadakat ve kampanya yönetimi",
    ],
  },
  {
    slug: "kurumsal",
    name: "Kurumsal",
    tagline: "Çoklu firma, açık API, özel destek",
    icon: Building2,
    highlights: [
      "Büyüme paketinin tüm özellikleri",
      "Çoklu firma (subdomain) yönetimi",
      "Açık API + webhook erişimi",
      "Özel entegrasyon desteği",
      "Önceliklendirilmiş destek hattı",
      "Detaylı resmi raporlar",
    ],
  },
];

type FeatureRow = {
  group: string;
  label: string;
  values: [boolean | string, boolean | string, boolean | string, boolean | string, boolean | string];
};

const featureMatrix: FeatureRow[] = [
  { group: "Stok & Ürün", label: "Ürün, kategori, varyant yönetimi", values: [true, true, true, true, true] },
  { group: "Stok & Ürün", label: "Barkod okuma + etiket basımı", values: [true, true, true, true, true] },
  { group: "Stok & Ürün", label: "Çok şubeli stok hareketleri", values: [true, true, true, true, true] },
  { group: "Stok & Ürün", label: "Sayım ve düzeltme", values: [true, true, true, true, true] },
  { group: "Stok & Ürün", label: "Düşük stok uyarıları", values: [true, true, true, true, true] },

  { group: "Satış & Cari", label: "Hızlı satış / POS akışı", values: [false, true, true, true, true] },
  { group: "Satış & Cari", label: "Müşteri / tedarikçi cari hesapları", values: [false, true, true, true, true] },
  { group: "Satış & Cari", label: "Tahsilat ve ödeme takibi", values: [false, true, true, true, true] },
  { group: "Satış & Cari", label: "Satış geçmişi ve raporları", values: [false, true, true, true, true] },

  { group: "Finans & Resmi", label: "e-Fatura / e-Arşiv (sağlayıcı seçilebilir)", values: [false, false, true, true, true] },
  { group: "Finans & Resmi", label: "Banka entegrasyonu, çek/senet", values: [false, false, true, true, true] },
  { group: "Finans & Resmi", label: "Personel + maaş + SGK gider takibi", values: [false, false, true, true, true] },
  { group: "Finans & Resmi", label: "Demirbaş ve amortisman", values: [false, false, true, true, true] },
  { group: "Finans & Resmi", label: "Finans dashboard + nakit akışı", values: [false, false, true, true, true] },

  { group: "Büyüme & Pazaryeri", label: "11 pazaryeri yerleşik (Trendyol, HB, N11...)", values: [false, false, false, true, true] },
  { group: "Büyüme & Pazaryeri", label: "B2B ağ + RFQ teklif sistemi", values: [false, false, false, true, true] },
  { group: "Büyüme & Pazaryeri", label: "Gerçek Kâr Motoru (anlık kâr)", values: [false, false, false, true, true] },
  { group: "Büyüme & Pazaryeri", label: "Fiş OCR + akıllı kategorizasyon", values: [false, false, false, true, true] },
  { group: "Büyüme & Pazaryeri", label: "Sadakat ve kampanya yönetimi", values: [false, false, false, true, true] },

  { group: "Kurumsal", label: "Çoklu firma (subdomain) yönetimi", values: [false, false, false, false, true] },
  { group: "Kurumsal", label: "Açık API + webhook erişimi", values: [false, false, false, false, true] },
  { group: "Kurumsal", label: "Özel entegrasyon desteği", values: [false, false, false, false, true] },
  { group: "Kurumsal", label: "Önceliklendirilmiş destek hattı", values: [false, false, false, false, true] },
  { group: "Kurumsal", label: "Detaylı resmi raporlar", values: [false, false, false, false, true] },

  { group: "Limitler", label: "Kullanıcı sayısı", values: ["2", "5", "10", "25", "Sınırsız"] },
  { group: "Limitler", label: "Şube sayısı", values: ["1", "2", "5", "10", "Sınırsız"] },
  { group: "Limitler", label: "Aylık fatura sayısı", values: ["—", "500", "2.500", "10.000", "Sınırsız"] },
  { group: "Limitler", label: "Destek", values: ["E-posta", "E-posta", "E-posta + Sohbet", "Telefon + Sohbet", "Özel hesap yöneticisi"] },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="flex justify-center" aria-label="Var">
        <Check className="h-4 w-4 text-emerald-600" />
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex justify-center text-muted-foreground/40" aria-label="Yok">
        <Minus className="h-4 w-4" />
      </div>
    );
  }
  return <div className="text-center text-sm font-medium">{value}</div>;
}

function ComparisonSection() {
  let lastGroup = "";
  return (
    <section className="container mx-auto px-4 pb-20" data-testid="paket-karsilastirma">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Paket Karşılaştırma
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Hangi paket sana uyuyor? Tüm özellikleri yan yana koyduk. Her üst paket, alttakinin tümünü kapsar.
          </p>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold w-[34%]">Özellik</th>
                  {packages.map((p) => (
                    <th
                      key={p.slug}
                      className={`text-center px-3 py-3 font-semibold ${p.best ? "text-primary bg-primary/5" : ""}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{p.name}</span>
                        {p.best && <span className="text-[10px] font-medium uppercase tracking-wide">Önerilen</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureMatrix.map((row, idx) => {
                  const showGroup = row.group !== lastGroup;
                  lastGroup = row.group;
                  return (
                    <Fragment key={idx}>
                      {showGroup && (
                        <tr className="bg-muted/30">
                          <td colSpan={6} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {row.group}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-border/50 hover:bg-muted/20 transition">
                        <td className="px-4 py-3 text-foreground">{row.label}</td>
                        {row.values.map((v, i) => (
                          <td
                            key={i}
                            className={`px-3 py-3 ${packages[i].best ? "bg-primary/5" : ""}`}
                          >
                            <Cell value={v} />
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span>Pakete dahil</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus className="h-3.5 w-3.5" />
            <span>Pakete dahil değil</span>
          </div>
          <div>Sayısal değerler kullanım/aylık limittir.</div>
        </div>
      </div>
    </section>
  );
}

export default function PaketlerPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-paketler">
      <PublicNav />
      <section className="t365-page-hero container mx-auto px-4 py-20 md:py-24 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5" style={{ fontFamily: "var(--font-display)" }}>
          <span className="t365-brand-gradient">Sana uygun bir paket var.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          5 paket, küçük bir dükkândan çoklu şubeli işletmeye kadar. İhtiyacın değiştikçe yukarı geç,
          veriler ve ekibin aynen kalsın.
        </p>
        <div className="mt-6">
          <Link href="/iletisim">
            <Button size="lg" className="gap-2" data-testid="btn-paket-call">
              Sana uygun paketi konuşalım
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
          {packages.map((p) => (
            <Card
              key={p.slug}
              className={`flex flex-col border-2 ${p.best ? "border-primary shadow-lg" : "hover:border-primary/40"} transition`}
              data-testid={`pkg-${p.slug}`}
            >
              <CardHeader className="pb-3">
                {p.best && <Badge className="w-fit mb-2">En çok tercih edilen</Badge>}
                <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
                  <p.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl" style={{ fontFamily: "var(--font-display)" }}>{p.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{p.tagline}</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-2 text-sm flex-1">
                  {p.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/iletisim">
                  <Button className="w-full mt-5" variant={p.best ? "default" : "outline"} data-testid={`btn-pkg-${p.slug}`}>
                    Detay iste
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
          Tüm paketler 21 gün ücretsiz başlatılır. Kredi kartı istemiyoruz. Beğenmezsen veriler 30 gün saklanır.
        </p>
      </section>

      <ComparisonSection />

      <PublicFooter />
    </div>
  );
}
