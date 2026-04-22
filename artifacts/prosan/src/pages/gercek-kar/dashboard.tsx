import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, AlertTriangle, Star, Clock, Wallet, RefreshCw, Lightbulb, Activity, Zap, AlertOctagon, ChevronRight } from "lucide-react";
import { Link } from "wouter";

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);
const fmtN = (n: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n || 0);

interface Snap {
  productId: number; name: string; code: string;
  purchasePrice: number; salePrice: number; stockQty: number;
  daysOnShelf: number; effectiveCost: number; trueProfit: number;
  trueMarginPct: number; breakEvenDay: number | null;
  turnoverDays: number | null; status: string; extraCost: number;
}
interface Dashboard {
  empty: boolean;
  totals: { stockValue: number; dailyHoldingTotal: number; dailyCapitalTotal: number; todayBleed: number };
  topProfit: Snap[]; losing: Snap[]; stagnant: Snap[]; stars: Snap[]; capitalLocked: Snap[];
  productCount: number;
}

const StatusBadge = ({ s }: { s: string }) => {
  const map: Record<string, { label: string; v: any }> = {
    star: { label: "Yıldız", v: "default" },
    ok: { label: "Sağlıklı", v: "secondary" },
    low_margin: { label: "Düşük Marj", v: "outline" },
    losing: { label: "Zarar", v: "destructive" },
    stagnant: { label: "Atıl", v: "outline" },
  };
  const m = map[s] ?? map.ok;
  return <Badge variant={m.v as any}>{m.label}</Badge>;
};

const SnapTable = ({ rows, emptyText }: { rows: Snap[]; emptyText: string }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 px-2">Ürün</th>
            <th className="py-2 px-2 text-right">Alış</th>
            <th className="py-2 px-2 text-right">Etkin Mal.</th>
            <th className="py-2 px-2 text-right">Satış</th>
            <th className="py-2 px-2 text-right">Gerçek Kâr</th>
            <th className="py-2 px-2 text-right">Marj</th>
            <th className="py-2 px-2 text-right">Rafta</th>
            <th className="py-2 px-2 text-right">Devir</th>
            <th className="py-2 px-2">Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId} className="border-b hover:bg-muted/30" data-testid={`row-snap-${r.productId}`}>
              <td className="py-2 px-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.code}</div>
              </td>
              <td className="py-2 px-2 text-right">{fmt(r.purchasePrice)}</td>
              <td className="py-2 px-2 text-right">
                <div className={r.extraCost > 0 ? "font-medium" : ""}>{fmt(r.effectiveCost)}</div>
                {r.extraCost > 0.001 && (
                  <div className="text-xs text-orange-600">+{fmt(r.extraCost)} ({r.daysOnShelf}g)</div>
                )}
              </td>
              <td className="py-2 px-2 text-right">{fmt(r.salePrice)}</td>
              <td className={`py-2 px-2 text-right font-semibold ${r.trueProfit < 0 ? "text-red-600" : "text-green-600"}`}>
                {fmt(r.trueProfit)}
              </td>
              <td className={`py-2 px-2 text-right ${r.trueMarginPct < 0 ? "text-red-600" : ""}`}>
                %{fmtN(r.trueMarginPct)}
              </td>
              <td className="py-2 px-2 text-right">{r.daysOnShelf}g</td>
              <td className="py-2 px-2 text-right">{r.turnoverDays ? `${fmtN(r.turnoverDays)}g` : "—"}</td>
              <td className="py-2 px-2"><StatusBadge s={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function GercekKarDashboard() {
  const { data, isLoading, isError, refetch, error } = useQuery<Dashboard>({
    queryKey: ["/api/profit-engine/dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/profit-engine/dashboard", { credentials: "include" });
      if (!r.ok) throw new Error("Veri alınamadı");
      return r.json();
    },
  });

  const recompute = async () => {
    await fetch("/api/profit-engine/recompute", { method: "POST", credentials: "include" });
    await refetch();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-orange-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">{(error as Error)?.message ?? "Hata"}</p>
            <Button onClick={() => refetch()} size="sm" data-testid="button-retry"><RefreshCw className="h-4 w-4 mr-1" />Tekrar Dene</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data?.empty) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Gerçek Kâr Motoru</CardTitle>
            <CardDescription>Henüz veri yok. Önce raf maliyeti kurallarını ayarlayın, ardından hesaplamayı başlatın.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href="/gercek-kar/ayarlar"><Button data-testid="button-settings">Ayarlara Git</Button></Link>
            <Button variant="outline" onClick={recompute} data-testid="button-recompute"><RefreshCw className="h-4 w-4 mr-1" />Şimdi Hesapla</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const t = data!.totals;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6 text-primary" />Gerçek Kâr Paneli</h1>
          <p className="text-sm text-muted-foreground">Görünen kâr değil, parmağınıza ulaşan kâr</p>
        </div>
        <div className="flex gap-2">
          <Link href="/gercek-kar/oneriler"><Button variant="outline" size="sm" data-testid="button-advisor"><Lightbulb className="h-4 w-4 mr-1" />Akıllı Öneriler</Button></Link>
          <Link href="/gercek-kar/ayarlar"><Button variant="outline" size="sm" data-testid="button-settings">Ayarlar</Button></Link>
          <Button size="sm" onClick={recompute} data-testid="button-recompute"><RefreshCw className="h-4 w-4 mr-1" />Yenile</Button>
        </div>
      </div>

      {/* Metrikler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stock-value">
          <CardHeader className="pb-2"><CardDescription>Stok Değeri (Alış)</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(t.stockValue)}</div></CardContent>
        </Card>
        <Card className="border-orange-500/20 dark:border-orange-900" data-testid="card-today-bleed">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><TrendingDown className="h-3 w-3" />Bugün Kaybediyorsunuz</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{fmt(t.todayBleed)}</div>
            <div className="text-xs text-muted-foreground">Tüm stok için günlük raf+sermaye maliyeti</div>
          </CardContent>
        </Card>
        <Card data-testid="card-daily-holding">
          <CardHeader className="pb-2"><CardDescription>Günlük Raf Maliyeti</CardDescription></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(t.dailyHoldingTotal)}</div></CardContent>
        </Card>
        <Card data-testid="card-daily-capital">
          <CardHeader className="pb-2"><CardDescription>Günlük Sermaye Maliyeti</CardDescription></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(t.dailyCapitalTotal)}</div></CardContent>
        </Card>
      </div>

      {/* Dalga 32 — Ek Insight Strip (sadece ekleme, mevcut data'dan türetilmiş) */}
      {(() => {
        const annualBleed = t.todayBleed * 365;
        const criticalCount = data!.losing.length + data!.stagnant.length;
        const losingCapital = data!.losing.reduce((a, s) => a + (s.purchasePrice * s.stockQty), 0);
        const losingCapitalPct = t.stockValue > 0 ? (losingCapital / t.stockValue) * 100 : 0;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="profit-insights-strip">
            <Card data-testid="insight-product-mix">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Ürün Karması</div>
                    <div className="text-2xl font-bold mt-1">{data!.productCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-1.5 flex-wrap">
                      <span className="text-yellow-600">★ {data!.stars.length}</span>
                      <span className="text-red-600">⚠ {data!.losing.length}</span>
                      <span className="text-orange-600">◷ {data!.stagnant.length}</span>
                    </div>
                  </div>
                  <Activity className="h-7 w-7 text-blue-500 opacity-70" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200" data-testid="insight-annual-bleed">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Yıllık Yansıma</div>
                    <div className="text-xl font-bold mt-1 text-red-600">{fmt(annualBleed)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">bugünkü hız × 365 gün</div>
                  </div>
                  <Zap className="h-7 w-7 text-red-500 opacity-70" />
                </div>
              </CardContent>
            </Card>
            <Card className={criticalCount > 0 ? "border-amber-200" : ""} data-testid="insight-critical-count">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Müdahale Bekleyen</div>
                    <div className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>{criticalCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">zarar + atıl ürün</div>
                  </div>
                  <AlertOctagon className={`h-7 w-7 opacity-70 ${criticalCount > 0 ? "text-amber-500" : "text-emerald-500"}`} />
                </div>
              </CardContent>
            </Card>
            <Card className={losingCapitalPct > 10 ? "border-red-200" : ""} data-testid="insight-losing-capital">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Zararlı Sermaye Oranı</div>
                    <div className={`text-2xl font-bold mt-1 ${losingCapitalPct > 10 ? "text-red-600" : losingCapitalPct > 0 ? "text-amber-600" : "text-emerald-600"}`}>%{fmtN(losingCapitalPct)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{fmt(losingCapital)} kilitli</div>
                  </div>
                  <Wallet className={`h-7 w-7 opacity-70 ${losingCapitalPct > 10 ? "text-red-500" : "text-slate-400"}`} />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Dalga 32 — "Acil Müdahale Gereken" widget (en kötü 5 zarar) */}
      {data!.losing.length > 0 && (
        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20" data-testid="critical-losers-widget">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-red-600" />
                <CardTitle className="text-sm">Acil Müdahale — En Kötü 5 Zarar</CardTitle>
              </div>
              <Link href="/gercek-kar/oneriler">
                <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid="btn-goto-advisor">
                  Akıllı Öneriler <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
              {[...data!.losing].sort((a, b) => a.trueProfit - b.trueProfit).slice(0, 5).map((s, i) => {
                const rankColor = i === 0 ? "bg-red-100 text-red-700 border-red-200"
                  : i === 1 ? "bg-orange-100 text-orange-700 border-orange-200"
                  : i === 2 ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-slate-100 text-slate-600 border-slate-200";
                return (
                  <div
                    key={s.productId}
                    className="p-3 rounded-lg border bg-card"
                    data-testid={`critical-loser-${s.productId}`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${rankColor}`}>#{i + 1}</Badge>
                      <span className="text-[10px] text-muted-foreground">{s.daysOnShelf}g rafta</span>
                    </div>
                    <div className="text-sm font-medium truncate" title={s.name}>{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">{s.code || `#${s.productId}`}</div>
                    <div className="text-sm font-bold text-red-600 mt-1">{fmt(s.trueProfit)}</div>
                    <div className="text-[11px] text-muted-foreground">marj: <span className="text-red-600">%{fmtN(s.trueMarginPct)}</span> · stok: {fmtN(s.stockQty)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="losing">
        <TabsList>
          <TabsTrigger value="losing" data-testid="tab-losing"><AlertTriangle className="h-4 w-4 mr-1" />Zarar Yazan ({data!.losing.length})</TabsTrigger>
          <TabsTrigger value="stagnant" data-testid="tab-stagnant"><Clock className="h-4 w-4 mr-1" />Atıl Stok ({data!.stagnant.length})</TabsTrigger>
          <TabsTrigger value="stars" data-testid="tab-stars"><Star className="h-4 w-4 mr-1" />Yıldızlar ({data!.stars.length})</TabsTrigger>
          <TabsTrigger value="top" data-testid="tab-top">En Kârlı (Top 10)</TabsTrigger>
          <TabsTrigger value="locked" data-testid="tab-locked"><Wallet className="h-4 w-4 mr-1" />Sermaye Kilitleyen</TabsTrigger>
        </TabsList>
        <TabsContent value="losing"><Card><CardContent className="p-0"><SnapTable rows={data!.losing} emptyText="Şu an zarar yazan ürün yok 🎉" /></CardContent></Card></TabsContent>
        <TabsContent value="stagnant"><Card><CardContent className="p-0"><SnapTable rows={data!.stagnant} emptyText="Atıl ürün yok" /></CardContent></Card></TabsContent>
        <TabsContent value="stars"><Card><CardContent className="p-0"><SnapTable rows={data!.stars} emptyText="Henüz yıldız ürün yok" /></CardContent></Card></TabsContent>
        <TabsContent value="top"><Card><CardContent className="p-0"><SnapTable rows={data!.topProfit} emptyText="Veri yok" /></CardContent></Card></TabsContent>
        <TabsContent value="locked"><Card><CardContent className="p-0"><SnapTable rows={data!.capitalLocked} emptyText="Veri yok" /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
