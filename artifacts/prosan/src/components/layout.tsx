import { Outlet, Link, useLocation } from "wouter";
import { WelcomeTour } from "./welcome-tour";
import { useAuth } from "./auth-context";
import { useCompany } from "./company-context";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { useLogout } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Package,
  PackageOpen,
  ScanBarcode,
  Barcode,
  ShoppingCart,
  History,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Menu,
  PackagePlus,
  Building2,
  CreditCard,
  Wrench,
  Clock,
  CalendarCheck,
  UserCircle,
  Truck,
  ShoppingBag,
  ClipboardList,
  Wallet,
  Banknote,
  TrendingUp,
  GitBranch,
  Webhook,
  FileText,
  Bell,
  Tag,
  Radio,
  Network,
  Inbox,
  Calculator,
  PieChart,
  Upload,
  ScanLine,
  Factory,
  Award,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "./notification-center";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

function TrialBanner() {
  const { user } = useAuth();
  const { data: status } = usePaymentStatus();

  if (!user || user.role === "super_admin") return null;
  if (!status || status.planType !== "trial" || status.trialDaysLeft === null) return null;
  if (status.isTrialExpired) return null;

  const days = status.trialDaysLeft;
  const color = days <= 3 ? "bg-red-600" : days <= 7 ? "bg-orange-500" : "bg-blue-600/80";

  return (
    <div className={`mx-3 mb-2 rounded-lg px-3 py-2 text-white text-xs ${color}`}>
      <div className="flex items-center gap-1.5 font-semibold">
        <Clock className="h-3 w-3 shrink-0" />
        Trial: {days} gün kaldı
      </div>
      {days <= 7 && (
        <p className="mt-0.5 opacity-80">Süre dolmadan ödeme yapın.</p>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [location] = useLocation();
  const logout = useLogout();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const companyName = company?.name ?? "SMS";

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      window.location.href = "/login";
    } catch {
      toast({ title: "Hata", description: "Çıkış yapılamadı.", variant: "destructive" });
    }
  };

  const navItems = [
    { href: "/dashboard", label: "Ana Panel", icon: LayoutDashboard, roles: ["admin", "staff", "viewer", "super_admin"] },
    { href: "/products", label: "Ürünler", icon: Package, roles: ["admin", "staff", "viewer"] },
    { href: "/barcode", label: "Barkod Tarama", icon: ScanBarcode, roles: ["admin", "staff"] },
    { href: "/sales", label: "Satış Ekranı", icon: ShoppingCart, roles: ["admin", "staff"] },
    { href: "/sales/history", label: "Satış Geçmişi", icon: History, roles: ["admin", "staff", "viewer"] },
    { href: "/stock", label: "Stok Girişi", icon: PackagePlus, roles: ["admin", "staff"] },
    { href: "/customers", label: "Müşteriler", icon: UserCircle, roles: ["admin", "staff", "viewer"] },
    { href: "/suppliers", label: "Tedarikçiler", icon: Truck, roles: ["admin", "staff", "viewer"] },
    { href: "/purchases", label: "Alış Faturaları", icon: ShoppingBag, roles: ["admin", "staff", "viewer"] },
    { href: "/barcodes", label: "Etiket Merkezi", icon: Barcode, roles: ["admin", "staff", "viewer"] },
    { href: "/stock-counts", label: "Stok Sayım", icon: ClipboardList, roles: ["admin", "staff"] },
    { href: "/finance", label: "Kasa / Finans", icon: Wallet, roles: ["admin", "staff", "viewer"] },
    { href: "/finance-dashboard", label: "Finans Paneli", icon: TrendingUp, roles: ["admin", "viewer"] },
    { href: "/profit", label: "Net Kâr Merkezi", icon: TrendingUp, roles: ["admin", "staff", "viewer"] },
    { href: "/muhasebeci", label: "Mali Müşavir", icon: Calculator, roles: ["admin", "staff", "viewer"] },
    { href: "/butce", label: "Bütçe & Tahmin", icon: PieChart, roles: ["admin", "staff", "viewer"] },
    { href: "/ice-aktarim", label: "Veri İçe Aktarımı", icon: Upload, roles: ["admin", "staff"] },
    { href: "/pos", label: "Hızlı Satış (POS)", icon: ScanLine, roles: ["admin", "staff"] },
    { href: "/uretim", label: "Üretim & Reçete", icon: Factory, roles: ["admin", "staff", "viewer"] },
    { href: "/sadakat", label: "Sadakat & Puan", icon: Award, roles: ["admin", "staff", "viewer"] },
    { href: "/doviz", label: "Çoklu Para Birimi", icon: DollarSign, roles: ["admin", "staff", "viewer"] },
    { href: "/marketplace", label: "Pazaryeri", icon: Radio, roles: ["admin", "staff"] },
    { href: "/banking", label: "Bankacılık", icon: Banknote, roles: ["admin", "staff"] },
    { href: "/branches", label: "Şubeler", icon: GitBranch, roles: ["admin", "staff", "viewer"] },
    { href: "/documents", label: "Evrak Yönetimi", icon: FileText, roles: ["admin", "staff", "viewer"] },
    { href: "/finance-documents", label: "Belge Merkezi", icon: Inbox, roles: ["admin", "staff", "viewer"] },
    { href: "/einvoice", label: "e-Fatura", icon: FileText, roles: ["admin", "staff", "viewer"] },
    { href: "/personnel", label: "Personel", icon: Users, roles: ["admin", "staff", "viewer"] },
    { href: "/campaigns", label: "Kampanyalar", icon: Tag, roles: ["admin", "staff", "viewer"] },
    { href: "/network", label: "B2B Ağı", icon: Network, roles: ["admin", "staff", "viewer"] },
    { href: "/b2b/quotes", label: "Teklifler", icon: FileText, roles: ["admin", "staff"] },
    { href: "/b2b/orders", label: "Siparişler", icon: Package, roles: ["admin", "staff"] },
    { href: "/b2b/catalog", label: "B2B Katalog", icon: PackageOpen, roles: ["admin", "staff"] },
    { href: "/channels", label: "Satış Kanalları", icon: Radio, roles: ["admin", "staff"] },
    { href: "/reports", label: "Raporlar", icon: BarChart3, roles: ["admin", "viewer"] },
    { href: "/reports/daily-summary", label: "Günlük Kapanış", icon: CalendarCheck, roles: ["admin", "viewer"] },
    { href: "/users", label: "Kullanıcılar", icon: Users, roles: ["admin"] },
    { href: "/settings/subscription", label: "Abonelik", icon: CreditCard, roles: ["admin"] },
    { href: "/settings/notifications", label: "Bildirim Ayarları", icon: Bell, roles: ["admin"] },
    { href: "/settings/integrations", label: "Entegrasyonlar", icon: Webhook, roles: ["admin"] },
    { href: "/settings", label: "Ayarlar", icon: Settings, roles: ["admin"] },
    { href: "/admin/companies", label: "Firma Yönetimi", icon: Building2, roles: ["super_admin"] },
    { href: "/admin/payments", label: "Ödeme Bildirimleri", icon: CreditCard, roles: ["super_admin"] },
    { href: "/admin/platform-settings", label: "Platform Ayarları", icon: Wrench, roles: ["super_admin"] },
  ];

  const filteredNav = navItems.filter(item => user && item.roles.includes(user.role));

  const NavLinks = ({ dark = false }: { dark?: boolean }) => (
    <div className="flex flex-col gap-0.5">
      {filteredNav.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        if (dark) {
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer text-sm ${
                  isActive
                    ? "bg-white/10 text-white font-semibold"
                    : "font-medium hover:bg-white/8 hover:text-white"
                }`}
                style={{ color: isActive ? "white" : "hsl(215 25% 65%)" }}
                onClick={() => setIsOpen(false)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        }
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden px-4 py-3 flex items-center justify-between sticky top-0 z-30 border-b" style={{ background: "hsl(222 47% 15%)" }}>
        <div className="flex items-center gap-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 text-white hover:bg-white/10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-64 p-0" style={{ background: "hsl(222 47% 15%)" }}>
              <SheetHeader className="p-4 border-b text-left" style={{ borderColor: "hsl(222 40% 22%)" }}>
                <SheetTitle className="text-xl font-bold tracking-tight text-white">{companyName}</SheetTitle>
                <p className="text-xs" style={{ color: "hsl(215 25% 55%)" }}>Stok Yönetim Sistemi</p>
              </SheetHeader>
              <div className="p-3 flex-1 overflow-y-auto">
                <TrialBanner />
                <NavLinks dark />
              </div>
              <div className="p-4 mt-auto" style={{ borderTop: "1px solid hsl(222 40% 22%)" }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: "hsl(221 83% 53%)" }}>
                    {user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{user.fullName}</p>
                    <p className="text-xs capitalize" style={{ color: "hsl(215 25% 55%)" }}>{user.role}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full justify-start border-white/10 text-slate-300 hover:text-white hover:bg-white/10 bg-transparent" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Çıkış Yap
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-bold text-lg tracking-tight text-white">{companyName}</span>
        </div>
        {/* Mobile sağ — zil */}
        {user.role !== "super_admin" && <NotificationCenter />}
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col h-screen sticky top-0" style={{ background: "hsl(222 47% 15%)" }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: "hsl(222 40% 22%)" }}>
          <h1 className="text-xl font-bold tracking-tight text-white">{companyName}</h1>
          <p className="text-[10px] font-semibold mt-0.5 uppercase tracking-widest" style={{ color: "hsl(215 25% 60%)" }}>Stok Yönetim Sistemi</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <TrialBanner />
          <NavLinks dark />
        </div>

        <div className="p-3 mt-auto" style={{ borderTop: "1px solid hsl(222 40% 22%)" }}>
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: "hsl(221 83% 53%)" }}>
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.fullName}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "hsl(215 25% 55%)" }}>{user.role}</p>
            </div>
            {user.role !== "super_admin" && <NotificationCenter />}
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Çıkış Yap" className="h-8 w-8 shrink-0 text-slate-400 hover:text-white hover:bg-white/10">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>

      <WelcomeTour />
    </div>
  );
}
