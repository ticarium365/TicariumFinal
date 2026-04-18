import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radio, Package, Tag, Truck, Store, Megaphone, ShoppingBag, BarChart3,
  ArrowRight, Sparkles, Globe, Layers, Check, Zap, Brain, Share2, Wallet,
  CreditCard, ShieldCheck, TrendingDown, Building2, Rocket, LineChart,
} from "lucide-react";

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
    highlight: "Türkiye'nin büyük pazaryerlerinde tek panelden satış yönetimi",
    desc:
      "Trendyol, Hepsiburada, N11, Amazon ve diğer pazaryerlerinde satış yapan işletmeler için kurgulandı. Tek bir ekrandan tüm kanallara aynı anda ürün açabilir, fiyatlarınızı ve stok seviyelerinizi anlık olarak güncelleyebilir, kanaldan kanala farklı stratejiler uygulayabilirsiniz. Ürün, sipariş ve fiyat hareketlerini izlemek için kapsamlı bir alarm ve raporlama altyapısı kuruldu; böylece kritik değişiklikleri kaçırmazsınız. Anlaşmalı olduğumuz kargo firmaları sayesinde ise tek başınıza alamayacağınız tarifeleri kullanma fırsatı yakalarsınız.",
    icon: Globe,
    accent: "hsl(217 91% 60%)",
    features: [
      { icon: Layers, text: "Tüm pazaryerlerine tek tıkla toplu ürün yayınlama ve kategori eşleştirme" },
      { icon: Tag, text: "Toplu fiyat ve stok güncelleme; kanal bazlı farklı fiyat kuralları" },
      { icon: LineChart, text: "Rakip fiyat takibi ve detaylı satış / ciro analiz raporları" },
      { icon: Megaphone, text: "Tüm kanallarda eş zamanlı kampanya, indirim ve kupon tanımlama" },
      { icon: Zap, text: "Stok azalması, fiyat sapması ve sipariş durumlarına özel uyarı sistemi" },
      { icon: Truck, text: "Yurtiçi, Aras, MNG ve PTT için merkezi anlaşmalı avantajlı kargo tarifeleri" },
    ],
    primaryCta: { label: "Pazaryeri Yayınını Aç", href: "/marketplace" },
    secondaryCta: { label: "Kanal Bağlantıları", href: "/channels" },
  },
  {
    key: "storefront",
    badge: "Hizmet 2",
    badgeColor: "hsl(280 70% 55%)",
    title: "Kendi E-Ticaret Siteniz",
    highlight: "Kendi markanızla, kendi alan adınızda; profesyonel altyapı bizden",
    desc:
      "İster kendi web siteniz olsun, ister sizin için sıfırdan tasarladığımız bir site; her durumda Ticarium365'in tüm e-ticaret fonksiyonları arka planda çalışır. Stok, fiyat, kargo ve sipariş yönetimi kesintisiz şekilde ilerler; siteniz kullanıcılarınıza her gün düzenli olarak hizmet verir. Tahsilatta esneklik tanır; bizim sanal POS altyapımızı tercih edebilir veya kendi banka POS'unuzu sisteme tanımlayabilirsiniz. Reklam tarafında ise opsiyonel bir hizmet sunuyoruz: bütçe ayırmayı tercih ederseniz Google ve Meta reklamlarınızı yapay zeka destekli pazarlama ekibimiz yönetir. Sosyal medya hesabı yönetmiyoruz; ancak içerik paylaşımı ve site bağlantısı için gereken altyapıyı hazır hale getiriyoruz.",
    icon: Store,
    accent: "hsl(280 70% 55%)",
    features: [
      { icon: Globe, text: "firmaadi.ticarium365.shop veya tamamen size özel alan adı" },
      { icon: Package, text: "Stok, fiyat, kargo ve sipariş tek bir altyapıda entegre çalışır" },
      { icon: CreditCard, text: "Bizim sanal POS'umuz ya da kendi banka POS'unuzla tahsilat" },
      { icon: Brain, text: "İsteğe bağlı Google ve Meta reklam yönetimi: yapay zeka + uzman pazarlama ekibi" },
      { icon: ShieldCheck, text: "SSL sertifikası, sunucu, bakım ve güncellemeler tarafımızdan karşılanır" },
      { icon: Share2, text: "Sosyal medya paylaşım altyapısı hazır (hesap yönetim hizmeti sunulmaz)" },
    ],
    primaryCta: { label: "Mağazamı Kur", href: "/magaza" },
    secondaryCta: { label: "Reklam Bütçesi Tanımla", href: "/reklam-butce" },
  },
  {
    key: "ticarium-pazar",
    badge: "Hizmet 3 — En Önemlisi",
    badgeColor: EMERALD,
    title: "Ticarium Pazar — Sektörel Pazaryerimiz",
    highlight: "Bizim kurduğumuz pazaryerine ürünleriniz doğrudan akar; rekabet sizin için çalışır",
    desc:
      "En büyük yatırımımız olan Ticarium Pazar, sektörel olarak ayrıştırılmış e-ticaret sitelerinden oluşur. Aynı sitede otomotiv yedek parçası ile hırdavat satılmaz; her sektör kendi vitriniyle, kendi müşteri kitlesiyle buluşur. Ticarium365'te tanımlı ürünleriniz hiçbir ek işlem yapmanıza gerek kalmadan ilgili sektörel pazaryerine aktarılır. Bir müşteri arama yaptığında sistem; fiyat, stok durumu ve teslim süresini değerlendirerek en uygun ürünü öne çıkarır. Bu yapı satıcılar arasında gerçek anlamda sağlıklı bir fiyat rekabeti yaratır ve kazanma şansını yalnızca büyük markalara değil, doğru fiyatlandıran herkese verir. Reklam ve pazarlama operasyonu da tek tek satıcılara değil, tüm pazaryeri ekosistemine yönelik yürütülür; yani trafik ve görünürlük ortak çabayla büyür.",
    icon: Building2,
    accent: EMERALD,
    features: [
      { icon: Layers, text: "Sektörel ayrıştırma: her pazaryeri kendi alanında uzmanlaşır" },
      { icon: TrendingDown, text: "Sabit ve şeffaf komisyon oranı; gizli ücret yoktur" },
      { icon: Brain, text: "Yapay zeka destekli ürün eşleştirme ve fiyat rekabeti motoru" },
      { icon: Rocket, text: "Tüm satıcıların yararlandığı merkezi Google ve Meta reklam yatırımı" },
      { icon: Truck, text: "Merkezi kargo anlaşmaları sayesinde küçük satıcı da büyük indirimden yararlanır" },
      { icon: ShoppingBag, text: "Müşteri tek sepette farklı satıcılardan alışveriş yapabilir" },
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

export default function ETicariumMerkeziPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "staff";

  return (
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
              e-Ticaret Çözüm Merkezi
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              e-Ticarium <span style={{ color: EMERALD }}>Merkezi</span>
            </h1>
            <p className="mt-3 text-sm md:text-base opacity-90 leading-relaxed">
              Üç güçlü hizmet, tek altyapı. İster mevcut pazaryerlerinde büyüyün,
              ister kendi markanızla bağımsız e-ticaret sitenizi açın, isterseniz
              <strong className="font-semibold" style={{ color: EMERALD }}> Ticarium Pazar</strong>'da bizim
              kurduğumuz sektörel pazaryerine doğrudan akın. Tüm fonksiyonlar — stok, fiyat,
              kargo, sipariş, reklam — sorunsuz çalışır.
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

      {/* Üç hizmet bölümü */}
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
            Üç Hizmeti Birlikte Kullanın — Maksimum Erişim
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: EMERALD }} />
              <span><strong>Tek stok havuzu</strong> — pazaryeri, kendi siteniz ve Ticarium Pazar aynı stoktan satar.</span>
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
  );
}
