import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check, X, Minus, ArrowRight, Sparkles, ScanLine, Receipt, Store,
  Boxes, Smartphone, Cloud, BarChart3, Zap, ShieldCheck,
} from "lucide-react";

type Cell = true | false | "partial";

// Jenerik rakip kategorileri — belirli marka adı yok.
const features: { name: string; ticarium365: Cell; onMuhasebe: Cell; klasikErp: Cell; mobilPos: Cell; note?: string }[] = [
  { name: "Bulut tabanlı (kurulum yok)", ticarium365: true, onMuhasebe: true, klasikErp: "partial", mobilPos: true },
  { name: "Mobil uygulama (iOS + Android)", ticarium365: true, onMuhasebe: "partial", klasikErp: "partial", mobilPos: true },
  { name: "Barkod okutma + hızlı satış (POS)", ticarium365: true, onMuhasebe: false, klasikErp: true, mobilPos: true },
  { name: "Çok şubeli stok / fiyat yönetimi", ticarium365: true, onMuhasebe: "partial", klasikErp: true, mobilPos: "partial" },
  { name: "e-Fatura / e-Arşiv (sağlayıcı seçilebilir)", ticarium365: true, onMuhasebe: true, klasikErp: true, mobilPos: "partial" },
  { name: "Pazaryeri entegrasyonu (Trendyol, HB, N11, vd.)", ticarium365: true, onMuhasebe: "partial", klasikErp: false, mobilPos: "partial", note: "11 sağlayıcı, eklenti yok" },
  { name: "Fiş / Fatura OCR (yapay zeka ile otomatik veri)", ticarium365: true, onMuhasebe: "partial", klasikErp: false, mobilPos: false },
  { name: "Net Kâr Merkezi (gerçek zamanlı kâr)", ticarium365: true, onMuhasebe: "partial", klasikErp: "partial", mobilPos: false },
  { name: "Demirbaş & amortisman takibi", ticarium365: true, onMuhasebe: true, klasikErp: true, mobilPos: false },
  { name: "Personel maaş & SGK gider takibi", ticarium365: true, onMuhasebe: true, klasikErp: true, mobilPos: false },
  { name: "B2B Ağ / Teklif (RFQ)", ticarium365: true, onMuhasebe: false, klasikErp: false, mobilPos: false },
  { name: "Açık API + webhook", ticarium365: true, onMuhasebe: true, klasikErp: "partial", mobilPos: false },
  { name: "Çoklu firma (subdomain)", ticarium365: true, onMuhasebe: "partial", klasikErp: false, mobilPos: false },
  { name: "Türkçe arayüz + Türkçe destek", ticarium365: true, onMuhasebe: true, klasikErp: true, mobilPos: true },
];

function CellIcon({ v }: { v: Cell }) {
  if (v === true) return <Check className="h-5 w-5 text-emerald-600 mx-auto" data-testid="cell-yes" />;
  if (v === false) return <X className="h-5 w-5 text-red-400 mx-auto" data-testid="cell-no" />;
  return <Minus className="h-5 w-5 text-amber-500 mx-auto" data-testid="cell-partial" />;
}

const differentiators = [
  { icon: Boxes, title: "Tek platform, tek fatura", desc: "Stok, barkod, satış, e-fatura, pazaryeri, B2B, finans, kâr — hepsi bir yerde. Eklenti yok, sürpriz kalem yok." },
  { icon: Store, title: "11 pazaryeri yerleşik", desc: "Trendyol, Hepsiburada, N11, Amazon, Çiçeksepeti, PTT AVM, Shopify, WooCommerce, İdeaSoft, Ticimax — tek panelden senkron." },
  { icon: Receipt, title: "Fiş OCR (yapay zeka)", desc: "Fişin fotoğrafını çek — tutar, KDV, satıcı, fatura no otomatik girilsin. Defter dolduran sürtünmeyi sıfırlar." },
  { icon: BarChart3, title: "Net Kâr Merkezi", desc: "Ciro − COGS − gider − maaş − amortisman = net kâr. Anlık. Şubeye göre. Aya göre. Ürüne göre." },
  { icon: Smartphone, title: "Mobil-doğal", desc: "iOS + Android uygulamamız her abonelikte dahil. Çırak da depocu da telefondan satar, sayar, kontrol eder." },
  { icon: ScanLine, title: "KOBİ için barkod / POS akışı", desc: "Bir tarama → satışa dönüştür, stok düşsün, e-fatura kesilsin. 30 saniye, tek ekran." },
  { icon: Cloud, title: "Sağlayıcı bağımsız e-Fatura", desc: "Bir entegratöre kilitli değilsin. İstediğin sağlayıcıyı bağla, istediğinde değiştir." },
  { icon: Zap, title: "Sıfır kurulum, dakikalarda canlı", desc: "Subdomain'ini al, ekibini davet et, satışa başla. Bayi / danışmanlık dayatması yok." },
  { icon: ShieldCheck, title: "Çok kiracılı izolasyon", desc: "Her firmanın verisi ayrı kiracıda. Bankacılık seviyesi izolasyon, KVKK / GDPR uyumlu mimari." },
];

export default function KarsilastirPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20" data-testid="page-karsilastir">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold" style={{ fontFamily: "var(--font-display)" }}>T</div>
            <span className="font-bold text-lg" style={{ fontFamily: "var(--font-display)" }}>Ticarium365</span>
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">Neden farklıyız?</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="btn-login">Giriş Yap</Button>
            </Link>
            <Link href="/login">
              <Button size="sm" data-testid="btn-cta-trial">21 gün ücretsiz</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="container mx-auto px-4 py-16 md:py-24 text-center">
        <Badge variant="outline" className="mb-4">
          <Sparkles className="h-3 w-3 mr-1" />
          KOBİ ön muhasebesinin ötesinde
        </Badge>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 max-w-4xl mx-auto" style={{ fontFamily: "var(--font-display)" }}>
          Diğer alternatiflerden <span className="text-primary">neden farklıyız?</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Çoğu yazılım ya sadece <strong>ön muhasebe</strong>, ya sadece <strong>perakende</strong>, ya sadece <strong>mobil POS</strong>.
          Ticarium365 satış, stok, e-fatura, pazaryeri ve net kârı tek panelde, eklentisiz birleştirir.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login">
            <Button size="lg" className="gap-2" data-testid="btn-hero-trial">
              Hemen başla — 21 gün ücretsiz
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#tablo">
            <Button size="lg" variant="outline" data-testid="btn-hero-table">Karşılaştırmayı gör</Button>
          </a>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold text-center mb-3" style={{ fontFamily: "var(--font-display)" }}>9 sebepte Ticarium365 farkı</h2>
        <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
          Aşağıdaki 9 kabiliyet, KOBİ'lerin yazılım yığınına ödediği gizli faturayı ortadan kaldırır.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {differentiators.map((d, i) => (
            <Card key={i} className="border-2 hover:border-primary/50 transition-colors" data-testid={`diff-${i}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <d.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{d.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{d.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* COMPARISON TABLE — generic categories, no brand names, no prices */}
      <section id="tablo" className="container mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>Yetenek karşılaştırması</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Piyasadaki yazılım kategorilerini bağımsız değerlendirdik. Yeşil tik tam destek, sarı çizgi sınırlı/eklenti, kırmızı çarpı yok demek.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border-2 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-semibold min-w-[280px]">Özellik</th>
                <th className="p-4 font-bold text-primary bg-primary/5">Ticarium365</th>
                <th className="p-4 font-medium">Bulut Ön Muhasebe</th>
                <th className="p-4 font-medium">Klasik ERP / Ticari</th>
                <th className="p-4 font-medium">Mobil POS Çözümleri</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr key={i} className="border-t hover:bg-muted/20" data-testid={`row-${i}`}>
                  <td className="p-4">
                    <div>{f.name}</div>
                    {f.note && <div className="text-xs text-muted-foreground mt-0.5">{f.note}</div>}
                  </td>
                  <td className="p-4 text-center bg-primary/5"><CellIcon v={f.ticarium365} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.onMuhasebe} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.klasikErp} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.mobilPos} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-center text-muted-foreground mt-4 max-w-3xl mx-auto">
          Karşılaştırma; piyasada yaygın yazılım kategorilerinin tipik özellik setine dayanır. Spesifik bir ürünü temsil etmez; ürünler arasında farklılık gösterebilir.
        </p>
      </section>

      {/* POSITIONING STATEMENT — no brand names */}
      <section className="container mx-auto px-4 py-16">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/20">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Bizim konumlandırma cümlemiz</h2>
            <p className="text-lg md:text-2xl text-muted-foreground italic max-w-3xl mx-auto leading-relaxed">
              "Ön muhasebenin <strong>düzeni</strong>, perakendenin <strong>derinliği</strong>,
              klasik ERP'nin <strong>resmi raporları</strong>, mobil POS'un <strong>hızı</strong> —
              hepsi <span className="text-primary font-bold not-italic">tek bulutta, mobil dahil, eklentisiz</span>."
            </p>
            <p className="mt-6 text-sm text-muted-foreground">
              Aynı parayı 3 farklı yazılıma vermeyi bırak. Tek panelde yönet.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* FINAL CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ fontFamily: "var(--font-display)" }}>Karar vermeden önce dene.</h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Kredi kartı istemiyoruz. 21 gün boyunca tüm modüller açık.
          Beğenmezsen hesap kapatılır, veriler 30 gün saklanır.
        </p>
        <Link href="/login">
          <Button size="lg" className="gap-2" data-testid="btn-final-cta">
            Hemen ücretsiz başla
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Ticarium365 · Türkiye'nin tek panelli KOBİ işletim sistemi
      </footer>
    </div>
  );
}
