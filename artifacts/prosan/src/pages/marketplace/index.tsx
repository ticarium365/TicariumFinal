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
import { Plus, RefreshCw, Activity, Trash2, ShoppingCart, ListChecks, Settings as SettingsIcon, Package, CheckCircle2, AlertCircle, Clock, AlertOctagon, Hourglass, Loader2, Store, WifiOff, PackageOpen, ChevronRight, Rocket } from "lucide-react";
import { MarketplaceAutopilotPanel } from "./MarketplaceAutopilotPanel";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import { useToast } from "@/hooks/use-toast";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SkeletonBlock, SkeletonLine, SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

type Provider = { key: string; label: string; needs: string[] };
type Account = {
  id: number; provider: string; name: string; sandbox: boolean; isActive: boolean;
  credentials: Record<string, string>; settings: Record<string, any>;
  lastHealthOk: boolean | null; lastHealthMessage: string | null; lastSyncAt: string | null;
};
type Job = {
  id: number; jobType: string; status: string; accountId: number;
  attemptCount: number; maxAttempts?: number; lastError: string | null;
  createdAt: string; result: any;
  // Sprint C — backend türetilmiş alanlar
  errorCategory?: "rate-limit" | "permanent" | "transient" | null;
  errorMessage?: string | null;
  nextRetryAt?: string | null;
  retryAvailable?: boolean;
};
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
  const [showTestAccounts, setShowTestAccounts] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Dalga 31 — KPI strip + pending orders widget (sadece ekleme)
  const [globalPendingCount, setGlobalPendingCount] = useState(0);
  const [globalPendingOrders, setGlobalPendingOrders] = useState<MOrder[]>([]);
  const [publishedProductsCount, setPublishedProductsCount] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [newProvider, setNewProvider] = useState("mock");
  const [newName, setNewName] = useState("Mock Mağaza");
  const [newSandbox, setNewSandbox] = useState(true);
  const [newCreds, setNewCreds] = useState<Record<string, string>>({});

  async function refresh() {
    setPageLoading(true);
    try {
      const [p, a, j, l] = await Promise.all([
        api<Provider[]>("/marketplace/providers"),
        api<Account[]>("/marketplace/accounts"),
        api<Job[]>("/marketplace/jobs"),
        api<Log[]>("/marketplace/logs"),
      ]);
      setProviders(p); setAccounts(a); setJobs(j); setLogs(l);
      await loadOrders();
      fetchKpiData().catch(() => {});
    } finally {
      setPageLoading(false);
    }
  }

  async function loadOrders() {
    setOrdersLoading(true);
    const qs = orderFilter === "pending" ? "?converted=false"
      : orderFilter === "converted" ? "?converted=true" : "";
    try {
      const o = await api<MOrder[]>(`/marketplace/orders${qs}`);
      setOrders(o);
    } catch (e: any) {
      // sessizce yut — yetki yoksa
    } finally {
      setOrdersLoading(false);
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
        fetchKpiData().catch(() => {});
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
  // Dalga 31 — KPI/widget verileri (filter-bağımsız global)
  async function fetchKpiData() {
    try {
      const [pending, stats] = await Promise.all([
        api<MOrder[]>("/marketplace/orders?converted=false&limit=500"),
        api<{ publishedMappings: { count: number }[] }>("/marketplace/stats"),
      ]);
      setGlobalPendingOrders(pending);
      setGlobalPendingCount(pending.length);
      setPublishedProductsCount(Number(stats.publishedMappings?.[0]?.count || 0));
    } catch {
      // sessizce yut
    }
  }

  useEffect(() => {
    refresh().catch(() => {
      toastError("Pazaryeri verileri yüklenemedi.");
    });
  }, []);
  useEffect(() => { loadOrders().catch(() => {}); }, [orderFilter]);
  useEffect(() => { fetchKpiData().catch(() => {}); }, []);
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
    if (r.ok) toastSuccess(r.message);
    else toastError(r.message);
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

  async function bulkDeleteTestAccounts() {
    const targets = accounts.filter(isTestAccount);
    if (targets.length === 0) return;
    if (!confirm(`${targets.length} test/mock hesabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
    setBulkDeleting(true);
    try {
      let ok = 0; let fail = 0;
      for (const a of targets) {
        try {
          await api(`/marketplace/accounts/${a.id}`, { method: "DELETE" });
          ok++;
        } catch { fail++; }
      }
      toast({ title: "Test hesapları temizlendi", description: `${ok} silindi${fail > 0 ? `, ${fail} hata` : ""}` });
      await refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  function isTestAccount(a: Account): boolean {
    return (a.provider === "mock" && a.sandbox === true) || /^MockAcc-/i.test(a.name);
  }

  const realAccounts = accounts.filter((a) => !isTestAccount(a));
  const testAccounts = accounts.filter(isTestAccount);
  const visibleAccounts = showTestAccounts ? accounts : realAccounts;

  return (
    <OnlineSalesFeatureGate>
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

      {/* Dalga 31 — KPI Strip (sadece ekleme) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="marketplace-kpi-strip">
        {(() => {
          const activeAccounts = accounts.filter((a) => a.isActive);
          const healthyCount = activeAccounts.filter((a) => a.lastHealthOk === true).length;
          const unhealthyCount = activeAccounts.filter((a) => a.lastHealthOk === false).length;
          const pendingDisplay = globalPendingCount >= 500 ? "500+" : String(globalPendingCount);
          return (
            <>
              <Card data-testid="kpi-active-stores">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Aktif Mağaza</div>
                      <div className="text-2xl font-bold mt-1">{activeAccounts.length}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{healthyCount} sağlıklı</div>
                    </div>
                    <Store className="h-7 w-7 text-blue-500 opacity-70" />
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-unhealthy-stores" className={unhealthyCount > 0 ? "border-red-200" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Sağlıksız Mağaza</div>
                      <div className={`text-2xl font-bold mt-1 ${unhealthyCount > 0 ? "text-red-600" : ""}`}>{unhealthyCount}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">son sağlık kontrolü</div>
                    </div>
                    <WifiOff className={`h-7 w-7 opacity-70 ${unhealthyCount > 0 ? "text-red-500" : "text-slate-400"}`} />
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-published-products">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Yayında Ürün</div>
                      <div className="text-2xl font-bold mt-1">{publishedProductsCount}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">eşleştirilmiş kanal</div>
                    </div>
                    <PackageOpen className="h-7 w-7 text-emerald-500 opacity-70" />
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-pending-orders" className={globalPendingCount > 0 ? "border-amber-200" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Bekleyen Sipariş</div>
                      <div className={`text-2xl font-bold mt-1 ${globalPendingCount > 0 ? "text-amber-600" : ""}`}>{pendingDisplay}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">satışa dönüştürülmemiş</div>
                    </div>
                    <ShoppingCart className={`h-7 w-7 opacity-70 ${globalPendingCount > 0 ? "text-amber-500" : "text-slate-400"}`} />
                  </div>
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>

      {/* Dalga 31 — Bekleyen Sipariş widget (sadece ekleme) */}
      {globalPendingOrders.length > 0 && (
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20" data-testid="pending-orders-widget">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm">Bekleyen Sipariş — Son İşlemler</CardTitle>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setOrderFilter("pending"); setTab("orders"); }} data-testid="btn-goto-pending-orders">
                Tümü <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
              {globalPendingOrders.slice(0, 5).map((o, i) => {
                const rankColor = i === 0 ? "bg-orange-100 text-orange-700 border-orange-200"
                  : i === 1 ? "bg-amber-100 text-amber-700 border-amber-200"
                  : i === 2 ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                  : "bg-slate-100 text-slate-600 border-slate-200";
                const acc = accounts.find((a) => a.id === o.accountId);
                const isConverting = convertingId === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => convertOrder(o.id)}
                    disabled={isConverting}
                    className="text-left p-3 rounded-lg border bg-card hover:shadow-md transition-shadow disabled:opacity-60 disabled:cursor-wait"
                    data-testid={`pending-order-${o.id}`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${rankColor}`}>#{i + 1}</Badge>
                      {isConverting ? <Loader2 className="h-3 w-3 animate-spin text-amber-600" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="text-sm font-medium truncate">{o.customerName || `Sipariş #${o.externalOrderId}`}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {new Date(o.pulledAt).toLocaleDateString("tr-TR")} · {acc?.name || o.channelKey}
                    </div>
                    {o.totalAmount != null && (
                      <div className="text-sm font-semibold text-emerald-700 mt-1">
                        {Number(o.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {o.currency || "TRY"}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accounts" data-testid="tab-accounts"><SettingsIcon className="h-4 w-4 mr-1" />Mağazalar ({realAccounts.length})</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders"><Package className="h-4 w-4 mr-1" />Siparişler ({orders.length})</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs"><ListChecks className="h-4 w-4 mr-1" />İşler ({jobs.length})</TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs"><Activity className="h-4 w-4 mr-1" />Loglar</TabsTrigger>
          <TabsTrigger value="autopilot" data-testid="tab-autopilot"><Rocket className="h-4 w-4 mr-1" />Autopilot</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-3 mt-4">
          {testAccounts.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span><strong>{testAccounts.length}</strong> test/mock hesabı gizli.</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowTestAccounts((v) => !v)} data-testid="btn-toggle-test-accounts">
                    {showTestAccounts ? "Gizle" : "Göster"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={bulkDeleteTestAccounts} disabled={bulkDeleting} data-testid="btn-bulk-delete-test">
                    {bulkDeleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    Tümünü Sil
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {pageLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((k) => (
                <Card key={k}>
                  <CardHeader className="space-y-3">
                    <div className="flex justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1 space-y-2">
                        <SkeletonLine width="min(280px, 55%)" height={22} borderRadius={6} />
                        <SkeletonLine width="85%" height={14} />
                      </div>
                      <div className="flex gap-2">
                        <SkeletonBlock width={120} height={32} borderRadius={6} />
                        <SkeletonBlock width={120} height={32} borderRadius={6} />
                        <SkeletonBlock width={40} height={32} borderRadius={6} />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : null}
          {!pageLoading && visibleAccounts.length === 0 && (
            <Card>
              <CardContent className="py-6">
                <EmptyState
                  icon={Store}
                  title="Henüz kanal bağlanmadı"
                  description="Trendyol, Hepsiburada veya n11 hesabınızı bağlayarak satışlarınızı senkronize edin."
                  action={{ label: "Kanal Bağla", onClick: () => setOpenCreate(true), testId: "empty-connect-channel" }}
                />
              </CardContent>
            </Card>
          )}
          {!pageLoading && visibleAccounts.map((a) => {
            const isTest = isTestAccount(a);
            return (
            <Card key={a.id} data-testid={`account-${a.id}`} className={isTest ? "opacity-70" : ""}>
              <CardHeader>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      <span className="truncate">{a.name}</span>
                      <Badge variant={a.isActive ? "default" : "secondary"}>{a.provider}</Badge>
                      {a.sandbox && <Badge variant="outline">SANDBOX</Badge>}
                      {isTest && <Badge variant="outline" className="border-amber-500/50 text-amber-400">TEST</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {a.lastHealthOk == null
                        ? <span className="text-muted-foreground">Henüz sağlık kontrolü çalıştırılmadı — "Sağlık Kontrolü" butonuna bas.</span>
                        : a.lastHealthOk ? `✓ ${a.lastHealthMessage}` : `✗ ${a.lastHealthMessage}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => healthCheck(a.id)} data-testid={`btn-health-${a.id}`}>Sağlık Kontrolü</Button>
                    <Button size="sm" variant="outline" onClick={() => enqueueJob(a.id, "pull_orders")} data-testid={`btn-pull-${a.id}`}>Sipariş Çek</Button>
                    <Button size="sm" variant="ghost" onClick={() => delAccount(a.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
            );
          })}
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
            {ordersLoading ? (
              <SkeletonTable rows={6} columns={10} rowHeight={40} className="border-0 rounded-none" />
            ) : (
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
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <JobsTab jobs={jobs} accounts={accounts} />
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

        <TabsContent value="autopilot" className="mt-4">
          <MarketplaceAutopilotPanel />
        </TabsContent>
      </Tabs>
    </div>
    </OnlineSalesFeatureGate>
  );
}

// ─── Sprint C — Jobs Tab: tek paylaşımlı 1s tick (per-row interval yerine) ──
function JobsTab({ jobs, accounts }: { jobs: Job[]; accounts: Account[] }) {
  const needsTick = jobs.some((j) => j.retryAvailable && j.nextRetryAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!needsTick) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [needsTick]);
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="p-2">#</th><th>Tür</th><th>Mağaza</th><th>Durum</th>
            <th>Hata Tipi</th><th>Deneme</th><th>Sonraki Tekrar</th>
            <th>Tarih</th><th>Hata Mesajı</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} now={now} accountName={accounts.find((a) => a.id === j.accountId)?.name || String(j.accountId)} />
          ))}
          {jobs.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Henüz iş yok</td></tr>}
        </tbody>
      </table>
    </CardContent></Card>
  );
}

function JobRow({ job: j, accountName, now }: { job: Job; accountName: string; now: number }) {
  const max = j.maxAttempts ?? 3;
  const attemptsExhausted = j.attemptCount >= max;
  const remainMs = j.nextRetryAt ? new Date(j.nextRetryAt).getTime() - now : 0;

  const categoryUI = (() => {
    if (!j.errorCategory) return null;
    if (j.errorCategory === "permanent") {
      return <Badge variant="destructive" className="gap-1" data-testid={`job-cat-${j.id}`}><AlertOctagon className="h-3 w-3" />Kalıcı Hata</Badge>;
    }
    if (j.errorCategory === "rate-limit") {
      return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500/90" data-testid={`job-cat-${j.id}`}><Hourglass className="h-3 w-3" />Hız Limiti</Badge>;
    }
    return <Badge variant="secondary" className="gap-1" data-testid={`job-cat-${j.id}`}><Clock className="h-3 w-3" />Geçici</Badge>;
  })();

  const retryUI = (() => {
    if (j.errorCategory === "permanent") {
      return <span className="text-xs text-destructive">Tekrar yok</span>;
    }
    if (attemptsExhausted) {
      return <span className="text-xs text-muted-foreground">Limit doldu</span>;
    }
    if (j.retryAvailable && remainMs > 0) {
      const total = Math.ceil(remainMs / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      const fmt = m > 0 ? `${m}d ${s.toString().padStart(2, "0")}s` : `${s}s`;
      return <span className="text-xs font-mono tabular-nums text-amber-600" data-testid={`job-retry-${j.id}`}>{fmt} sonra</span>;
    }
    if (j.status === "running" || j.status === "queued") {
      return <span className="text-xs text-blue-600">Sırada</span>;
    }
    return <span className="text-xs text-muted-foreground">-</span>;
  })();

  return (
    <tr className="border-t" data-testid={`job-row-${j.id}`}>
      <td className="p-2">{j.id}</td>
      <td>{j.jobType}</td>
      <td>{accountName}</td>
      <td>
        <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>
          {j.status}
        </Badge>
      </td>
      <td>{categoryUI ?? <span className="text-xs text-muted-foreground">-</span>}</td>
      <td>
        <span className={attemptsExhausted ? "text-destructive font-semibold" : ""}>
          {j.attemptCount}/{max}
        </span>
      </td>
      <td>{retryUI}</td>
      <td className="text-xs">{new Date(j.createdAt).toLocaleString("tr-TR")}</td>
      <td className="text-xs text-red-500 max-w-[280px] truncate" title={j.errorMessage || j.lastError || ""}>
        {j.errorMessage || j.lastError || "-"}
      </td>
    </tr>
  );
}
