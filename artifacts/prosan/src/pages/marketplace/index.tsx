import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, RefreshCw, Activity, Trash2, ShoppingCart, ListChecks, Settings as SettingsIcon, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Provider = { key: string; label: string; needs: string[] };
type Account = {
  id: number; provider: string; name: string; sandbox: boolean; isActive: boolean;
  credentials: Record<string, string>; settings: Record<string, any>;
  lastHealthOk: boolean | null; lastHealthMessage: string | null; lastSyncAt: string | null;
};
type Job = { id: number; jobType: string; status: string; accountId: number; attemptCount: number; lastError: string | null; createdAt: string; result: any };
type MOrder = {
  id: number; companyId: number; accountId: number; channelKey: string;
  externalOrderId: string; status: string; totalAmount: number | null;
  currency: string | null; customerName: string | null; itemsJson: any[];
  rawJson: any; convertedSaleId: number | null; convertedAt: string | null;
  pulledAt: string;
};
type Log = { id: number; operation: string; status: string; level: string; message: string | null; createdAt: string; itemsProcessed: number; itemsFailed: number };

async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${url}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Hata");
  return r.json();
}

export default function MarketplacePage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [orders, setOrders] = useState<MOrder[]>([]);
  const [orderFilter, setOrderFilter] = useState<"all" | "pending" | "converted">("pending");
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editAcc, setEditAcc] = useState<Account | null>(null);
  const [tab, setTab] = useState("accounts");

  const [newProvider, setNewProvider] = useState("mock");
  const [newName, setNewName] = useState("Mock Mağaza");
  const [newSandbox, setNewSandbox] = useState(true);
  const [newCreds, setNewCreds] = useState<Record<string, string>>({});

  async function refresh() {
    const [p, a, j, l] = await Promise.all([
      api<Provider[]>("/marketplace/providers"),
      api<Account[]>("/marketplace/accounts"),
      api<Job[]>("/marketplace/jobs"),
      api<Log[]>("/marketplace/logs"),
    ]);
    setProviders(p); setAccounts(a); setJobs(j); setLogs(l);
    await loadOrders();
  }

  async function loadOrders() {
    const qs = orderFilter === "pending" ? "?converted=false"
      : orderFilter === "converted" ? "?converted=true" : "";
    try {
      const o = await api<MOrder[]>(`/marketplace/orders${qs}`);
      setOrders(o);
    } catch (e: any) {
      // sessizce yut — yetki yoksa
    }
  }

  async function convertOrder(orderId: number) {
    setConvertingId(orderId);
    try {
      const r = await fetch(`/api/marketplace/orders/${orderId}/convert-to-sale`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const data = await r.json();
      if (r.ok) {
        if (data.alreadyConverted) {
          toast({ title: "Zaten dönüştürülmüş", description: `Satış #${data.primarySaleId}` });
        } else {
          const skipMsg = data.skipped?.length ? ` (${data.skipped.length} atlandı)` : "";
          toast({ title: "Satışa dönüştürüldü", description: `${data.sales.length} satış oluşturuldu${skipMsg}` });
        }
        await loadOrders();
      } else if (r.status === 422) {
        const reasons = (data.skipped || []).map((s: any) => s.reason).join(", ");
        toast({ title: "Dönüştürme başarısız", description: `Sebep: ${reasons || "bilinmiyor"}`, variant: "destructive" });
      } else {
        toast({ title: "Hata", description: data.error || data.message || "Bilinmeyen hata", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Bağlantı hatası", description: e.message, variant: "destructive" });
    } finally {
      setConvertingId(null);
    }
  }
  useEffect(() => { refresh().catch(console.error); }, []);
  useEffect(() => { loadOrders().catch(() => {}); }, [orderFilter]);
  useEffect(() => {
    const t = setInterval(() => { api<Job[]>("/marketplace/jobs").then(setJobs).catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, []);

  const selectedProvider = providers.find((p) => p.key === newProvider);

  async function createAccount() {
    await api("/marketplace/accounts", {
      method: "POST",
      body: JSON.stringify({ provider: newProvider, name: newName, sandbox: newSandbox, credentials: newCreds }),
    });
    setOpenCreate(false); setNewCreds({}); setNewName(""); refresh();
  }

  async function healthCheck(id: number) {
    const r = await api<any>(`/marketplace/accounts/${id}/health-check`, { method: "POST" });
    alert(`${r.ok ? "✓" : "✗"} ${r.message}`);
    refresh();
  }

  async function enqueueJob(accountId: number, jobType: string, payload: any = {}) {
    await api("/marketplace/jobs", { method: "POST", body: JSON.stringify({ accountId, jobType, payload }) });
    refresh();
  }

  async function delAccount(id: number) {
    if (!confirm("Bu mağazayı silmek istediğinize emin misiniz?")) return;
    await api(`/marketplace/accounts/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="container mx-auto p-6 space-y-4" data-testid="page-marketplace">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart className="h-6 w-6" /> Pazaryeri Yönetimi</h1>
          <p className="text-sm text-muted-foreground">Trendyol, Hepsiburada, N11, Amazon TR, Shopify ve daha fazlasını tek panelden yönet.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4 mr-1" />Yenile</Button>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild><Button size="sm" data-testid="btn-add-account"><Plus className="h-4 w-4 mr-1" />Yeni Mağaza</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Yeni Mağaza Bağla</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Sağlayıcı</Label>
                  <Select value={newProvider} onValueChange={(v) => { setNewProvider(v); setNewCreds({}); }}>
                    <SelectTrigger data-testid="select-provider"><SelectValue /></SelectTrigger>
                    <SelectContent>{providers.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mağaza Adı</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Trendyol Ana Mağaza" data-testid="input-account-name" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newSandbox} onCheckedChange={setNewSandbox} id="sandbox-sw" />
                  <Label htmlFor="sandbox-sw">Sandbox / Test ortamı</Label>
                </div>
                {(selectedProvider?.needs || []).map((k) => (
                  <div key={k}>
                    <Label className="text-xs">{k}</Label>
                    <Input
                      type={/secret|password|key|token/i.test(k) ? "password" : "text"}
                      value={newCreds[k] || ""}
                      onChange={(e) => setNewCreds({ ...newCreds, [k]: e.target.value })}
                      data-testid={`input-cred-${k}`}
                    />
                  </div>
                ))}
              </div>
              <DialogFooter><Button onClick={createAccount} data-testid="btn-create-account">Kaydet</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accounts" data-testid="tab-accounts"><SettingsIcon className="h-4 w-4 mr-1" />Mağazalar ({accounts.length})</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders"><Package className="h-4 w-4 mr-1" />Siparişler ({orders.length})</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs"><ListChecks className="h-4 w-4 mr-1" />İşler ({jobs.length})</TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs"><Activity className="h-4 w-4 mr-1" />Loglar</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-3 mt-4">
          {accounts.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">Henüz mağaza yok. Sağ üstten yeni mağaza ekleyin.</CardContent></Card>}
          {accounts.map((a) => (
            <Card key={a.id} data-testid={`account-${a.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {a.name}
                      <Badge variant={a.isActive ? "default" : "secondary"}>{a.provider}</Badge>
                      {a.sandbox && <Badge variant="outline">SANDBOX</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {a.lastHealthOk == null ? "Sağlık kontrolü yok" : a.lastHealthOk ? `✓ ${a.lastHealthMessage}` : `✗ ${a.lastHealthMessage}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => healthCheck(a.id)} data-testid={`btn-health-${a.id}`}>Sağlık Kontrolü</Button>
                    <Button size="sm" variant="outline" onClick={() => enqueueJob(a.id, "pull_orders")} data-testid={`btn-pull-${a.id}`}>Sipariş Çek</Button>
                    <Button size="sm" variant="ghost" onClick={() => delAccount(a.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Label>Filtre:</Label>
            <Select value={orderFilter} onValueChange={(v: any) => setOrderFilter(v)}>
              <SelectTrigger className="w-48" data-testid="select-order-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Bekleyen (dönüştürülmemiş)</SelectItem>
                <SelectItem value="converted">Dönüştürülmüş</SelectItem>
                <SelectItem value="all">Hepsi</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => loadOrders()} data-testid="btn-refresh-orders">
              <RefreshCw className="h-4 w-4 mr-1" />Yenile
            </Button>
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">#</th>
                  <th>Kanal</th>
                  <th>Mağaza</th>
                  <th>Sipariş No</th>
                  <th>Durum</th>
                  <th>Müşteri</th>
                  <th>Ürün</th>
                  <th>Tutar</th>
                  <th>Çekildi</th>
                  <th>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const acc = accounts.find((a) => a.id === o.accountId);
                  const itemCount = Array.isArray(o.itemsJson) ? o.itemsJson.length : 0;
                  return (
                    <tr key={o.id} className="border-t" data-testid={`order-row-${o.id}`}>
                      <td className="p-2">{o.id}</td>
                      <td><Badge variant="outline">{o.channelKey}</Badge></td>
                      <td className="text-xs">{acc?.name || o.accountId}</td>
                      <td className="font-mono text-xs">{o.externalOrderId}</td>
                      <td>
                        <Badge variant={o.status === "invoiced" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"}>
                          {o.status}
                        </Badge>
                      </td>
                      <td className="text-xs">{o.customerName || "-"}</td>
                      <td className="text-xs">{itemCount} kalem</td>
                      <td className="text-right">{o.totalAmount != null ? `${Number(o.totalAmount).toFixed(2)} ${o.currency || "TRY"}` : "-"}</td>
                      <td className="text-xs">{new Date(o.pulledAt).toLocaleString("tr-TR")}</td>
                      <td>
                        {o.convertedSaleId ? (
                          <span className="inline-flex items-center text-xs text-green-600">
                            <CheckCircle2 className="h-4 w-4 mr-1" />Satış #{o.convertedSaleId}
                          </span>
                        ) : (
                          <Button size="sm" variant="default"
                            onClick={() => convertOrder(o.id)}
                            disabled={convertingId === o.id}
                            data-testid={`btn-convert-${o.id}`}>
                            {convertingId === o.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
                            Satışa Dönüştür
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">
                    {orderFilter === "pending" ? "Bekleyen sipariş yok. Mağazalar sekmesinden 'Sipariş Çek' butonuna basın." : "Sipariş yok."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-2">#</th><th>Tür</th><th>Mağaza</th><th>Durum</th><th>Deneme</th><th>Tarih</th><th>Hata</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="p-2">{j.id}</td>
                    <td>{j.jobType}</td>
                    <td>{accounts.find((a) => a.id === j.accountId)?.name || j.accountId}</td>
                    <td><Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge></td>
                    <td>{j.attemptCount}</td>
                    <td className="text-xs">{new Date(j.createdAt).toLocaleString("tr-TR")}</td>
                    <td className="text-xs text-red-500">{j.lastError || "-"}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz iş yok</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-2">Tarih</th><th>İşlem</th><th>Durum</th><th>İşlenen / Hata</th><th>Mesaj</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(l.createdAt).toLocaleString("tr-TR")}</td>
                    <td>{l.operation}</td>
                    <td><Badge variant={l.status === "success" ? "default" : "destructive"}>{l.status}</Badge></td>
                    <td>{l.itemsProcessed} / {l.itemsFailed}</td>
                    <td className="text-xs">{l.message}</td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Henüz log yok</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
