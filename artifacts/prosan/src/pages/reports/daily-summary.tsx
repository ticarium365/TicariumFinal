import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, RotateCcw, AlertTriangle, Receipt,
  CreditCard, Banknote, ArrowLeftRight, HelpCircle,
  ChevronLeft, ChevronRight, Printer, Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TopProduct {
  productName: string;
  productCode: string;
  quantity: number;
  revenue: number;
}

interface DailySummaryData {
  date: string;
  totalSalesCount: number;
  totalRevenue: number;
  totalProfit: number;
  netRevenue: number;
  totalReturnedCount: number;
  totalReturnedAmount: number;
  paymentBreakdown: { cash: number; card: number; transfer: number; other: number };
  topProducts: TopProduct[];
  lowStockCount: number;
}

async function fetchDailySummary(date: string): Promise<DailySummaryData> {
  const res = await fetch(`/api/reports/daily-summary?date=${date}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Özet alınamadı");
  }
  return res.json();
}

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function offsetDate(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}

const PAYMENT_ICONS: Record<string, any> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowLeftRight,
  other: HelpCircle,
};
const PAYMENT_LABELS: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  transfer: "Havale",
  other: "Diğer",
};

export default function DailySummaryPage() {
  const [date, setDate] = useState(todayStr());

  const { data, isLoading, error } = useQuery<DailySummaryData>({
    queryKey: ["daily-summary", date],
    queryFn: () => fetchDailySummary(date),
    retry: false,
  });

  const isToday = date === todayStr();
  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("tr-TR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 print:space-y-4">

      {/* Başlık + tarih navigasyonu */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Günlük Kapanış</h1>
          <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="icon" onClick={() => setDate(d => offsetDate(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button variant="outline" size="icon" onClick={() => setDate(d => offsetDate(d, 1))} disabled={isToday}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Yazdır
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 h-24" />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/30">
          <CardContent className="p-5 text-destructive text-sm">{String(error)}</CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* KPI Kartları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Satış Adedi</span>
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-3xl font-bold tabular-nums">{data.totalSalesCount}</p>
                {data.totalReturnedCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{data.totalReturnedCount} iade</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Brüt Ciro</span>
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <p className="text-3xl font-bold tabular-nums">{fmt(data.totalRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">TL</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Ciro</span>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-3xl font-bold tabular-nums text-green-600">{fmt(data.netRevenue)}</p>
                {data.totalReturnedAmount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">İade: -{fmt(data.totalReturnedAmount)} TL</p>
                )}
              </CardContent>
            </Card>

            <Card className={data.lowStockCount > 0 ? "border-amber-500/30" : ""}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kritik Stok</span>
                  <AlertTriangle className={`h-4 w-4 ${data.lowStockCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                </div>
                <p className={`text-3xl font-bold tabular-nums ${data.lowStockCount > 0 ? "text-amber-600" : ""}`}>{data.lowStockCount}</p>
                <p className="text-xs text-muted-foreground mt-1">ürün</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Ödeme Yöntemi Kırılımı */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ödeme Yöntemi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(["cash", "card", "transfer", "other"] as const).map((method) => {
                  const amount = data.paymentBreakdown[method];
                  const Icon = PAYMENT_ICONS[method];
                  const total = Object.values(data.paymentBreakdown).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? (amount / total) * 100 : 0;
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{PAYMENT_LABELS[method]}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold tabular-nums">{fmt(amount)} TL</span>
                          {pct > 0 && <span className="text-xs text-muted-foreground ml-2">%{pct.toFixed(0)}</span>}
                        </div>
                      </div>
                      {pct > 0 && (
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}

                {data.totalSalesCount === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Bu gün satış yapılmamış</p>
                )}
              </CardContent>
            </Card>

            {/* En Çok Satan Ürünler */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">En Çok Satan 5 Ürün</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Bu gün satış yapılmamış</p>
                ) : (
                  <div className="space-y-3">
                    {data.topProducts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.productName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.productCode}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold tabular-nums">{p.quantity} adet</p>
                          <p className="text-xs text-muted-foreground">{fmt(p.revenue)} TL</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Kar Bilgisi */}
          {data.totalSalesCount > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5">
                <div className="flex flex-wrap gap-6 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-8 w-8 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Günlük Kar</p>
                      <p className="text-2xl font-bold text-primary tabular-nums">{fmt(data.totalProfit)} TL</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Brüt Ciro</p>
                      <p className="font-semibold tabular-nums">{fmt(data.totalRevenue)} TL</p>
                    </div>
                    {data.totalReturnedAmount > 0 && (
                      <div>
                        <p className="text-muted-foreground text-xs">İade</p>
                        <p className="font-semibold text-destructive tabular-nums">-{fmt(data.totalReturnedAmount)} TL</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground text-xs">Net Ciro</p>
                      <p className="font-semibold tabular-nums">{fmt(data.netRevenue)} TL</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {data.totalSalesCount === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium text-muted-foreground">Bu gün için satış kaydı bulunamadı</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
