import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, PackageX, Minus, Sun, Moon, Sunset } from "lucide-react";
import { Link } from "wouter";

interface MorningBriefData {
  greeting: string;
  date: string;
  yesterday: {
    salesCount: number;
    revenue: number;
    profit: number;
    revenueTrend: number | null;
  };
  week: {
    salesCount: number;
    revenue: number;
    profit: number;
  };
  stock: {
    zeroStock: number;
    lowStock: number;
    criticalProducts: Array<{
      id: number;
      name: string;
      productCode: string;
      stock: number;
      minStock: number;
    }>;
  };
}

function useMorningBrief() {
  return useQuery<MorningBriefData>({
    queryKey: ["dashboard", "morning-brief"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/morning-brief", { credentials: "include" });
      if (!res.ok) throw new Error("fetch error");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

const fmt = (v: number) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₺";

function GreetingIcon({ greeting }: { greeting: string }) {
  if (greeting.includes("Günaydın")) return <Sun className="h-5 w-5 text-amber-400" />;
  if (greeting.includes("akşamlar")) return <Moon className="h-5 w-5 text-indigo-400" />;
  return <Sunset className="h-5 w-5 text-orange-400" />;
}

export function MorningBrief() {
  const { data, isLoading, isError } = useMorningBrief();

  if (isLoading || isError || !data) return null;

  const { greeting, yesterday, week, stock } = data;
  const trend = yesterday.revenueTrend;

  return (
    <Card className="border-0 bg-gradient-to-br from-slate-800 to-slate-900 text-white overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <GreetingIcon greeting={greeting} />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">{greeting}!</p>
              <p className="text-white/60 text-xs">
                {new Date(data.date).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>

          {/* Trend badge */}
          {trend !== null && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${trend >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Dün Satış */}
          <div className="bg-white/8 rounded-xl p-3">
            <p className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Dün Ciro</p>
            <p className="font-bold text-base">{fmt(yesterday.revenue)}</p>
            <p className="text-white/50 text-xs">{yesterday.salesCount} satış</p>
          </div>

          {/* Dün Kâr */}
          <div className="bg-white/8 rounded-xl p-3">
            <p className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Dün Kâr</p>
            <p className="font-bold text-base text-emerald-400">{fmt(yesterday.profit)}</p>
            <p className="text-white/50 text-xs">
              {yesterday.revenue > 0 ? ((yesterday.profit / yesterday.revenue) * 100).toFixed(1) : 0}% marj
            </p>
          </div>

          {/* 7 Gün */}
          <div className="bg-white/8 rounded-xl p-3">
            <p className="text-white/50 text-[10px] uppercase tracking-wider mb-1">7 Günlük</p>
            <p className="font-bold text-base">{fmt(week.revenue)}</p>
            <p className="text-white/50 text-xs">{week.salesCount} satış</p>
          </div>
        </div>

        {/* Stok Uyarıları */}
        {(stock.zeroStock > 0 || stock.lowStock > 0) && (
          <div className="border-t border-white/10 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Stok Uyarıları</p>
              <div className="flex gap-1.5">
                {stock.zeroStock > 0 && (
                  <Badge className="bg-red-500/30 text-red-300 border-0 text-[10px] gap-1">
                    <PackageX className="h-3 w-3" />
                    {stock.zeroStock} tükendi
                  </Badge>
                )}
                {stock.lowStock > 0 && (
                  <Badge className="bg-amber-500/30 text-amber-300 border-0 text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {stock.lowStock} kritik
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stock.criticalProducts.slice(0, 3).map((p) => (
                <Link key={p.id} href={`/products/${p.id}`}>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer hover:opacity-80 transition-opacity ${p.stock === 0 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>
                    {p.stock === 0 ? <PackageX className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {p.name}
                  </span>
                </Link>
              ))}
              {stock.criticalProducts.length > 3 && (
                <Link href="/products?lowStock=true">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-white/10 text-white/60 cursor-pointer hover:opacity-80">
                    +{stock.criticalProducts.length - 3} daha
                  </span>
                </Link>
              )}
            </div>
          </div>
        )}

        {stock.zeroStock === 0 && stock.lowStock === 0 && (
          <div className="border-t border-white/10 pt-3 flex items-center gap-2 text-emerald-400">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs">Tüm stoklar normal seviyede</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
