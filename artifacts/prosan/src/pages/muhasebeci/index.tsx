import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  UserPlus, Lock, Unlock, FileText, Download, Calculator, Calendar,
  TrendingUp, TrendingDown, Receipt, Building2,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

const fmtTRY = (n: number | null | undefined) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(n || 0));

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

export default function MuhasebeciPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("kdv");
  const [period, setPeriod] = useState(currentPeriod());

  // Reports
  const [kdv, setKdv] = useState<any>(null);
  const [babs, setBabs] = useState<any>(null);
  const [mizan, setMizan] = useState<any>(null);

  // Invites + period closes
  const [invites, setInvites] = useState<any[]>([]);
  const [accesses, setAccesses] = useState<any[]>([]);
  const [closes, setCloses] = useState<any[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closePeriod, setClosePeriod] = useState(currentPeriod());
  const [closeNote, setCloseNote] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  async function loadReports() {
    try {
      const [k, b, m] = await Promise.all([
        api(`/reports-official/kdv?period=${period}`),
        api(`/reports-official/ba-bs?period=${period}&threshold=5000`),
        api(`/reports-official/mizan?from=${period}-01`),
      ]);
      setKdv(k); setBabs(b); setMizan(m);
    } catch (e: any) { toast({ title: "Rapor yüklenemedi", description: String(e), variant: "destructive" }); }
  }
  async function loadAdmin() {
    try {
      const [i, a, c] = await Promise.all([
        api("/accountant/invites"), api("/accountant/access"), api("/accountant/period-closes"),
      ]);
      setInvites(i); setAccesses(a); setCloses(c);
    } catch (e: any) { /* admin değilse 403 normal */ }
  }
  useEffect(() => { loadReports(); }, [period]);
  useEffect(() => { loadAdmin(); }, []);

  async function sendInvite() {
    try {
      await api("/accountant/invites", { method: "POST", body: JSON.stringify({ email: inviteEmail, fullName: inviteName }) });
      toast({ title: "Davet oluşturuldu", description: "Token üretildi, müşavirinize iletin." });
      setInviteOpen(false); setInviteEmail(""); setInviteName(""); loadAdmin();
    } catch (e: any) { toast({ title: "Hata", description: String(e), variant: "destructive" }); }
  }
  async function revokeInvite(id: number) {
    if (!confirm("Davet iptal edilsin mi?")) return;
    await api(`/accountant/invites/${id}/revoke`, { method: "POST" });
    loadAdmin();
  }
  async function revokeAccess(id: number) {
    if (!confirm("Müşavir erişimi iptal edilsin mi?")) return;
    await api(`/accountant/access/${id}`, { method: "DELETE" });
    loadAdmin();
  }
  async function closeAPeriod() {
    try {
      await api("/accountant/period-close", { method: "POST", body: JSON.stringify({ period: closePeriod, note: closeNote }) });
      toast({ title: "Dönem kapatıldı", description: closePeriod });
      setCloseOpen(false); setCloseNote(""); loadAdmin();
    } catch (e: any) { toast({ title: "Hata", description: String(e), variant: "destructive" }); }
  }
  async function reopenPeriod(p: string) {
    if (!confirm(`${p} dönemini yeniden açmak istediğinize emin misiniz?`)) return;
    await api("/accountant/period-reopen", { method: "POST", body: JSON.stringify({ period: p }) });
    loadAdmin();
  }

  const downloadBABS = () => {
    window.open(apiUrl(`/api/reports-official/ba-bs.csv?period=${period}&threshold=5000`), "_blank");
  };

  const periodOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-muhasebeci">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calculator className="h-7 w-7 text-primary" />
            Mali Müşavir Paneli
          </h1>
          <p className="text-muted-foreground">Resmi raporlar, dönem kapanışı ve mali müşavir erişimi.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Dönem:</Label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={period} onChange={(e) => setPeriod(e.target.value)}
            data-testid="select-period"
          >
            {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5" data-testid="muhasebeci-tabs">
          <TabsTrigger value="kdv">KDV Beyanı</TabsTrigger>
          <TabsTrigger value="babs">Form Ba/Bs</TabsTrigger>
          <TabsTrigger value="mizan">Mizan</TabsTrigger>
          <TabsTrigger value="kapanis">Dönem Kapanışı</TabsTrigger>
          <TabsTrigger value="musavir">Müşavir Daveti</TabsTrigger>
        </TabsList>

        {/* ─── KDV ─── */}
        <TabsContent value="kdv" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="kpi-output-vat">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Hesaplanan KDV (Satışlar)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-emerald-600">{fmtTRY(kdv?.outputVat)}</div></CardContent>
            </Card>
            <Card data-testid="kpi-input-vat">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">İndirilecek KDV (Alımlar)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-blue-600">{fmtTRY(kdv?.inputVat)}</div></CardContent>
            </Card>
            <Card data-testid="kpi-payable">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ödenecek KDV</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-red-600">{fmtTRY(kdv?.payable)}</div></CardContent>
            </Card>
            <Card data-testid="kpi-carry">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Devreden KDV</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-amber-600">{fmtTRY(kdv?.carryForward)}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Detay</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="font-bold text-muted-foreground">Satışlar</div>
                  <div>Brüt: <strong>{fmtTRY(kdv?.sales?.gross)}</strong></div>
                  <div>Matrah: {fmtTRY(kdv?.sales?.base)}</div>
                  <div>KDV: {fmtTRY(kdv?.sales?.vat)}</div>
                  <div className="text-xs text-muted-foreground">{kdv?.sales?.rowCount || 0} satır</div>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-muted-foreground">Alış faturaları</div>
                  <div>Net: <strong>{fmtTRY(kdv?.purchases?.net)}</strong></div>
                  <div>KDV: {fmtTRY(kdv?.purchases?.vat)}</div>
                  <div className="text-xs text-muted-foreground">{kdv?.purchases?.rowCount || 0} fatura</div>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-muted-foreground">Giderler içindeki KDV</div>
                  <div>Brüt: {fmtTRY(kdv?.expenses?.gross)}</div>
                  <div>KDV: <strong>{fmtTRY(kdv?.expenses?.vat)}</strong></div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                * Bu değerler beyanname hazırlığı için referans gösterimdir; resmi beyan için mali müşavirinizle teyit ediniz.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BA-BS ─── */}
        <TabsContent value="babs" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Form Ba/Bs (5.000 TL+)</h3>
              <p className="text-sm text-muted-foreground">{babs?.baCount || 0} BA satırı, {babs?.bsCount || 0} BS satırı.</p>
            </div>
            <Button variant="outline" onClick={downloadBABS} data-testid="btn-export-babs">
              <Download className="h-4 w-4 mr-2" /> CSV indir
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />Form Ba — Alımlar</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>VKN/TCKN</TableHead><TableHead>Ünvan</TableHead><TableHead className="text-right">Net Tutar</TableHead><TableHead className="text-right">KDV</TableHead><TableHead className="text-right">Fatura</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(babs?.ba || []).map((r: any, i: number) => (
                    <TableRow key={i} data-testid={`ba-row-${i}`}>
                      <TableCell className="font-mono text-xs">{r.vkn}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right">{fmtTRY(r.netTotal)}</TableCell>
                      <TableCell className="text-right">{fmtTRY(r.vatTotal)}</TableCell>
                      <TableCell className="text-right">{r.invoiceCount}</TableCell>
                    </TableRow>
                  ))}
                  {(!babs?.ba || babs.ba.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Bu dönemde 5.000 TL+ alım yok</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" />Form Bs — Satışlar</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>VKN/TCKN</TableHead><TableHead>Müşteri</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">KDV</TableHead><TableHead className="text-right">Satır</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(babs?.bs || []).map((r: any, i: number) => (
                    <TableRow key={i} data-testid={`bs-row-${i}`}>
                      <TableCell className="font-mono text-xs">{r.vkn}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right">{fmtTRY(r.netTotal)}</TableCell>
                      <TableCell className="text-right">{fmtTRY(r.vatTotal)}</TableCell>
                      <TableCell className="text-right">{r.rows}</TableCell>
                    </TableRow>
                  ))}
                  {(!babs?.bs || babs.bs.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Bu dönemde 5.000 TL+ kayıtlı müşteri satışı yok</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MİZAN ─── */}
        <TabsContent value="mizan" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="mizan-revenue"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ciro</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{fmtTRY(mizan?.revenue)}</div></CardContent></Card>
            <Card data-testid="mizan-cogs"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SMM (COGS)</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{fmtTRY(mizan?.cogs)}</div></CardContent></Card>
            <Card data-testid="mizan-expense"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Toplam Gider</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{fmtTRY(mizan?.totalExpense)}</div></CardContent></Card>
            <Card data-testid="mizan-net"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Kâr</CardTitle></CardHeader><CardContent><div className={`text-xl font-bold ${(mizan?.netProfit || 0) < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtTRY(mizan?.netProfit)}</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Gider Mizanı</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Kategori</TableHead><TableHead className="text-right">Toplam</TableHead><TableHead className="text-right">Hareket</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(mizan?.expenses || []).map((e: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{e.category}</TableCell>
                      <TableCell className="text-right">{fmtTRY(e.total)}</TableCell>
                      <TableCell className="text-right">{e.count}</TableCell>
                    </TableRow>
                  ))}
                  {(!mizan?.expenses || mizan.expenses.length === 0) && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Veri yok</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DÖNEM KAPANIŞI ─── */}
        <TabsContent value="kapanis" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Dönem Kapanışları</h3>
              <p className="text-sm text-muted-foreground">Kapatılmış dönemlere yeni kayıt eklenmemesi için hatırlatıcı.</p>
            </div>
            <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-close-period"><Lock className="h-4 w-4 mr-2" />Dönem Kapat</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Dönem Kapat</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Dönem (YYYY-MM)</Label><Input value={closePeriod} onChange={(e) => setClosePeriod(e.target.value)} data-testid="input-close-period" /></div>
                  <div><Label>Not (opsiyonel)</Label><Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} data-testid="input-close-note" /></div>
                </div>
                <DialogFooter><Button onClick={closeAPeriod} data-testid="btn-confirm-close">Kapat</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Dönem</TableHead><TableHead>Durum</TableHead><TableHead>Kapatma Tarihi</TableHead><TableHead>Not</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {closes.map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-close-${c.id}`}>
                      <TableCell className="font-mono">{c.period}</TableCell>
                      <TableCell>{c.status === "closed" ? <Badge variant="destructive">Kapalı</Badge> : <Badge variant="secondary">Yeniden açıldı</Badge>}</TableCell>
                      <TableCell>{new Date(c.closedAt).toLocaleString("tr-TR")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.note || "—"}</TableCell>
                      <TableCell className="text-right">
                        {c.status === "closed" && (
                          <Button variant="ghost" size="sm" onClick={() => reopenPeriod(c.period)} data-testid={`btn-reopen-${c.id}`}>
                            <Unlock className="h-4 w-4 mr-1" />Aç
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {closes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Henüz kapanış yapılmadı</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MÜŞAVIR DAVETI ─── */}
        <TabsContent value="musavir" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Mali Müşavir Erişimi</h3>
              <p className="text-sm text-muted-foreground">Müşavirinize davet linki gönderin; verilerinize sadece okuma yetkisiyle ulaşır.</p>
            </div>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-invite-accountant"><UserPlus className="h-4 w-4 mr-2" />Müşavir Davet Et</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Mali Müşavir Davet</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>E-posta</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} data-testid="input-invite-email" /></div>
                  <div><Label>Ad Soyad (opsiyonel)</Label><Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} data-testid="input-invite-name" /></div>
                </div>
                <DialogFooter><Button onClick={sendInvite} data-testid="btn-send-invite">Davet Oluştur</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Davetler</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>E-posta</TableHead><TableHead>Ad</TableHead><TableHead>Durum</TableHead><TableHead>Token</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {invites.map((i: any) => (
                    <TableRow key={i.id} data-testid={`invite-${i.id}`}>
                      <TableCell>{i.email}</TableCell>
                      <TableCell>{i.fullName || "—"}</TableCell>
                      <TableCell>
                        {i.status === "pending" && <Badge variant="secondary">Bekliyor</Badge>}
                        {i.status === "accepted" && <Badge>Kabul edildi</Badge>}
                        {i.status === "revoked" && <Badge variant="destructive">İptal</Badge>}
                        {i.status === "expired" && <Badge variant="outline">Süresi doldu</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{i.token.slice(0, 12)}…</TableCell>
                      <TableCell className="text-right">
                        {i.status === "pending" && (
                          <Button variant="ghost" size="sm" onClick={() => revokeInvite(i.id)} data-testid={`btn-revoke-${i.id}`}>İptal</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {invites.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Davet yok</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Aktif Müşavir Erişimleri</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Kullanıcı</TableHead><TableHead>E-posta</TableHead><TableHead>Yetki</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {accesses.map((a: any) => (
                    <TableRow key={a.id} data-testid={`access-${a.id}`}>
                      <TableCell>{a.fullName || a.username}</TableCell>
                      <TableCell>{a.email || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{a.scope}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => revokeAccess(a.id)} data-testid={`btn-revoke-access-${a.id}`}>Erişimi Kaldır</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {accesses.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Aktif müşavir yok</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
