import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  TrendingUp, TrendingDown, Plus, Camera, Loader2, Package, Users, Repeat, Receipt, Trash2, RefreshCw,
} from "lucide-react";

async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${url}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Hata");
  return r.json();
}
async function uploadOcr(file: File): Promise<any> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/profit/receipt-ocr", { method: "POST", body: fd, credentials: "include" });
  if (!r.ok) throw new Error("OCR başarısız");
  return r.json();
}

const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);

type Dashboard = {
  granularity: string; revenue: number; cogs: number; grossProfit: number;
  expensesByCategory: { category: string; total: number }[];
  totalExpenses: number; payroll: number; depreciation: number;
  netProfit: number; marginPct: number;
};
type Asset = {
  id: number; name: string; category: string | null; purchaseDate: string; purchasePrice: number;
  vendor: string | null; depreciationMonths: number; salvageValue: number; status: string;
};
type Recurring = { id: number; name: string; amount: number; frequency: string; isActive: boolean; lastGeneratedAt: string | null; categoryId: number | null };
type Employee = { id: number; employeeName: string; department: string | null; periodYear: number; periodMonth: number; grossSalary: number; totalEmployerCost: number; paymentStatus: string };
type Expense = { id: number; amount: number; description: string; expenseDate: string; paymentMethod: string; category: { name: string } | null; details: any };
type Category = { id: number; name: string };

export default function ProfitPage() {
  const [tab, setTab] = useState("dashboard");
  const [granularity, setGranularity] = useState<"today" | "month">("month");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  async function refresh() {
    const [d, ins, a, r, e, ex, c] = await Promise.all([
      api<Dashboard>(`/profit/dashboard?granularity=${granularity}`),
      api<any[]>("/profit/insights").catch(() => []),
      api<Asset[]>("/profit/fixed-assets").catch(() => []),
      api<Recurring[]>("/profit/recurring-expenses").catch(() => []),
      api<Employee[]>(`/profit/employee-costs?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`).catch(() => []),
      api<Expense[]>("/profit/expenses?limit=50").catch(() => []),
      api<{ categories: Category[] }>("/finance/expense-categories").then((x) => x.categories || []).catch(() => []),
    ]);
    setDash(d); setInsights(ins); setAssets(a); setRecurring(r); setEmployees(e); setExpenses(ex); setCategories(c);
  }
  useEffect(() => { refresh().catch(console.error); }, [granularity]);

  return (
    <div className="container mx-auto p-6 space-y-4" data-testid="page-profit">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6" /> Net Kâr Merkezi</h1>
          <p className="text-sm text-muted-foreground">Gider takibi, demirbaş, personel ve net kar — fiş okuma ile hızlı giriş.</p>
        </div>
        <div className="flex gap-2">
          <Select value={granularity} onValueChange={(v: any) => setGranularity(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Bugün</SelectItem>
              <SelectItem value="month">Bu Ay</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4 mr-1" />Yenile</Button>
        </div>
      </div>

      {dash && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Ciro</div><div className="text-2xl font-bold" data-testid="kpi-revenue">{fmt(dash.revenue)}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Brüt Kâr</div><div className="text-2xl font-bold text-indigo-600" data-testid="kpi-gross">{fmt(dash.grossProfit)}</div><div className="text-xs">COGS: {fmt(dash.cogs)}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Toplam Gider</div><div className="text-2xl font-bold text-orange-600" data-testid="kpi-expenses">{fmt(dash.totalExpenses + dash.payroll + dash.depreciation)}</div><div className="text-xs">Personel: {fmt(dash.payroll)} • Amortisman: {fmt(dash.depreciation)}</div></CardContent></Card>
          <Card><CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Net Kâr</div>
            <div className={`text-2xl font-bold flex items-center gap-1 ${dash.netProfit >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="kpi-net">
              {dash.netProfit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {fmt(dash.netProfit)}
            </div>
            <div className="text-xs">Marj: %{dash.marginPct.toFixed(1)}</div>
          </CardContent></Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Özet</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses"><Receipt className="h-4 w-4 mr-1" />Giderler & Fiş OCR</TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets"><Package className="h-4 w-4 mr-1" />Demirbaşlar ({assets.length})</TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees"><Users className="h-4 w-4 mr-1" />Personel ({employees.length})</TabsTrigger>
          <TabsTrigger value="recurring" data-testid="tab-recurring"><Repeat className="h-4 w-4 mr-1" />Tekrarlayan ({recurring.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-3 mt-4">
          <Card>
            <CardHeader><CardTitle>Kategori Bazlı Giderler</CardTitle></CardHeader>
            <CardContent>
              {dash?.expensesByCategory?.length ? dash.expensesByCategory.map((e) => {
                const max = Math.max(...dash.expensesByCategory.map((x) => x.total));
                return (
                  <div key={e.category} className="space-y-1 mb-2">
                    <div className="flex justify-between text-sm"><span>{e.category}</span><span className="font-medium">{fmt(e.total)}</span></div>
                    <div className="h-2 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{ width: `${(e.total / max) * 100}%` }} /></div>
                  </div>
                );
              }) : <div className="text-sm text-muted-foreground">Bu dönemde gider yok.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Bu Ay vs Geçen Ay (kategori karşılaştırma)</CardTitle></CardHeader>
            <CardContent>
              {insights.length === 0 && <div className="text-sm text-muted-foreground">Karşılaştırma için yeterli veri yok.</div>}
              {insights.map((i) => (
                <div key={i.category} className="flex justify-between items-center py-1 border-b last:border-0 text-sm">
                  <span>{i.category}</span>
                  <div className="flex gap-3 items-center">
                    <span className="text-muted-foreground">{fmt(i.lastMonth)} → {fmt(i.thisMonth)}</span>
                    <Badge variant={i.severity === "warn" ? "destructive" : i.severity === "info" ? "default" : "secondary"}>
                      {i.deltaPct > 0 ? "+" : ""}{i.deltaPct}%
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4 space-y-3">
          <ExpensesTab categories={categories} expenses={expenses} onChange={refresh} />
        </TabsContent>

        <TabsContent value="assets" className="mt-4 space-y-3">
          <AssetsTab assets={assets} onChange={refresh} />
        </TabsContent>

        <TabsContent value="employees" className="mt-4 space-y-3">
          <EmployeesTab employees={employees} onChange={refresh} />
        </TabsContent>

        <TabsContent value="recurring" className="mt-4 space-y-3">
          <RecurringTab recurring={recurring} categories={categories} onChange={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Expenses + OCR ─────────────────────────────────────────────────────────
function ExpensesTab({ categories, expenses, onChange }: { categories: Category[]; expenses: Expense[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [form, setForm] = useState<any>({
    amount: "", description: "", expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "cash", categoryId: "", vatRate: 20, vendorName: "", invoiceNumber: "",
  });
  const [ocrResult, setOcrResult] = useState<any>(null);

  async function handleFile(f: File) {
    setOcrLoading(true); setOcrResult(null);
    try {
      const r = await uploadOcr(f);
      setOcrResult(r.ocr);
      const o = r.ocr || {};
      // Otomatik form doldur
      setForm((p: any) => ({
        ...p,
        amount: o.amount?.toString() || p.amount,
        description: o.description || p.description,
        expenseDate: o.date || p.expenseDate,
        paymentMethod: o.paymentMethod || p.paymentMethod,
        vatRate: o.vatRate ?? p.vatRate,
        vendorName: o.vendorName || p.vendorName,
        invoiceNumber: o.invoiceNumber || p.invoiceNumber,
      }));
      // Kategoriyi adıyla eşleştir
      if (o.category) {
        const m = categories.find((c) => c.name.toLowerCase().includes(o.category.toLowerCase()));
        if (m) setForm((p: any) => ({ ...p, categoryId: String(m.id) }));
      }
    } catch (e: any) {
      alert("OCR hatası: " + e.message);
    } finally { setOcrLoading(false); }
  }

  async function save() {
    if (!form.amount || !form.description) { alert("Tutar ve açıklama zorunlu."); return; }
    const vatAmount = (Number(form.amount) * Number(form.vatRate || 0)) / (100 + Number(form.vatRate || 0));
    await api("/profit/expenses", {
      method: "POST",
      body: JSON.stringify({
        ...form, amount: Number(form.amount),
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        vatRate: Number(form.vatRate || 0), vatAmount: Math.round(vatAmount * 100) / 100,
        ocrData: ocrResult,
      }),
    });
    setOpen(false); setOcrResult(null);
    setForm({ amount: "", description: "", expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "cash", categoryId: "", vatRate: 20, vendorName: "", invoiceNumber: "" });
    onChange();
  }

  return (
    <>
      <div className="flex justify-between">
        <h3 className="font-medium">Gider Listesi</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid="btn-add-expense"><Plus className="h-4 w-4 mr-1" />Yeni Gider</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Yeni Gider — Fiş Okuma ile Hızlı Giriş</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Card className="border-dashed border-2">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <Camera className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Fiş / Fatura Görseli Yükle</div>
                      <div className="text-xs text-muted-foreground">JPG/PNG — yapay zeka tutar, KDV, satıcı ve kategoriyi otomatik dolduracak.</div>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} data-testid="input-receipt-file" />
                    <Button size="sm" variant="outline" disabled={ocrLoading} onClick={() => fileRef.current?.click()} data-testid="btn-upload-receipt">
                      {ocrLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Okunuyor…</> : "Görsel Seç"}
                    </Button>
                  </div>
                  {ocrResult && (
                    <div className="mt-2 text-xs bg-green-500/10 border border-green-500/30 rounded p-2">
                      ✓ Okuma başarılı (güven %{Math.round((ocrResult.confidence || 0) * 100)})
                      {ocrResult.items?.length ? ` — ${ocrResult.items.length} kalem` : ""}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tutar (KDV dahil) *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="input-amount" /></div>
                <div><Label>KDV %</Label><Input type="number" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /></div>
                <div className="col-span-2"><Label>Açıklama *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-description" /></div>
                <div><Label>Tarih</Label><Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
                <div><Label>Ödeme Yöntemi</Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cash">Nakit</SelectItem><SelectItem value="bank">Banka</SelectItem><SelectItem value="credit">Kredi Kartı</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Kategori</Label>
                  <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Seç" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Satıcı</Label><Input value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} /></div>
                <div className="col-span-2"><Label>Fatura No</Label><Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="btn-save-expense">Kaydet</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Tarih</th><th>Açıklama</th><th>Kategori</th><th>Satıcı</th><th>Ödeme</th><th>OCR</th><th className="text-right">Tutar</th></tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2 text-xs">{new Date(e.expenseDate).toLocaleDateString("tr-TR")}</td>
                <td>{e.description}</td>
                <td>{e.category?.name || "-"}</td>
                <td className="text-xs">{e.details?.vendorName || "-"}</td>
                <td className="text-xs">{e.paymentMethod}</td>
                <td>{e.details?.ocrStatus === "done" ? <Badge variant="default">OCR</Badge> : "-"}</td>
                <td className="text-right font-medium">{fmt(e.amount)}</td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Gider yok.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </>
  );
}

// ─── Assets ─────────────────────────────────────────────────────────────────
function AssetsTab({ assets, onChange }: { assets: Asset[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    name: "", category: "", purchaseDate: new Date().toISOString().slice(0, 10),
    purchasePrice: "", vendor: "", depreciationMonths: 36, salvageValue: 0,
  });
  async function save() {
    if (!form.name || !form.purchasePrice) { alert("Ad ve fiyat zorunlu."); return; }
    await api("/profit/fixed-assets", {
      method: "POST",
      body: JSON.stringify({ ...form, purchasePrice: Number(form.purchasePrice), depreciationMonths: Number(form.depreciationMonths), salvageValue: Number(form.salvageValue) }),
    });
    setOpen(false); setForm({ name: "", category: "", purchaseDate: new Date().toISOString().slice(0, 10), purchasePrice: "", vendor: "", depreciationMonths: 36, salvageValue: 0 });
    onChange();
  }
  async function del(id: number) {
    if (!confirm("Demirbaş silinsin mi?")) return;
    await api(`/profit/fixed-assets/${id}`, { method: "DELETE" }); onChange();
  }
  return (
    <>
      <div className="flex justify-between">
        <h3 className="font-medium">Demirbaşlar (Amortismanlı)</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid="btn-add-asset"><Plus className="h-4 w-4 mr-1" />Yeni Demirbaş</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Yeni Demirbaş</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Ad *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-asset-name" /></div>
              <div><Label>Kategori</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Bilgisayar, Araç…" /></div>
              <div><Label>Tedarikçi</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
              <div><Label>Alış Fiyatı *</Label><Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} data-testid="input-asset-price" /></div>
              <div><Label>Alış Tarihi</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
              <div><Label>Amortisman (Ay)</Label><Input type="number" value={form.depreciationMonths} onChange={(e) => setForm({ ...form, depreciationMonths: e.target.value })} /></div>
              <div><Label>Hurda Değer</Label><Input type="number" value={form.salvageValue} onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="btn-save-asset">Kaydet</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Ad</th><th>Kategori</th><th>Alış Tarihi</th><th>Amortisman</th><th>Aylık</th><th>Defter Değ.</th><th className="text-right">Alış</th><th></th></tr></thead>
          <tbody>
            {assets.map((a) => {
              const monthly = (a.purchasePrice - (a.salvageValue || 0)) / (a.depreciationMonths || 36);
              const monthsElapsed = Math.min(a.depreciationMonths || 36, Math.max(0, (Date.now() - new Date(a.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30)));
              const bookValue = Math.max(a.salvageValue || 0, a.purchasePrice - monthly * monthsElapsed);
              return (
                <tr key={a.id} className="border-t" data-testid={`asset-${a.id}`}>
                  <td className="p-2 font-medium">{a.name}</td>
                  <td>{a.category || "-"}</td>
                  <td className="text-xs">{new Date(a.purchaseDate).toLocaleDateString("tr-TR")}</td>
                  <td className="text-xs">{a.depreciationMonths} ay</td>
                  <td>{fmt(monthly)}</td>
                  <td>{fmt(bookValue)}</td>
                  <td className="text-right font-medium">{fmt(a.purchasePrice)}</td>
                  <td><Button size="icon" variant="ghost" onClick={() => del(a.id)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
            {assets.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Demirbaş yok.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </>
  );
}

// ─── Employees ──────────────────────────────────────────────────────────────
function EmployeesTab({ employees, onChange }: { employees: Employee[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [form, setForm] = useState<any>({
    employeeName: "", department: "", periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1,
    grossSalary: "", netSalary: "", sgkEmployer: "", mealAllowance: 0, transportAllowance: 0, bonus: 0,
  });
  async function save() {
    if (!form.employeeName || !form.grossSalary) { alert("İsim ve brüt maaş zorunlu."); return; }
    await api("/profit/employee-costs", { method: "POST", body: JSON.stringify({
      ...form, periodYear: Number(form.periodYear), periodMonth: Number(form.periodMonth),
      grossSalary: Number(form.grossSalary), netSalary: Number(form.netSalary || 0),
      sgkEmployer: Number(form.sgkEmployer || 0), mealAllowance: Number(form.mealAllowance || 0),
      transportAllowance: Number(form.transportAllowance || 0), bonus: Number(form.bonus || 0),
    }) });
    setOpen(false); onChange();
  }
  return (
    <>
      <div className="flex justify-between">
        <h3 className="font-medium">Bu Ayın Personel Maliyetleri</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid="btn-add-employee"><Plus className="h-4 w-4 mr-1" />Yeni Kayıt</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Personel Maliyeti Ekle</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Personel Adı *</Label><Input value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} data-testid="input-emp-name" /></div>
              <div><Label>Departman</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>Brüt Maaş *</Label><Input type="number" value={form.grossSalary} onChange={(e) => setForm({ ...form, grossSalary: e.target.value })} data-testid="input-gross" /></div>
              <div><Label>Net Maaş</Label><Input type="number" value={form.netSalary} onChange={(e) => setForm({ ...form, netSalary: e.target.value })} /></div>
              <div><Label>SGK İşveren</Label><Input type="number" value={form.sgkEmployer} onChange={(e) => setForm({ ...form, sgkEmployer: e.target.value })} /></div>
              <div><Label>Yemek</Label><Input type="number" value={form.mealAllowance} onChange={(e) => setForm({ ...form, mealAllowance: e.target.value })} /></div>
              <div><Label>Yol</Label><Input type="number" value={form.transportAllowance} onChange={(e) => setForm({ ...form, transportAllowance: e.target.value })} /></div>
              <div><Label>Prim</Label><Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="btn-save-employee">Kaydet</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Personel</th><th>Dept.</th><th>Dönem</th><th>Brüt</th><th>Toplam Maliyet</th><th>Durum</th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2 font-medium">{e.employeeName}</td>
                <td>{e.department || "-"}</td>
                <td className="text-xs">{e.periodYear}/{String(e.periodMonth).padStart(2, "0")}</td>
                <td>{fmt(e.grossSalary)}</td>
                <td className="font-medium">{fmt(e.totalEmployerCost)}</td>
                <td><Badge variant={e.paymentStatus === "paid" ? "default" : "secondary"}>{e.paymentStatus}</Badge></td>
              </tr>
            ))}
            {employees.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Bu ay personel kaydı yok.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </>
  );
}

// ─── Recurring ──────────────────────────────────────────────────────────────
function RecurringTab({ recurring, categories, onChange }: { recurring: Recurring[]; categories: Category[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    name: "", amount: "", frequency: "monthly", paymentMethod: "bank",
    startDate: new Date().toISOString().slice(0, 10), dayOfMonth: 1, vatRate: 20, categoryId: "",
  });
  async function save() {
    if (!form.name || !form.amount) { alert("Ad ve tutar zorunlu."); return; }
    await api("/profit/recurring-expenses", { method: "POST", body: JSON.stringify({
      ...form, amount: Number(form.amount), vatRate: Number(form.vatRate),
      dayOfMonth: Number(form.dayOfMonth), categoryId: form.categoryId ? Number(form.categoryId) : null,
    }) });
    setOpen(false); onChange();
  }
  async function runAll() {
    const r = await api<any>("/profit/recurring-expenses/run", { method: "POST" });
    alert(`${r.created} adet otomatik gider oluşturuldu.`);
    onChange();
  }
  async function del(id: number) { if (!confirm("Sil?")) return; await api(`/profit/recurring-expenses/${id}`, { method: "DELETE" }); onChange(); }
  return (
    <>
      <div className="flex justify-between">
        <h3 className="font-medium">Tekrarlayan Giderler (Kira, Internet, Abonelik…)</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runAll} data-testid="btn-run-recurring">Bu Ay İçin Oluştur</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" data-testid="btn-add-recurring"><Plus className="h-4 w-4 mr-1" />Yeni</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tekrarlayan Gider</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Ad *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-rec-name" /></div>
                <div><Label>Tutar *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="input-rec-amount" /></div>
                <div><Label>KDV %</Label><Input type="number" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /></div>
                <div><Label>Sıklık</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Aylık</SelectItem>
                      <SelectItem value="weekly">Haftalık</SelectItem>
                      <SelectItem value="quarterly">Çeyreklik</SelectItem>
                      <SelectItem value="yearly">Yıllık</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Ay İçi Gün</Label><Input type="number" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} /></div>
                <div><Label>Kategori</Label>
                  <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Seç" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Başlangıç</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save} data-testid="btn-save-recurring">Kaydet</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Ad</th><th>Sıklık</th><th>Son Üretim</th><th>Aktif</th><th className="text-right">Tutar</th><th></th></tr></thead>
          <tbody>
            {recurring.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-medium">{r.name}</td>
                <td>{r.frequency}</td>
                <td className="text-xs">{r.lastGeneratedAt ? new Date(r.lastGeneratedAt).toLocaleDateString("tr-TR") : "-"}</td>
                <td><Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Aktif" : "Pasif"}</Badge></td>
                <td className="text-right font-medium">{fmt(r.amount)}</td>
                <td><Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {recurring.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Henüz tekrarlayan gider yok.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </>
  );
}
