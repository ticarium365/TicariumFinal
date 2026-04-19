import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Calendar, Save, AlertTriangle, BarChart3, Bell, RefreshCw } from "lucide-react";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(n || 0));
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function curPeriod() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextP(p: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(p)!;
  let y = +m[1], mo = +m[2] + 1;
  if (mo > 12) { mo = 1; y++; } return `${y}-${String(mo).padStart(2, "0")}`;
}

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error((await r.text()) || `${r.status}`);
  return r.json();
}

export default function BudgetsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("plan");
  const [period, setPeriod] = useState(curPeriod());
  const [budgets, setBudgets] = useState<any[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [forecastBasis, setForecastBasis] = useState("trend3");
  const [forecastTarget, setForecastTarget] = useState(nextP(curPeriod()));
  const [cashflow, setCashflow] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [expenseForecast, setExpenseForecast] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [expForecastLoading, setExpForecastLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ scope: "expense", categoryId: "", label: "", budgetAmount: "", note: "" });

  async function loadAll() {
    try {
      const [b, c, cats] = await Promise.all([
        api(`/budgets?period=${period}`),
        api(`/budgets/comparison?period=${period}`),
        api(`/finance/expense-categories`),
      ]);
      setBudgets(b); setComparison(c);
      setCategories(cats?.categories || []);
    } catch (e: any) { toast({ title: "Hata", description: String(e), variant: "destructive" }); }
  }
  async function loadForecast() {
    try {
      const [f, cf] = await Promise.all([
        api(`/budgets/forecast/revenue?basis=${forecastBasis}&period=${forecastTarget}`),
        api(`/budgets/forecast/cashflow?weeks=8`),
      ]);
      setForecast(f); setCashflow(cf);
    } catch (e: any) { toast({ title: "Hata", description: String(e), variant: "destructive" }); }
  }
  async function loadExpenseForecast() {
    setExpForecastLoading(true);
    try {
      const f = await api(`/budgets/forecast/expenses?months=6`);
      setExpenseForecast(f);
    } catch (e: any) {
      toast({ title: "Hata", description: String(e), variant: "destructive" });
    } finally { setExpForecastLoading(false); }
  }
  async function loadAlerts() {
    setAlertsLoading(true);
    try {
      const a = await api(`/budgets/alerts?period=${period}`);
      setAlerts(Array.isArray(a) ? a : (a?.alerts || []));
    } catch (e: any) {
      toast({ title: "Hata", description: String(e), variant: "destructive" });
    } finally { setAlertsLoading(false); }
  }

  useEffect(() => { loadAll(); }, [period]);
  useEffect(() => { loadForecast(); }, [forecastBasis, forecastTarget]);
  useEffect(() => { if (tab === "gider-tahmin") loadExpenseForecast(); }, [tab]);
  useEffect(() => { if (tab === "uyari") loadAlerts(); }, [tab, period]);

  async function saveBudget() {
    try {
      await api("/budgets", { method: "POST", body: JSON.stringify({
        period, scope: form.scope,
        categoryId: form.scope === "expense" && form.categoryId ? Number(form.categoryId) : null,
        label: form.label || null,
        budgetAmount: form.budgetAmount, note: form.note,
      })});
      toast({ title: "Bütçe satırı eklendi" });
      setOpen(false);
      setForm({ scope: "expense", categoryId: "", label: "", budgetAmount: "", note: "" });
      loadAll();
    } catch (e: any) { toast({ title: "Hata", description: String(e), variant: "destructive" }); }
  }
  async function delBudget(id: number) {
    if (!confirm("Bütçe satırı silinsin mi?")) return;
    await api(`/budgets/${id}`, { method: "DELETE" });
    loadAll();
  }
  async function saveForecast() {
    if (!forecast) return;
    await api(`/budgets/forecast/revenue/save`, { method: "POST", body: JSON.stringify({
      period: forecast.targetPeriod, basis: forecast.basis,
      forecastAmount: forecast.forecast,
      meta: { sampleMonths: forecast.sampleMonths, avg: forecast.avg },
    })});
    toast({ title: "Tahmin kaydedildi" });
  }

  const periodOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = -3; i < 9; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);

  const totalBudget = comparison?.totals?.budget || 0;
  const totalActual = comparison?.totals?.actual || 0;
  const totalVariance = totalActual - totalBudget;
  const totalPct = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-butce">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-primary" />
            Bütçe & Tahmin
          </h1>
          <p className="text-muted-foreground">Aylık bütçe, gerçekleşme, ciro tahmini ve nakit akışı planı.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Dönem:</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32" data-testid="select-period"><SelectValue /></SelectTrigger>
            <SelectContent>{periodOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="plan">Bütçe Planı</TabsTrigger>
          <TabsTrigger value="karsilastir">Plan vs Gerçekleşen</TabsTrigger>
          <TabsTrigger value="uyari" data-testid="tab-uyari">
            <Bell className="h-3 w-3 mr-1" />Uyarılar
            {alerts.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{alerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ciro">Ciro Tahmini</TabsTrigger>
          <TabsTrigger value="gider-tahmin" data-testid="tab-gider-tahmin">
            <BarChart3 className="h-3 w-3 mr-1" />Gider Tahmini
          </TabsTrigger>
          <TabsTrigger value="nakit">Nakit Akışı</TabsTrigger>
        </TabsList>

        {/* ─── PLAN ─── */}
        <TabsContent value="plan" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{period} Dönemi Bütçesi</h3>
              <p className="text-sm text-muted-foreground">Kategori bazında planlanan harcama ve gelir hedefleri.</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-add-budget"><Plus className="h-4 w-4 mr-2" />Bütçe Ekle</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Bütçe Satırı</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Tür</Label>
                    <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v, categoryId: "" })}>
                      <SelectTrigger data-testid="select-scope"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Gider</SelectItem>
                        <SelectItem value="revenue">Gelir / Ciro Hedefi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.scope === "expense" && (
                    <div>
                      <Label>Kategori (opsiyonel)</Label>
                      <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                        <SelectTrigger data-testid="select-category"><SelectValue placeholder="Kategori seç" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Etiket (kategori yoksa)</Label>
                    <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} data-testid="input-label" />
                  </div>
                  <div>
                    <Label>Bütçe Tutarı (TL)</Label>
                    <Input type="number" value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })} data-testid="input-amount" />
                  </div>
                  <div>
                    <Label>Not</Label>
                    <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="input-note" />
                  </div>
                </div>
                <DialogFooter><Button onClick={saveBudget} data-testid="btn-save-budget"><Save className="h-4 w-4 mr-2" />Kaydet</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Tür</TableHead><TableHead>Kategori / Etiket</TableHead><TableHead className="text-right">Bütçe</TableHead><TableHead>Not</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {budgets.map((b: any) => (
                    <TableRow key={b.id} data-testid={`row-budget-${b.id}`}>
                      <TableCell><Badge variant={b.scope === "revenue" ? "default" : "secondary"}>{b.scope === "revenue" ? "Gelir" : "Gider"}</Badge></TableCell>
                      <TableCell>{b.categoryName || b.label || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(b.budgetAmount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.note || ""}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => delBudget(b.id)} data-testid={`btn-del-${b.id}`}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {budgets.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Bu dönem için henüz bütçe satırı yok</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── KARŞILAŞTIRMA ─── */}
        <TabsContent value="karsilastir" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="kpi-total-budget"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Bütçelenen Gider</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(totalBudget)}</div></CardContent></Card>
            <Card data-testid="kpi-total-actual"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gerçekleşen Gider</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(totalActual)}</div></CardContent></Card>
            <Card data-testid="kpi-variance"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sapma</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totalVariance > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(totalVariance)} <span className="text-sm font-normal">({pct(totalPct)})</span></div></CardContent></Card>
            <Card data-testid="kpi-revenue"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ciro: Hedef / Gerçek</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(comparison?.totals?.revenueBudget)} / {fmt(comparison?.totals?.revenueActual)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Satır Bazında Karşılaştırma</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Tür</TableHead><TableHead>Kategori</TableHead><TableHead className="text-right">Bütçe</TableHead><TableHead className="text-right">Gerçek</TableHead><TableHead>Kullanım</TableHead><TableHead className="text-right">Sapma</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(comparison?.lines || []).map((l: any) => {
                    const usage = l.budget > 0 ? Math.min(150, (l.actual / l.budget) * 100) : 0;
                    const danger = l.scope === "expense" && l.actual > l.budget;
                    return (
                      <TableRow key={l.id} data-testid={`compare-${l.id}`}>
                        <TableCell><Badge variant={l.scope === "revenue" ? "default" : "secondary"}>{l.scope === "revenue" ? "Gelir" : "Gider"}</Badge></TableCell>
                        <TableCell>{l.label}</TableCell>
                        <TableCell className="text-right">{fmt(l.budget)}</TableCell>
                        <TableCell className="text-right">{fmt(l.actual)}</TableCell>
                        <TableCell className="w-40">
                          <Progress value={Math.min(100, usage)} className={danger ? "[&>*]:bg-red-500" : ""} />
                          <div className="text-xs text-muted-foreground mt-1">{usage.toFixed(0)}%</div>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${danger ? "text-red-600" : "text-emerald-600"}`}>{fmt(l.variance)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(!comparison?.lines || comparison.lines.length === 0) && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Bütçe planlamak için "Bütçe Planı" sekmesini kullanın</TableCell></TableRow>}
                </TableBody>
              </Table>
              {comparison?.orphanCats?.length > 0 && (
                <div className="mt-4 p-3 bg-amber-500/10 dark:bg-amber-900/20 border border-amber-500/30 dark:border-amber-700 rounded-md text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Bütçesiz harcamalar:</strong> {comparison.orphanCats.length} kategoride toplam {fmt(comparison.orphanCats.reduce((s: number, x: any) => s + x.actual, 0))} harcama yapılmış ama bütçe planı yok.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── UYARILAR ─── */}
        <TabsContent value="uyari" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Bell className="h-5 w-5" />Bütçe Sapma Uyarıları — {period}
              </h3>
              <p className="text-sm text-muted-foreground">
                Bütçenin %20 üstünde gider, hedefin altında ciro veya plansız harcama tespit edildiğinde uyarı oluşur.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadAlerts} disabled={alertsLoading} data-testid="btn-refresh-alerts">
              {alertsLoading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Yenile
            </Button>
          </div>

          {alertsLoading ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Yükleniyor…</CardContent></Card>
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <div className="text-emerald-600 text-4xl">✓</div>
                <div className="font-medium">Bu dönem için aktif uyarı yok</div>
                <div className="text-sm text-muted-foreground">Bütçeler hedef bandının içinde.</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {alerts.map((a: any, idx: number) => {
                const isCritical = a.severity === "critical";
                const colorBg = isCritical ? "bg-red-500/10 border-red-500/40" : "bg-amber-500/10 border-amber-500/40";
                const colorText = isCritical ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400";
                const TYPE_LABEL: Record<string, string> = {
                  expense_over_budget: "Bütçe Aşımı",
                  revenue_under_budget: "Ciro Hedefin Altında",
                  orphan_expense: "Plansız Harcama",
                };
                return (
                  <Card key={idx} className={`border-2 ${colorBg}`} data-testid={`alert-${idx}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${colorText}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={isCritical ? "destructive" : "secondary"}>{a.severity?.toUpperCase()}</Badge>
                            <Badge variant="outline">{TYPE_LABEL[a.type] || a.type}</Badge>
                            {a.label && <span className="font-semibold">{a.label}</span>}
                          </div>
                          <p className="text-sm mt-2">{a.message}</p>
                          {(a.budget != null || a.actual != null) && (
                            <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                              {a.budget != null && (
                                <div>
                                  <div className="text-muted-foreground">Bütçe</div>
                                  <div className="font-bold">{fmt(a.budget)}</div>
                                </div>
                              )}
                              {a.actual != null && (
                                <div>
                                  <div className="text-muted-foreground">Gerçekleşen</div>
                                  <div className="font-bold">{fmt(a.actual)}</div>
                                </div>
                              )}
                              {a.variancePct != null && (
                                <div>
                                  <div className="text-muted-foreground">Sapma</div>
                                  <div className={`font-bold ${colorText}`}>{pct(a.variancePct)}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── CIRO TAHMINI ─── */}
        <TabsContent value="ciro" className="mt-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <Label className="text-sm">Hedef Ay</Label>
              <Select value={forecastTarget} onValueChange={setForecastTarget}>
                <SelectTrigger className="w-32" data-testid="select-forecast-target"><SelectValue /></SelectTrigger>
                <SelectContent>{periodOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Yöntem</Label>
              <Select value={forecastBasis} onValueChange={setForecastBasis}>
                <SelectTrigger className="w-44" data-testid="select-basis"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trend3">Son 3 Ay (Ağırlıklı)</SelectItem>
                  <SelectItem value="trend6">Son 6 Ay</SelectItem>
                  <SelectItem value="trend12">Son 12 Ay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveForecast} data-testid="btn-save-forecast"><Save className="h-4 w-4 mr-2" />Tahmini Kaydet</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="forecast-amount" className="md:col-span-2">
              <CardHeader><CardTitle>{forecast?.targetPeriod} Ciro Tahmini</CardTitle></CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-primary">{fmt(forecast?.forecast)}</div>
                <p className="text-sm text-muted-foreground mt-2">Son {forecast?.sampleMonths} ay ortalaması: {fmt(forecast?.avg)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Geçmiş Aylar</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {(forecast?.history || []).map((h: any) => (
                      <TableRow key={h.period}>
                        <TableCell className="font-mono">{h.period}</TableCell>
                        <TableCell className="text-right">{fmt(h.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── GİDER TAHMİNİ (Kategori Bazlı) ─── */}
        <TabsContent value="gider-tahmin" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />Kategori Bazında Gider Tahmini
              </h3>
              <p className="text-sm text-muted-foreground">
                Son 6 ayın gerçekleşen gider verisinden kategori bazında bir sonraki ay tahmini.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadExpenseForecast} disabled={expForecastLoading} data-testid="btn-refresh-exp-forecast">
              <RefreshCw className={`h-4 w-4 mr-1 ${expForecastLoading ? "animate-spin" : ""}`} />Yenile
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="exp-fcast-total">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Toplam Beklenen Gider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(expenseForecast?.totalForecast)}</div>
                <p className="text-xs text-muted-foreground mt-1">Sonraki ay projeksiyonu</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Aktif Kategori</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(expenseForecast?.categories || []).length}</div>
                <p className="text-xs text-muted-foreground mt-1">Tahmin üretilen kategori sayısı</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Örneklem</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{expenseForecast?.sampleMonths ?? 6} ay</div>
                <p className="text-xs text-muted-foreground mt-1">Geçmiş veri penceresi</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Kategori Detayı</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Ortalama</TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                    <TableHead className="text-right">Tahmin (Sonraki Ay)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenseForecast?.categories || []).map((c: any, idx: number) => {
                    const trend = c.slope || 0;
                    const trendDir = trend > 0 ? "up" : trend < 0 ? "down" : "flat";
                    return (
                      <TableRow key={c.categoryId || idx} data-testid={`exp-fcast-row-${idx}`}>
                        <TableCell>
                          <div className="font-medium">{c.icon || "•"} {c.label || c.name || "Kategorisiz"}</div>
                        </TableCell>
                        <TableCell className="text-right">{fmt(c.avg)}</TableCell>
                        <TableCell className="text-right">
                          {trendDir === "up" && <span className="text-red-600 flex items-center justify-end gap-1"><TrendingUp className="h-3 w-3" />{fmt(trend)}/ay</span>}
                          {trendDir === "down" && <span className="text-emerald-600 flex items-center justify-end gap-1"><TrendingDown className="h-3 w-3" />{fmt(Math.abs(trend))}/ay</span>}
                          {trendDir === "flat" && <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-bold">{fmt(c.forecast)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(!expenseForecast?.categories || expenseForecast.categories.length === 0) && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Henüz yeterli geçmiş gider verisi yok. Birkaç ay finansal hareket biriktikten sonra tahminler görünecek.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── NAKIT AKIŞI ─── */}
        <TabsContent value="nakit" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="cf-ar"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-500" />Açık Alacak</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{fmt(cashflow?.openAR)}</div></CardContent></Card>
            <Card data-testid="cf-ap"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-red-500" />Açık Borç</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{fmt(cashflow?.openAP)}</div></CardContent></Card>
            <Card data-testid="cf-weekly-in"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Haftalık Ort. Giriş</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{fmt(cashflow?.weeklyAvgIn)}</div></CardContent></Card>
            <Card data-testid="cf-weekly-out"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Haftalık Ort. Çıkış</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{fmt(cashflow?.weeklyAvgOut)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />8 Haftalık Nakit Projeksiyonu</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Hafta</TableHead><TableHead className="text-right">Beklenen Giriş</TableHead><TableHead className="text-right">Beklenen Çıkış</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(cashflow?.weeks || []).map((w: any, i: number) => (
                    <TableRow key={i} data-testid={`cf-week-${i}`}>
                      <TableCell className="font-mono">{w.weekStart}</TableCell>
                      <TableCell className="text-right text-emerald-600">{fmt(w.expectedIn)}</TableCell>
                      <TableCell className="text-right text-red-600">{fmt(w.expectedOut)}</TableCell>
                      <TableCell className={`text-right font-bold ${w.net < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(w.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
