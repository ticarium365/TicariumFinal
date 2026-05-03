import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BodySmall, Caption, Heading3 } from "@/components/ui/typography";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  UserPlus, Lock, Unlock, Download, Table2, Mail,
  TrendingUp, TrendingDown, Building2,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatTryCurrency, formatTrDateTime } from "@/lib/finance-intl";

const fmtTRY = formatTryCurrency;

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
      setInvites(i); setAccesses(Array.isArray(a) ? a : []); setCloses(c);
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

  const baColumns: DataTableColumn<any>[] = useMemo(() => [
    { id: "vkn", header: "VKN/TCKN", sortable: true, sortValue: (r) => r.vkn, cell: (r) => <span className="font-mono text-xs">{r.vkn}</span> },
    { id: "name", header: "Ünvan", sortable: true, sortValue: (r) => r.name, cell: (r) => r.name },
    { id: "netTotal", header: "Net Tutar", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.netTotal, cell: (r) => fmtTRY(Number(r.netTotal), 2) },
    { id: "vatTotal", header: "KDV", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.vatTotal, cell: (r) => fmtTRY(Number(r.vatTotal), 2) },
    { id: "invoiceCount", header: "Fatura", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.invoiceCount, cell: (r) => r.invoiceCount },
  ], []);

  const bsColumns: DataTableColumn<any>[] = useMemo(() => [
    { id: "vkn", header: "VKN/TCKN", sortable: true, sortValue: (r) => r.vkn, cell: (r) => <span className="font-mono text-xs">{r.vkn}</span> },
    { id: "name", header: "Müşteri", sortable: true, sortValue: (r) => r.name, cell: (r) => r.name },
    { id: "netTotal", header: "Net", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.netTotal, cell: (r) => fmtTRY(Number(r.netTotal), 2) },
    { id: "vatTotal", header: "KDV", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.vatTotal, cell: (r) => fmtTRY(Number(r.vatTotal), 2) },
    { id: "rows", header: "Satır", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.rows, cell: (r) => r.rows },
  ], []);

  const mizanExpenseColumns: DataTableColumn<any>[] = useMemo(() => [
    { id: "category", header: "Kategori", sortable: true, sortValue: (r) => r.category, cell: (r) => r.category },
    { id: "total", header: "Toplam", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.total, cell: (r) => fmtTRY(Number(r.total), 2) },
    { id: "count", header: "Hareket", headerClassName: "text-right", className: "text-right", sortable: true, sortValue: (r) => r.count, cell: (r) => r.count },
  ], []);

  const inviteColumns: DataTableColumn<any>[] = useMemo(() => [
    { id: "email", header: "E-posta", cell: (r) => r.email },
    { id: "fullName", header: "Ad", cell: (r) => r.fullName || "—" },
    {
      id: "status",
      header: "Durum",
      cell: (r) => {
        if (r.status === "pending") return <Badge tone="warning">Bekliyor</Badge>;
        if (r.status === "accepted") return <Badge tone="success">Kabul edildi</Badge>;
        if (r.status === "revoked") return <Badge tone="danger">İptal</Badge>;
        if (r.status === "expired") return <Badge tone="neutral">Süresi doldu</Badge>;
        return <Badge tone="neutral">{r.status}</Badge>;
      },
    },
    { id: "token", header: "Token", cell: (r) => <span className="font-mono text-xs">{r.token?.slice(0, 12)}…</span> },
    {
      id: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) =>
        r.status === "pending" ? (
          <Button variant="ghost" size="sm" onClick={() => revokeInvite(r.id)} data-testid={`btn-revoke-${r.id}`}>İptal</Button>
        ) : null,
    },
  ], []);

  const accessColumns: DataTableColumn<any>[] = useMemo(() => [
    { id: "user", header: "Kullanıcı", cell: (r) => r.fullName || r.username },
    { id: "email", header: "E-posta", cell: (r) => r.email || "—" },
    { id: "scope", header: "Yetki", cell: (r) => <Badge tone="neutral">{r.scope}</Badge> },
    {
      id: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => revokeAccess(r.id)} data-testid={`btn-revoke-access-${r.id}`}>Erişimi Kaldır</Button>
      ),
    },
  ], []);

  const closeColumns: DataTableColumn<any>[] = useMemo(() => [
    { id: "period", header: "Dönem", cell: (r) => <span className="font-mono">{r.period}</span> },
    {
      id: "status",
      header: "Durum",
      cell: (r) => (r.status === "closed" ? <Badge tone="danger">Kapalı</Badge> : <Badge tone="neutral">Yeniden açıldı</Badge>),
    },
    { id: "closedAt", header: "Kapatma Tarihi", cell: (r) => formatTrDateTime(r.closedAt) },
    { id: "note", header: "Not", cell: (r) => <span className="text-sm text-muted-foreground">{r.note || "—"}</span> },
    {
      id: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) =>
        r.status === "closed" ? (
          <Button variant="ghost" size="sm" onClick={() => reopenPeriod(r.period)} data-testid={`btn-reopen-${r.id}`}>
            <Unlock className="h-4 w-4 mr-1" />Aç
          </Button>
        ) : null,
    },
  ], []);

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-muhasebeci">
      <PageHeader
        title="Mali Müşavir Paneli"
        subtitle="Resmi raporlar, dönem kapanışı ve mali müşavir erişimi."
        right={
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Dönem</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40" data-testid="select-period"><SelectValue /></SelectTrigger>
              <SelectContent>{periodOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        }
      />

      {accesses.length === 0 && (
        <EmptyState
          icon={Building2}
          title="Bağlı mali müşavir yok"
          description="Müşavirinizi davet ederek rapor ve belge paylaşımını başlatın."
          action={{ label: "Müşavir Davet Et", onClick: () => setInviteOpen(true), testId: "btn-empty-invite-accountant" }}
        />
      )}

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
              <Caption as="p" className="mt-4 text-muted-foreground">
                * Bu değerler beyanname hazırlığı için referans gösterimdir; resmi beyan için mali müşavirinizle teyit ediniz.
              </Caption>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BA-BS ─── */}
        <TabsContent value="babs" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading3>Form Ba/Bs (5.000 TL+)</Heading3>
              <BodySmall className="text-muted-foreground">
                {babs?.baCount || 0} BA satırı, {babs?.bsCount || 0} BS satırı.
              </BodySmall>
            </div>
            <Button variant="outline" onClick={downloadBABS} data-testid="btn-export-babs">
              <Download className="h-4 w-4 mr-2" /> CSV indir
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />Form Ba — Alımlar</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={baColumns}
                data={babs?.ba || []}
                getRowId={(r, i) => `ba-${r.vkn}-${i}`}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={TrendingDown}
                    title="Form Ba satırı yok"
                    description="Seçili dönemde 5.000 TL ve üzeri tedarikçi alımları için üretilecek Ba satırı yok."
                  />
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" />Form Bs — Satışlar</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={bsColumns}
                data={babs?.bs || []}
                getRowId={(r, i) => `bs-${r.vkn}-${i}`}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={TrendingUp}
                    title="Form Bs satırı yok"
                    description="Seçili dönemde 5.000 TL ve üzeri kayıtlı müşteriye satış (Bs) için satır bulunmuyor."
                  />
                }
              />
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
              <DataTable
                columns={mizanExpenseColumns}
                data={mizan?.expenses || []}
                getRowId={(_, i) => `mizan-exp-${i}`}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={Table2}
                    title="Gider satırı yok"
                    description="Bu dönem için gider mizanında listelenecek kalem bulunmuyor."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DÖNEM KAPANIŞI ─── */}
        <TabsContent value="kapanis" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading3>Dönem Kapanışları</Heading3>
              <BodySmall className="text-muted-foreground">
                Kapatılmış dönemlere yeni kayıt eklenmemesi için hatırlatıcı.
              </BodySmall>
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
              <DataTable
                columns={closeColumns}
                data={closes}
                getRowId={(c) => `close-${c.id}`}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={Lock}
                    title="Kapanış kaydı yok"
                    description="Dönem kapanışı yaptığınızda kayıtlar burada listelenir; yeni kayıt eklenmesini engellemek için kullanılır."
                    action={{ label: "Dönem kapat", onClick: () => setCloseOpen(true), testId: "empty-close-period" }}
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MÜŞAVIR DAVETI ─── */}
        <TabsContent value="musavir" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading3>Mali Müşavir Erişimi</Heading3>
              <BodySmall className="text-muted-foreground">
                Müşavirinize davet linki gönderin; verilerinize sadece okuma yetkisiyle ulaşır.
              </BodySmall>
            </div>
            <Button data-testid="btn-invite-accountant" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4 mr-2" />Müşavir Davet Et</Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Davetler</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={inviteColumns}
                data={invites}
                getRowId={(r) => `invite-${r.id}`}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={Mail}
                    title="Davet geçmişi boş"
                    description="Mali müşavirinize e-posta daveti gönderildiğinde kayıtlar burada görünür."
                    action={{ label: "Davet gönder", onClick: () => setInviteOpen(true), testId: "empty-send-invite" }}
                  />
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Aktif Müşavir Erişimleri</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={accessColumns}
                data={accesses}
                getRowId={(r) => `access-${r.id}`}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={Building2}
                    title="Aktif müşavir erişimi yok"
                    description="Davet kabul edildiğinde müşaviriniz burada salt okunur erişimle görünür."
                    action={{ label: "Müşavir davet et", onClick: () => setInviteOpen(true), testId: "empty-invite-accountant-table" }}
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
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
  );
}
