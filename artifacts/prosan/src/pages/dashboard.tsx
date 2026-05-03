import { lazy, Suspense, useEffect, useRef } from "react";
import { useGetDashboardStats, useGetTopProducts } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Package, AlertTriangle, TrendingUp, ScanBarcode,
  ShoppingCart, BarChart2, CircleDollarSign, Bell, Inbox,
  Banknote, ArrowRight, AlertCircle, PackageX, PackageMinus,
  Mail, Sparkles, Wallet, FileText, TrendingDown, ListChecks,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trackProductEvent } from "@/lib/product-analytics";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/skeleton";

const DashboardRevenueChart = lazy(() => import("@/components/dashboard-revenue-chart"));

interface DailyStat {
  date: string;
  revenue: number;
  profit: number;
  count: number;
}

interface MiniProduct {
  id: number;
  name: string;
  productCode: string;
  stock: number;
  minStock?: number;
  salePrice?: number;
  purchasePrice?: number;
  margin?: number;
  marginPct?: number;
}

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  entityType?: string | null;
  entityId?: number | null;
  createdAt: string;
}

interface TcmbRates {
  rates: Record<string, { buy: number; sell: number; date: string; source: string }>;
  base: string;
  fetchedAt: string;
}

const fmt = (v: number) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₺";

const fmtKur = (v: number) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: v < 1 ? 4 : 2, maximumFractionDigits: v < 1 ? 4 : 2 });

function useDailyStats(days = 30) {
  return useQuery<DailyStat[]>({
    queryKey: ["sales", "daily-stats", days],
    queryFn: async () => {
      const res = await fetch(`/api/sales/daily-stats?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch error");
      return res.json();
    },
    staleTime: 0,
  });
}

function useMiniList(path: string, key: string) {
  return useQuery<MiniProduct[]>({
    queryKey: ["dashboard", key],
    queryFn: async () => {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) throw new Error("fetch error");
      return res.json();
    },
    staleTime: 0,
  });
}

// Dalga 34 — Cross-modül "Bugün Yapılacaklar" özet (sadece ekleme, mevcut endpoint'ler)
// 403 → unavailable (yetki/plan yok); ok → veri; diğer hatalar → unavailable
type CrossModuleCount = number | "unavailable";
function useCrossModuleActions() {
  return useQuery<{
    bankingUnmatched: CrossModuleCount;
    marketplacePending: CrossModuleCount;
    b2bInboxPending: CrossModuleCount;
    profitLosing: CrossModuleCount;
  }>({
    queryKey: ["dashboard", "cross-module-actions"],
    queryFn: async () => {
      const safeFetch = async (url: string): Promise<any | "unavailable"> => {
        try {
          const r = await fetch(url, { credentials: "include" });
          if (!r.ok) return "unavailable";
          return await r.json();
        } catch { return "unavailable"; }
      };
      const [counts, b2b, profit] = await Promise.all([
        safeFetch("/api/dashboard/action-counts"),
        safeFetch("/api/b2b/quotes/stats"),
        safeFetch("/api/profit-engine/dashboard-counts"),
      ]);
      const bankingUnmatched: CrossModuleCount = counts === "unavailable" ? "unavailable" : Number(counts?.bankingUnmatched ?? 0);
      const marketplacePending: CrossModuleCount = counts === "unavailable" ? "unavailable" : Number(counts?.marketplacePendingConversion ?? 0);
      return {
        bankingUnmatched,
        marketplacePending,
        b2bInboxPending: b2b === "unavailable" ? "unavailable" : Number(b2b?.inbox?.pending || 0),
        profitLosing: profit === "unavailable" ? "unavailable" : Number(profit?.losingCount ?? 0),
      };
    },
    staleTime: 60_000,
  });
}

function useSubscriptionFeatures() {
  return useQuery<{ planSlug: string; status: string; trialEndsAt?: string }>({
    queryKey: ["/api/subscriptions/features"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/features", { credentials: "include" });
      if (!r.ok) return { planSlug: "", status: "unknown" };
      return r.json();
    },
    staleTime: 120_000,
  });
}

function useNotifications() {
  return useQuery<{ notifications: NotificationItem[]; total: number }>({
    queryKey: ["dashboard", "notifications"],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?limit=10`, { credentials: "include" });
      if (!res.ok) return { notifications: [], total: 0 };
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useTcmbRates() {
  return useQuery<TcmbRates>({
    queryKey: ["dashboard", "tcmb-rates"],
    queryFn: async () => {
      const res = await fetch(`/api/currency-rates/rates/latest`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch error");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

const NOTIF_META: Record<string, { icon: any; color: string; label: string }> = {
  low_stock: { icon: AlertTriangle, color: "text-amber-500", label: "Stok" },
  stock_zero: { icon: PackageX, color: "text-rose-500", label: "Tükendi" },
  product_request: { icon: Mail, color: "text-blue-400", label: "Talep" },
  ecommerce_order: { icon: ShoppingCart, color: "text-emerald-500", label: "E-Ticaret" },
  system_announcement: { icon: Sparkles, color: "text-purple-500", label: "Yenilik" },
  daily_summary: { icon: Bell, color: "text-cyan-500", label: "Özet" },
  system: { icon: Bell, color: "text-muted-foreground", label: "Sistem" },
};

function relativeTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}g`;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function ProductMiniRow({ p, accent }: { p: MiniProduct; accent: string }) {
  return (
    <Link href={`/products/${p.id}`}>
      <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors group">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">{p.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{p.productCode}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {p.marginPct !== undefined ? (
            <Badge variant="outline" className={`font-mono text-[10px] h-5 px-1.5 ${accent}`}>
              {p.marginPct >= 0 ? "+" : ""}{p.marginPct.toFixed(1)}%
            </Badge>
          ) : (
            <Badge variant="outline" className={`font-mono text-[10px] h-5 px-1.5 ${accent}`}>
              {p.stock}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function ProductMiniCard({
  title, icon: Icon, accentClass, items, emptyText, viewAllHref,
}: {
  title: string;
  icon: any;
  accentClass: string;
  items?: MiniProduct[];
  emptyText: string;
  viewAllHref?: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${accentClass}`} />
            {title}
          </span>
          <Badge variant="secondary" className="text-[10px] h-5">
            {items?.length ?? 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1">
        <div className="space-y-0.5 max-h-[320px] overflow-y-auto pr-1">
          {items && items.length > 0 ? (
            items.map((p) => <ProductMiniRow key={p.id} p={p} accent={accentClass} />)
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Package className="h-7 w-7 mb-2 opacity-40" />
              <p className="text-xs text-center">{emptyText}</p>
            </div>
          )}
        </div>
        {viewAllHref && items && items.length > 0 && (
          <Link href={viewAllHref}>
            <div className="mt-2 pt-2 border-t border-border text-xs text-primary hover:underline flex items-center justify-center gap-1 cursor-pointer">
              Tümünü Gör <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: topProducts, isLoading: topProductsLoading } = useGetTopProducts();
  const { data: daily30, isLoading: dailyLoading } = useDailyStats(30);
  const { data: depleted, isLoading: depletedLoading } = useMiniList("/api/dashboard/depleted", "depleted");
  const { data: depleting, isLoading: depletingLoading } = useMiniList("/api/dashboard/depleting", "depleting");
  const { data: costWarnings, isLoading: costWarningsLoading } = useMiniList("/api/dashboard/cost-warnings", "cost-warnings");
  const { data: notifData, isLoading: notifLoading } = useNotifications();
  const { data: tcmb } = useTcmbRates();
  const { data: crossActions } = useCrossModuleActions();
  const { data: subFeat } = useSubscriptionFeatures();
  const trialBannerTracked = useRef(false);

  const trialDaysLeft =
    subFeat?.status === "trial" && subFeat.trialEndsAt
      ? Math.ceil((new Date(subFeat.trialEndsAt).getTime() - Date.now()) / 86_400_000)
      : null;

  useEffect(() => {
    if (trialBannerTracked.current) return;
    if (subFeat?.status !== "trial") return;
    trialBannerTracked.current = true;
    trackProductEvent("trial_dashboard_banner_view", { days_left: trialDaysLeft ?? -1 });
  }, [subFeat?.status, trialDaysLeft]);

  const chartData30 = daily30?.map(d => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
  })) ?? [];

  const topList = (topProducts?.topSelling ?? []).slice(0, 10);
  const notifications = notifData?.notifications ?? [];

  const todayRevenue = stats?.todayGrossRevenue ?? 0;
  const todaySales = stats?.todaySalesCount ?? 0;
  const criticalCount = stats?.criticalStockCount ?? 0;
  const todayWholesaleRevenue = (stats as any)?.todayWholesaleRevenue ?? 0;
  const todayWholesaleCount = (stats as any)?.todayWholesaleCount ?? 0;
  const todayRetailRevenue = (stats as any)?.todayRetailRevenue ?? 0;
  const todayRetailCount = (stats as any)?.todayRetailCount ?? 0;
  const revenue30 = (daily30 ?? []).reduce((s, d) => s + d.revenue, 0);
  const sales30 = (daily30 ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-5">
      {subFeat?.status === "trial" && (
        <Alert className="border-blue-300/60 bg-blue-50/90 dark:bg-blue-950/30 dark:border-blue-700/50">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 dark:text-blue-100">
            Deneme süreniz
            {trialDaysLeft != null
              ? trialDaysLeft >= 0
                ? ` — yaklaşık ${trialDaysLeft} gün kaldı`
                : " — süresi doldu; hemen plan seçin"
              : ""}
          </AlertTitle>
          <AlertDescription className="text-blue-900/90 dark:text-blue-100/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              Kesintisiz kullanım için plan seçip ödeme adımına geçin. Tüm paketler ve fiyatlar için fiyat sayfasına; mevcut kullanımınız için abonelik ekranına gidin.
            </span>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button size="sm" className="gap-1" asChild>
                <Link href="/pricing" onClick={() => trackProductEvent("trial_cta_click", { from: "dashboard_banner", to: "pricing" })}>
                  Planları gör <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/settings/subscription" onClick={() => trackProductEvent("trial_cta_click", { from: "dashboard_banner", to: "subscription" })}>
                  Abonelik
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {subFeat?.status === "expired" && (
        <Alert variant="destructive" className="border-red-300/80">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Abonelik / deneme süresi dolmuş olabilir</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>Özelliklere tam erişim için plan yenileyin.</span>
            <Button size="sm" variant="secondary" asChild>
              <Link href="/pricing" onClick={() => trackProductEvent("expired_cta_click", { from: "dashboard_banner" })}>Plan seç</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Başlık + Kompakt Kur Şeridi */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="t365-heading-accent">
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text" style={{ fontFamily: "var(--font-display)" }}>
            Ana Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Bugünün cirosu, stok uyarıları ve bekleyen işler tek bakışta.
          </p>
        </div>

        {/* Kompakt TCMB Kur Şeridi */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
            <Banknote className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            {(["USD", "EUR", "GBP", "JPY"] as const).map((cur) => {
              const r = tcmb?.rates?.[cur];
              const flag = cur === "USD" ? "🇺🇸" : cur === "EUR" ? "🇪🇺" : cur === "GBP" ? "🇬🇧" : "🇯🇵";
              return (
                <div
                  key={cur}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-card/70 border border-border/60"
                  title={`${cur}/TRY  Alış: ${r ? fmtKur(r.buy) : "—"}  Satış: ${r ? fmtKur(r.sell) : "—"}`}
                >
                  <span className="text-xs">{flag}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">{cur}</span>
                  <span className="text-xs font-bold t365-numeric text-emerald-600 dark:text-emerald-400">
                    {r ? fmtKur(r.sell) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            {tcmb?.rates && Object.values(tcmb.rates)[0]?.source === "temsili"
              ? "Temsili kurlar — TCMB API entegrasyonu sonrası 15 dakikada bir güncellenecek"
              : "TCMB kurları 15 dakikada bir güncellenir"}
          </p>
        </div>
      </div>

      {/* Dalga 34 — Cross-modül "Bugün Yapılacaklar" özet (sadece ekleme) */}
      {crossActions && (() => {
        const items = [
          { key: "banking", label: "Eşleşme Bekleyen Hareket", count: crossActions.bankingUnmatched, href: "/banking", icon: Wallet, accent: "amber" },
          { key: "marketplace", label: "Bekleyen Pazaryeri Sipariş", count: crossActions.marketplacePending, href: "/marketplace", icon: ShoppingCart, accent: "orange" },
          { key: "b2b", label: "Yanıt Bekleyen B2B Teklif", count: crossActions.b2bInboxPending, href: "/b2b/quotes", icon: FileText, accent: "blue" },
          { key: "profit", label: "Zarar Yazan Ürün", count: crossActions.profitLosing, href: "/gercek-kar/dashboard", icon: TrendingDown, accent: "red" },
        ];
        // 403/unavailable modülleri toplama dahil etme; sadece sayısal modüllerin pending'leri toplanır
        const totalPending = items.reduce((a, i) => a + (typeof i.count === "number" ? i.count : 0), 0);
        const accentMap: Record<string, { bg: string; text: string; border: string }> = {
          amber: { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30" },
          orange: { bg: "bg-orange-500/10", text: "text-orange-600", border: "border-orange-500/30" },
          blue: { bg: "bg-blue-500/10", text: "text-blue-600", border: "border-blue-500/30" },
          red: { bg: "bg-red-500/10", text: "text-red-600", border: "border-red-500/30" },
        };
        return (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" data-testid="cross-module-actions">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Bugün Yapılacaklar — Tüm Modüller
                </span>
                <Badge variant={totalPending > 0 ? "default" : "secondary"} className="text-[10px] h-5">
                  {totalPending > 0 ? `${totalPending} aksiyon` : "tümü temiz ✓"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {items.map((it) => {
                  const Icon = it.icon;
                  const a = accentMap[it.accent]!;
                  const isUnavailable = it.count === "unavailable";
                  const numCount = typeof it.count === "number" ? it.count : 0;
                  const display = isUnavailable ? "🔒" : (numCount >= 500 ? "500+" : String(numCount));
                  const titleAttr = isUnavailable ? "Bu modül planınızda mevcut değil veya erişim izniniz yok" : it.label;
                  return (
                    <Link key={it.key} href={it.href}>
                      <div
                        className={`p-3 rounded-lg border ${isUnavailable ? "bg-muted/40 border-dashed border-muted-foreground/20 opacity-70" : (numCount > 0 ? `${a.bg} ${a.border}` : "bg-card border-border")} hover:shadow-md transition-shadow cursor-pointer`}
                        data-testid={`cross-action-${it.key}`}
                        title={titleAttr}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Icon className={`h-4 w-4 ${isUnavailable ? "text-muted-foreground" : (numCount > 0 ? a.text : "text-muted-foreground")}`} />
                          <span className={`text-2xl font-bold t365-numeric ${isUnavailable ? "text-muted-foreground" : (numCount > 0 ? a.text : "text-muted-foreground")}`}>{display}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">{it.label}{isUnavailable && <span className="block text-[10px] italic mt-0.5">erişim yok</span>}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Bugün — Toptan / Perakende kırılımı */}
      <div className="grid gap-3 grid-cols-2">
        <Card className="border-indigo-500/30">
          <CardContent className="px-5 py-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Bugün — Toptan</p>
            <div className="mt-1" data-testid="kpi-wholesale-revenue">
              {statsLoading ? (
                <SkeletonLine width={140} height={28} borderRadius={6} />
              ) : (
                <p className="text-xl font-bold tracking-tight t365-numeric text-indigo-400">{fmt(todayWholesaleRevenue)}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{todayWholesaleCount} satış</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardContent className="px-5 py-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Bugün — Perakende</p>
            <div className="mt-1" data-testid="kpi-retail-revenue">
              {statsLoading ? (
                <SkeletonLine width={140} height={28} borderRadius={6} />
              ) : (
                <p className="text-xl font-bold tracking-tight t365-numeric text-amber-400">{fmt(todayRetailRevenue)}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{todayRetailCount} satış</p>
          </CardContent>
        </Card>
      </div>

      {/* Stat Kartları: Bugünün Cirosu + Son 30 Gün Cirosu + Kritik Stok */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card className="border-primary/30">
          <CardContent className="px-5 py-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
              Bugünün Cirosu
            </p>
            <div className="mt-1">
              {statsLoading ? (
                <SkeletonLine width={160} height={32} borderRadius={6} />
              ) : (
                <p className="text-2xl font-bold tracking-tight t365-numeric text-primary">{fmt(todayRevenue)}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{todaySales} satış</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30">
          <CardContent className="px-5 py-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
              Son 30 Gün Cirosu
            </p>
            <div className="mt-1">
              {dailyLoading ? (
                <SkeletonLine width={160} height={32} borderRadius={6} />
              ) : (
                <p className="text-2xl font-bold tracking-tight t365-numeric text-blue-400">{fmt(revenue30)}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dailyLoading ? <SkeletonLine width={72} height={14} /> : `${sales30} satış`}
            </p>
          </CardContent>
        </Card>
        <Link href="/products?lowStock=true">
          <Card className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${criticalCount > 0 ? "border-rose-500/40 hover:border-rose-500/70" : "border-emerald-500/30 hover:border-emerald-500/60"}`}>
            <CardContent className="px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className={`h-3.5 w-3.5 ${criticalCount > 0 ? "text-rose-500" : "text-emerald-500"}`} />
                  Kritik Stok
                </p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="mt-1">
                {statsLoading ? (
                  <SkeletonLine width={48} height={32} borderRadius={6} />
                ) : (
                  <p className={`text-2xl font-bold tracking-tight t365-numeric ${criticalCount > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    {criticalCount}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats?.totalProducts ?? 0} ürün kayıtlı · listeyi aç
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Hızlı Satış Butonu */}
      <Link href="/sales">
        <div className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-600 hover:brightness-105 active:brightness-95 transition-all shadow-lg shadow-indigo-600/20 cursor-pointer">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-white/80 text-xs font-medium uppercase tracking-widest">Hızlı İşlem</p>
              <p className="text-white text-xl font-bold mt-0.5">Barkod ile Satış Yap</p>
              <p className="text-white/70 text-xs mt-0.5">Kamera ile tara, sepete ekle, satışı tamamla</p>
            </div>
            <div className="bg-card/20 rounded-full p-3.5 shrink-0">
              <ScanBarcode className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
      </Link>

      {/* 30 Günlük Ciro & Kâr — recharts ayrı chunk */}
      <Suspense
        fallback={(
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                Son 30 Gün — Ciro & Kâr
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 min-h-[220px] flex flex-col justify-center gap-2">
              <SkeletonLine width="100%" height={14} />
              <SkeletonBlock width="100%" height={180} borderRadius={8} />
            </CardContent>
          </Card>
        )}
      >
        {dailyLoading ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                Son 30 Gün — Ciro & Kâr
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 min-h-[220px] flex flex-col justify-center gap-2">
              <SkeletonLine width="100%" height={14} />
              <SkeletonBlock width="100%" height={180} borderRadius={8} />
            </CardContent>
          </Card>
        ) : (
          <DashboardRevenueChart data={chartData30} />
        )}
      </Suspense>

      {/* Çok Satanlar — LİSTE + Bildirimler */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Çok Satanlar Liste */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Çok Satanlar (30 Gün)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
              {topProductsLoading ? (
                <div className="space-y-3 py-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-2">
                      <SkeletonBlock width={28} height={28} borderRadius={9999} />
                      <div className="flex-1 space-y-2 min-w-0">
                        <SkeletonLine width="75%" height={14} />
                        <SkeletonLine width="40%" height={10} />
                      </div>
                      <SkeletonLine width={52} height={20} />
                    </div>
                  ))}
                </div>
              ) : topList.length > 0 ? topList.map((p, i) => (
                <Link key={p.id} href={`/products/${p.id}`}>
                  <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors group">
                    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{p.productCode}</p>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs shrink-0">
                      {p.sales30Days} adet
                    </Badge>
                  </div>
                </Link>
              )) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">Henüz satış verisi yok</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bildirimler — Son 10 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                Bildirimler
                {notifData && notifData.total > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5">{notifData.total}</Badge>
                )}
              </span>
              <Link href="/bildirimler">
                <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  Tümünü Gör <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
              {notifLoading ? (
                <div className="space-y-3 py-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-2.5 py-2 px-2">
                      <SkeletonBlock width={28} height={28} borderRadius={6} />
                      <div className="flex-1 space-y-2 min-w-0">
                        <SkeletonLine width="50%" height={12} />
                        <SkeletonLine width="85%" height={14} />
                        <SkeletonLine width="70%" height={10} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length > 0 ? notifications.map((n) => {
                const meta = NOTIF_META[n.type] ?? NOTIF_META.system!;
                const Icon = meta.icon;
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-2.5 py-2 px-2 rounded-lg hover:bg-muted/60 transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
                  >
                    <div className="rounded-md p-1.5 bg-muted/60 shrink-0">
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Badge variant="outline" className="text-[9px] h-4 px-1">{meta.label}</Badge>
                        {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        <span className="text-[10px] text-muted-foreground ml-auto">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="text-xs font-medium truncate">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{n.message}</p>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Inbox className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">Henüz bildirim yok</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stok Durumu — 3 Liste: Maliyet Uyarısı / Tükenmiş / Tükenmeye Yakın */}
      {depletedLoading || depletingLoading || costWarningsLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader className="pb-2">
                <SkeletonLine width="55%" height={16} />
              </CardHeader>
              <CardContent className="pt-0 flex-1 space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <SkeletonLine key={j} width="100%" height={36} borderRadius={8} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <ProductMiniCard
            title="Maliyet Altında / Düşük Marj"
            icon={AlertCircle}
            accentClass="text-amber-500"
            items={costWarnings}
            emptyText="Marj uyarısı verilen ürün yok"
            viewAllHref="/products?filter=cost-warning"
          />
          <ProductMiniCard
            title="Tükenmiş Ürünler"
            icon={PackageX}
            accentClass="text-rose-500"
            items={depleted}
            emptyText="Tükenmiş ürün yok"
            viewAllHref="/products?filter=out-of-stock"
          />
          <ProductMiniCard
            title="Tükenmeye Yakın"
            icon={PackageMinus}
            accentClass="text-amber-500"
            items={depleting}
            emptyText="Tükenmeye yakın ürün yok"
            viewAllHref="/products?filter=low-stock"
          />
        </div>
      )}
    </div>
  );
}
