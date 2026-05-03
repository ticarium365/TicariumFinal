import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { formatTryCurrency, formatTrDateTime, formatTrDate } from "@/lib/finance-intl";
import type { BadgeTone } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader2, RefreshCw, Send, X, Plus, FileText, Inbox, Settings as SettingsIcon, Activity, FileCode, Copy, Download } from "lucide-react";

const API = "/api/einvoice";

type Provider = { key: string; label: string; category: string; needs: string[] };
type Settings = {
  id: number; provider: string; sandbox: boolean; enabled: boolean;
  config: Record<string, any>;
  defaultSenderAlias?: string | null; defaultProfile?: string | null;
  lastHealthCheck?: string | null; lastHealthOk?: boolean | null; lastHealthMessage?: string | null;
};
type OutboxRow = {
  id: number; documentNumber: string | null; receiverName: string; receiverVkn: string | null;
  invoiceType: string; profile: string; scenario: string; invoiceDate: string;
  totalAmount: number; taxAmount: number; currency: string;
  provider: string; externalId: string | null; externalNo: string | null;
  status: string; statusMessage: string | null; attemptCount: number; createdAt: string;
};
type InboxRow = {
  id: number; provider: string; externalId: string; senderName: string; senderVkn: string | null;
  invoiceNo: string | null; invoiceDate: string; totalAmount: number; taxAmount: number;
  currency: string; status: string; convertedToType?: string | null; createdAt: string;
};
type EventRow = {
  id: number; provider: string; event: string; level: string; message: string | null; createdAt: string;
};

function outboxStatusDisplay(status: string): { label: string; tone: BadgeTone } {
  const s = (status || "").toLowerCase();
  if (s === "sent" || s === "accepted") return { label: "Gönderildi", tone: "success" };
  if (s === "queued" || s === "new") return { label: "Beklemede", tone: "warning" };
  if (s === "failed" || s === "rejected") return { label: "Hata", tone: "danger" };
  if (s === "draft") return { label: "Taslak", tone: "neutral" };
  if (s === "cancelled") return { label: "İptal", tone: "neutral" };
  return { label: status || "—", tone: "neutral" };
}

function inboxStatusDisplay(status: string): { label: string; tone: BadgeTone } {
  const s = (status || "").toLowerCase();
  if (s === "converted") return { label: "İşlendi", tone: "success" };
  if (s === "new") return { label: "Beklemede", tone: "warning" };
  if (s === "rejected" || s === "failed") return { label: "Hata", tone: "danger" };
  if (s === "draft") return { label: "Taslak", tone: "neutral" };
  if (s === "read") return { label: "Okundu", tone: "neutral" };
  if (s === "archived") return { label: "Arşiv", tone: "neutral" };
  return { label: status || "—", tone: "neutral" };
}

export default function EInvoicePage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [healthBusy, setHealthBusy] = useState(false);
  const [pollBusy, setPollBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [xmlPreview, setXmlPreview] = useState<{ id: number; loading: boolean; xml: string | null; row: OutboxRow | null } | null>(null);

  const openXmlPreview = async (row: OutboxRow) => {
    setXmlPreview({ id: row.id, loading: true, xml: null, row });
    try {
      const res = await fetch(`${API}/outbox/${row.id}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const xml = data.rawXml || data.lastResponse?.xml || null;
      setXmlPreview({ id: row.id, loading: false, xml, row });
    } catch (e: any) {
      toast({ title: "XML alınamadı", description: e.message, variant: "destructive" });
      setXmlPreview(null);
    }
  };

  const copyXml = async () => {
    if (!xmlPreview?.xml) return;
    try {
      await navigator.clipboard.writeText(xmlPreview.xml);
      toast({ title: "Panoya kopyalandı" });
    } catch { toast({ title: "Kopyalanamadı", variant: "destructive" }); }
  };

  const downloadXml = () => {
    if (!xmlPreview?.xml || !xmlPreview.row) return;
    const blob = new Blob([xmlPreview.xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `efatura-${xmlPreview.row.externalNo || xmlPreview.row.id}.xml`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // Sprint B — Notification deep-link: /einvoice?outbox=:id ile gelen kullanıcıyı
  // ilgili outbox satırına odakla (highlight + scroll). ?new=1 davranışı korunur.
  const [highlightOutboxId, setHighlightOutboxId] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let mutated = false;
    if (params.get("new") === "1") {
      setCreateOpen(true);
      params.delete("new");
      mutated = true;
    }
    const ob = params.get("outbox");
    if (ob && /^\d+$/.test(ob)) {
      setHighlightOutboxId(Number(ob));
      params.delete("outbox");
      mutated = true;
    }
    if (mutated) {
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, []);

  // Outbox listesi yüklendikten sonra hedef satıra scroll + highlight pulse
  useEffect(() => {
    if (highlightOutboxId == null || outbox.length === 0) return undefined;
    const el = document.getElementById(`outbox-row-${highlightOutboxId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "bg-primary/5");
      const t = setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "bg-primary/5");
        setHighlightOutboxId(null);
      }, 3500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [highlightOutboxId, outbox.length]);

  const loadAll = useCallback(async () => {
    const [p, s, o, i, e] = await Promise.all([
      fetch(`${API}/providers`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API}/settings`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API}/outbox?limit=100`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API}/inbox?limit=100`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API}/events?limit=50`, { credentials: "include" }).then((r) => r.json()),
    ]);
    setProviders(Array.isArray(p) ? p : []);
    setSettings(s && !s.error ? s : null);
    setOutbox(Array.isArray(o) ? o : []);
    setInbox(Array.isArray(i) ? i : []);
    setEvents(Array.isArray(e) ? e : []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const currentProvider = providers.find((p) => p.key === settings?.provider);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`${API}/settings`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setSettings(updated);
      toast({ title: "Ayarlar kaydedildi" });
    } catch (e: any) {
      toast({ title: "Kaydedilemedi", description: e.message, variant: "destructive" });
    } finally { setSavingSettings(false); }
  };

  const runHealthCheck = async () => {
    setHealthBusy(true);
    try {
      const res = await fetch(`${API}/health-check`, { method: "POST", credentials: "include" });
      const data = await res.json();
      toast({
        title: data.ok ? "Bağlantı OK" : "Bağlantı sorunu",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
      await loadAll();
    } finally { setHealthBusy(false); }
  };

  const pollInbox = async () => {
    setPollBusy(true);
    try {
      const res = await fetch(`${API}/inbox/poll`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      toast({ title: "Inbox güncellendi", description: `${data.inserted} yeni / ${data.skipped} mevcut` });
      await loadAll();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setPollBusy(false); }
  };

  const sendOutbox = async (id: number) => {
    const res = await fetch(`${API}/outbox/${id}/send`, { method: "POST", credentials: "include" });
    const data = await res.json();
    toast({ title: "Gönderim", description: data.statusMessage || data.status });
    await loadAll();
  };

  const cancelOutbox = async (id: number) => {
    const reason = prompt("İptal sebebi:");
    if (reason === null) return;
    const res = await fetch(`${API}/outbox/${id}/cancel`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    toast({ title: "İptal", description: data.statusMessage || data.status });
    await loadAll();
  };

  const downloadOutboxPdf = async (row: OutboxRow) => {
    try {
      const res = await fetch(`${API}/outbox/${row.id}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `efatura-${row.externalNo || row.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF indirilemedi", description: e.message, variant: "destructive" });
    }
  };

  const outboxColumns: DataTableColumn<OutboxRow>[] = [
    {
      id: "invoiceDate",
      header: "Tarih",
      sortable: true,
      sortValue: (r) => r.invoiceDate,
      cell: (r) => <span className="text-xs">{formatTrDate(r.invoiceDate)}</span>,
    },
    {
      id: "receiver",
      header: "Alıcı",
      cell: (r) => (
        <>
          <div className="font-medium">{r.receiverName}</div>
          <div className="text-xs text-muted-foreground">{r.receiverVkn || "-"}</div>
        </>
      ),
    },
    { id: "invoiceType", header: "Tip", cell: (r) => <Badge tone="neutral">{r.invoiceType}</Badge> },
    { id: "profile", header: "Profil", cell: (r) => <span className="text-xs">{r.profile}</span> },
    {
      id: "totalAmount",
      header: "Tutar",
      headerClassName: "text-right",
      className: "text-right",
      sortable: true,
      sortValue: (r) => r.totalAmount,
      cell: (r) => <span className="font-medium">{formatTryCurrency(r.totalAmount, 2)}</span>,
    },
    {
      id: "ettn",
      header: "ETTN / No",
      cell: (r) => (
        <span className="text-xs font-mono">
          {r.externalNo || "-"}
          <br />
          <span className="text-muted-foreground">{r.externalId?.slice(0, 8)}…</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Durum",
      cell: (r) => {
        const st = outboxStatusDisplay(r.status);
        return (
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {r.statusMessage ? (
              <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">{r.statusMessage}</div>
            ) : null}
          </>
        );
      },
    },
    {
      id: "actions",
      header: "İşlem",
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" title="PDF indir" onClick={() => downloadOutboxPdf(r)} data-testid={`btn-pdf-${r.id}`}>
            <Download className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" title="UBL-TR XML önizle" onClick={() => openXmlPreview(r)} data-testid={`btn-xml-${r.id}`}>
            <FileCode className="h-3 w-3" />
          </Button>
          {(r.status === "draft" || r.status === "failed" || r.status === "queued") && (
            <Button size="sm" variant="default" title="Gönder" onClick={() => sendOutbox(r.id)} data-testid={`btn-send-${r.id}`}>
              <Send className="h-3 w-3" />
            </Button>
          )}
          {(r.status === "sent" || r.status === "accepted") && (
            <Button size="sm" variant="outline" title="İptal" onClick={() => cancelOutbox(r.id)} data-testid={`btn-cancel-${r.id}`}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const inboxColumns: DataTableColumn<InboxRow>[] = [
    {
      id: "invoiceDate",
      header: "Tarih",
      sortable: true,
      sortValue: (r) => r.invoiceDate,
      cell: (r) => <span className="text-xs">{formatTrDate(r.invoiceDate)}</span>,
    },
    {
      id: "sender",
      header: "Gönderen",
      cell: (r) => (
        <>
          <div className="font-medium">{r.senderName}</div>
          <div className="text-xs text-muted-foreground">{r.senderVkn}</div>
        </>
      ),
    },
    { id: "invoiceNo", header: "Fatura No", cell: (r) => <span className="font-mono text-xs">{r.invoiceNo || r.externalId.slice(0, 12)}</span> },
    {
      id: "totalAmount",
      header: "Tutar",
      headerClassName: "text-right",
      className: "text-right",
      sortable: true,
      sortValue: (r) => r.totalAmount,
      cell: (r) => formatTryCurrency(r.totalAmount, 2),
    },
    {
      id: "taxAmount",
      header: "KDV",
      headerClassName: "text-right",
      className: "text-right",
      sortable: true,
      sortValue: (r) => r.taxAmount,
      cell: (r) => formatTryCurrency(r.taxAmount, 2),
    },
    {
      id: "status",
      header: "Durum",
      cell: (r) => {
        const st = inboxStatusDisplay(r.status);
        return <Badge tone={st.tone}>{st.label}</Badge>;
      },
    },
  ];

  const eventColumns: DataTableColumn<EventRow>[] = [
    {
      id: "createdAt",
      header: "Tarih",
      sortable: true,
      sortValue: (r) => r.createdAt,
      cell: (r) => <span className="text-xs">{formatTrDateTime(r.createdAt)}</span>,
    },
    { id: "provider", header: "Sağlayıcı", cell: (r) => <Badge tone="neutral">{r.provider}</Badge> },
    { id: "event", header: "Olay", cell: (r) => <span className="font-mono text-xs">{r.event}</span> },
    {
      id: "level",
      header: "Seviye",
      cell: (r) => (
        <Badge tone={r.level === "error" ? "danger" : r.level === "warn" ? "warning" : "neutral"}>{r.level}</Badge>
      ),
    },
    { id: "message", header: "Mesaj", cell: (r) => <span className="text-xs">{r.message}</span> },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="e-Fatura / e-Arşiv"
        subtitle="Provider-bağımsız e-Fatura ve e-Arşiv yönetim merkezi."
        right={
          <Button variant="outline" size="sm" onClick={loadAll}><RefreshCw className="h-4 w-4 mr-1" /> Yenile</Button>
        }
      />

      {settings && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-4 flex-wrap">
            <Badge tone={settings.enabled ? "success" : "neutral"}>
              {settings.enabled ? "Aktif" : "Pasif"}
            </Badge>
            <Badge tone="neutral">Sağlayıcı: {currentProvider?.label || settings.provider}</Badge>
            <Badge tone={settings.sandbox ? "warning" : "brand"}>
              {settings.sandbox ? "Sandbox" : "Canlı"}
            </Badge>
            {settings.lastHealthOk != null && (
              <Badge tone={settings.lastHealthOk ? "success" : "danger"}>
                Sağlık: {settings.lastHealthOk ? "OK" : "FAIL"}
              </Badge>
            )}
            {settings.lastHealthMessage && (
              <span className="text-xs text-muted-foreground truncate max-w-[400px]">{settings.lastHealthMessage}</span>
            )}
            <Button size="sm" variant="outline" onClick={runHealthCheck} disabled={healthBusy}>
              {healthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />}
              Sağlık Kontrolü
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="outbox">
        <TabsList>
          <TabsTrigger value="outbox"><Send className="h-4 w-4 mr-1" /> Giden ({outbox.length})</TabsTrigger>
          <TabsTrigger value="inbox"><Inbox className="h-4 w-4 mr-1" /> Gelen ({inbox.length})</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1" /> Ayarlar</TabsTrigger>
          <TabsTrigger value="events"><Activity className="h-4 w-4 mr-1" /> Olay Günlüğü</TabsTrigger>
        </TabsList>

        {/* OUTBOX */}
        <TabsContent value="outbox" className="space-y-3">
          <div className="flex justify-end">
            <CreateInvoiceDialog
              open={createOpen} setOpen={setCreateOpen}
              defaultProfile={settings?.defaultProfile || "TICARIFATURA"}
              onCreated={loadAll}
            />
          </div>
          <Card>
            <CardContent className="p-3">
              <DataTable<OutboxRow>
                columns={outboxColumns}
                data={outbox}
                getRowId={(r) => String(r.id)}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={FileText}
                    title="Giden kutusu boş"
                    description="Satış kaynaklı veya manuel oluşturulan faturalar gönderildikçe burada listelenir."
                    action={{ label: "Fatura oluştur", onClick: () => setCreateOpen(true), testId: "empty-create-invoice" }}
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* INBOX */}
        <TabsContent value="inbox" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={pollInbox} disabled={pollBusy}>
              {pollBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sağlayıcıdan Çek
            </Button>
          </div>
          <Card>
            <CardContent className="p-3">
              <DataTable<InboxRow>
                columns={inboxColumns}
                data={inbox}
                getRowId={(r) => String(r.id)}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={Inbox}
                    title="Gelen fatura yok"
                    description='Sağlayıcı kayıtlarınızdan gelen e-faturaları çekmek için üstteki "Sağlayıcıdan Çek" düğmesini kullanın.'
                    action={{ label: "Sağlayıcıdan çek", onClick: () => pollInbox(), testId: "empty-poll-inbox" }}
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings">
          {settings && (
            <Card>
              <CardHeader>
                <CardTitle>e-Fatura Sağlayıcı Ayarları</CardTitle>
                <CardDescription>Sağlayıcı bağımsız sözleşme — istediğiniz zaman provider değiştirebilirsiniz.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Sağlayıcı</Label>
                    <Select value={settings.provider} onValueChange={(v) => setSettings({ ...settings, provider: v, config: {} })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Varsayılan Profil</Label>
                    <Select value={settings.defaultProfile || "TICARIFATURA"} onValueChange={(v) => setSettings({ ...settings, defaultProfile: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TEMELFATURA">Temel Fatura</SelectItem>
                        <SelectItem value="TICARIFATURA">Ticari Fatura</SelectItem>
                        <SelectItem value="EARSIVFATURA">e-Arşiv Fatura</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Gönderici Alias (urn:mail:…)</Label>
                    <Input value={settings.defaultSenderAlias || ""} onChange={(e) => setSettings({ ...settings, defaultSenderAlias: e.target.value })} />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch checked={settings.sandbox} onCheckedChange={(v) => setSettings({ ...settings, sandbox: v })} data-testid="switch-sandbox" />
                    <Label>Sandbox / Test Modu</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
                    <Label>Bu sağlayıcıyı aktif et</Label>
                  </div>
                </div>

                {/* Sprint 62 — Sandbox bilgilendirme banner (sadece-ekleme) */}
                {settings.sandbox && settings.provider !== "mock" && (
                  <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 text-xs space-y-1" data-testid="sandbox-info-banner">
                    <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" /> Sandbox modu aktif
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      Bu modda <strong>UBL-TR XML üretimi gerçek</strong>; ancak <strong>gönderme/iptal/gelen çekme</strong> sağlayıcının
                      gerçek API'sine değil, mock kabul yanıtına gider. API anahtarınızı doldurmadan tüm akışı uçtan uca test
                      edebilirsiniz. Üretime almadan önce sandbox kapatıldığında transport gerçek sağlayıcıya bağlanır.
                    </p>
                  </div>
                )}

                {currentProvider && currentProvider.needs.length > 0 && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-medium">Sağlayıcı Kimlik Bilgileri</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {currentProvider.needs.map((k) => (
                        <div key={k}>
                          <Label className="text-xs">{k}</Label>
                          <Input
                            type={/password|secret/i.test(k) ? "password" : "text"}
                            placeholder={settings.config?.[k] === "********" ? "Kayıtlı (değiştirmek için yazın)" : ""}
                            value={settings.config?.[k] === "********" ? "" : (settings.config?.[k] ?? "")}
                            onChange={(e) => setSettings({ ...settings, config: { ...settings.config, [k]: e.target.value } })}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Şifreler & secret'lar maskelenir. Boş bırakılan alanlar mevcut değeri korur.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={runHealthCheck} disabled={healthBusy}>
                    {healthBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Activity className="h-4 w-4 mr-1" />}
                    Bağlantıyı Test Et
                  </Button>
                  <Button onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Ayarları Kaydet
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* EVENTS */}
        <TabsContent value="events">
          <Card>
            <CardContent className="p-3">
              <DataTable<EventRow>
                columns={eventColumns}
                data={events}
                getRowId={(r) => String(r.id)}
                enableRowSelection={false}
                emptyState={
                  <EmptyState
                    icon={Activity}
                    title="Olay kaydı yok"
                    description="Sağlayıcıdan gelen gönderim, hata ve durum bildirimleri burada görünür."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* UBL-TR XML Önizleme */}
      <Dialog open={!!xmlPreview} onOpenChange={(o) => !o && setXmlPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              UBL-TR 1.2 XML Önizleme
              {xmlPreview?.row && (
                <Badge tone="neutral" className="ml-2">
                  {xmlPreview.row.externalNo || `#${xmlPreview.row.id}`}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-md border bg-muted/30">
            {xmlPreview?.loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
              </div>
            ) : xmlPreview?.xml ? (
              <pre className="text-xs p-4 whitespace-pre-wrap break-all font-mono" data-testid="xml-content">{xmlPreview.xml}</pre>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Bu fatura için kayıtlı XML yok. Stub provider taslakları yeniden oluşturulduğunda XML üretilir.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {xmlPreview?.xml && (
              <>
                <Button variant="outline" size="sm" onClick={copyXml}><Copy className="h-4 w-4 mr-1" />Kopyala</Button>
                <Button variant="outline" size="sm" onClick={downloadXml}><Download className="h-4 w-4 mr-1" />.xml İndir</Button>
              </>
            )}
            <Button variant="default" size="sm" onClick={() => setXmlPreview(null)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Yeni Fatura Dialog ──────────────────────────────────────────────────────
function CreateInvoiceDialog({
  open, setOpen, defaultProfile, onCreated,
}: { open: boolean; setOpen: (v: boolean) => void; defaultProfile: string; onCreated: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    invoiceType: "SATIS",
    profile: defaultProfile,
    scenario: "EFATURA",
    invoiceDate: new Date().toISOString().slice(0, 10),
    documentNumber: "",
    senderName: "",
    senderVkn: "",
    receiverName: "",
    receiverVkn: "",
    receiverEmail: "",
    notes: "",
  });
  const [lines, setLines] = useState([
    { name: "", quantity: 1, unitPrice: 0, vatRate: 20, discountAmount: 0 },
  ]);

  const submit = async () => {
    if (!form.receiverName || lines.length === 0) {
      toast({ title: "Eksik alan", description: "Alıcı adı ve en az bir satır gerekli", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/outbox`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceType: form.invoiceType, profile: form.profile, scenario: form.scenario,
          invoiceDate: form.invoiceDate, documentNumber: form.documentNumber || null,
          notes: form.notes ? [form.notes] : [],
          sender: { name: form.senderName || "Şirket", vkn: form.senderVkn || null },
          receiver: { name: form.receiverName, vkn: form.receiverVkn || null, email: form.receiverEmail || null },
          lines: lines.map((l) => ({
            name: l.name, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
            vatRate: Number(l.vatRate), discountAmount: Number(l.discountAmount) || 0, unitCode: "C62",
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || res.statusText);
      }
      toast({ title: "Taslak oluşturuldu", description: "Outbox'tan gönderebilirsiniz." });
      setOpen(false);
      onCreated();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Yeni Fatura</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Yeni e-Fatura Taslağı</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Tip</Label>
              <Select value={form.invoiceType} onValueChange={(v) => setForm({ ...form, invoiceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SATIS">Satış</SelectItem>
                  <SelectItem value="IADE">İade</SelectItem>
                  <SelectItem value="ISTISNA">İstisna</SelectItem>
                  <SelectItem value="TEVKIFAT">Tevkifat</SelectItem>
                  <SelectItem value="IRSALIYE">e-İrsaliye</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Senaryo</Label>
              <Select value={form.scenario} onValueChange={(v) => setForm({ ...form, scenario: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFATURA">e-Fatura</SelectItem>
                  <SelectItem value="EARSIV">e-Arşiv</SelectItem>
                  <SelectItem value="EIRSALIYE">e-İrsaliye</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profil</Label>
              <Select value={form.profile} onValueChange={(v) => setForm({ ...form, profile: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEMELFATURA">Temel</SelectItem>
                  <SelectItem value="TICARIFATURA">Ticari</SelectItem>
                  <SelectItem value="EARSIVFATURA">e-Arşiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tarih</Label>
              <Input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
          </div>

          <div className="border rounded p-3 space-y-2">
            <div className="text-sm font-medium">Alıcı</div>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="Ünvan / Ad" value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} />
              <Input placeholder="VKN/TCKN" value={form.receiverVkn} onChange={(e) => setForm({ ...form, receiverVkn: e.target.value })} />
              <Input placeholder="E-posta" value={form.receiverEmail} onChange={(e) => setForm({ ...form, receiverEmail: e.target.value })} />
            </div>
          </div>

          <div className="border rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">Satırlar</div>
              <Button size="sm" variant="outline" onClick={() => setLines([...lines, { name: "", quantity: 1, unitPrice: 0, vatRate: 20, discountAmount: 0 }])}>
                <Plus className="h-3 w-3 mr-1" /> Satır
              </Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-5" placeholder="Ürün / hizmet" value={l.name} onChange={(e) => { const n = [...lines]; n[i].name = e.target.value; setLines(n); }} />
                <Input className="col-span-1" type="number" value={l.quantity} onChange={(e) => { const n = [...lines]; n[i].quantity = Number(e.target.value); setLines(n); }} />
                <Input className="col-span-2" type="number" placeholder="Birim Fiyat" value={l.unitPrice} onChange={(e) => { const n = [...lines]; n[i].unitPrice = Number(e.target.value); setLines(n); }} />
                <Input className="col-span-1" type="number" placeholder="KDV%" value={l.vatRate} onChange={(e) => { const n = [...lines]; n[i].vatRate = Number(e.target.value); setLines(n); }} />
                <Input className="col-span-2" type="number" placeholder="İskonto" value={l.discountAmount} onChange={(e) => { const n = [...lines]; n[i].discountAmount = Number(e.target.value); setLines(n); }} />
                <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label>Notlar</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Taslak Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
