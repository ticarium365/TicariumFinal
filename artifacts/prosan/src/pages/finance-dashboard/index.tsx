import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, Banknote, Receipt, FileText, AlertTriangle,
  Loader2, Bot, Send, Download, RefreshCw, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0);
const fmtTLp = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);

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

  // AI CFO chat
  const [cfoInput, setCfoInput] = useState("");
  const [cfoBusy, setCfoBusy] = useState(false);
  const [cfoMessages, setCfoMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [exportBusy, setExportBusy] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, agingRes] = await Promise.all([
        fetch("/api/finance-dashboard/summary", { credentials: "include" }),
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
  }, [toast]);

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
      const url = "/api/finance-dashboard/accountant-export";
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

  if (loading || !safeData) {
    return <div className="p-12 text-center"><Loader2 className="inline h-8 w-8 animate-spin" /></div>;
  }

  const k = safeData.kpis;
  const isHealthy = k.netMonthCash > 0;

  return (
    <>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <TrendingUp className="h-7 w-7" /> Finans Paneli
            </h1>
            <p className="text-muted-foreground">Nakit, alacak, borç ve AI CFO analizi</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchSummary}>
              <RefreshCw className="h-4 w-4 mr-2" /> Yenile
            </Button>
            <Button onClick={exportXlsx} disabled={exportBusy}>
              {exportBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Muhasebeci için Export (XLSX)
            </Button>
          </div>
        </div>

        {/* Top KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4" /> Toplam Banka Bakiyesi</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtTLp(k.totalBankBalance)}</div>
            </CardContent>
          </Card>
          <Card className={isHealthy ? "border-emerald-500/20" : "border-red-500/20"}>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
              {isHealthy ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}
              Bu Ay Net Nakit
            </CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isHealthy ? "text-emerald-600" : "text-red-600"}`}>{fmtTLp(k.netMonthCash)}</div>
              <div className="text-xs text-muted-foreground">Satış − (Alış + Gider)</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" /> Müşteri Alacakları</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-300">{fmtTL(k.customersBalance)}</div>
              <div className="text-xs text-muted-foreground">Tahsil edilecek toplam</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Tedarikçi Borçları</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-300">{fmtTL(k.suppliersBalance)}</div>
              <div className="text-xs text-muted-foreground">{k.unpaidPurchasesCount} ödenmemiş alış</div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Bu Ay Satış</div>
            <div className="text-xl font-bold">{fmtTL(k.monthSales)}</div>
            <div className="text-xs text-muted-foreground">{k.monthSalesCount} adet</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Bu Ay Alış</div>
            <div className="text-xl font-bold">{fmtTL(k.monthPurchases)}</div>
            <div className="text-xs text-muted-foreground">{k.monthPurchasesCount} adet</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Bu Ay Gider</div>
            <div className="text-xl font-bold">{fmtTL(k.monthExpenses)}</div>
            <div className="text-xs text-muted-foreground">{k.monthExpensesCount} adet</div>
          </CardContent></Card>
          <Card className={(k.pendingDocs + k.unmatchedTx) > 0 ? "border-amber-500/30" : ""}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {(k.pendingDocs + k.unmatchedTx) > 0 && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                İşlem Bekleyen
              </div>
              <div className="text-xl font-bold">{k.pendingDocs + k.unmatchedTx}</div>
              <div className="text-xs text-muted-foreground">{k.pendingDocs} belge · {k.unmatchedTx} hareket</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Cashflow */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Son 30 Gün Nakit Akışı</CardTitle></CardHeader>
            <CardContent>
              {safeData.cashflow30d.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">Henüz banka hareketi yok.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={safeData.cashflow30d}>
                    <defs>
                      <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} fontSize={11} />
                    <YAxis tickFormatter={(v) => `₺${(v/1000).toFixed(0)}K`} fontSize={11} />
                    <Tooltip
                      formatter={(v: number) => fmtTLp(v)}
                      labelFormatter={(d) => new Date(d as string).toLocaleDateString("tr-TR")}
                    />
                    <Area type="monotone" dataKey="inflow" stroke="#10b981" fill="url(#gIn)" name="Giriş" />
                    <Area type="monotone" dataKey="outflow" stroke="#ef4444" fill="url(#gOut)" name="Çıkış" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Aging summary */}
          <Card>
            <CardHeader><CardTitle className="text-base">Yaşlandırma</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">ALACAKLAR</div>
                {safeData.agingReceivables.map(a => (
                  <div key={a.bucket} className="flex justify-between text-sm py-1 border-b last:border-b-0">
                    <span>{a.bucket}</span>
                    <span className="font-medium text-emerald-300">{fmtTL(a.total)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">BORÇLAR</div>
                {safeData.agingPayables.map(a => (
                  <div key={a.bucket} className="flex justify-between text-sm py-1 border-b last:border-b-0">
                    <span>{a.bucket}</span>
                    <span className="font-medium text-red-300">{fmtTL(a.total)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI CFO Chat */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> AI CFO — Yapay Zeka Mali Müşaviriniz
              <Badge variant="outline" className="ml-2">GPT-5.2</Badge>
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
