import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Megaphone, TrendingUp, Wallet, Target, BarChart3 } from "lucide-react";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(n || 0));
const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("tr-TR").format(Number(n || 0));

function curPeriod() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

export default function AdBudgetPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("ozet");
  const [period, setPeriod] = useState(curPeriod());
  const [presets, setPresets] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);

  const [chDlg, setChDlg] = useState(false);
  const [newChCode, setNewChCode] = useState("");
  const [newChName, setNewChName] = useState("");
  const [newChPlatform, setNewChPlatform] = useState("custom");

  const [spDlg, setSpDlg] = useState(false);
  const [spChannel, setSpChannel] = useState<string>("");
  const [spBudget, setSpBudget] = useState("");
  const [spSpend, setSpSpend] = useState("");
  const [spImp, setSpImp] = useState("");
  const [spClicks, setSpClicks] = useState("");
  const [spLeads, setSpLeads] = useState("");
  const [spOrders, setSpOrders] = useState("");
  const [spRev, setSpRev] = useState("");

  async function loadAll() {
    try {
      const [p, ch, sm, tr] = await Promise.all([
        api("/ad-budgets/presets"),
        api("/ad-budgets/channels"),
        api(`/ad-budgets/summary?period=${period}`),
        api("/ad-budgets/trend?months=6"),
      ]);
      setPresets(p); setChannels(ch); setSummary(sm); setTrend(tr);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Yüklenemedi", description: String(e.message || e) });
    }
  }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [period]);

  async function addChannel() {
    if (!newChCode || !newChName) return;
    try {
      await api("/ad-budgets/channels", { method: "POST", body: JSON.stringify({
        code: newChCode, name: newChName, platform: newChPlatform,
      })});
      toast({ title: "Kanal eklendi" });
      setChDlg(false); setNewChCode(""); setNewChName(""); setNewChPlatform("custom");
      loadAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    }
  }

  function pickPreset(code: string) {
    const p = presets.find((x: any) => x.code === code);
    if (p) { setNewChCode(p.code); setNewChName(p.name); setNewChPlatform(p.platform); }
  }

  async function delChannel(id: number) {
    if (!confirm("Bu kanal ve tüm harcama geçmişi silinsin mi?")) return;
    await api(`/ad-budgets/channels/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function saveSpend() {
    if (!spChannel) { toast({ variant: "destructive", title: "Kanal seç" }); return; }
    try {
      await api("/ad-budgets/spends", { method: "POST", body: JSON.stringify({
        channelId: Number(spChannel), period,
        budgetAmount: spBudget || "0", spendAmount: spSpend || "0",
        impressions: Number(spImp) || 0, clicks: Number(spClicks) || 0,
        leads: Number(spLeads) || 0, orders: Number(spOrders) || 0,
        attributedRevenue: spRev || "0",
      })});
      toast({ title: "Kaydedildi" });
      setSpDlg(false);
      setSpChannel(""); setSpBudget(""); setSpSpend(""); setSpImp(""); setSpClicks(""); setSpLeads(""); setSpOrders(""); setSpRev("");
      loadAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    }
  }

  const totals = summary?.totals;

  return (
    <OnlineSalesFeatureGate title="Reklam bütçesi paketinizde kapalı">
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6 text-orange-500" /> Reklam Bütçesi</h1>
          <p className="text-sm text-muted-foreground">Tüm reklam kanallarınızdaki bütçeyi, harcamayı ve geri dönüşü tek panelden takip edin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label>Dönem:</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Bütçe</div><div className="text-lg font-bold">{fmt(totals.budget)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Harcama</div><div className="text-lg font-bold">{fmt(totals.spend)}</div><Progress className="mt-1 h-1" value={Math.min(100, totals.budgetUsedPct)} /></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Atfedilen Ciro</div><div className="text-lg font-bold text-green-600">{fmt(totals.revenue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ROAS</div><div className="text-lg font-bold">{totals.roas.toFixed(2)}x</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Net Kâr</div><div className={`text-lg font-bold ${totals.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(totals.profit)}</div></CardContent></Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ozet">Özet</TabsTrigger>
          <TabsTrigger value="kanallar">Kanallar</TabsTrigger>
          <TabsTrigger value="trend">Aylık Trend</TabsTrigger>
        </TabsList>

        <TabsContent value="ozet" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Kanal Performansı — {period}</CardTitle>
              <Dialog open={spDlg} onOpenChange={setSpDlg}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Harcama Gir</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Reklam Harcaması Gir / Güncelle</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Kanal</Label>
                      <Select value={spChannel} onValueChange={setSpChannel}>
                        <SelectTrigger><SelectValue placeholder="Kanal seç" /></SelectTrigger>
                        <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Planlanan Bütçe (TL)</Label><Input value={spBudget} onChange={(e) => setSpBudget(e.target.value)} /></div>
                      <div><Label>Gerçek Harcama (TL)</Label><Input value={spSpend} onChange={(e) => setSpSpend(e.target.value)} /></div>
                      <div><Label>Gösterim</Label><Input value={spImp} onChange={(e) => setSpImp(e.target.value)} /></div>
                      <div><Label>Tıklama</Label><Input value={spClicks} onChange={(e) => setSpClicks(e.target.value)} /></div>
                      <div><Label>Lead</Label><Input value={spLeads} onChange={(e) => setSpLeads(e.target.value)} /></div>
                      <div><Label>Sipariş</Label><Input value={spOrders} onChange={(e) => setSpOrders(e.target.value)} /></div>
                    </div>
                    <div><Label>Atfedilen Ciro (TL)</Label><Input value={spRev} onChange={(e) => setSpRev(e.target.value)} /></div>
                  </div>
                  <DialogFooter><Button onClick={saveSpend}>Kaydet</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {summary?.channels?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kanal</TableHead>
                      <TableHead className="text-right">Bütçe</TableHead>
                      <TableHead className="text-right">Harcama</TableHead>
                      <TableHead className="text-right">Tıklama</TableHead>
                      <TableHead className="text-right">Sipariş</TableHead>
                      <TableHead className="text-right">CPA</TableHead>
                      <TableHead className="text-right">Ciro</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                      <TableHead className="text-right">Net Kâr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.channels.map((r: any) => (
                      <TableRow key={r.channelId}>
                        <TableCell><div className="font-medium">{r.channelName}</div><div className="text-xs text-muted-foreground">{r.platform}</div></TableCell>
                        <TableCell className="text-right">{fmt(r.budgetAmount)}</TableCell>
                        <TableCell className="text-right">{fmt(r.spendAmount)}</TableCell>
                        <TableCell className="text-right">{num(r.clicks)}</TableCell>
                        <TableCell className="text-right">{num(r.orders)}</TableCell>
                        <TableCell className="text-right">{r.cpa > 0 ? fmt(r.cpa) : "—"}</TableCell>
                        <TableCell className="text-right text-green-600">{fmt(r.attributedRevenue)}</TableCell>
                        <TableCell className="text-right"><Badge variant={r.roas >= 1 ? "default" : "secondary"}>{r.roas.toFixed(2)}x</Badge></TableCell>
                        <TableCell className={`text-right font-semibold ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(r.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="mx-auto h-10 w-10 mb-2 opacity-40" />
                  <p>Bu dönem için henüz harcama girilmemiş.</p>
                  <p className="text-xs">Önce "Kanallar" sekmesinden bir kanal ekleyin, sonra "Harcama Gir" ile veri girin.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kanallar" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Reklam Kanalları</CardTitle>
              <Dialog open={chDlg} onOpenChange={setChDlg}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Kanal Ekle</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Yeni Reklam Kanalı</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Hazır Şablon</Label>
                      <Select value="" onValueChange={pickPreset}>
                        <SelectTrigger><SelectValue placeholder="Şablon seç (opsiyonel)" /></SelectTrigger>
                        <SelectContent>{presets.map((p: any) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Kod *</Label><Input value={newChCode} onChange={(e) => setNewChCode(e.target.value)} placeholder="google_ads" /></div>
                      <div><Label>Platform</Label><Input value={newChPlatform} onChange={(e) => setNewChPlatform(e.target.value)} /></div>
                    </div>
                    <div><Label>Görünen Ad *</Label><Input value={newChName} onChange={(e) => setNewChName(e.target.value)} placeholder="Google Ads" /></div>
                  </div>
                  <DialogFooter><Button onClick={addChannel}>Ekle</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {channels.length ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Ad</TableHead><TableHead>Kod</TableHead><TableHead>Platform</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {channels.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><code className="text-xs">{c.code}</code></TableCell>
                        <TableCell><Badge variant="outline">{c.platform}</Badge></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => delChannel(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Henüz kanal eklenmemiş. Yukarıdan "Kanal Ekle" ile başlayın.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Aylık Trend (son 6 ay)</CardTitle></CardHeader>
            <CardContent>
              {trend.length ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Ay</TableHead><TableHead className="text-right">Harcama</TableHead><TableHead className="text-right">Sipariş</TableHead><TableHead className="text-right">Ciro</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {trend.map((r: any) => (
                      <TableRow key={r.period}>
                        <TableCell>{r.period}</TableCell>
                        <TableCell className="text-right">{fmt(r.spend)}</TableCell>
                        <TableCell className="text-right">{num(r.orders)}</TableCell>
                        <TableCell className="text-right text-green-600">{fmt(r.revenue)}</TableCell>
                        <TableCell className="text-right"><Badge variant={r.roas >= 1 ? "default" : "secondary"}>{r.roas.toFixed(2)}x</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Trend için henüz yeterli veri yok.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </OnlineSalesFeatureGate>
  );
}
