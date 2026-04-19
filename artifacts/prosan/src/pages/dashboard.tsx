import { useGetDashboardStats, useGetTopProducts } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Package, AlertTriangle, TrendingUp, ScanBarcode,
  ShoppingCart, BarChart2, CircleDollarSign, Bell, Inbox,
  Banknote, ArrowRight, AlertCircle, PackageX, PackageMinus,
  Mail, Sparkles,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

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

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(v);
};

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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 60_000,
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const date = new Date(label + "T00:00:00");
  const day = date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm min-w-[140px]">
      <p className="font-semibold mb-2 text-foreground">{day}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex justify-between gap-4 text-xs">
          <span style={{ color: entry.color }}>{entry.name === "revenue" ? "Ciro" : "Kâr"}</span>
          <span className="font-mono font-medium">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

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
  const { data: topProducts } = useGetTopProducts();
  const { data: daily30 } = useDailyStats(30);
  const { data: depleted } = useMiniList("/api/dashboard/depleted", "depleted");
  const { data: depleting } = useMiniList("/api/dashboard/depleting", "depleting");
  const { data: costWarnings } = useMiniList("/api/dashboard/cost-warnings", "cost-warnings");
  const { data: notifData } = useNotifications();
  const { data: tcmb } = useTcmbRates();

  const chartData30 = daily30?.map(d => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
  })) ?? [];

  const topList = (topProducts?.topSelling ?? []).slice(0, 10);
  const notifications = notifData?.notifications ?? [];

  const todayRevenue = stats?.todayGrossRevenue ?? 0;
  const todaySales = stats?.todaySalesCount ?? 0;
  const criticalCount = stats?.criticalStockCount ?? 0;
  const revenue30 = (daily30 ?? []).reduce((s, d) => s + d.revenue, 0);
  const sales30 = (daily30 ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-5">
      {/* Başlık + Kompakt Kur Şeridi */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="t365-heading-accent">
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text" style={{ fontFamily: "var(--font-display)" }}>
            Ana Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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

      {/* Stat Kartları: Bugünün Cirosu + Son 30 Gün Cirosu + Kritik Stok */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card className="border-primary/30">
          <CardContent className="px-5 py-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
              Bugünün Cirosu
            </p>
            <p className="text-2xl font-bold tracking-tight t365-numeric text-primary mt-1">
              {statsLoading ? "—" : fmt(todayRevenue)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{todaySales} satış</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30">
          <CardContent className="px-5 py-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
              Son 30 Gün Cirosu
            </p>
            <p className="text-2xl font-bold tracking-tight t365-numeric text-blue-400 mt-1">
              {fmt(revenue30)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{sales30} satış</p>
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
              <p className={`text-2xl font-bold tracking-tight t365-numeric mt-1 ${criticalCount > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                {statsLoading ? "—" : criticalCount}
              </p>
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

      {/* 30 Günlük Ciro & Kâr Grafiği */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            Son 30 Gün — Ciro & Kâr
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData30} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtShort}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(v) => v === "revenue" ? "Ciro" : "Kâr"}
              />
              <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#colorRevenue)" dot={false} />
              <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#colorProfit)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
              {topList.length > 0 ? topList.map((p, i) => (
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
              {notifications.length > 0 ? notifications.map((n) => {
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
    </div>
  );
}
