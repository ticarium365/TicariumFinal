import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { endOfMonth, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DateRangePicker, financeRangeToApiStrings } from "@/components/ui/date-range-picker";
import { FinanceKpiCard } from "@/components/finance-kpi-card";
import { formatTryCurrency } from "@/lib/finance-intl";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Loader2, Bot, Send, Download, RefreshCw,
} from "lucide-react";
const FinanceDashboardCashflowChart = lazy(() =>
  import("@/components/finance-dashboard-cashflow-chart").then((m) => ({
    default: m.FinanceDashboardCashflowChart,
  })),
);

type CashflowDay = { date: string; inflow?: number; outflow?: number; net: number; in?: number; out?: number };
type Summary = {
  kpis: {
    totalBankBalance: number;
    monthSales: number;
    monthSalesCount: number;
    monthPurchases: number;
    monthPurchasesCount: number;
    monthExpenses: number;
    monthExpensesCount: number;
    netMonthCash: number;
    pendingDocs: number;
    unmatchedTx: number;
    unpaidPurchases: number;
    unpaidPurchasesCount: number;
    suppliersBalance: number;
    customersBalance: number;
  };
  cashflow30d: CashflowDay[];
  agingReceivables: { bucket: string; total: number; count: number }[];
  agingPayables: { bucket: string; total: number; count: number }[];
  recentDocs: any[];
};

export default function FinanceDashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  }));

  // AI CFO chat
  const [cfoInput, setCfoInput] = useState("");
  const [cfoBusy, setCfoBusy] = useState(false);
  const [cfoMessages, setCfoMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [exportBusy, setExportBusy] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = financeRangeToApiStrings(range);
      const sumUrl = `/api/finance-dashboard/summary?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}`;
      const [sumRes, agingRes] = await Promise.all([
        fetch(sumUrl, { credentials: "include" }),
        fetch("/api/finance-dashboard/aging", { credentials: "include" }),
      ]);
      if (!sumRes.ok) {
        toast({ title: "Özet yüklenemedi", description: `HTTP ${sumRes.status}`, variant: "destructive" });
        return;
      }
      const sum = await sumRes.json();
      let agingPayables: { bucket: string; total: number; count: number }[] = [];
      let agingReceivables: { bucket: string; total: number; count: number }[] = [];
      if (agingRes.ok) {
        const a = await agingRes.json();
        if (a.purchasesAging && typeof a.purchasesAging === "object") {
          agingPayables = Object.entries(a.purchasesAging).map(([bucket, total]) => ({
            bucket, total: Number(total) || 0, count: 0,
          }));
        }
        if (a.receivables) agingReceivables = a.receivables;
        if (a.payables) agingPayables = a.payables;
      }
      setData({
        ...sum,
        agingReceivables: agingReceivables.length ? agingReceivables : (sum.agingReceivables || []),
        agingPayables: agingPayables.length ? agingPayables : (sum.agingPayables || []),
      });
    } catch (e: any) {
      toast({ title: "Hata", description: String(e?.message || e), variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, range]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const askCfo = async () => {
    const q = cfoInput.trim();
    if (!q) return;
    setCfoMessages(m => [...m, { role: "user", content: q }]);
    setCfoInput("");
    setCfoBusy(true);
    try {
      const res = await fetch("/api/finance-dashboard/ai-cfo/analyze", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCfoMessages(m => [...m, { role: "assistant", content: `❌ ${json?.error || "Analiz hatası"}` }]);
      } else {
        setCfoMessages(m => [...m, { role: "assistant", content: json.analysis || json.answer || "(boş yanıt)" }]);
      }
    } catch (e: any) {
      setCfoMessages(m => [...m, { role: "assistant", content: `❌ ${e?.message || e}` }]);
    } finally { setCfoBusy(false); }
  };

  const exportXlsx = async () => {
    setExportBusy(true);
    try {
      const { startDate, endDate } = financeRangeToApiStrings(range);
      const url = `/api/finance-dashboard/accountant-export?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        toast({ title: "Export başarısız", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `muhasebe-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      toast({ title: "İndirme başladı" });
    } finally { setExportBusy(false); }
  };

  const safeData = data ? {
    ...data,
    cashflow30d: data.cashflow30d || [],
    agingReceivables: data.agingReceivables || [],
    agingPayables: data.agingPayables || [],
    recentDocs: data.recentDocs || [],
  } : null;

  if (loading && !safeData) {
    return <div className="p-12 text-center"><Loader2 className="inline h-8 w-8 animate-spin" /></div>;
  }
  if (!safeData) {
    return <div className="p-12 text-center text-muted-foreground">Veri yok</div>;
  }

  const k = safeData.kpis;
  const isHealthy = k.netMonthCash > 0;

  return (
    <>
      <div className="space-y-6 p-6">
        <PageHeader
          title="Finans Özeti"
          subtitle="Nakit, alacak, borç ve AI CFO analizi"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker value={range} onChange={setRange} useShortLabel className="min-w-[200px]" />
              <Button variant="secondary" onClick={fetchSummary} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Yenile
              </Button>
              <Button onClick={exportXlsx} disabled={exportBusy}>
                {exportBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Muhasebeci için Export (XLSX)
              </Button>
            </div>
          }
        />

        {/* Top KPI Row */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <FinanceKpiCard
            label="Toplam banka bakiyesi"
            value={formatTryCurrency(k.totalBankBalance, 2)}
            sublabel="Tüm aktif hesaplar"
          />
          <FinanceKpiCard
            label="Dönem net nakit"
            value={formatTryCurrency(k.netMonthCash, 2)}
            sublabel={
              <span className={isHealthy ? "text-[var(--color-semantic-success)]" : "text-[var(--color-semantic-danger)]"}>
                Satış − (Alış + Gider)
              </span>
            }
          />
          <FinanceKpiCard
            label="Müşteri alacakları"
            value={formatTryCurrency(k.customersBalance, 0)}
            sublabel="Tahsil edilecek toplam"
          />
          <FinanceKpiCard
            label="Tedarikçi borçları"
            value={formatTryCurrency(k.suppliersBalance, 0)}
            sublabel={`${k.unpaidPurchasesCount} ödenmemiş alış`}
          />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card variant="flat" className="border border-[color:var(--color-border-subtle)] shadow-none">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Dönem satış</div>
              <div className="text-xl font-bold">{formatTryCurrency(k.monthSales, 0)}</div>
              <div className="text-xs text-muted-foreground">{k.monthSalesCount} adet</div>
            </CardContent>
          </Card>
          <Card variant="flat" className="border border-[color:var(--color-border-subtle)] shadow-none">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Dönem alış</div>
              <div className="text-xl font-bold">{formatTryCurrency(k.monthPurchases, 0)}</div>
              <div className="text-xs text-muted-foreground">{k.monthPurchasesCount} adet</div>
            </CardContent>
          </Card>
          <Card variant="flat" className="border border-[color:var(--color-border-subtle)] shadow-none">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Dönem gider</div>
              <div className="text-xl font-bold">{formatTryCurrency(k.monthExpenses, 0)}</div>
              <div className="text-xs text-muted-foreground">{k.monthExpensesCount} adet</div>
            </CardContent>
          </Card>
          <Card variant="flat" className={`border shadow-none ${(k.pendingDocs + k.unmatchedTx) > 0 ? "border-amber-500/30" : "border-[color:var(--color-border-subtle)]"}`}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {(k.pendingDocs + k.unmatchedTx) > 0 && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                İşlem bekleyen
              </div>
              <div className="text-xl font-bold">{k.pendingDocs + k.unmatchedTx}</div>
              <div className="text-xs text-muted-foreground">{k.pendingDocs} belge · {k.unmatchedTx} hareket</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Nakit akışı (banka hareketleri)</CardTitle></CardHeader>
            <CardContent>
              <div className="w-full min-h-[300px] rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] p-2">
                <Suspense fallback={<div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                  <FinanceDashboardCashflowChart data={safeData.cashflow30d} />
                </Suspense>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Yaşlandırma</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="w-full min-h-[300px] rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] p-3">
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">ALACAKLAR</div>
                  {safeData.agingReceivables.map(a => (
                    <div key={a.bucket} className="flex justify-between border-b py-1 text-sm last:border-b-0">
                      <span>{a.bucket}</span>
                      <span className="font-medium text-emerald-600">{formatTryCurrency(a.total, 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">BORÇLAR</div>
                  {safeData.agingPayables.map(a => (
                    <div key={a.bucket} className="flex justify-between border-b py-1 text-sm last:border-b-0">
                      <span>{a.bucket}</span>
                      <span className="font-medium text-red-600">{formatTryCurrency(a.total, 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI CFO Chat */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> AI CFO — Yapay Zeka Mali Müşaviriniz
              <Badge tone="neutral" className="ml-2">Beta</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted/30 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3 min-h-32">
              {cfoMessages.length === 0 ? (
                <div className="text-sm text-muted-foreground space-y-2">
                  <div>👋 Merhaba! Şirketinizin finansal durumunu sorabilirsiniz. Örnekler:</div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>"Bu ay nakit akışım nasıl?"</li>
                    <li>"Hangi tedarikçiye ne kadar borçluyum?"</li>
                    <li>"Önümüzdeki 30 günde nelere dikkat etmeliyim?"</li>
                    <li>"Karlılığım nasıl?"</li>
                  </ul>
                </div>
              ) : (
                cfoMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {cfoBusy && (
                <div className="flex justify-start">
                  <div className="bg-background border rounded-lg px-3 py-2 text-sm">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Analiz ediliyor...
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                rows={2}
                placeholder="Finans sorunuzu yazın..."
                value={cfoInput}
                onChange={(e) => setCfoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askCfo(); }
                }}
                disabled={cfoBusy}
              />
              <Button onClick={askCfo} disabled={cfoBusy || !cfoInput.trim()}>
                {cfoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
