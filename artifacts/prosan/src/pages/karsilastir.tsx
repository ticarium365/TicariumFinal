import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check, X, Minus, ArrowRight, Sparkles, ScanLine, Receipt, Store,
  Boxes, Smartphone, Cloud, BarChart3, Zap, ShieldCheck,
} from "lucide-react";

type Cell = true | false | "partial";

const features: { name: string; smsystems: Cell; bizim: Cell; parasut: Cell; logo: Cell; mikro: Cell; nebim: Cell; note?: string }[] = [
  { name: "Bulut tabanlı (kurulum yok)", smsystems: true, bizim: true, parasut: true, logo: true, mikro: "partial", nebim: "partial" },
  { name: "Mobil uygulama (iOS + Android)", smsystems: true, bizim: false, parasut: true, logo: "partial", mikro: "partial", nebim: "partial" },
  { name: "Barkod okutma + hızlı satış (POS)", smsystems: true, bizim: false, parasut: false, logo: "partial", mikro: true, nebim: true },
  { name: "Çok şubeli stok / fiyat yönetimi", smsystems: true, bizim: false, parasut: "partial", logo: true, mikro: true, nebim: true },
  { name: "e-Fatura / e-Arşiv (sağlayıcı seçilebilir)", smsystems: true, bizim: false, parasut: true, logo: true, mikro: true, nebim: true },
  { name: "Pazaryeri entegrasyonu (Trendyol, HB, N11, vd.)", smsystems: true, bizim: false, parasut: "partial", logo: false, mikro: false, nebim: "partial", note: "11 sağlayıcı, eklenti yok" },
  { name: "Fiş / Fatura OCR (yapay zeka ile otomatik veri)", smsystems: true, bizim: false, parasut: "partial", logo: false, mikro: false, nebim: false },
  { name: "Net Kâr Merkezi (gerçek zamanlı kâr)", smsystems: true, bizim: false, parasut: "partial", logo: false, mikro: "partial", nebim: false },
  { name: "Demirbaş & amortisman takibi", smsystems: true, bizim: false, parasut: true, logo: true, mikro: true, nebim: true },
  { name: "Personel maaş & SGK gider takibi", smsystems: true, bizim: false, parasut: true, logo: true, mikro: true, nebim: true },
  { name: "B2B Ağ / Teklif (RFQ)", smsystems: true, bizim: false, parasut: false, logo: false, mikro: false, nebim: false },
  { name: "Açık API + webhook", smsystems: true, bizim: false, parasut: true, logo: "partial", mikro: false, nebim: false },
  { name: "Çoklu firma (subdomain)", smsystems: true, bizim: false, parasut: "partial", logo: "partial", mikro: false, nebim: false },
  { name: "Türkçe arayüz + Türkçe destek", smsystems: true, bizim: true, parasut: true, logo: true, mikro: true, nebim: true },
  { name: "Şeffaf fiyat (gizli kalem yok)", smsystems: true, bizim: true, parasut: true, logo: false, mikro: false, nebim: false },
];

function CellIcon({ v }: { v: Cell }) {
  if (v === true) return <Check className="h-5 w-5 text-emerald-600 mx-auto" data-testid="cell-yes" />;
  if (v === false) return <X className="h-5 w-5 text-red-400 mx-auto" data-testid="cell-no" />;
  return <Minus className="h-5 w-5 text-amber-500 mx-auto" data-testid="cell-partial" />;
}

const competitors = [
  {
    key: "bizim",
    name: "Bizim Hesap",
    pkg: "Tek paket (ücretsiz / sınırlı)",
    price: "₺0 – ₺199/ay",
    strengths: ["Ücretsiz başlangıç", "Çok basit arayüz", "Banka entegrasyonu"],
    weaknesses: ["Stok / barkod yetersiz", "Pazaryeri yok", "Çok şubeli senaryo desteklenmiyor", "Mobil uygulama yok", "Raporlar yüzeysel"],
  },
  {
    key: "parasut",
    name: "Paraşüt",
    pkg: "Başlangıç / Şirket / Şirket Plus",
    price: "₺499 – ₺2.499/ay",
    strengths: ["Güçlü ön muhasebe", "Mali müşavir ekosistemi", "Açık API", "e-Fatura olgun"],
    weaknesses: ["Pazaryeri sync sınırlı / 3. parti", "Barkod & POS akışı zayıf", "Çok şubeli gerçek zamanlı stok kısıtlı", "Fiş OCR sınırlı"],
  },
  {
    key: "logo",
    name: "Logo İşbaşı",
    pkg: "Mini / Standart / Plus",
    price: "₺599 – ₺2.999/ay + bayi",
    strengths: ["Logo ekosistemi", "Muhasebeci tanıdık", "Güçlü resmi raporlar"],
    weaknesses: ["Eski arayüz", "Modüler ek ücretler", "Mobil deneyim zayıf", "Pazaryeri yerleşik değil", "Bayi üzerinden satış / kurulum"],
  },
  {
    key: "mikro",
    name: "Mikro Jump",
    pkg: "Başlangıç / Plus / Premium",
    price: "₺799 – ₺3.500/ay + danışmanlık",
    strengths: ["Perakende / toptan deneyimi", "Stok hareketleri detaylı", "Türkiye'de yaygın"],
    weaknesses: ["Modern web UX'i değil", "Kurulum / danışman zorunlu hissi", "Pazaryeri eklentileri 3. parti", "Fiyat şeffaf değil"],
  },
  {
    key: "nebim",
    name: "Nebim küçük çözümler",
    pkg: "Nebim V3 SMB paketleri",
    price: "₺2.000+ /ay (proje bazlı)",
    strengths: ["Moda / perakende dikeyinde güçlü", "Mağaza POS olgun", "Kurumsal referanslar"],
    weaknesses: ["Genel KOBİ için ağır / pahalı", "Hızlı kuruluma uygun değil", "Self-servis SaaS değil", "Pazaryeri / B2B modülleri ayrı maliyet"],
  },
] as const;

const differentiators = [
  { icon: Boxes, title: "Tek platform, tek fatura", desc: "Stok, barkod, satış, e-fatura, pazaryeri, B2B, finans, kâr — hepsi bir yerde. Eklenti yok, sürpriz yok." },
  { icon: Store, title: "11 pazaryeri yerleşik", desc: "Trendyol, Hepsiburada, N11, Amazon, Çiçeksepeti, PTT AVM, Shopify, WooCommerce, İdeaSoft, Ticimax — tek yerden senkron." },
  { icon: Receipt, title: "Fiş OCR (yapay zeka)", desc: "Fişin fotoğrafını çek — tutar, KDV, satıcı, fatura no otomatik girilsin. Defter dolduran rakip tek." },
  { icon: BarChart3, title: "Net Kâr Merkezi", desc: "Ciro – COGS – gider – maaş – amortisman = net kâr. Anlık. Şubeye göre. Aya göre." },
  { icon: Smartphone, title: "Mobil-doğal", desc: "iOS + Android uygulamamız her abonelikte dahil. Çırak da depocu da telefondan satar / sayar." },
  { icon: ScanLine, title: "Barkod / POS akışı KOBİ için", desc: "Bir tarama → satışa dönüştür, stok düşsün, e-fatura kesilsin. 30 saniye. Bizim Hesap / Paraşüt'te yok." },
  { icon: Cloud, title: "Sağlayıcı bağımsız e-Fatura", desc: "Paraşüt, QNB, Foriba, Logo, Mikro — istediğin sağlayıcıyı bağla. Kilit altında değilsin." },
  { icon: Zap, title: "Sıfır kurulum, dakikalarda canlı", desc: "Subdomain'ini al, ekibini davet et, satışa başla. Bayi / danışmanlık dayatması yok." },
  { icon: ShieldCheck, title: "Çok kiracılı izolasyon", desc: "Her firmanın verisi ayrı kiracıda. Bankacılık seviyesi izolasyon, GDPR / KVKK uyumlu mimari." },
];

export default function KarsilastirPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20" data-testid="page-karsilastir">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">S</div>
            <span className="font-bold text-lg">SMSYSTEMS</span>
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">Karşılaştırma</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="btn-login">Giriş Yap</Button>
            </Link>
            <Link href="/login">
              <Button size="sm" data-testid="btn-cta-trial">14 gün ücretsiz</Button>
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
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 max-w-4xl mx-auto">
          Bizim Hesap, Paraşüt, Logo İşbaşı,<br />
          Mikro Jump, Nebim'den <span className="text-primary">neden farklıyız?</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Çoğu rakip ya sadece <strong>ön muhasebe</strong>, ya sadece <strong>perakende</strong>.
          SMSYSTEMS; satış, stok, e-fatura, pazaryeri ve net kâr — hepsini tek yerden, tek fiyata sunar.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login">
            <Button size="lg" className="gap-2" data-testid="btn-hero-trial">
              Hemen başla — 14 gün ücretsiz
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
        <h2 className="text-3xl font-bold text-center mb-12">9 sebepte SMSYSTEMS farkı</h2>
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

      {/* COMPARISON TABLE */}
      <section id="tablo" className="container mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">Birebir özellik karşılaştırması</h2>
          <p className="text-muted-foreground">Yeşil tik tam destek, sarı çizgi sınırlı / eklenti, kırmızı çarpı yok demektir.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border-2 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-semibold min-w-[280px]">Özellik</th>
                <th className="p-4 font-bold text-primary bg-primary/5">SMSYSTEMS</th>
                <th className="p-4 font-medium">Bizim Hesap</th>
                <th className="p-4 font-medium">Paraşüt</th>
                <th className="p-4 font-medium">Logo İşbaşı</th>
                <th className="p-4 font-medium">Mikro Jump</th>
                <th className="p-4 font-medium">Nebim SMB</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr key={i} className="border-t hover:bg-muted/20" data-testid={`row-${i}`}>
                  <td className="p-4">
                    <div>{f.name}</div>
                    {f.note && <div className="text-xs text-muted-foreground mt-0.5">{f.note}</div>}
                  </td>
                  <td className="p-4 text-center bg-primary/5"><CellIcon v={f.smsystems} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.bizim} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.parasut} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.logo} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.mikro} /></td>
                  <td className="p-4 text-center"><CellIcon v={f.nebim} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* COMPETITOR DEEP-DIVE */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-3">Rakipler — güçlü ve eksik yönler</h2>
        <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
          Hangi alternatife baktıysan, SMSYSTEMS'in onu nerede tamamladığını görüyorsun.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {competitors.map((c) => (
            <Card key={c.key} className="flex flex-col" data-testid={`competitor-${c.key}`}>
              <CardHeader>
                <CardTitle>{c.name}</CardTitle>
                <div className="text-sm text-muted-foreground mt-1">{c.pkg}</div>
                <div className="font-bold text-lg mt-2 text-primary">{c.price}</div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase text-emerald-600 mb-2">Güçlü yönleri</div>
                  <ul className="text-sm space-y-1.5">
                    {c.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-red-500 mb-2">Eksikleri</div>
                  <ul className="text-sm space-y-1.5">
                    {c.weaknesses.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
          {/* SMSYSTEMS card */}
          <Card className="flex flex-col border-2 border-primary bg-primary/5 lg:col-span-1" data-testid="competitor-smsystems">
            <CardHeader>
              <Badge className="w-fit mb-2">Bizim cevabımız</Badge>
              <CardTitle className="text-primary">SMSYSTEMS</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">Tek paket, tüm modüller dahil</div>
              <div className="font-bold text-lg mt-2 text-primary">14 gün ücretsiz, sonra ₺499/ay'dan</div>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div>
                <div className="text-xs font-bold uppercase text-emerald-600 mb-2">Hepsi dahil</div>
                <ul className="text-sm space-y-1.5">
                  {[
                    "Stok + barkod + POS",
                    "e-Fatura (5 sağlayıcıdan seç)",
                    "11 pazaryeri sync",
                    "Net Kâr + Fiş OCR",
                    "Mobil uygulama dahil",
                    "Çok şubeli, çok firmalı",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="font-medium">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/login">
                <Button className="w-full mt-4" data-testid="btn-card-cta">14 gün ücretsiz başla</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* POSITIONING STATEMENT */}
      <section className="container mx-auto px-4 py-16">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/20">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-4">Bizim konumlandırma cümlemiz</h2>
            <p className="text-lg md:text-2xl text-muted-foreground italic max-w-3xl mx-auto leading-relaxed">
              "Paraşüt'ün <strong>ön muhasebesi</strong>, Mikro'nun <strong>perakende derinliği</strong>,
              Logo'nun <strong>resmi raporları</strong>, Nebim'in <strong>POS olgunluğu</strong> —
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
        <h2 className="text-3xl md:text-5xl font-bold mb-6">Karar vermeden önce dene.</h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Kredi kartı istemiyoruz. 14 gün boyunca tüm modüller açık.
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
        © {new Date().getFullYear()} SMSYSTEMS · Türkiye'nin tek panelli KOBİ işletim sistemi
      </footer>
    </div>
  );
}
