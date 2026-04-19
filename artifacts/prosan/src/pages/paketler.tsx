import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import { Check, ArrowRight, Boxes, ShoppingCart, Briefcase, TrendingUp, Building2 } from "lucide-react";

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

      <PublicFooter />
    </div>
  );
}
