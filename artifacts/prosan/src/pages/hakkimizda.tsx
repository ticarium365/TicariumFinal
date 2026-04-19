import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import { Building2, Users, Rocket, Heart, ArrowRight } from "lucide-react";

const values = [
  { icon: Heart, title: "KOBİ odaklı", desc: "Çözümlerimizi mahalle bakkalından bölgesel toptancıya kadar gerçek KOBİ'lerle birlikte tasarlıyoruz." },
  { icon: Rocket, title: "Hızlı ve sade", desc: "Eğitim videosu izlemeden kullanılabilen, dakikalar içinde canlıya alınabilen bir deneyim." },
  { icon: Users, title: "Şeffaf ekip", desc: "Roadmap'imizi paylaşırız, geri bildirimi 48 saat içinde değerlendiririz." },
  { icon: Building2, title: "Türkiye'de büyüyen", desc: "Tüm geliştirme, destek ve veri merkezi süreçlerimizi Türkiye'den yönetiyoruz." },
];

export default function HakkimizdaPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-hakkimizda">
      <PublicNav />
      <section className="t365-page-hero container mx-auto px-4 py-20 md:py-28 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6" style={{ fontFamily: "var(--font-display)" }}>
          <span className="t365-brand-gradient">Biz Kimiz?</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          <strong>Ticarium365</strong>, Türkiye'deki KOBİ'lerin günlük operasyonunu — stok, satış, e-fatura, pazaryeri ve finans dahil —
          tek panelden yönetmesi için kurulmuş bir işletim sistemidir. Yazılım yığınını sadeleştirmek, gizli faturayı ortadan kaldırmak
          ve "hangi modülü açacağız?" kararını ortadan kaldırmak için varız.
        </p>
      </section>

      <section className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-2"><CardContent className="p-8">
            <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-display)", color: NAVY }}>Hikayemiz</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ticarium365 ekibi olarak yıllarca KOBİ'lerin 4-5 farklı yazılıma para ödediğine, eklenti üzerine eklenti aldığına şahit olduk.
              Müşterilerimizin "hepsi bir arada olsa" cümlesini binlerce kez duyduktan sonra, gerçekten tek panelli bir KOBİ işletim sistemi
              kurmaya karar verdik. 2025'te Ticarium365 olarak yeniden konumlandık.
            </p>
          </CardContent></Card>
          <Card className="border-2"><CardContent className="p-8">
            <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-display)", color: NAVY }}>Bugün</h2>
            <p className="text-muted-foreground leading-relaxed">
              Stok ve barkoddan e-faturaya, 11 pazaryerinden mobil POS'a, gerçek kâr motorundan B2B teklif sistemine kadar geniş bir ürün
              yelpazesini tek aboneliğin altında sunuyoruz. Her firmanın verisini ayrı kiracıda tutan çoklu firma mimarimizle, küçük bir
              dükkândan zincir mağazaya kadar büyüyebilirsin.
            </p>
          </CardContent></Card>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: "var(--font-display)", color: NAVY }}>Değerlerimiz</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {values.map((v, i) => (
            <Card key={i} className="border-2 hover:border-primary/40 transition" data-testid={`value-${i}`}>
              <CardContent className="p-6">
                <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
                  <v.icon className="h-5 w-5" />
                </div>
                <div className="font-bold mb-2">{v.title}</div>
                <p className="text-sm text-muted-foreground">{v.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Tanışmak ister misin?</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Ekibimizden biri 1 iş günü içinde seni arasın, ihtiyaçlarını dinlesin, doğru paketi birlikte seçelim.
        </p>
        <Link href="/iletisim">
          <Button size="lg" className="gap-2" data-testid="btn-cta-iletisim">
            Sizi arayalım
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}
