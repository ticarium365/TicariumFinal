import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, X, Download,
  ChevronRight, ArrowUpRight, ArrowDownRight, Filter, RefreshCw, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatTryCurrency, formatTrDate, formatTrDateTime } from "@/lib/finance-intl";
import { useToast } from "@/hooks/use-toast";
import { SkeletonBlock, SkeletonLine, SkeletonTable } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────
interface ExpenseCategory { id: number; name: string; icon?: string | null; color?: string | null; }
interface Expense {
  id: number; amount: number; description: string; expenseDate: string;
  paymentMethod: string; notes?: string | null; categoryId?: number | null;
  categoryName?: string | null; categoryIcon?: string | null;
}
interface CashRegister { id: number; name: string; currentBalance: number; isDefault: boolean; }
interface CashMovement {
  id: number; type: string; direction: "in" | "out"; amount: number;
  description: string; createdAt: string; balanceBefore?: number | null; balanceAfter?: number | null;
}
interface FinanceSummary {
  revenue: number; profit: number; totalExpenses: number; netProfit: number;
  salesCount: number; expenseCount: number; totalCashBalance: number;
  categoryBreakdown: { categoryId: number | null; categoryName?: string | null; categoryIcon?: string | null; total: number; count: number }[];
  dailySales: { day: string; revenue: number; profit: number }[];
  dailyExpenses: { day: string; total: number }[];
}

type TabId = "summary" | "expenses" | "cash";

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────
const PM_LABELS: Record<string, string> = { cash: "Nakit", bank: "Banka", credit: "Kredi" };

const PRESET_CATEGORIES = [
  { name: "Kira", icon: "🏢" }, { name: "Personel", icon: "👥" },
  { name: "Elektrik/Su/Gaz", icon: "💡" }, { name: "İnternet/Telefon", icon: "📱" },
  { name: "Yakıt/Ulaşım", icon: "🚗" }, { name: "Ofis Malzemesi", icon: "📦" },
  { name: "Pazarlama", icon: "📣" }, { name: "Bakım/Onarım", icon: "🔧" },
  { name: "Diğer", icon: "📋" },
];

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("summary");

  const [range, setRange] = useState(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  }));
  const startDate = format(range.from, "yyyy-MM-dd");
  const endDate = format(range.to, "yyyy-MM-dd");

  // Gider formu — tarih aralığı yönetimi DateRangePicker üzerinden
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("new");
    if (v === "expense" || v === "1") {
      setTab("expenses");
      setShowExpenseForm(true);
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, []);
  const [expForm, setExpForm] = useState({ categoryId: "", amount: "", description: "", expenseDate: format(new Date(), "yyyy-MM-dd"), paymentMethod: "cash", notes: "" });

  // Kategori formu
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", icon: "📋" });

  // Kasa hareketi formu
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashForm, setCashForm] = useState({ direction: "in", amount: "", description: "" });
  const [selectedRegister, setSelectedRegister] = useState<CashRegister | null>(null);

  // ─── Sorgular ─────────────────────────────────────────────────────────────
  const summaryQ = useQuery<FinanceSummary>({
    queryKey: ["finance-summary", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/finance/summary?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Özet yüklenemedi");
      return res.json();
    },
  });

  const categoriesQ = useQuery<{ categories: ExpenseCategory[] }>({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch("/api/finance/expense-categories", { credentials: "include" });
      if (!res.ok) throw new Error("Kategoriler yüklenemedi");
      return res.json();
    },
  });

  const expensesQ = useQuery<{ expenses: Expense[]; total: number; totalAmount: number }>({
    queryKey: ["expenses", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/finance/expenses?startDate=${startDate}&endDate=${endDate}&limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Giderler yüklenemedi");
      return res.json();
    },
    enabled: tab === "expenses",
  });

  const cashQ = useQuery<{ registers: CashRegister[] }>({
    queryKey: ["cash-registers"],
    queryFn: async () => {
      const res = await fetch("/api/finance/cash", { credentials: "include" });
      if (!res.ok) throw new Error("Kasa yüklenemedi");
      return res.json();
    },
    enabled: tab === "cash",
  });

  const movementsQ = useQuery<{ movements: CashMovement[] }>({
    queryKey: ["cash-movements", selectedRegister?.id, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/finance/cash/${selectedRegister?.id}/movements?startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Hareketler yüklenemedi");
      return res.json();
    },
    enabled: !!selectedRegister?.id && tab === "cash",
  });

  // Kasa seçimi
  useEffect(() => {
    if (cashQ.data?.registers && cashQ.data.registers.length > 0 && !selectedRegister) {
      setSelectedRegister(cashQ.data.registers.find(r => r.isDefault) ?? cashQ.data.registers[0]);
    }
  }, [cashQ.data, selectedRegister]);

  // ─── Mutasyonlar ─────────────────────────────────────────────────────────
  const addExpense = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch("/api/finance/expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kaydedilemedi");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["cash-registers"] });
      qc.invalidateQueries({ queryKey: ["cash-movements"] });
      setShowExpenseForm(false);
      setExpForm({ categoryId: "", amount: "", description: "", expenseDate: format(new Date(), "yyyy-MM-dd"), paymentMethod: "cash", notes: "" });
      toast({ title: "Gider eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/finance/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      toast({ title: "Gider silindi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const addCategory = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch("/api/finance/expense-categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kaydedilemedi");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      setShowCatForm(false);
      setCatForm({ name: "", icon: "📋" });
      toast({ title: "Kategori eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const addCashMovement = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(`/api/finance/cash/${selectedRegister?.id}/movements`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kaydedilemedi");
      return json;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["cash-registers"] });
      qc.invalidateQueries({ queryKey: ["cash-movements"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      setShowCashForm(false);
      setCashForm({ direction: "in", amount: "", description: "" });
      if (d.register) setSelectedRegister(d.register);
      toast({ title: "Kasa hareketi kaydedildi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const handleExportExpenses = async () => {
    const res = await fetch(`/api/finance/expenses/export?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
    if (!res.ok) { toast({ title: "Export başarısız", variant: "destructive" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "giderler.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── ÖZET TAB ─────────────────────────────────────────────────────────────
  const summary = summaryQ.data;
  const TABS: { id: TabId; label: string }[] = [
    { id: "summary", label: "Genel Özet" },
    { id: "expenses", label: "Giderler" },
    { id: "cash", label: "Kasa" },
  ];

  const categories = categoriesQ.data?.categories ?? [];
  const expenses = expensesQ.data?.expenses ?? [];
  const registers = cashQ.data?.registers ?? [];
  const movements = movementsQ.data?.movements ?? [];

  // Tarih presetleri
  const DATE_PRESETS = [
    { label: "Bu Ay", start: format(startOfMonth(new Date()), "yyyy-MM-dd"), end: format(endOfMonth(new Date()), "yyyy-MM-dd") },
    { label: "Geçen Ay", start: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), end: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") },
    { label: "Son 3 Ay", start: format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"), end: format(endOfMonth(new Date()), "yyyy-MM-dd") },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Kasa / Finans Merkezi</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gelir, gider ve kasa yönetimi</p>
        </div>
        <div className="flex gap-2">
          {tab === "expenses" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleExportExpenses}>
                <Download className="h-3.5 w-3.5" />CSV
              </Button>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowExpenseForm(true)}>
                <Plus className="h-3.5 w-3.5" />Gider Ekle
              </Button>
            </>
          )}
          {tab === "cash" && selectedRegister && (
            <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowCashForm(true)}>
              <Plus className="h-3.5 w-3.5" />Hareket Ekle
            </Button>
          )}
        </div>
      </div>

      {/* Tarih filtresi */}
      <div className="flex flex-wrap gap-2 items-center bg-card border rounded-xl p-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <DateRangePicker value={range} onChange={setRange} useShortLabel className="min-w-[220px]" />
        {DATE_PRESETS.map(p => (
          <button key={p.label}
            type="button"
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${startDate === p.start && endDate === p.end ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            onClick={() => {
              setRange({
                from: new Date(p.start + "T12:00:00"),
                to: new Date(p.end + "T12:00:00"),
              });
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── GENEL ÖZET ─────────────────────────────────────────────── */}
      {tab === "summary" && (
        <div className="space-y-5">
          {summaryQ.isLoading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-4 space-y-2">
                    <SkeletonBlock width={36} height={36} borderRadius={8} />
                    <SkeletonLine width="60%" height={14} />
                    <SkeletonLine width="80%" height={24} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border rounded-xl p-4 space-y-3">
                  <SkeletonLine width={140} height={16} />
                  <SkeletonLine width="50%" height={32} />
                  <SkeletonLine width="70%" height={12} />
                </div>
                <div className="bg-card border rounded-xl p-4 space-y-3">
                  <SkeletonLine width={120} height={16} />
                  <div className="space-y-2 pt-1">
                    <SkeletonLine width="100%" height={12} />
                    <SkeletonLine width="90%" height={12} />
                    <SkeletonLine width="95%" height={12} />
                  </div>
                </div>
              </div>
              <SkeletonTable rows={6} columns={5} rowHeight={40} />
            </div>
          ) : summary ? (
            <>
              {/* KPI kartları */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Satış Cirosu",    value: summary.revenue,       icon: TrendingUp,   color: "text-blue-600",   bg: "bg-blue-500/10" },
                  { label: "Satış Kârı",       value: summary.profit,        icon: TrendingUp,   color: "text-green-600",  bg: "bg-green-500/10" },
                  { label: "Toplam Gider",     value: summary.totalExpenses, icon: TrendingDown, color: "text-red-600",    bg: "bg-red-500/10" },
                  { label: "Net Kâr",          value: summary.netProfit,     icon: PiggyBank,    color: summary.netProfit >= 0 ? "text-emerald-600" : "text-red-600", bg: summary.netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10" },
                ].map(c => (
                  <div key={c.label} className="bg-card border rounded-xl p-4">
                    <div className={`inline-flex h-9 w-9 rounded-lg ${c.bg} items-center justify-center mb-2`}>
                      <c.icon className={`h-5 w-5 ${c.color}`} />
                    </div>
                    <p className={`text-xl font-bold ${c.color}`}>{formatTryCurrency(c.value, 2)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Alt satır: kasa + kategori */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kasa bakiyesi */}
                <div className="bg-card border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <p className="font-semibold text-sm">Kasa Bakiyesi</p>
                  </div>
                  <p className="text-3xl font-bold">{formatTryCurrency(summary.totalCashBalance, 2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Tüm kasaların toplamı</p>
                </div>

                {/* Gider kategori dökümü */}
                <div className="bg-card border rounded-xl p-4">
                  <p className="font-semibold text-sm mb-3">Gider Dağılımı</p>
                  {summary.categoryBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Bu dönemde gider yok</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {summary.categoryBreakdown.map((c, i) => {
                        const pct = summary.totalExpenses > 0 ? (c.total / summary.totalExpenses) * 100 : 0;
                        return (
                          <div key={i} className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span>{c.categoryIcon && `${c.categoryIcon} `}{c.categoryName ?? "Kategorisiz"}</span>
                              <span className="font-semibold">{formatTryCurrency(c.total, 2)} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Günlük akış tablosu */}
              {summary.dailySales.length > 0 && (
                <div className="bg-card border rounded-xl overflow-hidden">
                  <div className="p-3 border-b">
                    <p className="font-semibold text-sm">Günlük Akış</p>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground text-xs uppercase">Tarih</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase">Ciro</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase">Satış Kârı</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase">Gider</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {summary.dailySales.map(s => {
                          const exp = summary.dailyExpenses.find(e => e.day === s.day)?.total ?? 0;
                          const net = s.profit - exp;
                          return (
                            <tr key={s.day} className="hover:bg-muted/20">
                              <td className="px-4 py-2">{formatTrDate(new Date(s.day + "T12:00:00"), { day: "numeric", month: "short", year: "numeric" })}</td>
                              <td className="px-4 py-2 text-right font-mono">{formatTryCurrency(s.revenue, 2)}</td>
                              <td className="px-4 py-2 text-right font-mono text-green-600">{formatTryCurrency(s.profit, 2)}</td>
                              <td className="px-4 py-2 text-right font-mono text-red-500">{exp > 0 ? formatTryCurrency(exp, 2) : "—"}</td>
                              <td className={`px-4 py-2 text-right font-mono font-semibold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>{formatTryCurrency(net, 2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ─── GİDERLER TAB ────────────────────────────────────────────── */}
      {tab === "expenses" && (
        <div className="space-y-4">
          {/* Gider ekleme formu */}
          {showExpenseForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Yeni Gider</p>
                <button onClick={() => setShowExpenseForm(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Kategori</label>
                  <select value={expForm.categoryId} onChange={e => setExpForm(p => ({ ...p, categoryId: e.target.value }))}
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Kategorisiz</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon && `${c.icon} `}{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tutar (₺)</label>
                  <Input type="number" min="0" step="0.01" value={expForm.amount}
                    onChange={e => setExpForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Açıklama</label>
                  <Input value={expForm.description}
                    onChange={e => setExpForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Gider açıklaması" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tarih</label>
                  <Input type="date" value={expForm.expenseDate}
                    onChange={e => setExpForm(p => ({ ...p, expenseDate: e.target.value }))}
                    className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Ödeme Yöntemi</label>
                  <select value={expForm.paymentMethod}
                    onChange={e => setExpForm(p => ({ ...p, paymentMethod: e.target.value }))}
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="cash">Nakit</option>
                    <option value="bank">Banka</option>
                    <option value="credit">Kredi</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Not (opsiyonel)</label>
                  <Input value={expForm.notes}
                    onChange={e => setExpForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Not" className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => addExpense.mutate({
                  categoryId: expForm.categoryId ? Number(expForm.categoryId) : undefined,
                  amount: Number(expForm.amount),
                  description: expForm.description,
                  expenseDate: expForm.expenseDate,
                  paymentMethod: expForm.paymentMethod,
                  notes: expForm.notes || undefined,
                })} disabled={addExpense.isPending || !expForm.amount || !expForm.description}>
                  {addExpense.isPending ? "Kaydediliyor..." : "Kaydet"}
                </Button>
                <Button variant="outline" onClick={() => setShowExpenseForm(false)}>İptal</Button>
              </div>
            </div>
          )}

          {/* Kategori yönetimi */}
          <div className="bg-card border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kategoriler</p>
              <button onClick={() => setShowCatForm(v => !v)} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Yeni
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-xs">
                  {c.icon} {c.name}
                </span>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Henüz kategori yok.{" "}
                  <button className="text-primary underline"
                    onClick={async () => {
                      for (const p of PRESET_CATEGORIES) {
                        await fetch("/api/finance/expense-categories", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          credentials: "include", body: JSON.stringify(p),
                        });
                      }
                      qc.invalidateQueries({ queryKey: ["expense-categories"] });
                      toast({ title: "Varsayılan kategoriler eklendi" });
                    }}>
                    Varsayılanları ekle
                  </button>
                </p>
              )}
            </div>
            {showCatForm && (
              <div className="mt-2 flex gap-2 items-end">
                <Input value={catForm.icon} onChange={e => setCatForm(p => ({ ...p, icon: e.target.value }))}
                  className="w-14 text-center text-lg" placeholder="📋" />
                <Input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Kategori adı" className="flex-1" />
                <Button size="sm" onClick={() => addCategory.mutate(catForm)} disabled={!catForm.name.trim()}>Ekle</Button>
                <Button size="sm" variant="outline" onClick={() => setShowCatForm(false)}>İptal</Button>
              </div>
            )}
          </div>

          {/* Gider listesi */}
          {expensesQ.isLoading ? (
            <div className="bg-card border rounded-xl overflow-hidden divide-y">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <SkeletonBlock width={36} height={36} borderRadius={8} />
                  <div className="flex-1 space-y-2 min-w-0">
                    <SkeletonLine width="55%" height={16} />
                    <SkeletonLine width="40%" height={12} />
                  </div>
                  <SkeletonLine width={72} height={16} />
                </div>
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed rounded-xl">
              <p className="text-muted-foreground">Bu dönemde gider yok</p>
              <Button className="mt-3 gap-2" onClick={() => setShowExpenseForm(true)}>
                <Plus className="h-4 w-4" />Gider Ekle
              </Button>
            </div>
          ) : (
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <p className="text-sm font-semibold">{expenses.length} gider</p>
                <p className="text-sm font-bold text-red-600">{formatTryCurrency(expensesQ.data?.totalAmount ?? 0, 2)}</p>
              </div>
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                    <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-lg shrink-0">
                      {e.categoryIcon ?? "💸"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.categoryName ?? "Kategorisiz"} •{" "}
                        {formatTrDate(e.expenseDate)} •{" "}
                        {PM_LABELS[e.paymentMethod] ?? e.paymentMethod}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-red-600 shrink-0">{formatTryCurrency(e.amount, 2)}</p>
                    <button onClick={() => deleteExpense.mutate(e.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded ml-1 shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── KASA TAB ─────────────────────────────────────────────────── */}
      {tab === "cash" && (
        <div className="space-y-4">
          {cashQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-card border rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock width={40} height={40} borderRadius={12} />
                    <div className="flex-1 space-y-2">
                      <SkeletonLine width="50%" height={16} />
                      <SkeletonLine width="40%" height={24} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Kasa kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {registers.map(r => (
                  <button key={r.id} onClick={() => setSelectedRegister(r)}
                    className={`text-left bg-card border rounded-xl p-4 hover:shadow-md transition-all ${selectedRegister?.id === r.id ? "border-primary ring-1 ring-primary" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Wallet className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{r.name}</p>
                        {r.isDefault && <span className="text-[10px] text-primary font-semibold uppercase">Varsayılan</span>}
                      </div>
                      <div className="ml-auto text-right">
                        <p className={`text-xl font-bold ${r.currentBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatTryCurrency(r.currentBalance, 2)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {registers.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                    <p className="text-sm">Kasa yok. İlk hareketi ekleyince otomatik oluşur.</p>
                  </div>
                )}
              </div>

              {/* Kasa hareketi formu */}
              {showCashForm && selectedRegister && (
                <div className="bg-card border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{selectedRegister.name} — Hareket Ekle</p>
                    <button onClick={() => setShowCashForm(false)}><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: "in", label: "Giriş", color: "text-green-600 bg-green-500/10 border-green-500/20" },
                      { id: "out", label: "Çıkış", color: "text-red-600 bg-red-500/10 border-red-500/20" }].map(d => (
                      <button key={d.id} onClick={() => setCashForm(p => ({ ...p, direction: d.id }))}
                        className={`py-2 rounded-lg border-2 text-sm font-semibold transition-all ${cashForm.direction === d.id ? d.color : "border-transparent bg-muted"}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <Input type="number" min="0" step="0.01" value={cashForm.amount}
                    onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="Tutar (₺)" />
                  <Input value={cashForm.description}
                    onChange={e => setCashForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Açıklama" />
                  <div className="flex gap-2">
                    <Button onClick={() => addCashMovement.mutate({ type: "manual", direction: cashForm.direction, amount: Number(cashForm.amount), description: cashForm.description })}
                      disabled={!cashForm.amount || !cashForm.description || addCashMovement.isPending}>
                      Kaydet
                    </Button>
                    <Button variant="outline" onClick={() => setShowCashForm(false)}>İptal</Button>
                  </div>
                </div>
              )}

              {/* Hareket listesi */}
              {selectedRegister && (
                <div className="bg-card border rounded-xl overflow-hidden">
                  <div className="p-3 border-b flex items-center justify-between">
                    <p className="font-semibold text-sm">{selectedRegister.name} — Hareketler</p>
                    <button onClick={() => qc.invalidateQueries({ queryKey: ["cash-movements"] })}>
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {movementsQ.isLoading ? (
                    <div className="divide-y">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          <SkeletonBlock width={32} height={32} borderRadius={9999} />
                          <div className="flex-1 space-y-2 min-w-0">
                            <SkeletonLine width="70%" height={14} />
                            <SkeletonLine width="45%" height={12} />
                          </div>
                          <SkeletonLine width={64} height={16} />
                        </div>
                      ))}
                    </div>
                  ) : movements.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">Bu dönemde hareket yok</div>
                  ) : (
                    <div className="divide-y max-h-[400px] overflow-y-auto">
                      {movements.map(m => (
                        <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${m.direction === "in" ? "bg-green-500/15" : "bg-red-500/15"}`}>
                            {m.direction === "in"
                              ? <ArrowUpRight className="h-4 w-4 text-green-600" />
                              : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{m.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatTrDateTime(m.createdAt)}
                              {m.balanceAfter != null && ` • Bakiye: ${formatTryCurrency(m.balanceAfter, 2)}`}
                            </p>
                          </div>
                          <p className={`text-sm font-bold shrink-0 ${m.direction === "in" ? "text-green-600" : "text-red-600"}`}>
                            {m.direction === "in" ? "+" : "-"}{formatTryCurrency(m.amount, 2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
