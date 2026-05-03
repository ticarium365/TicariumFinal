import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-context";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radio, Package, Tag, Truck, Store, Megaphone, ShoppingBag, BarChart3,
  ArrowRight, Sparkles, Globe, Layers, Check, Zap, Brain, Share2, Wallet,
  CreditCard, ShieldCheck, TrendingDown, Building2, Rocket, LineChart,
  Inbox, Clock, FileText, TrendingUp,
} from "lucide-react";

type Overview = {
  kpis: { yayindakiUrun: number; bugunGelenTalep: number; buAySatis: number; bekleyenTeklif: number };
  kanallar: {
    pazaryeri: { aktifSayisi: number; toplamSayi: number; urunSayisi: number; sonSenkron: string | null };
    webSitem: { aktifSayisi: number; toplamSayi: number; urunSayisi: number };
    ortakVitrin: { aktifSayisi: number; toplamSayi: number; urunSayisi: number };
  };
  siparisler: { bekleyen: number };
};

const TRY = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);

const NAVY = "hsl(222 47% 15%)";
const EMERALD = "hsl(152 76% 45%)";

type Service = {
  key: string;
  badge: string;
  badgeColor: string;
  title: string;
  highlight: string;
  desc: string;
  icon: any;
  features: Array<{ icon: any; text: string }>;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  accent: string;
};

const services: Service[] = [
  {
    key: "marketplaces",
    badge: "Hizmet 1",
    badgeColor: "hsl(217 91% 60%)",
    title: "Pazaryeri Entegrasyonları",
    highlight: "Sipariş ve stok için tek operasyon paneli.",
    desc:
      "Desteklenen pazaryeri hesaplarınızı bağlayıp ürün, sipariş ve stok akışını buradan yönetirsiniz. Hangi platformların hesabınızda açık olduğu Ayarlar → Entegrasyonlar ve paket kapsamınıza bağlıdır; canlı öncesi mutlaka bağlantı durumunu kontrol edin.",
    icon: Globe,
    accent: "hsl(217 91% 60%)",
    features: [
      { icon: Layers, text: "Tüm pazaryerlerine tek tıkla toplu ürün yayınlama ve kategori eşleştirme" },
      { icon: Tag, text: "Toplu fiyat ve stok güncelleme; kanal bazlı farklı fiyat kuralları" },
      { icon: LineChart, text: "Rakip fiyat takibi ve detaylı satış / ciro analiz raporları" },
      { icon: Megaphone, text: "Tüm kanallarda eş zamanlı kampanya, indirim ve kupon tanımlama" },
      { icon: Zap, text: "Stok azalması, fiyat sapması ve sipariş durumlarına özel uyarı sistemi" },
      { icon: Truck, text: "Kargo ayarları ve gönderi akışı (taşıyıcı entegrasyonunun hazır olmasına bağlı)" },
    ],
    primaryCta: { label: "Pazaryeri Yayınını Aç", href: "/marketplace" },
    secondaryCta: { label: "Kanal Bağlantıları", href: "/channels" },
  },
  {
    key: "storefront",
    badge: "Hizmet 2",
    badgeColor: "hsl(280 70% 55%)",
    title: "Kendi E-Ticaret Siteniz",
    highlight: "Markanız önde, operasyon tek yerde.",
    desc:
      "Hazır mağaza şablonları ve kanal ayarlarıyla vitrininizi açar; stok, fiyat ve sipariş bilgisini merkezdeki kayıtlarla eşlersiniz. Tahsilat ve POS seçenekleri paketinize ve ödeme sağlayıcısı bağlantılarınıza göre değişir. Reklam ve dönüşüm ölçümü için entegrasyonlar yol haritasında; canlı önce destekten teyit alın.",
    icon: Store,
    accent: "hsl(280 70% 55%)",
    features: [
      { icon: Globe, text: "firmaadi.ticarium365.shop veya tamamen size özel alan adı" },
      { icon: Package, text: "Stok, fiyat, kargo ve sipariş tek bir altyapıda entegre çalışır" },
      { icon: CreditCard, text: "Bizim sanal POS'umuz ya da kendi banka POS'unuzla tahsilat" },
      { icon: Brain, text: "Google / Meta piksel ve kampanya bağlantıları (hesabınıza göre, yol haritası)" },
      { icon: ShieldCheck, text: "Barındırma ve güvenlik katmanı ürün politikasına göre sağlanır" },
      { icon: Share2, text: "Sosyal medya paylaşım altyapısı hazır (hesap yönetim hizmeti sunulmaz)" },
    ],
    primaryCta: { label: "Mağazamı Kur", href: "/magaza" },
    secondaryCta: { label: "Reklam Bütçesi Tanımla", href: "/reklam-butce" },
  },
  {
    key: "ticarium-pazar",
    badge: "Pilot / yol haritası",
    badgeColor: "hsl(38 92% 50%)",
    title: "Sektörel vitrin (Ticarium Pazar)",
    highlight: "Tüm hesaplarda canlı satış vaadi yoktur; kapsam satış ekibiyle netleşir.",
    desc:
      "Sektörel vitrin ve ortak keşif kanalı fikri uzun vadeli ürün yönümüzdür. Bugün öncelik: mevcut pazaryeri ve kendi mağazanızdan gelen siparişleri tek stok ve fiyat mantığıyla yönetmek. Bu blokta anlatılan bazı deneyimler henüz üretimde tamamlanmamış veya sınırlı pilot olabilir; yatırım kararı vermeden önce ürün ekibinden güncel durum isteyin.",
    icon: Building2,
    accent: EMERALD,
    features: [
      { icon: Layers, text: "Sektöre göre vitrin ayrımı (tasarım hedefi)" },
      { icon: TrendingDown, text: "Komisyon ve ücret politikası şeffaflığı hedeflenir" },
      { icon: Brain, text: "Ürün eşleştirme ve fiyat önerileri (geliştirme aşamasında olabilir)" },
      { icon: Rocket, text: "Ortak pazarlama bütçesi modeli değerlendirme aşamasında" },
      { icon: Truck, text: "Kargo tarafında taşıyıcı anlaşmaları ayrı sözleşmeye tabidir" },
      { icon: ShoppingBag, text: "Çok satıcılı sepet deneyimi pilotlarda sınırlı olabilir" },
    ],
    primaryCta: { label: "Karlılık Analizini Aç", href: "/karlilik-kanal" },
    secondaryCta: { label: "Komisyon Karşılaştırması", href: "/karlilik-kanal" },
  },
];

const supportingModules = [
  { key: "channels", title: "Satış Kanalları", icon: Radio, href: "/channels" },
  { key: "marketplace", title: "Pazaryeri Yayını", icon: Globe, href: "/marketplace" },
  { key: "pricing", title: "Fiyat Motoru", icon: Tag, href: "/fiyat-motoru" },
  { key: "campaigns", title: "Kampanyalar", icon: Megaphone, href: "/campaigns" },
  { key: "shipping", title: "Kargo Yönetimi", icon: Truck, href: "/kargo" },
  { key: "stores", title: "Mağazalarım", icon: Store, href: "/magaza" },
  { key: "orders", title: "Sipariş Merkezi", icon: ShoppingBag, href: "/b2b/orders" },
  { key: "analytics", title: "Karlılık Analizi", icon: BarChart3, href: "/karlilik-kanal" },
];

function ServiceSection({ service }: { service: Service }) {
  const [, setLocation] = useLocation();
  const Icon = service.icon;

  return (
    <Card className="overflow-hidden border-2" style={{ borderColor: `${service.accent}33` }}>
      <div
        className="p-6 md:p-7 relative"
        style={{ background: `linear-gradient(135deg, ${service.accent}10 0%, transparent 60%)` }}
      >
        <div className="flex flex-col md:flex-row md:items-start gap-5">
          {/* İkon kutusu */}
          <div
            className="h-16 w-16 shrink-0 rounded-2xl flex items-center justify-center shadow-md"
            style={{ background: service.accent }}
          >
            <Icon className="h-8 w-8 text-white" />
          </div>

          {/* Başlık + açıklama */}
          <div className="flex-1 min-w-0">
            <Badge
              className="mb-2 text-white border-0"
              style={{ background: service.badgeColor }}
            >
              {service.badge}
            </Badge>
            <h2
              className="text-xl md:text-2xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)", color: NAVY }}
            >
              {service.title}
            </h2>
            <p className="mt-1 text-sm md:text-base font-semibold" style={{ color: service.accent }}>
              {service.highlight}
            </p>
            <p className="mt-3 text-sm md:text-[15px] text-muted-foreground leading-relaxed">
              {service.desc}
            </p>
          </div>
        </div>

        {/* Özellik listesi */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {service.features.map((f, i) => {
            const FIcon = f.icon;
            return (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: `${service.accent}1f` }}
                >
                  <FIcon className="h-3.5 w-3.5" style={{ color: service.accent }} />
                </div>
                <span className="text-sm text-foreground/90 leading-snug">{f.text}</span>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={() => setLocation(service.primaryCta.href)}
            className="text-white shadow-sm hover:opacity-95"
            style={{ background: service.accent }}
            data-testid={`service-cta-${service.key}`}
          >
            {service.primaryCta.label}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
          {service.secondaryCta && (
            <Button
              variant="outline"
              onClick={() => setLocation(service.secondaryCta!.href)}
              data-testid={`service-cta-secondary-${service.key}`}
            >
              {service.secondaryCta.label}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function KpiCard({ icon: Icon, label, value, color, href, testId }: { icon: any; label: string; value: string; color: string; href?: string; testId: string }) {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => href && setLocation(href)}
      className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-slate-300 hover:shadow-md"
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        {href && <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-slate-600" />}
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </button>
  );
}

function ChannelCard({ icon: Icon, title, subtitle, urunSayisi, aktif, toplam, ctaLabel, ctaHref, color, testId }: {
  icon: any; title: string; subtitle: string; urunSayisi: number; aktif: number; toplam: number; ctaLabel: string; ctaHref: string; color: string; testId: string;
}) {
  const [, setLocation] = useLocation();
  const isLive = aktif > 0;
  return (
    <Card className="overflow-hidden border-slate-200 transition-shadow hover:shadow-md" data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-slate-900">{title}</div>
              <div className="text-xs text-slate-500">{subtitle}</div>
            </div>
          </div>
          <Badge variant={isLive ? "default" : "outline"} className={isLive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "text-slate-500"}>
            {isLive ? "Aktif" : "Bağlı değil"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Yayında Ürün</div>
            <div className="text-lg font-semibold text-slate-900">{urunSayisi}</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Bağlı Hesap</div>
            <div className="text-lg font-semibold text-slate-900">{aktif}<span className="text-sm font-normal text-slate-400">/{toplam}</span></div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => setLocation(ctaHref)} data-testid={`${testId}-cta`}>
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ETicariumMerkeziPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "staff";

  const { data: overview } = useQuery<Overview>({
    queryKey: ["ticarium-center-overview"],
    queryFn: async () => {
      const r = await fetch("/api/ticarium-center/overview", { credentials: "include" });
      if (!r.ok) throw new Error("overview failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <OnlineSalesFeatureGate>
    <div className="container mx-auto px-4 py-6 space-y-6" data-testid="eticarium-merkezi">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 md:p-9 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, hsl(222 47% 22%) 100%)` }}
      >
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: `${EMERALD}33` }} />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(217 91% 60% / 0.18)" }} />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-medium opacity-80 mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              Online satış özeti
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Online <span style={{ color: EMERALD }}>Satış Merkezi</span>
            </h1>
            <p className="mt-3 text-sm md:text-base opacity-90 leading-relaxed">
              Pazaryeri siparişleri, hazır mağaza vitrininiz ve B2B vitrin ayarlarına buradan geçin.
              Stok ve fiyat tek merkezde tutulur; hangi kanalın ne kadar katkı verdiğini ilgili raporlardan izlersiniz.
              Aşağıdaki üç blokta anlatılan bazı özellikler paket ve entegrasyon durumunuza göre değişir; emin olmadığınız noktada destek ekibine yazın.
            </p>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => setLocation("/channels")}
                variant="secondary"
                data-testid="hub-cta-channels"
              >
                <Radio className="h-4 w-4 mr-1.5" />
                Kanallarımı Aç
              </Button>
              <Button
                size="sm"
                onClick={() => setLocation("/karlilik-kanal")}
                style={{ background: EMERALD, color: NAVY }}
                data-testid="hub-cta-analytics"
              >
                <BarChart3 className="h-4 w-4 mr-1.5" />
                Karlılığa Bak
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Üç hizmet bölümü (3. blok pilot / yol haritası içerebilir) */}
      <div className="space-y-5">
        {services.map((s) => (
          <ServiceSection key={s.key} service={s} />
        ))}
      </div>

      {/* Karşılaştırma şeridi */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-5 md:p-6">
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4" style={{ color: EMERALD }} />
            Tek stok, çok kanal
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: EMERALD }} />
              <span><strong>Tek stok kaynağı</strong> — bağladığınız pazaryeri ve mağaza kanalları aynı ürün kartından beslenir.</span>
            </div>
            <div className="flex gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: EMERALD }} />
              <span><strong>Tek fiyat motoru</strong> — kanal başına farklı kâr marjı ve kural seti tanımlanabilir.</span>
            </div>
            <div className="flex gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: EMERALD }} />
              <span><strong>Birleşik karlılık raporu</strong> — komisyon ve kargo düşülmüş net kâr karşılaştırması.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hızlı erişim modülleri */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base">Hızlı Erişim — Tüm Modüller</h3>
            <span className="text-xs text-muted-foreground">Tek tıkla operasyona</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {supportingModules.map((m) => {
              const MIcon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => setLocation(m.href)}
                  className="group flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
                  data-testid={`module-${m.key}`}
                >
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: `${EMERALD}14` }}
                  >
                    <MIcon className="h-4 w-4" style={{ color: EMERALD }} />
                  </div>
                  <span className="text-[11px] font-medium text-center text-foreground/80 group-hover:text-foreground leading-tight">
                    {m.title}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
    </OnlineSalesFeatureGate>
  );
}
