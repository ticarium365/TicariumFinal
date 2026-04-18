import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Radio, Package, Tag, Truck, Store, Megaphone, ShoppingBag, BarChart3,
  ArrowRight, Sparkles, Globe, Layers,
} from "lucide-react";

type ModuleStatus = "live" | "soon";

const tabs: Array<{ key: string; label: string; icon: any }> = [
  { key: "overview", label: "Genel Bakış", icon: Sparkles },
  { key: "channels", label: "Kanallar", icon: Radio },
  { key: "listings", label: "Ürünler", icon: Package },
  { key: "pricing", label: "Fiyat Kuralları", icon: Tag },
  { key: "shipping", label: "Kargo Kuralları", icon: Truck },
  { key: "storefront", label: "Hazır Mağaza", icon: Store },
  { key: "ads", label: "Reklam Bütçesi", icon: Megaphone },
  { key: "orders", label: "Siparişler", icon: ShoppingBag },
  { key: "analytics", label: "Karlılık & Analiz", icon: BarChart3 },
];

const moduleCards: Array<{
  key: string;
  title: string;
  desc: string;
  icon: any;
  status: ModuleStatus;
  href?: string;
}> = [
  {
    key: "channels",
    title: "Satış Kanalları",
    desc: "Trendyol, Hepsiburada, N11, Shopify, WooCommerce ve hazır mağaza bağlantılarını yönet.",
    icon: Radio,
    status: "live",
    href: "/channels",
  },
  {
    key: "marketplace",
    title: "Pazaryeri Yayını",
    desc: "Ürünleri pazaryerlerine yayınla, senkronizasyon durumunu izle.",
    icon: Globe,
    status: "live",
    href: "/marketplace",
  },
  {
    key: "orders",
    title: "Sipariş Merkezi",
    desc: "Tüm kanallardan gelen siparişleri tek ekranda topla, kargo durumunu güncelle.",
    icon: ShoppingBag,
    status: "live",
    href: "/b2b/orders",
  },
  {
    key: "campaigns",
    title: "Kampanyalar",
    desc: "Kanal bazlı indirim, kupon ve ücretsiz kargo kampanyalarını planla.",
    icon: Tag,
    status: "live",
    href: "/campaigns",
  },
  {
    key: "pricing",
    title: "Fiyat Motoru",
    desc: "Kanal bazlı +%, sabit TL, yuvarlama, min/max limit. Önce taslak, sonra toplu uygula.",
    icon: Tag,
    status: "live",
    href: "/fiyat-motoru",
  },
  {
    key: "shipping",
    title: "Kargo Yönetimi",
    desc: "Bölge + desi bazlı kargo, ücretsiz kargo eşiği, ürün bazlı override.",
    icon: Truck,
    status: "live",
    href: "/kargo",
  },
  {
    key: "storefront",
    title: "Hazır Mağaza & Müşteri Sitesi",
    desc: "firmaadi.ticarium365.shop hazır mağaza, kendi sitenize embed widget ya da merkezi Ticarium Pazar.",
    icon: Store,
    status: "live",
    href: "/magaza",
  },
  {
    key: "ads",
    title: "Reklam Bütçesi Merkezi",
    desc: "Meta, Google ve pazaryeri sponsorlu reklamlar için bütçe & ROAS takibi. (Yakında)",
    icon: Megaphone,
    status: "soon",
  },
  {
    key: "analytics",
    title: "Karlılık Analizi",
    desc: "Komisyon, kargo, reklam sonrası net kâr ve kanal karşılaştırması. (Yakında)",
    icon: BarChart3,
    status: "soon",
  },
];

const NAVY = "hsl(222 47% 15%)";
const EMERALD = "hsl(152 76% 45%)";

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Layers className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{desc}</p>
        <Badge variant="secondary" className="mt-4">Yakında</Badge>
      </CardContent>
    </Card>
  );
}

export default function ETicariumMerkeziPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState("overview");
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "staff";

  return (
    <div className="container mx-auto px-4 py-6 space-y-6" data-testid="eticarium-merkezi">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 md:p-8 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, hsl(222 47% 22%) 100%)` }}
      >
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: `${EMERALD}33` }} />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium opacity-80 mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              Çok kanallı ticaret merkezi
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              e-Ticarium <span style={{ color: EMERALD }}>Merkezi</span>
            </h1>
            <p className="mt-2 text-sm md:text-base opacity-85 max-w-2xl">
              Tüm satış kanallarını, mağazalarını, fiyat ve kargo kurallarını tek panelden yönet.
              Ürünleri seç, kanala gönder, kâra geç.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setLocation("/channels")} data-testid="hub-cta-channels">
                <Radio className="h-4 w-4 mr-1.5" />
                Kanalları Aç
              </Button>
              <Button size="sm" onClick={() => setLocation("/marketplace")} data-testid="hub-cta-marketplace" style={{ background: EMERALD, color: NAVY }}>
                <Globe className="h-4 w-4 mr-1.5" />
                Pazaryeri Yayını
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto justify-start gap-1 bg-muted/40 p-1">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5"
              data-testid={`hub-tab-${t.key}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Genel Bakış */}
        <TabsContent value="overview" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {moduleCards.map((m) => (
              <Card key={m.key} className={m.status === "soon" ? "opacity-90" : "hover:shadow-md transition-shadow"}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ background: m.status === "live" ? `${EMERALD}1a` : "hsl(216 33% 95%)" }}
                    >
                      <m.icon className="h-5 w-5" style={{ color: m.status === "live" ? EMERALD : "hsl(222 47% 35%)" }} />
                    </div>
                    {m.status === "soon" ? (
                      <Badge variant="secondary">Yakında</Badge>
                    ) : (
                      <Badge style={{ background: `${EMERALD}26`, color: NAVY }}>Aktif</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-3">{m.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground min-h-[3rem]">{m.desc}</p>
                  {m.status === "live" && m.href && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 px-0 h-auto font-medium"
                      onClick={() => setLocation(m.href!)}
                      data-testid={`hub-card-${m.key}`}
                    >
                      Aç
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="channels" className="mt-6">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <Radio className="h-10 w-10 mx-auto" style={{ color: EMERALD }} />
              <h3 className="font-semibold text-lg">Satış Kanalları</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Trendyol, Hepsiburada, N11, Shopify ve diğer kanal bağlantılarını yönet.
              </p>
              <Button onClick={() => setLocation("/channels")}>Kanal Listesini Aç</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listings" className="mt-6">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <Package className="h-10 w-10 mx-auto" style={{ color: EMERALD }} />
              <h3 className="font-semibold text-lg">Ürün Yayınlama Merkezi</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Ürünleri seçerek hangi kanala çıkacağını belirle. Pazaryeri yayın listesi:
              </p>
              <Button onClick={() => setLocation("/marketplace")}>Pazaryeri Yayınını Aç</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="mt-6">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <Tag className="h-10 w-10 mx-auto" style={{ color: EMERALD }} />
              <h3 className="font-semibold text-lg">Fiyat Motoru</h3>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                Kanal bazlı kural setleri ile fiyatlarınızı tek tıkla yönetin. Markup %, sabit TL,
                maliyet+%, indirim, yuvarlama (.99 / .95), min/max limit. Önce taslak çalıştırıp
                etkiyi görebilirsiniz.
              </p>
              <Button onClick={() => setLocation("/fiyat-motoru")} style={{ background: EMERALD }}>
                Kuralları Yönet <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shipping" className="mt-6">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <Truck className="h-10 w-10 mx-auto" style={{ color: EMERALD }} />
              <h3 className="font-semibold text-lg">Kargo Yönetim Merkezi</h3>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                81 ili bölgelere ayırın, desi aralığı + bölge başına kargo bedeli belirleyin.
                Sepet ≥ X TL üstü ücretsiz kargo, ürün bazlı override desteklenir. Test sekmesinde anlık fiyat sorgulayın.
              </p>
              <Button onClick={() => setLocation("/kargo")} style={{ background: EMERALD }}>
                Kargo Kurallarını Yönet <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storefront" className="mt-6">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <Store className="h-10 w-10 mx-auto" style={{ color: EMERALD }} />
              <h3 className="font-semibold text-lg">Hazır Mağaza & Müşteri Sitesi</h3>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                Üç farklı tipte mağaza: <b>firmaadi.ticarium365.shop</b> hazır mağaza,
                müşterinizin kendi web sitesine <b>embed widget</b> veya merkezi
                <b> Ticarium Pazar</b> (yakında) e-ticaret sitemize çıkış. Ödeme modeli
                anlaşmaya göre — ya biz tahsil ederiz ya da işletmenin POS'una yönlendiririz.
              </p>
              <Button onClick={() => setLocation("/magaza")} style={{ background: EMERALD }}>
                Mağazalarımı Yönet <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads" className="mt-6">
          <ComingSoon
            title="Reklam Bütçesi Merkezi"
            desc="Meta Ads, Google Ads ve pazaryeri sponsorlu reklamlar için bütçe planlama, ROAS ve dönüşüm takibi yakında."
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <ShoppingBag className="h-10 w-10 mx-auto" style={{ color: EMERALD }} />
              <h3 className="font-semibold text-lg">Sipariş Merkezi</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Tüm kanallardan gelen siparişleri tek listede gör.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" onClick={() => setLocation("/b2b/orders")}>B2B Siparişler</Button>
                <Button onClick={() => setLocation("/sales/history")}>Satış Geçmişi</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <ComingSoon
            title="Karlılık & Performans"
            desc="Kanal bazlı net kâr, komisyon-kargo-reklam sonrası kâr karşılaştırması yakında. Mevcut Gerçek Kâr modülü ile entegre olacak."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
