import { useGetDashboardStats, useGetTopProducts, useGetCriticalStock } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Package, AlertTriangle, TrendingUp, TrendingDown, ScanBarcode,
  ShoppingCart, BarChart2, CircleDollarSign,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface DailyStat {
  date: string;
  revenue: number;
  profit: number;
  count: number;
}

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

const fmt = (v: number) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL";

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(v);
};

function StatCard({
  title, value, sub, icon: Icon, color = "text-foreground", trend,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  trend?: number;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`text-2xl font-bold tracking-tight truncate ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend).toFixed(1)}% dünden
              </div>
            )}
          </div>
          <div className="shrink-0 ml-3">
            <div className={`rounded-xl p-2.5 bg-muted/60`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold mb-1 text-foreground text-xs truncate max-w-[180px]">{label}</p>
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-primary">Satış Adedi</span>
        <span className="font-mono font-bold">{payload[0]?.value}</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: topProducts } = useGetTopProducts();
  const { data: criticalStock } = useGetCriticalStock();
  const { data: daily30 } = useDailyStats(30);
  const { data: daily7 } = useDailyStats(7);

  const totalRevenue30 = daily30?.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const totalProfit30 = daily30?.reduce((s, d) => s + d.profit, 0) ?? 0;

  // Yesterday vs day before comparison
  const yesterday = daily30?.[daily30.length - 2];
  const dayBefore = daily30?.[daily30.length - 3];
  const revTrend = dayBefore && dayBefore.revenue > 0
    ? ((yesterday?.revenue ?? 0) - dayBefore.revenue) / dayBefore.revenue * 100
    : undefined;

  const chartData7 = daily7?.map(d => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "short" }),
  })) ?? [];

  const chartData30 = daily30?.map(d => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
  })) ?? [];

  const topData = (topProducts?.topSelling ?? []).slice(0, 8).map(p => ({
    name: p.name.length > 22 ? p.name.slice(0, 22) + "…" : p.name,
    satış: p.sales30Days,
  }));

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ana Panel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Hızlı Satış Butonu */}
      <Link href="/sales">
        <div className="rounded-xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 hover:brightness-105 active:brightness-95 transition-all shadow-lg shadow-blue-600/20 cursor-pointer">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-white/80 text-xs font-medium uppercase tracking-widest">Hızlı İşlem</p>
              <p className="text-white text-xl font-bold mt-0.5">Barkod ile Satış Yap</p>
              <p className="text-white/70 text-xs mt-0.5">Kamera ile tara, sepete ekle, satışı tamamla</p>
            </div>
            <div className="bg-white/20 rounded-full p-3.5 shrink-0">
              <ScanBarcode className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
      </Link>

      {/* Stat Kartları */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Günlük Ciro"
          value={statsLoading ? "—" : fmt(stats?.todayGrossRevenue ?? 0)}
          sub={`${stats?.todaySalesCount ?? 0} adet satış`}
          icon={CircleDollarSign}
          color="text-primary"
          trend={revTrend}
        />
        <StatCard
          title="Günlük Kâr"
          value={statsLoading ? "—" : fmt(stats?.todayProfit ?? 0)}
          sub={`${stats?.todayProfitPercent?.toFixed(1) ?? 0}% marj`}
          icon={TrendingUp}
          color="text-emerald-600"
        />
        <StatCard
          title="30 Günlük Ciro"
          value={statsLoading ? "—" : fmt(totalRevenue30)}
          sub={`${fmt(totalProfit30)} kâr`}
          icon={BarChart2}
          color="text-blue-600"
        />
        <StatCard
          title="Kritik Stok"
          value={statsLoading ? "—" : String(stats?.criticalStockCount ?? 0)}
          sub={`${stats?.totalProducts ?? 0} ürün kayıtlı`}
          icon={AlertTriangle}
          color="text-rose-600"
        />
      </div>

      {/* Ana Grafik - 30 Günlük Ciro & Kâr */}
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

      {/* Alt Satır: Çok Satanlar + Son 7 Gün */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Çok Satanlar Bar Chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Çok Satanlar (30 Gün)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="satış" fill="#2563eb" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                Henüz satış verisi bulunmuyor.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kritik Stok Listesi */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              Kritik Stok
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {criticalStock?.slice(0, 10).map((p) => (
                <Link key={p.id} href={`/products/${p.id}`}>
                  <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.productCode}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge
                        variant={p.stock === 0 ? "destructive" : "secondary"}
                        className="font-mono text-xs h-5 px-1.5"
                      >
                        {p.stock}
                      </Badge>
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
              {!criticalStock?.length && (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground text-center">
                  <div>
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>Kritik stokta ürün yok</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Son 7 Gün Özeti */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Son 7 Gün — Günlük Dağılım
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData7} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtShort}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Ciro" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="profit" name="Kâr" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
