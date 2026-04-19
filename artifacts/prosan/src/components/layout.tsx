import { Link, useLocation } from "wouter";
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
  Trophy,
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
  Sparkles,
  Store,
  Megaphone,
  ShoppingBasket,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  Activity,
} from "lucide-react";
import { useFeatures } from "@/components/use-features";
import { useMenuPrefs } from "@/components/use-menu-prefs";
import { FeatureGate } from "@/components/feature-gate";
import { navItemId, navIdToTestSlug } from "@/components/nav-config";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "./notification-center";
import { GlobalSearch } from "./global-search";
import { QuickAction } from "./quick-action";
import { TrialBadge } from "./trial-badge";
import { DemoDataBanner } from "./demo-data-banner";
import { CommandPalette } from "./command-palette";
import { SetupChecklistPopover } from "./setup-checklist-popover";
import { NAV_GROUPS, type NavItem } from "./nav-config";
import { BrandLogo } from "./brand-logo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useState } from "react";

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

// Tüm menü öğeleri mantıksal gruplara ayrıldı.
// "Ana Panel" üstte sabit (grup dışı), diğer gruplar katlanabilir.
const TOP_ITEM: NavItem = {
  href: "/dashboard", label: "Ana Panel", icon: LayoutDashboard,
  roles: ["admin", "staff", "viewer", "super_admin"],
};

const HERO_ITEM: NavItem = {
  href: "/eticarium-merkezi", label: "e-Ticarium Merkezi", icon: Sparkles,
  roles: ["admin", "staff", "viewer"],
};


const STORAGE_KEY = "ticarium365_nav_open_groups_v1";
const COLLAPSE_KEY = "ticarium365_sidebar_collapsed_v1";

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return {};
}

function saveOpenGroups(state: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* */ }
}

function loadCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
}
function saveCollapsed(v: boolean) {
  try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* */ }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [location] = useLocation();
  const logout = useLogout();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => loadOpenGroups());
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const { has: hasFeature } = useFeatures();
  const { isHidden: isItemHidden } = useMenuPrefs();

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed(next);
  };

  const companyName = company?.name ?? "Ticarium365";

  // Rol filtresi + kullanıcı menü tercihi (hidden) uygulanmış gruplar
  const visibleGroups = useMemo(() => {
    if (!user) return [];
    const accountType = ((user as any).accountType ?? "seller") as "buyer" | "seller" | "both";
    return NAV_GROUPS
      .filter((g) => !g.accountTypes || g.accountTypes.includes(accountType))
      .map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          i.roles.includes(user.role) &&
          (!i.accountTypes || i.accountTypes.includes(accountType)) &&
          !isItemHidden(navItemId(i))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [user, isItemHidden]);

  // Aktif rotanın feature gereksinimi (en uzun href eşleşmesi — nested route güvenliği)
  const currentRouteFeature = useMemo<string | null>(() => {
    let bestHref = "";
    let bestFeature: string | null = null;
    for (const g of NAV_GROUPS) {
      for (const i of g.items) {
        const match = location === i.href || location.startsWith(i.href + "/");
        if (match && i.href.length > bestHref.length) {
          bestHref = i.href;
          bestFeature = i.feature ?? null;
        }
      }
    }
    return bestFeature;
  }, [location]);

  // Aktif yol hangi gruptaysa o grup otomatik açılır
  const activeGroupId = useMemo(() => {
    for (const g of visibleGroups) {
      if (g.items.some((i) => location === i.href || location.startsWith(i.href + "/"))) {
        return g.id;
      }
    }
    return null;
  }, [visibleGroups, location]);

  useEffect(() => {
    if (activeGroupId && !openGroups[activeGroupId]) {
      const next = { ...openGroups, [activeGroupId]: true };
      setOpenGroups(next);
      saveOpenGroups(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    const next = { ...openGroups, [id]: !openGroups[id] };
    setOpenGroups(next);
    saveOpenGroups(next);
  };

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      window.location.href = "/login";
    } catch {
      toast({ title: "Hata", description: "Çıkış yapılamadı.", variant: "destructive" });
    }
  };

  const isItemActive = (href: string) => location === href || location.startsWith(href + "/");

  const NavLinks = () => (
    <nav className="flex flex-col gap-0.5">
      {/* Ana Panel — sabit üst */}
      {user && TOP_ITEM.roles.includes(user.role) && (
        <Link href={TOP_ITEM.href}>
          <div
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer text-sm mb-1.5 ${
              isItemActive(TOP_ITEM.href)
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 font-medium hover:bg-slate-100"
            }`}
            onClick={() => setIsOpen(false)}
            data-testid="nav-link-dashboard"
          >
            <TOP_ITEM.icon className="h-4 w-4 shrink-0" />
            <span>{TOP_ITEM.label}</span>
          </div>
        </Link>
      )}

      {/* HERO — e-Ticarium Merkezi (öne çıkarılmış) */}
      {user && HERO_ITEM.roles.includes(user.role) && (
        <Link href={HERO_ITEM.href}>
          <div
            className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer text-sm mb-3 overflow-hidden ${
              isItemActive(HERO_ITEM.href)
                ? "shadow-md shadow-indigo-500/30"
                : "hover:shadow-md hover:shadow-indigo-500/20"
            }`}
            style={{
              background: "linear-gradient(135deg, hsl(234 89% 60%) 0%, hsl(180 70% 40%) 100%)",
              color: "white",
            }}
            onClick={() => setIsOpen(false)}
            data-testid="nav-link-eticarium-merkezi"
          >
            <span
              aria-hidden
              className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity"
              style={{
                background: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.5) 0%, transparent 60%)",
              }}
            />
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 shrink-0">
              <HERO_ITEM.icon className="h-4 w-4" />
            </span>
            <div className="relative flex-1 min-w-0">
              <div className="font-bold leading-tight">{HERO_ITEM.label}</div>
              <div className="text-[10px] opacity-90 leading-tight mt-0.5">Tek tıkla tüm kanallar</div>
            </div>
            <span className="relative text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/25">
              Yeni
            </span>
          </div>
        </Link>
      )}

      {visibleGroups.map((group) => {
        const isOpenGroup = !!openGroups[group.id];
        const groupHasActive = group.id === activeGroupId;
        return (
          <div key={group.id} className="mb-0.5">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer text-xs uppercase tracking-wider ${
                groupHasActive ? "text-blue-700 font-bold" : "text-slate-500 font-bold hover:bg-slate-100"
              }`}
              data-testid={`nav-group-${group.id}`}
              aria-expanded={isOpenGroup}
            >
              <group.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">{group.label}</span>
              <span className="text-[10px] font-semibold opacity-60">{group.items.length}</span>
              {isOpenGroup
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />}
            </button>
            {isOpenGroup && (
              <div className="ml-2 mt-0.5 mb-1 border-l border-slate-200 pl-2">
                {group.items.map((item) => {
                  const active = isItemActive(item.href);
                  const locked = item.feature ? !hasFeature(item.feature) : false;
                  const itemId = navItemId(item);
                  const slug = navIdToTestSlug(itemId);
                  return (
                    <Link key={itemId} href={item.href}>
                      <div
                        title={locked ? "Bu modül paketinizde yok — tıklayarak yükseltme ekranını görebilirsiniz" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all cursor-pointer text-sm border-l-2 ${
                          active
                            ? "bg-slate-100 text-blue-700 font-semibold border-blue-500"
                            : locked
                              ? "text-slate-400 hover:bg-slate-50 hover:text-slate-600 border-transparent"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent"
                        }`}
                        onClick={() => setIsOpen(false)}
                        data-testid={`nav-link-${slug}`}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1">{item.label}</span>
                        {locked && <Lock className="h-3 w-3 shrink-0 opacity-70" data-testid={`nav-lock-${slug}`} />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden px-4 py-3 flex items-center justify-between sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 text-slate-700 hover:bg-slate-100" data-testid="button-mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-72 p-0 bg-slate-50">
              <SheetHeader className="p-5 border-b border-slate-200 text-left bg-white">
                <SheetTitle
                  className="text-2xl font-extrabold tracking-tight flex items-center gap-2.5"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <BrandLogo size={32} />
                  <span className="t365-brand-gradient">Ticarium365</span>
                </SheetTitle>
              </SheetHeader>
              <div className="p-3 flex-1 overflow-y-auto">
                <TrialBanner />
                <NavLinks />
              </div>
              <div className="p-4 mt-auto border-t border-slate-200 bg-white">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-gradient-to-br from-blue-600 to-teal-600">
                    {user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
                    <p className="text-xs capitalize text-slate-500">{user.role}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full justify-start border-slate-200 text-slate-700 hover:bg-slate-100 bg-white" onClick={handleLogout} data-testid="button-mobile-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Çıkış Yap
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-bold text-lg tracking-tight text-slate-900">{companyName}</span>
        </div>
        {/* Mobile sağ — zil */}
        {user.role !== "super_admin" && <NotificationCenter />}
      </header>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex ${collapsed ? "w-16" : "w-64"} flex-col h-screen sticky top-0 bg-slate-50 border-r border-slate-200 transition-[width] duration-200`}
        data-testid="desktop-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div className="px-3 py-5 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
          {collapsed ? (
            <div className="mx-auto"><BrandLogo size={28} /></div>
          ) : (
            <h1
              className="text-2xl font-extrabold tracking-tight flex items-center gap-2.5 px-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <BrandLogo size={32} />
              <span className="t365-brand-gradient">Ticarium365</span>
            </h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            className="h-7 w-7 shrink-0 text-slate-500 hover:text-slate-900"
            data-testid="button-sidebar-toggle"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </Button>
        </div>

        {collapsed ? (
          <div className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1.5">
            {user && TOP_ITEM.roles.includes(user.role) && (
              <Link href={TOP_ITEM.href}>
                <div
                  title={TOP_ITEM.label}
                  className={`h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer ${
                    isItemActive(TOP_ITEM.href) ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                  data-testid="nav-link-collapsed-dashboard"
                >
                  <TOP_ITEM.icon className="h-4 w-4" />
                </div>
              </Link>
            )}
            {visibleGroups.map((g) => (
              <div
                key={g.id}
                title={g.label}
                onClick={() => { setCollapsed(false); saveCollapsed(false); toggleGroup(g.id); }}
                className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                data-testid={`nav-group-collapsed-${g.id}`}
              >
                <g.icon className="h-4 w-4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3">
            <TrialBanner />
            <NavLinks />
          </div>
        )}

        <div className="p-3 mt-auto border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-gradient-to-br from-blue-600 to-teal-600">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{user.fullName}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{user.role}</p>
            </div>
            {user.role !== "super_admin" && <NotificationCenter />}
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Çıkış Yap" className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100" data-testid="button-desktop-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Sprint 83 — sticky üst bar: global arama + hızlı işlem */}
        <div className="hidden md:flex sticky top-0 z-20 items-center gap-3 border-b border-slate-200 bg-white/95 px-6 py-2.5 backdrop-blur">
          <div className="flex-1 max-w-xl">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2">
            <TrialBadge />
            <QuickAction />
          </div>
        </div>
        <DemoDataBanner />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <FeatureGate feature={currentRouteFeature ?? undefined}>
              {children}
            </FeatureGate>
          </div>
        </div>
      </main>

      <WelcomeTour />
      <CommandPalette />
      <SetupChecklistPopover />
    </div>
  );
}
