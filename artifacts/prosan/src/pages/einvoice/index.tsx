import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
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

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(n) || 0);
const fmtDate = (d: string) => new Date(d).toLocaleString("tr-TR");

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", queued: "secondary", sent: "default",
  accepted: "default", rejected: "destructive", cancelled: "outline", failed: "destructive",
  new: "secondary", read: "outline", converted: "default", archived: "outline",
};

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> e-Fatura</h1>
          <p className="text-sm text-muted-foreground">Provider-bağımsız e-Fatura / e-Arşiv yönetim merkezi.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}><RefreshCw className="h-4 w-4 mr-1" /> Yenile</Button>
        </div>
      </div>

      {settings && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-4 flex-wrap">
            <Badge variant={settings.enabled ? "default" : "outline"}>
              {settings.enabled ? "Aktif" : "Pasif"}
            </Badge>
            <Badge variant="secondary">Sağlayıcı: {currentProvider?.label || settings.provider}</Badge>
            <Badge variant={settings.sandbox ? "outline" : "default"}>
              {settings.sandbox ? "Sandbox" : "Canlı"}
            </Badge>
            {settings.lastHealthOk != null && (
              <Badge variant={settings.lastHealthOk ? "default" : "destructive"}>
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
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Alıcı</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Profil</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead>ETTN / No</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outbox.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Henüz fatura yok.</TableCell></TableRow>
                  )}
                  {outbox.map((r) => (
                    <TableRow key={r.id} id={`outbox-row-${r.id}`} className="transition-all duration-300">
                      <TableCell className="text-xs">{fmtDate(r.invoiceDate)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.receiverName}</div>
                        <div className="text-xs text-muted-foreground">{r.receiverVkn || "-"}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.invoiceType}</Badge></TableCell>
                      <TableCell className="text-xs">{r.profile}</TableCell>
                      <TableCell className="text-right font-medium">{fmtTL(r.totalAmount)}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {r.externalNo || "-"}<br/>
                        <span className="text-muted-foreground">{r.externalId?.slice(0, 8)}…</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[r.status] || "secondary"}>{r.status}</Badge>
                        {r.statusMessage && <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">{r.statusMessage}</div>}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" title="UBL-TR XML önizle" onClick={() => openXmlPreview(r)} data-testid={`btn-xml-${r.id}`}>
                          <FileCode className="h-3 w-3" />
                        </Button>
                        {(r.status === "draft" || r.status === "failed") && (
                          <Button size="sm" variant="default" onClick={() => sendOutbox(r.id)}><Send className="h-3 w-3" /></Button>
                        )}
                        {(r.status === "sent" || r.status === "accepted") && (
                          <Button size="sm" variant="outline" onClick={() => cancelOutbox(r.id)}><X className="h-3 w-3" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Gönderen</TableHead>
                    <TableHead>Fatura No</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="text-right">KDV</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inbox.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Gelen fatura yok. "Sağlayıcıdan Çek" ile başlayın.</TableCell></TableRow>
                  )}
                  {inbox.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{fmtDate(r.invoiceDate)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.senderName}</div>
                        <div className="text-xs text-muted-foreground">{r.senderVkn}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.invoiceNo || r.externalId.slice(0, 12)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtTL(r.totalAmount)}</TableCell>
                      <TableCell className="text-right">{fmtTL(r.taxAmount)}</TableCell>
                      <TableCell><Badge variant={STATUS_BADGE[r.status] || "secondary"}>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                    <Switch checked={settings.sandbox} onCheckedChange={(v) => setSettings({ ...settings, sandbox: v })} />
                    <Label>Sandbox / Test Modu</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
                    <Label>Bu sağlayıcıyı aktif et</Label>
                  </div>
                </div>

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
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Sağlayıcı</TableHead>
                    <TableHead>Olay</TableHead>
                    <TableHead>Seviye</TableHead>
                    <TableHead>Mesaj</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Olay yok.</TableCell></TableRow>
                  )}
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{fmtDate(e.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline">{e.provider}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.event}</TableCell>
                      <TableCell>
                        <Badge variant={e.level === "error" ? "destructive" : e.level === "warn" ? "secondary" : "default"}>
                          {e.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <Badge variant="outline" className="ml-2">
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
