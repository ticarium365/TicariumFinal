import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-context";
import {
  ShoppingBag, Banknote, FileText, MessageSquare, Mail, Building2,
  Truck, BarChart3, Plug, Search, CheckCircle2, Clock,
} from "lucide-react";

type IntegrationStatus = "connected" | "available" | "coming_soon";
type IntegrationCategory = "marketplace" | "payment" | "einvoice" | "shipping" | "messaging" | "accounting" | "analytics";

interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  baseStatus: "available" | "coming_soon";
  badge?: string;
  /** Backend provider/platform id eşleşmesi — bağlantı durumu DB'den okunuyor */
  backendId?: { kind: "accounting" | "ecommerce"; id: string };
}

const CATEGORIES: Record<IntegrationCategory, { label: string; color: string; tab?: "accounting" | "ecommerce" }> = {
  marketplace: { label: "Pazaryerleri", color: "bg-orange-100 text-orange-800", tab: "ecommerce" },
  payment:     { label: "Ödeme & Banka", color: "bg-emerald-100 text-emerald-800" },
  einvoice:    { label: "e-Fatura / e-Arşiv", color: "bg-blue-100 text-blue-800" },
  shipping:    { label: "Kargo", color: "bg-purple-100 text-purple-800" },
  messaging:   { label: "SMS & E-posta", color: "bg-pink-100 text-pink-800" },
  accounting:  { label: "Muhasebe", color: "bg-amber-100 text-amber-800", tab: "accounting" },
  analytics:   { label: "Analitik", color: "bg-indigo-100 text-indigo-800" },
};

const INTEGRATIONS: Integration[] = [
  // Pazaryerleri  (backend: ecommerce_integrations.platform)
  { id: "trendyol",     name: "Trendyol",      category: "marketplace", description: "Ürün, sipariş ve stok senkronizasyonu", icon: ShoppingBag, baseStatus: "available", backendId: { kind: "ecommerce", id: "trendyol" } },
  { id: "hepsiburada",  name: "Hepsiburada",   category: "marketplace", description: "Listeleme, fiyat ve stok yönetimi",      icon: ShoppingBag, baseStatus: "available", backendId: { kind: "ecommerce", id: "hepsiburada" } },
  { id: "n11",          name: "n11",           category: "marketplace", description: "Otomatik ürün gönderimi ve sipariş çekme", icon: ShoppingBag, baseStatus: "available", backendId: { kind: "ecommerce", id: "n11" } },
  { id: "pazarama",     name: "Pazarama",      category: "marketplace", description: "Pazarama.com pazaryeri",                   icon: ShoppingBag, baseStatus: "available", backendId: { kind: "ecommerce", id: "pazarama" } },
  { id: "shopify",      name: "Shopify",       category: "marketplace", description: "Kendi mağazanız (Shopify)",                icon: ShoppingBag, baseStatus: "available", backendId: { kind: "ecommerce", id: "shopify" } },
  { id: "woocommerce",  name: "WooCommerce",   category: "marketplace", description: "WordPress / WooCommerce mağazası",         icon: ShoppingBag, baseStatus: "available", backendId: { kind: "ecommerce", id: "woocommerce" } },
  { id: "ciceksepeti",  name: "Çiçeksepeti",   category: "marketplace", description: "Pazaryeri entegrasyonu",                   icon: ShoppingBag, baseStatus: "coming_soon" },
  { id: "amazon-tr",    name: "Amazon TR",     category: "marketplace", description: "FBA & FBM siparişleri",                    icon: ShoppingBag, baseStatus: "coming_soon", badge: "Yakında" },
  // Ödeme & Banka
  { id: "iyzico",       name: "iyzico",        category: "payment", description: "Sanal POS ve Pay-with-iyzico",                 icon: Banknote, baseStatus: "coming_soon", badge: "Pilot" },
  { id: "param",        name: "Param",         category: "payment", description: "Sanal POS, taksit ve link ile ödeme",          icon: Banknote, baseStatus: "coming_soon", badge: "Pilot" },
  { id: "garanti-bbva", name: "Garanti BBVA",  category: "payment", description: "Hesap hareketi (Open Banking)",                icon: Building2, baseStatus: "coming_soon", badge: "Pilot" },
  { id: "ziraat",       name: "Ziraat Bankası", category: "payment", description: "Otomatik mutabakat",                           icon: Building2, baseStatus: "coming_soon" },
  // e-Fatura
  { id: "uyumsoft",     name: "Uyumsoft e-Fatura", category: "einvoice", description: "GİB özel entegratör",                     icon: FileText, baseStatus: "coming_soon", badge: "Pilot" },
  { id: "logo-isubesi", name: "Logo İşubesi",  category: "einvoice", description: "e-Fatura/e-Arşiv portal entegrasyonu",        icon: FileText, baseStatus: "coming_soon", badge: "Pilot" },
  { id: "qnb-efinans",  name: "QNB eFinans",   category: "einvoice", description: "Özel entegratör",                              icon: FileText, baseStatus: "coming_soon" },
  // Kargo
  { id: "yurtici",      name: "Yurtiçi Kargo", category: "shipping", description: "Otomatik etiket ve takip",                    icon: Truck, baseStatus: "coming_soon" },
  { id: "aras",         name: "Aras Kargo",    category: "shipping", description: "Etiket, takip ve teslim bildirimi",           icon: Truck, baseStatus: "coming_soon" },
  { id: "mng",          name: "MNG Kargo",     category: "shipping", description: "Sipariş takibi",                              icon: Truck, baseStatus: "coming_soon" },
  { id: "ptt",          name: "PTT Kargo",     category: "shipping", description: "Otomatik gönderim",                           icon: Truck, baseStatus: "coming_soon" },
  // Mesajlaşma
  { id: "netgsm",       name: "NetGSM SMS",    category: "messaging", description: "Toplu SMS, OTP, bilgilendirme",              icon: MessageSquare, baseStatus: "coming_soon" },
  { id: "iletimerkezi", name: "İletiMerkezi",  category: "messaging", description: "SMS gönderim altyapısı",                     icon: MessageSquare, baseStatus: "coming_soon" },
  { id: "sendgrid",     name: "SendGrid E-posta", category: "messaging", description: "Transactional ve pazarlama e-postaları",  icon: Mail, baseStatus: "coming_soon" },
  { id: "whatsapp-business", name: "WhatsApp Business", category: "messaging", description: "Sipariş ve teslimat bildirimleri",  icon: MessageSquare, baseStatus: "coming_soon", badge: "Yakında" },
  // Muhasebe (backend: accounting_integrations.provider)
  { id: "parasut",      name: "Paraşüt",       category: "accounting", description: "Online ön muhasebe",                        icon: Building2, baseStatus: "available", backendId: { kind: "accounting", id: "parasut" } },
  { id: "logo-tiger",   name: "Logo Tiger 3",  category: "accounting", description: "ERP veri köprüsü — fatura, cari, stok",     icon: Building2, baseStatus: "available", backendId: { kind: "accounting", id: "logo" } },
  { id: "mikro",        name: "Mikro Yazılım", category: "accounting", description: "ERP eşitleme",                              icon: Building2, baseStatus: "available", backendId: { kind: "accounting", id: "mikro" } },
  { id: "luca",         name: "Luca",          category: "accounting", description: "Mali müşavir muhasebe yazılımı",            icon: Building2, baseStatus: "available", backendId: { kind: "accounting", id: "luca" } },
  { id: "netsis",       name: "Netsis",        category: "accounting", description: "Logo Netsis ERP",                            icon: Building2, baseStatus: "available", backendId: { kind: "accounting", id: "netsis" } },
  // Analitik
  { id: "ga4",          name: "Google Analytics 4", category: "analytics", description: "E-ticaret raporları",                    icon: BarChart3, baseStatus: "coming_soon" },
  { id: "meta-pixel",   name: "Meta Pixel",    category: "analytics", description: "Facebook & Instagram dönüşüm takibi",        icon: BarChart3, baseStatus: "coming_soon" },
];

interface BackendIntegration { id: number; provider?: string; platform?: string; isActive: boolean; }

export default function EntegrasyonlarPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = !!user && (user as any).role === "admin";
  const [filter, setFilter] = useState<IntegrationCategory | "all">("all");
  const [search, setSearch] = useState("");

  // Gerçek bağlı entegrasyonlar (sadece admin görebilir; viewer/staff için boş set)
  const accQ = useQuery<{ integrations: BackendIntegration[] }>({
    queryKey: ["entegrasyon-acc-list"],
    queryFn: async () => {
      const r = await fetch("/api/ext-integrations/accounting", { credentials: "include" });
      if (!r.ok) return { integrations: [] };
      return r.json();
    },
    enabled: isAdmin,
  });
  const ecQ = useQuery<{ integrations: BackendIntegration[] }>({
    queryKey: ["entegrasyon-ec-list"],
    queryFn: async () => {
      const r = await fetch("/api/ext-integrations/ecommerce", { credentials: "include" });
      if (!r.ok) return { integrations: [] };
      return r.json();
    },
    enabled: isAdmin,
  });

  const connectedAccProviders = useMemo(
    () => new Set((accQ.data?.integrations ?? []).filter(i => i.isActive).map(i => i.provider).filter(Boolean) as string[]),
    [accQ.data]
  );
  const connectedEcPlatforms = useMemo(
    () => new Set((ecQ.data?.integrations ?? []).filter(i => i.isActive).map(i => i.platform).filter(Boolean) as string[]),
    [ecQ.data]
  );

  const enriched: (Integration & { status: IntegrationStatus })[] = useMemo(() => {
    return INTEGRATIONS.map(i => {
      let status: IntegrationStatus = i.baseStatus;
      if (i.backendId) {
        if (i.backendId.kind === "accounting" && connectedAccProviders.has(i.backendId.id)) status = "connected";
        if (i.backendId.kind === "ecommerce"  && connectedEcPlatforms.has(i.backendId.id))  status = "connected";
      }
      return { ...i, status };
    });
  }, [connectedAccProviders, connectedEcPlatforms]);

  const filtered = enriched.filter((i) => {
    if (filter !== "all" && i.category !== filter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: enriched.length,
    connected: enriched.filter((i) => i.status === "connected").length,
    available: enriched.filter((i) => i.status === "available").length,
    coming: enriched.filter((i) => i.status === "coming_soon").length,
  };

  const onComingSoon = (i: Integration) => {
    toast({ title: `${i.name} yakında`, description: "Bu entegrasyon için hazırlık sürüyor." });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="Entegrasyon Merkezi"
        description="Pazaryerleri, banka, e-fatura, kargo ve mesajlaşma entegrasyonlarınızı tek panelden yönetin."
        actions={
          <Badge variant="outline" className="gap-1.5" data-testid="badge-toplam">
            <Plug className="h-3.5 w-3.5" />
            {stats.total} entegrasyon
          </Badge>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Toplam</div><div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Bağlı</div><div className="text-2xl font-bold text-emerald-600" data-testid="stat-connected">{stats.connected}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Kullanıma açık</div><div className="text-2xl font-bold text-blue-600" data-testid="stat-available">{stats.available}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Yakında</div><div className="text-2xl font-bold text-amber-600" data-testid="stat-coming">{stats.coming}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === "all" ? "bg-emerald-600 text-white" : "bg-muted hover:bg-muted/80"}`}
          data-testid="filter-all"
        >
          Tümü
        </button>
        {(Object.keys(CATEGORIES) as IntegrationCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === cat ? "bg-emerald-600 text-white" : "bg-muted hover:bg-muted/80"}`}
            data-testid={`filter-${cat}`}
          >
            {CATEGORIES[cat].label}
          </button>
        ))}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Entegrasyon ara…"
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              data-testid="integration-search"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((i) => {
          const Icon = i.icon;
          const cat = CATEGORIES[i.category];
          const tabPath = cat.tab ? `/settings/integrations?tab=${cat.tab}` : null;
          const canManage = !!tabPath && isAdmin;

          let cta: React.ReactNode = null;
          if (i.status === "coming_soon") {
            cta = (
              <Button size="sm" variant="outline" onClick={() => onComingSoon(i)} data-testid={`connect-${i.id}`}>
                Bilgi al
              </Button>
            );
          } else if (i.status === "connected" && canManage) {
            cta = (
              <Link href={tabPath!}>
                <Button size="sm" variant="outline" data-testid={`connect-${i.id}`}>Yönet</Button>
              </Link>
            );
          } else if (canManage) {
            cta = (
              <Link href={tabPath!}>
                <Button size="sm" data-testid={`connect-${i.id}`}>Bağla</Button>
              </Link>
            );
          } else {
            // admin değilse veya backend bağlama akışı yoksa
            cta = (
              <Button
                size="sm"
                variant="outline"
                disabled
                title={!isAdmin ? "Bu işlem yalnızca admin yetkisindedir" : "Yakında"}
                data-testid={`connect-${i.id}`}
              >
                {!isAdmin ? "Yetkisiz" : "Yakında"}
              </Button>
            );
          }

          return (
            <Card key={i.id} className="hover:shadow-md transition-shadow" data-testid={`integration-${i.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center shrink-0 border">
                    <Icon className="h-6 w-6 text-slate-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{i.name}</h3>
                      {i.badge && <Badge variant="secondary" className="text-[10px]">{i.badge}</Badge>}
                    </div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${cat.color}`}>
                      {cat.label}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4 min-h-[32px]">{i.description}</p>
                <div className="flex items-center justify-between">
                  {i.status === "connected" ? (
                    <span className="text-xs flex items-center gap-1 text-emerald-700" data-testid={`status-${i.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Bağlı
                    </span>
                  ) : i.status === "coming_soon" ? (
                    <span className="text-xs flex items-center gap-1 text-amber-700" data-testid={`status-${i.id}`}>
                      <Clock className="h-3.5 w-3.5" /> Yakında
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" data-testid={`status-${i.id}`}>Hazır</span>
                  )}
                  {cta}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Aradığınız entegrasyon bulunamadı.
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="mt-8 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <strong>İpucu:</strong> Pazaryeri ve muhasebe entegrasyonlarınızı tek tıkla yönetim ekranından bağlayabilir, senkronize edebilir ve log kayıtlarını görüntüleyebilirsiniz.
          </div>
          <Link href="/settings/integrations">
            <Button size="sm" variant="outline" data-testid="cta-integrations-settings">Yönetim Ekranını Aç</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
