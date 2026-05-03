import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceKpiCard } from "@/components/finance-kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatTryCurrency } from "@/lib/finance-intl";
import {
  TrendingUp, AlertTriangle, Star, Clock, Wallet, RefreshCw, Lightbulb, AlertOctagon, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

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

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; tone: BadgeTone }> = {
    star: { label: "Yıldız", tone: "brand" },
    ok: { label: "Sağlıklı", tone: "neutral" },
    low_margin: { label: "Düşük Marj", tone: "warning" },
    losing: { label: "Zarar", tone: "danger" },
    stagnant: { label: "Atıl", tone: "neutral" },
  };
  const m = map[s] ?? map.ok;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function SnapDataTable({ rows, emptyState }: { rows: Snap[]; emptyState: ReactNode }) {
  const columns: DataTableColumn<Snap>[] = useMemo(() => [
    {
      id: "product",
      header: "Ürün",
      cell: (r) => (
        <>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.code}</div>
        </>
      ),
    },
    {
      id: "purchasePrice",
      header: "Alış",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.purchasePrice,
      cell: (r) => formatTryCurrency(r.purchasePrice, 2),
    },
    {
      id: "effectiveCost",
      header: "Etkin Mal.",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.effectiveCost,
      cell: (r) => (
        <>
          <div className={r.extraCost > 0 ? "font-medium" : ""}>{formatTryCurrency(r.effectiveCost, 2)}</div>
          {r.extraCost > 0.001 && (
            <div className="text-xs text-orange-600">+{formatTryCurrency(r.extraCost, 2)} ({r.daysOnShelf}g)</div>
          )}
        </>
      ),
    },
    {
      id: "salePrice",
      header: "Satış",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.salePrice,
      cell: (r) => formatTryCurrency(r.salePrice, 2),
    },
    {
      id: "trueProfit",
      header: "Gerçek Kâr",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.trueProfit,
      cell: (r) => (
        <span className={`font-semibold ${r.trueProfit < 0 ? "text-red-600" : "text-green-600"}`}>
          {formatTryCurrency(r.trueProfit, 2)}
        </span>
      ),
    },
    {
      id: "margin",
      header: "Marj",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.trueMarginPct,
      cell: (r) => (
        <span className={r.trueMarginPct < 0 ? "text-red-600" : ""}>%{fmtN(r.trueMarginPct)}</span>
      ),
    },
    {
      id: "daysOnShelf",
      header: "Rafta",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.daysOnShelf,
      cell: (r) => `${r.daysOnShelf}g`,
    },
    {
      id: "turnoverDays",
      header: "Devir",
      className: "text-right",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (r) => r.turnoverDays ?? -1,
      cell: (r) => (r.turnoverDays ? `${fmtN(r.turnoverDays)}g` : "—"),
    },
    {
      id: "status",
      header: "Durum",
      cell: (r) => <StatusBadge s={r.status} />,
    },
  ], []);

  return (
    <DataTable<Snap>
      columns={columns}
      data={rows}
      getRowId={(r) => String(r.productId)}
      enableRowSelection={false}
      emptyState={emptyState}
    />
  );
}

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
            <p className="text-sm text-muted-foreground">Henüz veri yok. Önce raf maliyeti kurallarını ayarlayın, ardından hesaplamayı başlatın.</p>
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
      <PageHeader
        title="Gerçek Kâr Paneli"
        subtitle="Görünen kâr değil, parmağınıza ulaşan kâr — en son stok anlık görüntüsü."
        right={
          <div className="flex flex-wrap gap-2">
            <Link href="/gercek-kar/oneriler"><Button variant="outline" size="sm" data-testid="button-advisor"><Lightbulb className="h-4 w-4 mr-1" />Akıllı Öneriler</Button></Link>
            <Link href="/gercek-kar/ayarlar"><Button variant="outline" size="sm" data-testid="button-settings">Ayarlar</Button></Link>
            <Button size="sm" onClick={recompute} data-testid="button-recompute"><RefreshCw className="h-4 w-4 mr-1" />Yenile</Button>
          </div>
        }
      />

      <div className="w-full min-h-[300px] rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <FinanceKpiCard label="Stok Değeri (Alış)" value={formatTryCurrency(t.stockValue, 2)} />
          <FinanceKpiCard
            label="Bugün Kaybediyorsunuz"
            value={formatTryCurrency(t.todayBleed, 2)}
            sublabel="Tüm stok için günlük raf + sermaye maliyeti"
            className="border-orange-500/20 dark:border-orange-900"
          />
          <FinanceKpiCard label="Günlük Raf Maliyeti" value={formatTryCurrency(t.dailyHoldingTotal, 2)} />
          <FinanceKpiCard label="Günlük Sermaye Maliyeti" value={formatTryCurrency(t.dailyCapitalTotal, 2)} />
        </div>
      </div>

      {(() => {
        const annualBleed = t.todayBleed * 365;
        const criticalCount = data!.losing.length + data!.stagnant.length;
        const losingCapital = data!.losing.reduce((a, s) => a + (s.purchasePrice * s.stockQty), 0);
        const losingCapitalPct = t.stockValue > 0 ? (losingCapital / t.stockValue) * 100 : 0;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="profit-insights-strip">
            <FinanceKpiCard
              label="Ürün Karması"
              value={String(data!.productCount)}
              sublabel={`★ ${data!.stars.length} · ⚠ ${data!.losing.length} · ◷ ${data!.stagnant.length}`}
            />
            <FinanceKpiCard
              label="Yıllık Yansıma"
              value={formatTryCurrency(annualBleed, 2)}
              sublabel="bugünkü hız × 365 gün"
              className="border-red-200"
            />
            <FinanceKpiCard
              label="Müdahale Bekleyen"
              value={String(criticalCount)}
              sublabel="zarar + atıl ürün"
              className={criticalCount > 0 ? "border-amber-200" : ""}
            />
            <FinanceKpiCard
              label="Zararlı Sermaye Oranı"
              value={`%${fmtN(losingCapitalPct)}`}
              sublabel={formatTryCurrency(losingCapital, 2) + " kilitli"}
              className={losingCapitalPct > 10 ? "border-red-200" : ""}
            />
          </div>
        );
      })()}

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
                      <Badge tone="neutral" className={`text-[10px] px-1.5 py-0 ${rankColor}`}>#{i + 1}</Badge>
                      <span className="text-[10px] text-muted-foreground">{s.daysOnShelf}g rafta</span>
                    </div>
                    <div className="text-sm font-medium truncate" title={s.name}>{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">{s.code || `#${s.productId}`}</div>
                    <div className="text-sm font-bold text-red-600 mt-1">{formatTryCurrency(s.trueProfit, 2)}</div>
                    <div className="text-[11px] text-muted-foreground">marj: <span className="text-red-600">%{fmtN(s.trueMarginPct)}</span> · stok: {fmtN(s.stockQty)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="w-full min-h-[300px] rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] overflow-hidden">
        <Tabs defaultValue="losing">
          <TabsList className="w-full justify-start rounded-none border-b">
            <TabsTrigger value="losing" data-testid="tab-losing"><AlertTriangle className="h-4 w-4 mr-1" />Zarar Yazan ({data!.losing.length})</TabsTrigger>
            <TabsTrigger value="stagnant" data-testid="tab-stagnant"><Clock className="h-4 w-4 mr-1" />Atıl Stok ({data!.stagnant.length})</TabsTrigger>
            <TabsTrigger value="stars" data-testid="tab-stars"><Star className="h-4 w-4 mr-1" />Yıldızlar ({data!.stars.length})</TabsTrigger>
            <TabsTrigger value="top" data-testid="tab-top">En Kârlı (Top 10)</TabsTrigger>
            <TabsTrigger value="locked" data-testid="tab-locked"><Wallet className="h-4 w-4 mr-1" />Sermaye Kilitleyen</TabsTrigger>
          </TabsList>
          <TabsContent value="losing" className="m-0 p-3">
            <SnapDataTable
              rows={data!.losing}
              emptyState={
                <EmptyState
                  icon={AlertTriangle}
                  title="Zarar yazan ürün yok"
                  description="Şu an listede görünen ürününüz zararda değil — veriler yenilendikçe tablo güncellenir."
                  action={{ label: "Ürünlere git", href: "/products" }}
                />
              }
            />
          </TabsContent>
          <TabsContent value="stagnant" className="m-0 p-3">
            <SnapDataTable
              rows={data!.stagnant}
              emptyState={
                <EmptyState
                  icon={Clock}
                  title="Atıl stok yok"
                  description="Uzun süredir satılmayan ürün kalmadığında bu liste boş kalır."
                />
              }
            />
          </TabsContent>
          <TabsContent value="stars" className="m-0 p-3">
            <SnapDataTable
              rows={data!.stars}
              emptyState={
                <EmptyState
                  icon={Star}
                  title="Yıldız ürün henüz yok"
                  description="Marj ve satış hızı kriterlerini geçen ürünler burada listelenir."
                />
              }
            />
          </TabsContent>
          <TabsContent value="top" className="m-0 p-3">
            <SnapDataTable
              rows={data!.topProfit}
              emptyState={
                <EmptyState
                  icon={TrendingUp}
                  title="En kârlı sıralaması boş"
                  description="Gerçek kâr hesaplaması için yeterli satış ve stok verisi oluştuğunda ürünler sıralanır."
                />
              }
            />
          </TabsContent>
          <TabsContent value="locked" className="m-0 p-3">
            <SnapDataTable
              rows={data!.capitalLocked}
              emptyState={
                <EmptyState
                  icon={Wallet}
                  title="Sermaye kilidi listesi boş"
                  description="Uzun süre rafta kalan ve sermayeyi bağlayan ürünler burada gösterilir."
                />
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
