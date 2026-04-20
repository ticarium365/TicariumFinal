import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
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
  status: IntegrationStatus;
  badge?: string;
  brand?: string;
}

const CATEGORIES: Record<IntegrationCategory, { label: string; color: string }> = {
  marketplace: { label: "Pazaryerleri", color: "bg-orange-100 text-orange-800" },
  payment: { label: "Ödeme & Banka", color: "bg-emerald-100 text-emerald-800" },
  einvoice: { label: "e-Fatura / e-Arşiv", color: "bg-blue-100 text-blue-800" },
  shipping: { label: "Kargo", color: "bg-purple-100 text-purple-800" },
  messaging: { label: "SMS & E-posta", color: "bg-pink-100 text-pink-800" },
  accounting: { label: "Muhasebe", color: "bg-amber-100 text-amber-800" },
  analytics: { label: "Analitik", color: "bg-indigo-100 text-indigo-800" },
};

const INTEGRATIONS: Integration[] = [
  // Pazaryerleri
  { id: "trendyol", name: "Trendyol", category: "marketplace", description: "Ürün, sipariş ve stok senkronizasyonu", icon: ShoppingBag, status: "available", brand: "TY" },
  { id: "hepsiburada", name: "Hepsiburada", category: "marketplace", description: "Listeleme, fiyat ve stok yönetimi", icon: ShoppingBag, status: "available", brand: "HB" },
  { id: "n11", name: "n11", category: "marketplace", description: "Otomatik ürün gönderimi ve sipariş çekme", icon: ShoppingBag, status: "available", brand: "n11" },
  { id: "ciceksepeti", name: "Çiçeksepeti", category: "marketplace", description: "Pazaryeri entegrasyonu", icon: ShoppingBag, status: "coming_soon" },
  { id: "amazon-tr", name: "Amazon TR", category: "marketplace", description: "FBA & FBM siparişleri", icon: ShoppingBag, status: "coming_soon", badge: "Yakında" },
  // Ödeme & Banka
  { id: "iyzico", name: "iyzico", category: "payment", description: "Sanal POS ve Pay-with-iyzico", icon: Banknote, status: "available" },
  { id: "param", name: "Param", category: "payment", description: "Sanal POS, taksit ve link ile ödeme", icon: Banknote, status: "available" },
  { id: "garanti-bbva", name: "Garanti BBVA", category: "payment", description: "Hesap hareketi senkronizasyonu (Open Banking)", icon: Building2, status: "coming_soon", badge: "Pilot" },
  { id: "ziraat", name: "Ziraat Bankası", category: "payment", description: "Otomatik mutabakat", icon: Building2, status: "coming_soon" },
  // e-Fatura
  { id: "uyumsoft", name: "Uyumsoft e-Fatura", category: "einvoice", description: "GİB özel entegratör — e-Fatura/e-Arşiv", icon: FileText, status: "available" },
  { id: "logo-isubesi", name: "Logo İşubesi", category: "einvoice", description: "e-Fatura/e-Arşiv portal entegrasyonu", icon: FileText, status: "available" },
  { id: "qnb-efinans", name: "QNB eFinans", category: "einvoice", description: "Özel entegratör", icon: FileText, status: "coming_soon" },
  // Kargo
  { id: "yurtici", name: "Yurtiçi Kargo", category: "shipping", description: "Otomatik etiket ve takip", icon: Truck, status: "available" },
  { id: "aras", name: "Aras Kargo", category: "shipping", description: "Etiket, takip ve teslim bildirimi", icon: Truck, status: "available" },
  { id: "mng", name: "MNG Kargo", category: "shipping", description: "Sipariş takibi", icon: Truck, status: "coming_soon" },
  { id: "ptt", name: "PTT Kargo", category: "shipping", description: "Otomatik gönderim", icon: Truck, status: "coming_soon" },
  // Mesajlaşma
  { id: "netgsm", name: "NetGSM SMS", category: "messaging", description: "Toplu SMS, OTP, bilgilendirme", icon: MessageSquare, status: "available" },
  { id: "iletimerkezi", name: "İletiMerkezi", category: "messaging", description: "SMS gönderim altyapısı", icon: MessageSquare, status: "available" },
  { id: "sendgrid", name: "SendGrid E-posta", category: "messaging", description: "Transactional ve pazarlama e-postaları", icon: Mail, status: "available" },
  { id: "whatsapp-business", name: "WhatsApp Business", category: "messaging", description: "Sipariş ve teslimat bildirimleri", icon: MessageSquare, status: "coming_soon", badge: "Yakında" },
  // Muhasebe
  { id: "logo-tiger", name: "Logo Tiger 3", category: "accounting", description: "ERP veri köprüsü — fatura, cari, stok", icon: Building2, status: "coming_soon", badge: "Pilot" },
  { id: "mikro", name: "Mikro Yazılım", category: "accounting", description: "ERP eşitleme", icon: Building2, status: "coming_soon" },
  { id: "parasut", name: "Paraşüt", category: "accounting", description: "Online ön muhasebe", icon: Building2, status: "available" },
  // Analitik
  { id: "ga4", name: "Google Analytics 4", category: "analytics", description: "E-ticaret raporları", icon: BarChart3, status: "available" },
  { id: "meta-pixel", name: "Meta Pixel", category: "analytics", description: "Facebook & Instagram dönüşüm takibi", icon: BarChart3, status: "available" },
];

export default function EntegrasyonlarPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<IntegrationCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = INTEGRATIONS.filter((i) => {
    if (filter !== "all" && i.category !== filter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: INTEGRATIONS.length,
    connected: INTEGRATIONS.filter((i) => i.status === "connected").length,
    available: INTEGRATIONS.filter((i) => i.status === "available").length,
    coming: INTEGRATIONS.filter((i) => i.status === "coming_soon").length,
  };

  const onConnect = (i: Integration) => {
    if (i.status === "coming_soon") {
      toast({ title: `${i.name} yakında`, description: "Bu entegrasyon için hazırlık sürüyor." });
      return;
    }
    toast({
      title: `${i.name} bağlantısı`,
      description: "Bağlantı sihirbazı yakında bu sayfada açılacak. Şu anda demo modundadır.",
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="Entegrasyon Merkezi"
        description="Pazaryerleri, banka, e-fatura, kargo ve mesajlaşma entegrasyonlarınızı tek panelden yönetin."
        actions={
          <Badge variant="outline" className="gap-1.5">
            <Plug className="h-3.5 w-3.5" />
            {stats.total} entegrasyon
          </Badge>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Toplam</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Bağlı</div><div className="text-2xl font-bold text-emerald-600">{stats.connected}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Kullanıma açık</div><div className="text-2xl font-bold text-blue-600">{stats.available}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Yakında</div><div className="text-2xl font-bold text-amber-600">{stats.coming}</div></CardContent></Card>
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
                    <span className="text-xs flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Bağlı</span>
                  ) : i.status === "coming_soon" ? (
                    <span className="text-xs flex items-center gap-1 text-amber-700"><Clock className="h-3.5 w-3.5" /> Yakında</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Hazır</span>
                  )}
                  <Button
                    size="sm"
                    variant={i.status === "available" ? "default" : "outline"}
                    onClick={() => onConnect(i)}
                    disabled={i.status === "connected"}
                    data-testid={`connect-${i.id}`}
                  >
                    {i.status === "connected" ? "Yönet" : i.status === "coming_soon" ? "Bilgi al" : "Bağla"}
                  </Button>
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

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        <strong>Not:</strong> Entegrasyonlar şu anda demo/önizleme modundadır. Üretim bağlantıları için lütfen{" "}
        <a href="/iletisim" className="underline font-medium">bizimle iletişime geçin</a>.
      </div>
    </div>
  );
}
