import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import { Target, Compass, TrendingUp, ArrowRight } from "lucide-react";

export default function AmacimizPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-amacimiz">
      <PublicNav />
      <section className="t365-page-hero container mx-auto px-4 py-20 md:py-28 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6" style={{ fontFamily: "var(--font-display)" }}>
          <span className="t365-brand-gradient">Amacımız</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          Türkiye'deki her KOBİ'nin işini tek panelde, tek aboneliğin altında, eklentisiz yönetebilmesi.
          Ne kadar gelir geldi, ne kadar kâr kaldı, hangi ürün ne kadar stokta — sorunun cevabı 2 tıkta.
        </p>
      </section>

      <section className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="border-2"><CardContent className="p-7">
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3"><Compass className="h-5 w-5" /></div>
            <div className="font-bold text-lg mb-2" style={{ fontFamily: "var(--font-display)" }}>Vizyonumuz</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              KOBİ'lerin "hangi yazılımı kullanalım" sorusunu sorması gereken bir dünya değil; tek bir cevabın olduğu bir Türkiye.
              Tek panel, tek fatura, tüm modüller dahil.
            </p>
          </CardContent></Card>
          <Card className="border-2"><CardContent className="p-7">
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3"><Target className="h-5 w-5" /></div>
            <div className="font-bold text-lg mb-2" style={{ fontFamily: "var(--font-display)" }}>Misyonumuz</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              KOBİ'lerin yazılıma ödediği toplam faturayı %50 azaltırken; raporlama, tahsilat ve karar verme hızını 3 katına çıkarmak.
            </p>
          </CardContent></Card>
          <Card className="border-2"><CardContent className="p-7">
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3"><TrendingUp className="h-5 w-5" /></div>
            <div className="font-bold text-lg mb-2" style={{ fontFamily: "var(--font-display)" }}>Hedefimiz</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              2027 sonuna kadar 10.000 KOBİ'nin günlük operasyonunda, eklenti veya başka bir yazılım gerektirmeden,
              tek panelle yer almak.
            </p>
          </CardContent></Card>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 max-w-4xl">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/20">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Neden bu işi yapıyoruz?
            </h2>
            <p className="text-base md:text-lg text-muted-foreground italic max-w-2xl mx-auto leading-relaxed">
              "KOBİ; Türkiye'nin %99,8'idir, istihdamın %72'sidir. Ama yazılım dünyası onları kurumsal müşterinin minik versiyonu gibi
              görüp 5 ayrı yazılım satıyor. Biz tek bir cevap istiyoruz: <span className="text-primary not-italic font-semibold">Ticarium365</span>."
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="container mx-auto px-4 py-12 text-center">
        <Link href="/iletisim">
          <Button size="lg" className="gap-2" data-testid="btn-amacimiz-cta">
            Demo için bizi arat
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}
