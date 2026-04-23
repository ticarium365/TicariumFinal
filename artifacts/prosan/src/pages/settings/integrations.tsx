import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Webhook, Key, Plus, X, Pencil, Trash2, CheckCircle, XCircle,
  Send, Eye, EyeOff, Copy, RefreshCw, Activity, Zap,
  BookOpen, ShoppingCart, PlayCircle, ChevronDown, ChevronUp,
  Search, LayoutGrid, Truck, Radio, CreditCard, BarChart3, Timer, AlertTriangle, Wrench, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useFeatures } from "@/components/use-features";

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────
interface WebhookItem {
  id: number; name: string; url: string; events: string; isActive: boolean;
  secret?: string | null; createdAt: string;
  deliveryStats?: { total: number; failed: number; lastAt?: string | null };
}
interface ApiKeyItem {
  id: number; name: string; keyPrefix: string; scopes: string;
  isActive: boolean; lastUsedAt?: string | null; createdAt: string;
}
interface SupportedEvent { event: string; description: string; }
interface Provider { id: string; name: string; logo: string; description: string; }
interface ExtIntegration {
  id: number; provider?: string; platform?: string; storeName?: string;
  displayName?: string; isActive: boolean; lastSyncAt?: string | null;
  lastSyncStatus?: string | null; createdAt: string;
  credentials: object; syncOptions: string;
}
interface SyncLog {
  id: number; syncType: string; status: string; recordCount: number;
  errorMessage?: string | null; startedAt: string; completedAt?: string | null;
}

type TabId = "webhooks" | "api-keys" | "accounting" | "ecommerce";

type HubLifecycle = "all" | "live" | "pilot" | "roadmap";

type HubCatalogEntry = {
  entryId: string;
  family: string;
  providerId: string;
  displayName: string;
  emoji: string;
  description: string;
  lifecycle: "live" | "pilot" | "roadmap";
  setupDifficulty: "low" | "medium" | "high";
  businessImpactTags: string[];
  recommendedFor: string[];
  packageEligibilityHint: string;
  setupChecklist: string[];
  envReadiness: Record<string, boolean>;
  connectedCountHint?: number;
  statusHint?: { ok: boolean; message: string; checkedAtIso?: string };
  deepLinkTab: TabId | null;
  inboundPath?: string;
};

type IntegrationCatalogPayload = {
  version: 1;
  generatedAt: string;
  entries: HubCatalogEntry[];
  tenantCounts: { webhooks: number; apiKeys: number; accounting: number; ecommerce: number };
  tenantActivityProfile?: {
    productsCount: number;
    salesLast30d: number;
    activeMarketplaceChannelAccounts: number;
  };
  recommendedEntryIds: string[];
  recommendationRationale?: { entryId: string; reason: string }[];
};

type LiveReadinessPayload = {
  version: 1;
  payment: {
    providerName: string;
    healthOk: boolean;
    healthMessage: string;
    mode: string;
    iyzicoApiKeyConfigured: boolean;
    iyzicoSecretConfigured: boolean;
    iyzicoModeOverride: string | null;
    returnPathHint: string;
  };
  marketplace: {
    accounts: {
      accountId: number;
      name: string;
      provider: string;
      sandbox: boolean;
      isActive: boolean;
      readiness: string;
      readinessDetail: string;
      lastSyncAtIso: string | null;
      credentialFieldsExpected: number;
      credentialFieldsNonEmpty: number;
    }[];
    recentFailures: {
      id: number;
      source: string;
      accountId: number | null;
      operationOrType: string;
      message: string | null;
      createdAtIso: string;
    }[];
  };
  shipping: {
    architecturePhase: string;
    description: string;
    zonesCount: number;
    rulesCount: number;
    defaultZoneConfigured: boolean;
    managePath: string;
    carrierCatalog: string[];
  };
  extSyncFailures: {
    accounting: { id: number; integrationId: number; operationOrType: string; message: string | null; createdAtIso: string }[];
    ecommerce: { id: number; integrationId: number; operationOrType: string; message: string | null; createdAtIso: string }[];
  };
};

type WorkerObsHealthHonest =
  | "no_channel"
  | "no_success_yet"
  | "healthy_recent"
  | "stale_success"
  | "degraded_queue";

type MarketplaceWorkerObservabilityV1 = {
  version: 1;
  generatedAtIso: string;
  queueSummary: {
    queued: number;
    running: number;
    retrying: number;
    failed: number;
    completed24h: number;
    skipped: number;
    cancelled: number;
    stuckQueued: number;
    stuckRunning: number;
  };
  avgSuccessLatencyMs7d: number | null;
  p95SuccessLatencyMs7d: number | null;
  retryReasonMix30d: { bucket: string; count: number }[];
  failedJobClusters30d: { jobType: string; errorSample: string; count: number }[];
  perAccount: {
    accountId: number;
    name: string;
    provider: string;
    sandbox: boolean;
    isActive: boolean;
    lastProviderHealthOk: boolean | null;
    lastProviderHealthMessage: string | null;
    lastSuccessSyncAtIso: string | null;
    lastSuccessOperation: string | null;
    lastSuccessDurationMs: number | null;
    avgSuccessLatencyMs7d: number | null;
    failedJobs7d: number;
    queuedJobsNow: number;
    runningJobsNow: number;
    queuedStuck: boolean;
    runningStuck: boolean;
    healthHonest: WorkerObsHealthHonest;
    slaWarnings: string[];
  }[];
  tenantAlerts: { severity: "critical" | "warning"; code: string; message: string; accountIds?: number[] }[];
};

type MarketplaceSelfHealingBundleV1 = {
  version: 1;
  generatedAtIso: string;
  recommendations: {
    accountId: number;
    name: string;
    provider: string;
    priority: "high" | "medium";
    code: string;
    message: string;
  }[];
  recentAutoActions: {
    id: number;
    createdAtIso: string;
    operation: string;
    accountId: number | null;
    jobId: number | null;
    message: string | null;
    payload: unknown;
  }[];
  retrySuccess24h: number;
};

type MarketplaceProfitAutomationV1 = {
  version: 1;
  generatedAtIso: string;
  lowStockSalesRisk: {
    productId: number;
    name: string;
    stock: number;
    minStock: number;
    accountId: number;
    accountName: string;
    provider: string;
    severity: "warning" | "critical";
    message: string;
  }[];
  priceChannelSignals: {
    mappingId: number;
    productId: number;
    productName: string;
    accountId: number;
    accountName: string;
    provider: string;
    masterSalePrice: number;
    purchasePrice: number;
    channelPrice: number;
    gapPct: number;
    signal: "overpriced_vs_master" | "underpriced_vs_master";
    message: string;
  }[];
  zeroSaleListedProducts: {
    mappingId: number;
    productId: number;
    productName: string;
    accountId: number;
    accountName: string;
    provider: string;
    message: string;
  }[];
  highReturnSkus: {
    productId: number;
    productName: string;
    returnedQty: number;
    soldQty: number;
    returnRatio: number;
    message: string;
  }[];
  topRevenueChannels: {
    channelKey: string;
    salesRevenue30d: number;
    saleLines30d: number;
    pulledOrderRevenue30d: number;
    pulledOrderCount30d: number;
    combinedHint: string;
  }[];
  lowMarginProducts: {
    productId: number;
    name: string;
    salePrice: number;
    purchasePrice: number;
    marginPct: number | null;
    message: string;
  }[];
  staleListings: {
    mappingId: number;
    productId: number;
    productName: string;
    accountId: number;
    accountName: string;
    provider: string;
    lastSyncedAtIso: string | null;
    syncStatus: string;
    message: string;
  }[];
  repricingRecommendations: {
    mappingId: number;
    productId: number;
    productName: string;
    accountId: number;
    accountName: string;
    provider: string;
    currentChannelPrice: number;
    masterSalePrice: number;
    suggestedPrice: number;
    signal: "overpriced_vs_master" | "underpriced_vs_master";
    rationale: string;
    nonDestructive: true;
  }[];
};

function workerObsHealthLabel(h: WorkerObsHealthHonest): string {
  switch (h) {
    case "healthy_recent":
      return "Worker: yakın başarı";
    case "stale_success":
      return "Worker: gecikmeli";
    case "no_success_yet":
      return "Worker: başarı kaydı yok";
    case "degraded_queue":
      return "Worker: kuyruk/hata";
    case "no_channel":
      return "—";
    default:
      return h;
  }
}

function fmt(d: string) { return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(d: string) { return new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isLoading: featuresLoading, isError: featuresError, features } = useFeatures();
  const marketplaceWorkerObsEnabled =
    !featuresLoading && !featuresError && features.includes("marketplace.basic");
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "webhooks";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "accounting" || t === "ecommerce" || t === "api-keys" || t === "webhooks") return t;
    return "webhooks";
  });

  // Webhook form
  const [showHookForm, setShowHookForm] = useState(false);
  const [editHook, setEditHook] = useState<WebhookItem | null>(null);
  const [hookForm, setHookForm] = useState({ name: "", url: "", events: [] as string[], secret: "" });
  const [selectedDeliveries, setSelectedDeliveries] = useState<number | null>(null);

  // API Key form
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: "", scopes: "read" });
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRawKey, setShowRawKey] = useState(false);

  // Ext integration forms
  const [showAccForm, setShowAccForm] = useState(false);
  const [accForm, setAccForm] = useState({ provider: "", displayName: "", apiKey: "", apiSecret: "" });
  const [showEcForm, setShowEcForm] = useState(false);
  const [ecForm, setEcForm] = useState({ platform: "", storeName: "", apiKey: "", apiSecret: "" });
  const [expandedLogs, setExpandedLogs] = useState<{ type: "acc" | "ec"; id: number } | null>(null);

  const [hubSearch, setHubSearch] = useState("");
  const [hubLifecycle, setHubLifecycle] = useState<HubLifecycle>("all");
  const [hubFamily, setHubFamily] = useState<"all" | HubCatalogEntry["family"]>("all");

  // ─── Sorgular ─────────────────────────────────────────────────────────────
  const catalogQ = useQuery<IntegrationCatalogPayload>({
    queryKey: ["integrations-catalog"],
    queryFn: async () => {
      const r = await fetch("/api/integrations/catalog", { credentials: "include" });
      if (!r.ok) throw new Error("catalog");
      return r.json();
    },
    staleTime: 120_000,
  });

  const liveReadinessQ = useQuery<LiveReadinessPayload>({
    queryKey: ["integrations-live-readiness"],
    queryFn: async () => {
      const r = await fetch("/api/integrations/live-readiness", { credentials: "include" });
      if (!r.ok) throw new Error("readiness");
      return r.json();
    },
    staleTime: 60_000,
  });

  const workerObsQ = useQuery<MarketplaceWorkerObservabilityV1>({
    queryKey: ["marketplace-worker-observability"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace/worker-observability", { credentials: "include" });
      if (!r.ok) throw new Error("worker_observability");
      return r.json();
    },
    enabled: marketplaceWorkerObsEnabled,
    staleTime: 45_000,
    refetchInterval: marketplaceWorkerObsEnabled ? 90_000 : false,
  });

  const selfHealingQ = useQuery<MarketplaceSelfHealingBundleV1>({
    queryKey: ["marketplace-self-healing"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace/self-healing", { credentials: "include" });
      if (!r.ok) throw new Error("self_healing");
      return r.json();
    },
    enabled: marketplaceWorkerObsEnabled,
    staleTime: 45_000,
    refetchInterval: marketplaceWorkerObsEnabled ? 120_000 : false,
  });

  const profitAutomationQ = useQuery<MarketplaceProfitAutomationV1>({
    queryKey: ["marketplace-profit-automation"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace/profit-automation", { credentials: "include" });
      if (!r.ok) throw new Error("profit_automation");
      return r.json();
    },
    enabled: marketplaceWorkerObsEnabled,
    staleTime: 120_000,
    refetchInterval: marketplaceWorkerObsEnabled ? 180_000 : false,
  });

  const pingCatalogEntry = useMutation({
    mutationFn: async (entryId: string) => {
      const r = await fetch(`/api/integrations/catalog/${encodeURIComponent(entryId)}/ping`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "ping");
      return j as { entryId: string; result: { ok: boolean; message: string; mode: string } };
    },
    onSuccess: (d) => {
      if (d.result?.ok) {
        toast({ title: "Bağlantı testi", description: d.result.message });
      } else {
        toast({ title: "Test yanıtı", description: d.result?.message ?? "", variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "Test başarısız", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const hl = sp.get("highlight");
    const tb = sp.get("tab");
    if (tb === "webhooks" || tb === "api-keys" || tb === "accounting" || tb === "ecommerce") setTab(tb);
    if (hl?.startsWith("accounting_")) {
      const pid = hl.slice("accounting_".length);
      setAccForm((f) => ({ ...f, provider: pid }));
      setTab("accounting");
    }
    if (hl?.startsWith("ecommerce_")) {
      const pid = hl.slice("ecommerce_".length);
      setEcForm((f) => ({ ...f, platform: pid }));
      setTab("ecommerce");
    }
    if (hl === "connectivity_webhooks") setTab("webhooks");
    if (hl === "connectivity_api_keys") setTab("api-keys");
  }, []);

  const hubEntries = useMemo(() => {
    const raw = catalogQ.data?.entries ?? [];
    const q = hubSearch.trim().toLowerCase();
    return raw.filter((e) => {
      if (hubLifecycle !== "all" && e.lifecycle !== hubLifecycle) return false;
      if (hubFamily !== "all" && e.family !== hubFamily) return false;
      if (!q) return true;
      const blob = `${e.displayName} ${e.description} ${e.businessImpactTags.join(" ")} ${e.recommendedFor.join(" ")}`.toLowerCase();
      return blob.includes(q);
    });
  }, [catalogQ.data?.entries, hubSearch, hubLifecycle, hubFamily]);

  const openCatalogEntry = (e: HubCatalogEntry) => {
    if (e.deepLinkTab) {
      setTab(e.deepLinkTab);
      const u = new URL(window.location.href);
      u.searchParams.set("tab", e.deepLinkTab);
      u.searchParams.set("highlight", e.entryId);
      window.history.replaceState({}, "", `${u.pathname}?${u.searchParams.toString()}`);
      if (e.deepLinkTab === "accounting" && e.family === "accounting") {
        setAccForm((f) => ({ ...f, provider: e.providerId }));
        setShowAccForm(true);
      }
      if (e.deepLinkTab === "ecommerce" && e.family === "ecommerce") {
        setEcForm((f) => ({ ...f, platform: e.providerId }));
        setShowEcForm(true);
      }
    }
  };

  const webhooksQ = useQuery<{ webhooks: WebhookItem[] }>({
    queryKey: ["webhooks"],
    queryFn: async () => { const r = await fetch("/api/integrations/webhooks", { credentials: "include" }); if (!r.ok) throw new Error(); return r.json(); },
    enabled: tab === "webhooks",
  });
  const apiKeysQ = useQuery<{ apiKeys: ApiKeyItem[] }>({
    queryKey: ["api-keys"],
    queryFn: async () => { const r = await fetch("/api/integrations/api-keys", { credentials: "include" }); if (!r.ok) throw new Error(); return r.json(); },
    enabled: tab === "api-keys",
  });
  const eventsQ = useQuery<{ events: SupportedEvent[] }>({
    queryKey: ["webhook-events"],
    queryFn: async () => { const r = await fetch("/api/integrations/webhook-events", { credentials: "include" }); if (!r.ok) throw new Error(); return r.json(); },
  });
  const deliveriesQ = useQuery<{ deliveries: { id: number; event: string; success: boolean; statusCode?: number; deliveredAt: string }[] }>({
    queryKey: ["webhook-deliveries", selectedDeliveries],
    queryFn: async () => { const r = await fetch(`/api/integrations/webhooks/${selectedDeliveries}/deliveries`, { credentials: "include" }); return r.json(); },
    enabled: !!selectedDeliveries,
  });
  const accProvidersQ = useQuery<{ providers: Provider[] }>({
    queryKey: ["acc-providers"],
    queryFn: async () => { const r = await fetch("/api/ext-integrations/accounting/providers", { credentials: "include" }); return r.json(); },
    enabled: tab === "accounting",
  });
  const accQ = useQuery<{ integrations: ExtIntegration[] }>({
    queryKey: ["acc-integrations"],
    queryFn: async () => { const r = await fetch("/api/ext-integrations/accounting", { credentials: "include" }); return r.json(); },
    enabled: tab === "accounting",
  });
  const ecPlatformsQ = useQuery<{ platforms: Provider[] }>({
    queryKey: ["ec-platforms"],
    queryFn: async () => { const r = await fetch("/api/ext-integrations/ecommerce/platforms", { credentials: "include" }); return r.json(); },
    enabled: tab === "ecommerce",
  });
  const ecQ = useQuery<{ integrations: ExtIntegration[] }>({
    queryKey: ["ec-integrations"],
    queryFn: async () => { const r = await fetch("/api/ext-integrations/ecommerce", { credentials: "include" }); return r.json(); },
    enabled: tab === "ecommerce",
  });
  const logsQ = useQuery<{ logs: SyncLog[] }>({
    queryKey: ["sync-logs", expandedLogs?.type, expandedLogs?.id],
    queryFn: async () => {
      if (!expandedLogs) return { logs: [] };
      const path = expandedLogs.type === "acc"
        ? `/api/ext-integrations/accounting/${expandedLogs.id}/logs`
        : `/api/ext-integrations/ecommerce/${expandedLogs.id}/logs`;
      const r = await fetch(path, { credentials: "include" });
      return r.json();
    },
    enabled: !!expandedLogs,
  });

  // ─── Webhook Mutasyonları ─────────────────────────────────────────────────
  const saveHook = useMutation({
    mutationFn: async (body: object) => {
      const url = editHook ? `/api/integrations/webhooks/${editHook.id}` : "/api/integrations/webhooks";
      const r = await fetch(url, { method: editHook ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      qc.invalidateQueries({ queryKey: ["integrations-catalog"] });
      setShowHookForm(false); setEditHook(null); setHookForm({ name: "", url: "", events: [], secret: "" });
      toast({ title: "Webhook kaydedildi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteHook = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/integrations/webhooks/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); qc.invalidateQueries({ queryKey: ["integrations-catalog"] }); toast({ title: "Webhook silindi" }); },
  });
  const testHook = useMutation({
    mutationFn: async (id: number) => { const r = await fetch(`/api/integrations/webhooks/${id}/test`, { method: "POST", credentials: "include" }); return r.json(); },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["webhooks"] }); if (d.success) toast({ title: `Test başarılı (${d.statusCode})` }); else toast({ title: "Test başarısız", description: d.error ?? `HTTP ${d.statusCode}`, variant: "destructive" }); },
  });

  // ─── API Key Mutasyonları ─────────────────────────────────────────────────
  const createKey = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/integrations/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      qc.invalidateQueries({ queryKey: ["integrations-catalog"] });
      setShowKeyForm(false); setKeyForm({ name: "", scopes: "read" });
      setRevealedKey(d.apiKey.rawKey); setShowRawKey(true);
      toast({ title: "API Key oluşturuldu — yalnızca bir kez gösterilir!" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteKey = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/integrations/api-keys/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); qc.invalidateQueries({ queryKey: ["integrations-catalog"] }); toast({ title: "API Key silindi" }); },
  });
  const toggleKey = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(`/api/integrations/api-keys/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); qc.invalidateQueries({ queryKey: ["integrations-catalog"] }); },
  });

  // ─── Ext Integration Mutasyonları ─────────────────────────────────────────
  const saveAcc = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/ext-integrations/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acc-integrations"] });
      qc.invalidateQueries({ queryKey: ["integrations-catalog"] });
      setShowAccForm(false); setAccForm({ provider: "", displayName: "", apiKey: "", apiSecret: "" });
      toast({ title: "Muhasebe entegrasyonu eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteAcc = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/ext-integrations/accounting/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acc-integrations"] }); qc.invalidateQueries({ queryKey: ["integrations-catalog"] }); toast({ title: "Entegrasyon silindi" }); },
  });
  const syncAcc = useMutation({
    mutationFn: async ({ id, syncType }: { id: number; syncType: string }) => {
      const r = await fetch(`/api/ext-integrations/accounting/${id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ syncType }) });
      return r.json();
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["acc-integrations"] }); qc.invalidateQueries({ queryKey: ["sync-logs", "acc"] });
      if (d.success) toast({ title: `Senkronizasyon başarılı (${d.log.recordCount} kayıt)` });
      else toast({ title: "Senkronizasyon başarısız", description: d.log.errorMessage, variant: "destructive" });
    },
  });
  const saveEc = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/ext-integrations/ecommerce", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ec-integrations"] });
      qc.invalidateQueries({ queryKey: ["integrations-catalog"] });
      setShowEcForm(false); setEcForm({ platform: "", storeName: "", apiKey: "", apiSecret: "" });
      toast({ title: "E-ticaret entegrasyonu eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteEc = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/ext-integrations/ecommerce/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ec-integrations"] }); qc.invalidateQueries({ queryKey: ["integrations-catalog"] }); toast({ title: "Entegrasyon silindi" }); },
  });
  const syncEc = useMutation({
    mutationFn: async ({ id, syncType }: { id: number; syncType: string }) => {
      const r = await fetch(`/api/ext-integrations/ecommerce/${id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ syncType }) });
      return r.json();
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["ec-integrations"] }); qc.invalidateQueries({ queryKey: ["sync-logs", "ec"] });
      if (d.success) toast({ title: `Senkronizasyon başarılı (${d.log.recordCount} kayıt)` });
      else toast({ title: "Senkronizasyon başarısız", description: d.log.errorMessage, variant: "destructive" });
    },
  });

  const openEditHook = (h: WebhookItem) => {
    setEditHook(h);
    let events: string[] = [];
    try { events = JSON.parse(h.events); } catch { events = []; }
    setHookForm({ name: h.name, url: h.url, events, secret: "" });
    setShowHookForm(true);
  };
  const toggleEvent = (ev: string) => setHookForm(p => ({ ...p, events: p.events.includes(ev) ? p.events.filter(e => e !== ev) : [...p.events, ev] }));

  const hooks = webhooksQ.data?.webhooks ?? [];
  const apiKeys = apiKeysQ.data?.apiKeys ?? [];
  const supportedEvents = eventsQ.data?.events ?? [];
  const deliveries = deliveriesQ.data?.deliveries ?? [];
  const accProviders = accProvidersQ.data?.providers ?? [];
  const accIntegrations = accQ.data?.integrations ?? [];
  const ecPlatforms = ecPlatformsQ.data?.platforms ?? [];
  const ecIntegrations = ecQ.data?.integrations ?? [];
  const syncLogs = logsQ.data?.logs ?? [];

  const tabs = [
    { id: "webhooks" as TabId, label: "Webhooks", icon: Zap },
    { id: "api-keys" as TabId, label: "API Anahtarları", icon: Key },
    { id: "accounting" as TabId, label: "Muhasebe", icon: BookOpen },
    { id: "ecommerce" as TabId, label: "E-Ticaret", icon: ShoppingCart },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Bağlantılar ve API</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Webhook, API anahtarı ve muhasebe / e-ticaret sağlayıcı ayarları</p>
        </div>
        <div className="flex gap-2">
          {tab === "webhooks" && <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditHook(null); setHookForm({ name: "", url: "", events: [], secret: "" }); setShowHookForm(true); }}><Plus className="h-3.5 w-3.5" />Webhook Ekle</Button>}
          {tab === "api-keys" && <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowKeyForm(true)}><Plus className="h-3.5 w-3.5" />API Key Oluştur</Button>}
          {tab === "accounting" && <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowAccForm(true)}><Plus className="h-3.5 w-3.5" />Entegrasyon Ekle</Button>}
          {tab === "ecommerce" && <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowEcForm(true)}><Plus className="h-3.5 w-3.5" />Mağaza Ekle</Button>}
        </div>
      </div>

      <Alert className="border-blue-500/30 bg-blue-500/5">
        <AlertTitle className="text-slate-900 dark:text-slate-100">Canlı bağlantı mı, deneme mi?</AlertTitle>
        <AlertDescription className="text-slate-800/90 dark:text-slate-100/85">
          Burada yaptığınız kayıtlar gerçek API anahtarları ve webhook URL’leri içerir. Harici platformun (pazaryeri, muhasebe, banka)
          hesabınızda da ilgili izinlerin açık olduğundan emin olun. Bağlantı hata verirse önce sağlayıcı panelinde anahtarı yenileyin;
          sorun sürerse destek ekibine senkron logları iletin.
        </AlertDescription>
      </Alert>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Canlı hazırlık paneli</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ["integrations-live-readiness"] });
              void qc.invalidateQueries({ queryKey: ["integrations-catalog"] });
              if (marketplaceWorkerObsEnabled) {
                void qc.invalidateQueries({ queryKey: ["marketplace-worker-observability"] });
                void qc.invalidateQueries({ queryKey: ["marketplace-self-healing"] });
                void qc.invalidateQueries({ queryKey: ["marketplace-profit-automation"] });
              }
            }}
          >
            Yenile
          </Button>
        </div>
        {liveReadinessQ.isLoading && <p className="text-xs text-muted-foreground">Özet yükleniyor…</p>}
        {liveReadinessQ.isError && (
          <p className="text-xs text-destructive">Hazırlık verisi alınamadı. Oturum veya ağ hatası olabilir.</p>
        )}
        {liveReadinessQ.data && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <CreditCard className="h-3.5 w-3.5" />
                Ödeme sağlayıcısı
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-mono text-foreground">{liveReadinessQ.data.payment.providerName}</span>
                {" · "}
                mod: <span className="font-mono">{liveReadinessQ.data.payment.mode}</span>
                {liveReadinessQ.data.payment.iyzicoModeOverride ? (
                  <> · IYZICO_MODE=<span className="font-mono">{liveReadinessQ.data.payment.iyzicoModeOverride}</span></>
                ) : null}
              </p>
              <div className="flex items-center gap-1.5 text-xs">
                {liveReadinessQ.data.payment.healthOk ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                )}
                <span>{liveReadinessQ.data.payment.healthMessage}</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono leading-snug">
                API_KEY: {liveReadinessQ.data.payment.iyzicoApiKeyConfigured ? "set" : "unset"} · SECRET:{" "}
                {liveReadinessQ.data.payment.iyzicoSecretConfigured ? "set" : "unset"}
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">{liveReadinessQ.data.payment.returnPathHint}</p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Truck className="h-3.5 w-3.5" />
                  Kargo mimarisi
                </div>
                <Button variant="link" className="h-auto p-0 text-xs" asChild>
                  <Link href={liveReadinessQ.data.shipping.managePath}>Bölgeler / kurallar</Link>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{liveReadinessQ.data.shipping.description}</p>
              <p className="text-[11px] font-mono text-foreground">
                Bölge: {liveReadinessQ.data.shipping.zonesCount} · Kural: {liveReadinessQ.data.shipping.rulesCount}
                {" · "}varsayılan bölge: {liveReadinessQ.data.shipping.defaultZoneConfigured ? "evet" : "hayır"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Taşıyıcı kataloğu (fiyat motoru): {liveReadinessQ.data.shipping.carrierCatalog.slice(0, 6).join(", ")}
                {liveReadinessQ.data.shipping.carrierCatalog.length > 6 ? "…" : ""}
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Radio className="h-3.5 w-3.5" />
                  Pazaryeri hesapları
                </div>
                <Button variant="link" className="h-auto p-0 text-xs" asChild>
                  <Link href="/marketplace">Pazaryeri konsolu</Link>
                </Button>
              </div>
              {liveReadinessQ.data.marketplace.accounts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Bu kiracıda kanal hesabı yok. Stok ve sipariş otomasyonu için önce mağaza ekleyin.</p>
              ) : (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {liveReadinessQ.data.marketplace.accounts.map((a) => (
                    <li key={a.accountId} className="text-[11px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/40 pb-1.5 last:border-0">
                      <span className="font-medium">{a.name}</span>
                      <span className="font-mono text-muted-foreground">{a.provider}</span>
                      {a.sandbox ? <Badge variant="outline" className="text-[9px] h-4 px-1">sandbox</Badge> : null}
                      <Badge
                        variant={
                          a.readiness === "healthy" ? "default"
                            : a.readiness === "unhealthy" ? "destructive"
                              : "secondary"
                        }
                        className="text-[9px] h-4 px-1"
                      >
                        {a.readiness}
                      </Badge>
                      <span className="text-muted-foreground w-full">{a.readinessDetail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(liveReadinessQ.data.marketplace.recentFailures.length > 0
              || liveReadinessQ.data.extSyncFailures.accounting.length > 0
              || liveReadinessQ.data.extSyncFailures.ecommerce.length > 0) && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2 md:col-span-2">
                <p className="text-xs font-semibold text-destructive">Son senkron / kuyruk hataları</p>
                {liveReadinessQ.data.marketplace.recentFailures.length > 0 && (
                  <ul className="text-[10px] font-mono space-y-1">
                    {liveReadinessQ.data.marketplace.recentFailures.map((f) => (
                      <li key={`${f.source}-${f.id}`}>
                        [{f.source}] {f.operationOrType} · acc {f.accountId ?? "—"} · {fmtTime(f.createdAtIso)}
                        {f.message ? ` — ${f.message.slice(0, 120)}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {liveReadinessQ.data.extSyncFailures.accounting.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Muhasebe senkron</p>
                    <ul className="text-[10px] font-mono space-y-1">
                      {liveReadinessQ.data.extSyncFailures.accounting.map((f) => (
                        <li key={`acc-${f.id}`}>
                          int#{f.integrationId} {f.operationOrType} · {fmtTime(f.createdAtIso)}
                          {f.message ? ` — ${f.message.slice(0, 120)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {liveReadinessQ.data.extSyncFailures.ecommerce.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">E-ticaret senkron</p>
                    <ul className="text-[10px] font-mono space-y-1">
                      {liveReadinessQ.data.extSyncFailures.ecommerce.map((f) => (
                        <li key={`ec-${f.id}`}>
                          int#{f.integrationId} {f.operationOrType} · {fmtTime(f.createdAtIso)}
                          {f.message ? ` — ${f.message.slice(0, 120)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {marketplaceWorkerObsEnabled ? (
        <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="h-4 w-4 text-primary shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">Pazaryeri worker gözlemi</h2>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Kuyruk, sync_logs gecikmesi ve hata kümeleri. Sağlayıcı API ping sonucu ayrı sütundadır — yeşil API, worker başarısı anlamına gelmez.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shrink-0 gap-1.5"
              onClick={() => void qc.invalidateQueries({ queryKey: ["marketplace-worker-observability"] })}
              disabled={workerObsQ.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${workerObsQ.isFetching ? "animate-spin" : ""}`} />
              Worker verisini yenile
            </Button>
          </div>

          {workerObsQ.isLoading && (
            <p className="text-xs text-muted-foreground">Worker metrikleri yükleniyor…</p>
          )}
          {workerObsQ.isError && (
            <p className="text-xs text-destructive">Worker gözlemi alınamadı. Oturum veya sunucu hatası.</p>
          )}
          {workerObsQ.data && (
            <div className="space-y-4">
              {workerObsQ.data.tenantAlerts.length > 0 && (
                <div className="space-y-2">
                  {workerObsQ.data.tenantAlerts.map((a) => (
                    <Alert
                      key={`${a.code}-${a.message.slice(0, 40)}`}
                      variant={a.severity === "critical" ? "destructive" : "default"}
                      className={a.severity === "warning" ? "border-amber-500/40 bg-amber-500/5" : undefined}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="text-xs font-semibold">
                        {a.severity === "critical" ? "Kritik" : "Uyarı"} · {a.code}
                      </AlertTitle>
                      <AlertDescription className="text-[11px] leading-relaxed">{a.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
                <div className="rounded-md border bg-muted/15 px-2 py-1.5">
                  <div className="text-muted-foreground font-medium">Kuyruk</div>
                  <div className="font-mono tabular-nums text-foreground mt-0.5">
                    q {workerObsQ.data.queueSummary.queued} · run {workerObsQ.data.queueSummary.running} · retry{" "}
                    {workerObsQ.data.queueSummary.retrying}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/15 px-2 py-1.5">
                  <div className="text-muted-foreground font-medium">Takılı (eşik)</div>
                  <div className="font-mono tabular-nums text-foreground mt-0.5">
                    q {workerObsQ.data.queueSummary.stuckQueued} · run {workerObsQ.data.queueSummary.stuckRunning}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/15 px-2 py-1.5">
                  <div className="text-muted-foreground font-medium flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Ort. / p95 (7g başarılı)
                  </div>
                  <div className="font-mono tabular-nums text-foreground mt-0.5">
                    {workerObsQ.data.avgSuccessLatencyMs7d != null ? `${workerObsQ.data.avgSuccessLatencyMs7d} ms` : "—"} ·{" "}
                    {workerObsQ.data.p95SuccessLatencyMs7d != null ? `${workerObsQ.data.p95SuccessLatencyMs7d} ms` : "—"}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/15 px-2 py-1.5">
                  <div className="text-muted-foreground font-medium">24s tamamlanan job</div>
                  <div className="font-mono tabular-nums text-foreground mt-0.5">
                    {workerObsQ.data.queueSummary.completed24h}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-2 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Yeniden deneme nedeni (30g)</p>
                  <div className="flex flex-wrap gap-1">
                    {workerObsQ.data.retryReasonMix30d.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">Veri yok</span>
                    ) : (
                      workerObsQ.data.retryReasonMix30d.map((b) => (
                        <Badge key={b.bucket} variant="outline" className="text-[10px] h-5 font-mono">
                          {b.bucket}: {b.count}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-md border p-2 space-y-1.5 min-h-[4.5rem]">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Başarısız job kümeleri (30g)</p>
                  <ul className="text-[10px] font-mono space-y-1 max-h-32 overflow-y-auto">
                    {workerObsQ.data.failedJobClusters30d.length === 0 ? (
                      <li className="text-muted-foreground">Son 30 günde kümelenmiş başarısız job yok.</li>
                    ) : (
                      workerObsQ.data.failedJobClusters30d.map((c, i) => (
                        <li key={`${c.jobType}-${i}`} className="break-all">
                          <span className="text-foreground/90">{c.jobType}</span> ×{c.count}
                          {c.errorSample ? ` — ${c.errorSample.slice(0, 100)}` : ""}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <div
                  className="min-w-[720px] grid gap-0 text-[10px]"
                  style={{
                    gridTemplateColumns: "minmax(120px,1.2fr) minmax(100px,0.9fr) minmax(88px,0.7fr) minmax(100px,0.8fr) minmax(72px,0.5fr) minmax(140px,1fr)",
                  }}
                >
                  <div className="contents font-semibold text-muted-foreground bg-muted/30 border-b">
                    <div className="px-2 py-1.5">Hesap</div>
                    <div className="px-2 py-1.5">Worker durumu</div>
                    <div className="px-2 py-1.5">Son başarılı sync</div>
                    <div className="px-2 py-1.5">Ort. gecikme 7g</div>
                    <div className="px-2 py-1.5">Kuyruk</div>
                    <div className="px-2 py-1.5">API ping (ayrı)</div>
                  </div>
                  {workerObsQ.data.perAccount.length === 0 ? (
                    <div
                      className="px-2 py-4 text-muted-foreground text-xs bg-muted/10"
                      style={{ gridColumn: "1 / -1" }}
                    >
                      Bu kiracıda pazaryeri kanal hesabı yok.
                    </div>
                  ) : (
                    workerObsQ.data.perAccount.map((row) => {
                      const honestOk = row.healthHonest === "healthy_recent";
                      return (
                        <div key={row.accountId} className="contents group">
                          <div className="px-2 py-1.5 border-b border-border/50 flex flex-col gap-0.5">
                            <span className="font-medium text-foreground text-[11px]">{row.name}</span>
                            <span className="font-mono text-muted-foreground">{row.provider}</span>
                            {row.sandbox ? <Badge variant="outline" className="text-[9px] h-4 w-fit">sandbox</Badge> : null}
                            {!row.isActive ? (
                              <Badge variant="secondary" className="text-[9px] h-4 w-fit">
                                pasif
                              </Badge>
                            ) : null}
                          </div>
                          <div className="px-2 py-1.5 border-b border-border/50 align-top">
                            <Badge
                              variant={honestOk ? "outline" : row.healthHonest === "degraded_queue" ? "destructive" : "secondary"}
                              className={`text-[9px] h-5 max-w-full whitespace-normal text-left font-normal ${
                                honestOk ? "border-emerald-600/40 text-emerald-800 dark:text-emerald-200" : ""
                              }`}
                            >
                              {workerObsHealthLabel(row.healthHonest)}
                            </Badge>
                            {row.slaWarnings.length > 0 && (
                              <ul className="mt-1 text-[9px] text-amber-800 dark:text-amber-200/90 list-disc pl-3 space-y-0.5">
                                {row.slaWarnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="px-2 py-1.5 border-b border-border/50 font-mono text-muted-foreground">
                            {row.lastSuccessSyncAtIso ? fmtTime(row.lastSuccessSyncAtIso) : "—"}
                            {row.lastSuccessOperation ? (
                              <div className="text-[9px] opacity-80 truncate">{row.lastSuccessOperation}</div>
                            ) : null}
                          </div>
                          <div className="px-2 py-1.5 border-b border-border/50 font-mono">
                            {row.avgSuccessLatencyMs7d != null ? `${row.avgSuccessLatencyMs7d} ms` : "—"}
                          </div>
                          <div className="px-2 py-1.5 border-b border-border/50 font-mono">
                            q {row.queuedJobsNow}
                            {row.queuedStuck ? <span className="text-rose-600"> !</span> : ""} · r {row.runningJobsNow}
                            {row.runningStuck ? <span className="text-rose-600"> !</span> : ""}
                            <div className="text-[9px] text-muted-foreground">fail 7g: {row.failedJobs7d}</div>
                          </div>
                          <div className="px-2 py-1.5 border-b border-border/50 text-[10px]">
                            {row.lastProviderHealthOk === null ? (
                              <span className="text-muted-foreground">Ping yok</span>
                            ) : (
                              <span className={row.lastProviderHealthOk ? "text-slate-600" : "text-rose-700"}>
                                {row.lastProviderHealthOk ? "OK" : "Hata"}
                                {row.lastProviderHealthMessage
                                  ? ` — ${row.lastProviderHealthMessage.slice(0, 80)}`
                                  : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Üretim: {new Date(workerObsQ.data.generatedAtIso).toLocaleString("tr-TR")}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Wrench className="h-4 w-4 text-primary shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">Pazaryeri self-healing</h2>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Sunucu tarafı güvenli kurtarma (takılı kuyruk, running timeout, [geçici]/[rate-limit] yeniden kuyruk).
                  Anahtar silme / hesap kapatma / sipariş silme yok. Tüm adımlar <span className="font-mono">sync_logs</span> içinde
                  <span className="font-mono"> self_heal_*</span> operasyonlarıyla izlenir.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shrink-0 gap-1.5"
              onClick={() => void qc.invalidateQueries({ queryKey: ["marketplace-self-healing"] })}
              disabled={selfHealingQ.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${selfHealingQ.isFetching ? "animate-spin" : ""}`} />
              Özet yenile
            </Button>
          </div>
          {selfHealingQ.isLoading && <p className="text-xs text-muted-foreground">Self-healing verisi yükleniyor…</p>}
          {selfHealingQ.isError && (
            <p className="text-xs text-destructive">Self-healing özeti alınamadı.</p>
          )}
          {selfHealingQ.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="font-mono tabular-nums">
                  Otomatik retry başarı (24s): {selfHealingQ.data.retrySuccess24h}
                </Badge>
              </div>
              {selfHealingQ.data.recommendations.length > 0 && (
                <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Hesap önerileri (manuel müdahale)</p>
                  <ul className="space-y-1.5 text-[11px]">
                    {selfHealingQ.data.recommendations.map((rec) => (
                      <li key={`${rec.accountId}-${rec.code}`} className="flex flex-col gap-0.5 border-b border-border/30 pb-1.5 last:border-0">
                        <span className="font-medium">
                          {rec.name}{" "}
                          <span className="font-mono text-muted-foreground">({rec.provider})</span>{" "}
                          <Badge variant={rec.priority === "high" ? "destructive" : "secondary"} className="text-[9px] h-4">
                            {rec.priority}
                          </Badge>
                        </span>
                        <span className="text-muted-foreground">{rec.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Son otomatik aksiyonlar (audit)</p>
                <ul className="max-h-48 overflow-y-auto space-y-1 text-[10px] font-mono border rounded-md p-2 bg-muted/10">
                  {selfHealingQ.data.recentAutoActions.length === 0 ? (
                    <li className="text-muted-foreground">Henüz self_heal kaydı yok veya henüz tetiklenmedi.</li>
                  ) : (
                    selfHealingQ.data.recentAutoActions.map((a) => (
                      <li key={a.id} className="break-all">
                        {fmtTime(a.createdAtIso)} · <span className="text-foreground">{a.operation}</span>
                        {a.jobId != null ? ` · job#${a.jobId}` : ""}
                        {a.accountId != null ? ` · acc#${a.accountId}` : ""}
                        {a.message ? ` — ${a.message.slice(0, 100)}` : ""}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Üretim: {new Date(selfHealingQ.data.generatedAtIso).toLocaleString("tr-TR")}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp className="h-4 w-4 text-primary shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">Pazaryeri kâr otomasyonu</h2>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Salt okunur sinyaller: stok riski, fiyat sapması, satışsız listeler, iade oranı, kanal cirosu, düşük marj,
                  bayat senkron ve önerilen fiyat yönü. Otomatik fiyat/stok yazılmaz — önce değerlendirme.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shrink-0 gap-1.5"
              onClick={() => void qc.invalidateQueries({ queryKey: ["marketplace-profit-automation"] })}
              disabled={profitAutomationQ.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${profitAutomationQ.isFetching ? "animate-spin" : ""}`} />
              Kâr verisini yenile
            </Button>
          </div>
          {profitAutomationQ.isLoading && <p className="text-xs text-muted-foreground">Kâr sinyalleri yükleniyor…</p>}
          {profitAutomationQ.isError && <p className="text-xs text-destructive">Kâr otomasyonu alınamadı.</p>}
          {profitAutomationQ.data && (
            <div className="space-y-3 text-[11px]">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-md border p-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Kanal cirosu (30g)</p>
                  <ul className="space-y-1 font-mono text-[10px]">
                    {profitAutomationQ.data.topRevenueChannels.length === 0 ? (
                      <li className="text-muted-foreground">Veri yok</li>
                    ) : (
                      profitAutomationQ.data.topRevenueChannels.map((c) => (
                        <li key={c.channelKey}>
                          <span className="font-medium text-foreground">{c.channelKey}</span>
                          <div className="text-muted-foreground">{c.combinedHint}</div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-md border p-2 space-y-1 max-h-44 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Stok + satış riski</p>
                  <ul className="space-y-1">
                    {profitAutomationQ.data.lowStockSalesRisk.length === 0 ? (
                      <li className="text-muted-foreground">Kayıt yok</li>
                    ) : (
                      profitAutomationQ.data.lowStockSalesRisk.map((r) => (
                        <li key={`${r.productId}-${r.accountId}`}>
                          <Badge variant={r.severity === "critical" ? "destructive" : "secondary"} className="text-[9px] h-4 mr-1">
                            {r.severity}
                          </Badge>
                          {r.name} · stok {r.stock}/{r.minStock} · {r.accountName}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-md border p-2 space-y-1 max-h-44 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Düşük marj ürün</p>
                  <ul className="space-y-1">
                    {profitAutomationQ.data.lowMarginProducts.length === 0 ? (
                      <li className="text-muted-foreground">Eşik altı yok</li>
                    ) : (
                      profitAutomationQ.data.lowMarginProducts.map((m) => (
                        <li key={m.productId}>
                          {m.name} · %{m.marginPct ?? "?"} marj
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border p-2 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Fiyat sapması (kanal vs ana)</p>
                  <ul className="space-y-1 font-mono text-[10px]">
                    {profitAutomationQ.data.priceChannelSignals.length === 0 ? (
                      <li className="text-muted-foreground">Sapma yok</li>
                    ) : (
                      profitAutomationQ.data.priceChannelSignals.map((p) => (
                        <li key={p.mappingId}>
                          {p.productName} · {p.signal === "overpriced_vs_master" ? "yüksek" : "düşük"} · %{Math.abs(p.gapPct).toFixed(1)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-md border p-2 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Önerilen fiyat (manuel)</p>
                  <ul className="space-y-1 text-[10px]">
                    {profitAutomationQ.data.repricingRecommendations.length === 0 ? (
                      <li className="text-muted-foreground">Öneri yok</li>
                    ) : (
                      profitAutomationQ.data.repricingRecommendations.map((r) => (
                        <li key={r.mappingId}>
                          {r.productName}: {r.currentChannelPrice} → öneri ~{r.suggestedPrice} ₺ — {r.rationale.slice(0, 80)}…
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-md border p-2 max-h-36 overflow-y-auto space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Satışsız listelenen</p>
                  <ul className="text-[10px] space-y-0.5">
                    {profitAutomationQ.data.zeroSaleListedProducts.slice(0, 12).map((z) => (
                      <li key={z.mappingId}>{z.productName} · {z.accountName}</li>
                    ))}
                    {profitAutomationQ.data.zeroSaleListedProducts.length === 0 ? <li className="text-muted-foreground">—</li> : null}
                  </ul>
                </div>
                <div className="rounded-md border p-2 max-h-36 overflow-y-auto space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Yüksek iade SKU</p>
                  <ul className="text-[10px] space-y-0.5">
                    {profitAutomationQ.data.highReturnSkus.map((h) => (
                      <li key={h.productId}>
                        {h.productName} · %{(h.returnRatio * 100).toFixed(0)} ({h.returnedQty}/{h.soldQty})
                      </li>
                    ))}
                    {profitAutomationQ.data.highReturnSkus.length === 0 ? <li className="text-muted-foreground">—</li> : null}
                  </ul>
                </div>
                <div className="rounded-md border p-2 max-h-36 overflow-y-auto space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Bayat / hatalı liste</p>
                  <ul className="text-[10px] space-y-0.5">
                    {profitAutomationQ.data.staleListings.slice(0, 12).map((s) => (
                      <li key={s.mappingId}>
                        {s.productName} · {s.syncStatus}
                        {s.lastSyncedAtIso ? ` · ${fmtTime(s.lastSyncedAtIso)}` : ""}
                      </li>
                    ))}
                    {profitAutomationQ.data.staleListings.length === 0 ? <li className="text-muted-foreground">—</li> : null}
                  </ul>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Üretim: {new Date(profitAutomationQ.data.generatedAtIso).toLocaleString("tr-TR")}
              </p>
            </div>
          )}
        </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/40 to-card/90 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Entegrasyon haritası</p>
            {catalogQ.data?.tenantCounts && (
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                webhook {catalogQ.data.tenantCounts.webhooks} · API key {catalogQ.data.tenantCounts.apiKeys} · muhasebe {catalogQ.data.tenantCounts.accounting} · e-ticaret {catalogQ.data.tenantCounts.ecommerce}
              </span>
            )}
          </div>
          {catalogQ.data?.tenantActivityProfile && (
            <p className="text-[10px] text-muted-foreground font-mono">
              Profil sinyali (30g): ürün {catalogQ.data.tenantActivityProfile.productsCount} · satış{" "}
              {catalogQ.data.tenantActivityProfile.salesLast30d} · aktif pazaryeri hesabı{" "}
              {catalogQ.data.tenantActivityProfile.activeMarketplaceChannelAccounts}
            </p>
          )}
          {catalogQ.isError && <span className="text-xs text-destructive">Katalog yüklenemedi</span>}
        </div>
        {(catalogQ.data?.recommendationRationale?.length ?? 0) > 0 && (
          <div className="rounded-md border border-dashed border-primary/20 bg-primary/[0.03] px-2 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-foreground">Bu kiracı için öneri gerekçeleri</p>
            <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc pl-4">
              {(catalogQ.data?.recommendationRationale ?? []).map((r) => (
                <li key={r.entryId}>
                  <span className="font-mono text-foreground/90">{r.entryId}</span>
                  {" — "}
                  {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={hubSearch}
              onChange={(e) => setHubSearch(e.target.value)}
              placeholder="İsim, etiket veya açıklama ara…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <select
            value={hubLifecycle}
            onChange={(e) => setHubLifecycle(e.target.value as HubLifecycle)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">Tüm yaşam döngüleri</option>
            <option value="live">Canlı</option>
            <option value="pilot">Pilot</option>
            <option value="roadmap">Yol haritası</option>
          </select>
          <select
            value={hubFamily}
            onChange={(e) => setHubFamily(e.target.value as typeof hubFamily)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">Tüm aileler</option>
            <option value="connectivity">Bağlantı</option>
            <option value="accounting">Muhasebe</option>
            <option value="ecommerce">E-ticaret</option>
            <option value="einvoice">E-belge</option>
          </select>
        </div>
        {catalogQ.isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Harita yükleniyor…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[min(52vh,520px)] overflow-y-auto pr-1">
            {hubEntries.slice(0, 24).map((e) => {
              const rec = catalogQ.data?.recommendedEntryIds?.includes(e.entryId);
              const lifeVariant =
                e.lifecycle === "live" ? "default" : e.lifecycle === "pilot" ? "secondary" : "outline";
              return (
                <div
                  key={e.entryId}
                  className={`rounded-lg border bg-card/80 p-3 space-y-1.5 text-left transition-shadow ${rec ? "ring-1 ring-primary/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{e.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{e.displayName}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{e.description}</p>
                      </div>
                    </div>
                    <Badge variant={lifeVariant} className="shrink-0 text-[10px] px-1.5 py-0 h-5">
                      {e.lifecycle}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {e.businessImpactTags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0 rounded bg-muted/60 text-muted-foreground">{t}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Kurulum: <span className="font-medium text-foreground/80">{e.setupDifficulty}</span>
                    {" · "}
                    {e.packageEligibilityHint}
                  </p>
                  {e.connectedCountHint != null && (
                    <p className="text-[10px] font-mono text-muted-foreground">Bu kiracıda bağlı: {e.connectedCountHint}</p>
                  )}
                  {e.statusHint && (
                    <p className="text-[10px] text-muted-foreground">
                      Son durum:{" "}
                      <span className={e.statusHint.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                        {e.statusHint.ok ? "ok" : "dikkat"}
                      </span>
                      {" — "}
                      {e.statusHint.message}
                      {e.statusHint.checkedAtIso ? (
                        <span className="font-mono text-[9px] ml-1">({fmtTime(e.statusHint.checkedAtIso)})</span>
                      ) : null}
                    </p>
                  )}
                  {e.inboundPath && (
                    <p className="text-[9px] font-mono text-muted-foreground break-all">Inbound: {e.inboundPath}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {e.deepLinkTab && (
                      <Button size="sm" variant="secondary" className="h-7 text-xs" type="button" onClick={() => openCatalogEntry(e)}>
                        Sekmeye git
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      type="button"
                      disabled={pingCatalogEntry.isPending}
                      onClick={() => pingCatalogEntry.mutate(e.entryId)}
                    >
                      Bağlantı testi
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {hubEntries.length > 24 && (
          <p className="text-[10px] text-muted-foreground text-center">Filtreleri daraltarak daha fazla girdiye ulaşın ({hubEntries.length} eşleşme).</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ─── WEBHOOKS ─────────────────────────────────────────── */}
      {tab === "webhooks" && (
        <div className="space-y-4">
          {showHookForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{editHook ? "Webhook Düzenle" : "Yeni Webhook"}</p>
                <button onClick={() => { setShowHookForm(false); setEditHook(null); }}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Ad *</label><Input value={hookForm.name} onChange={e => setHookForm(p => ({ ...p, name: e.target.value }))} placeholder="Webhook adı" className="mt-1" /></div>
                <div><label className="text-xs text-muted-foreground">URL *</label><Input type="url" value={hookForm.url} onChange={e => setHookForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." className="mt-1" /></div>
                <div><label className="text-xs text-muted-foreground">Gizli Anahtar (HMAC)</label><Input value={hookForm.secret} onChange={e => setHookForm(p => ({ ...p, secret: e.target.value }))} placeholder="Opsiyonel" className="mt-1" /></div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Olaylar</label>
                <div className="flex flex-wrap gap-1.5">
                  {supportedEvents.map(ev => (
                    <button key={ev.event} onClick={() => toggleEvent(ev.event)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${hookForm.events.includes(ev.event) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                      {ev.description}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveHook.mutate(hookForm)} disabled={!hookForm.name.trim() || !hookForm.url.trim() || saveHook.isPending}>{saveHook.isPending ? "Kaydediliyor..." : "Kaydet"}</Button>
                <Button variant="outline" onClick={() => { setShowHookForm(false); setEditHook(null); }}>İptal</Button>
              </div>
            </div>
          )}
          {webhooksQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
            : hooks.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed rounded-xl">
                <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Henüz webhook tanımlanmamış</p>
                <Button className="mt-3 gap-2" onClick={() => setShowHookForm(true)}><Plus className="h-4 w-4" />İlk Webhook'u Ekle</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {hooks.map(h => {
                  let events: string[] = [];
                  try { events = JSON.parse(h.events); } catch { events = []; }
                  return (
                    <div key={h.id} className="bg-card border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-2.5 w-2.5 rounded-full ${h.isActive ? "bg-green-500" : "bg-muted"}`} />
                          <div>
                            <p className="font-semibold text-sm">{h.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{h.url}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => testHook.mutate(h.id)}><Send className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedDeliveries(selectedDeliveries === h.id ? null : h.id)}><Activity className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditHook(h)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteHook.mutate(h.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {events.map(ev => <span key={ev} className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md font-mono">{ev}</span>)}
                      </div>
                      {h.deliveryStats && (
                        <div className="mt-2 text-xs text-muted-foreground flex gap-3">
                          <span>{h.deliveryStats.total} teslimat</span>
                          {h.deliveryStats.failed > 0 && <span className="text-red-500">{h.deliveryStats.failed} başarısız</span>}
                          {h.deliveryStats.lastAt && <span>Son: {fmt(h.deliveryStats.lastAt)}</span>}
                        </div>
                      )}
                      {selectedDeliveries === h.id && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold">Son Teslimatlar</p>
                            <button onClick={() => qc.invalidateQueries({ queryKey: ["webhook-deliveries", h.id] })}><RefreshCw className="h-3 w-3 text-muted-foreground" /></button>
                          </div>
                          {deliveriesQ.isLoading ? <p className="text-xs text-muted-foreground">Yükleniyor...</p>
                            : deliveries.length === 0 ? <p className="text-xs text-muted-foreground">Henüz teslimat yok</p>
                              : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {deliveries.map(d => (
                                    <div key={d.id} className="flex items-center gap-2 text-xs">
                                      {d.success ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                                      <span className="font-mono">{d.event}</span>
                                      <span className="text-muted-foreground">{d.statusCode ?? "—"}</span>
                                      <span className="text-muted-foreground ml-auto">{new Date(d.deliveredAt).toLocaleTimeString("tr-TR")}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* ─── API KEYS ──────────────────────────────────────────── */}
      {tab === "api-keys" && (
        <div className="space-y-4">
          {revealedKey && showRawKey && (
            <div className="bg-amber-500/10 border-2 border-amber-500/20 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-amber-300">⚠️ API Key — Yalnızca bir kez gösterilir!</p>
              <p className="text-xs text-amber-300">Bu anahtarı güvenli bir yere kaydedin.</p>
              <div className="flex items-center gap-2 bg-card rounded-lg border p-2">
                <code className="text-xs font-mono flex-1 break-all">{showRawKey ? revealedKey : "•".repeat(revealedKey.length)}</code>
                <button onClick={() => setShowRawKey(v => !v)}>{showRawKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                <button onClick={() => { navigator.clipboard.writeText(revealedKey); toast({ title: "Panoya kopyalandı" }); }}><Copy className="h-4 w-4" /></button>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setRevealedKey(null); setShowRawKey(false); }}>Tamam, kayıt ettim</Button>
            </div>
          )}
          {showKeyForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Yeni API Key</p>
                <button onClick={() => setShowKeyForm(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Ad *</label><Input value={keyForm.name} onChange={e => setKeyForm(p => ({ ...p, name: e.target.value }))} placeholder="Entegrasyon adı" className="mt-1" /></div>
                <div>
                  <label className="text-xs text-muted-foreground">Yetkiler</label>
                  <select value={keyForm.scopes} onChange={e => setKeyForm(p => ({ ...p, scopes: e.target.value }))} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="read">Sadece Okuma</option>
                    <option value="write">Okuma + Yazma</option>
                    <option value="admin">Tam Yetki</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => createKey.mutate(keyForm)} disabled={!keyForm.name.trim() || createKey.isPending}>{createKey.isPending ? "Oluşturuluyor..." : "API Key Oluştur"}</Button>
                <Button variant="outline" onClick={() => setShowKeyForm(false)}>İptal</Button>
              </div>
            </div>
          )}
          {apiKeysQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
            : apiKeys.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed rounded-xl">
                <Key className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Henüz API Key yok</p>
                <Button className="mt-3 gap-2" onClick={() => setShowKeyForm(true)}><Plus className="h-4 w-4" />API Key Oluştur</Button>
              </div>
            ) : (
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Ad</th><th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Prefix</th><th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Yetkiler</th><th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Son Kullanım</th><th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Durum</th><th className="px-4 py-2.5" /></tr></thead>
                  <tbody className="divide-y">
                    {apiKeys.map(k => (
                      <tr key={k.id} className="hover:bg-muted/10">
                        <td className="px-4 py-2.5 font-semibold">{k.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{k.keyPrefix}...</td>
                        <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${k.scopes === "admin" ? "bg-red-500/15 text-red-300" : k.scopes === "write" ? "bg-amber-500/15 text-amber-300" : "bg-blue-500/15 text-blue-300"}`}>{k.scopes === "read" ? "Okuma" : k.scopes === "write" ? "Okuma+Yazma" : "Tam Yetki"}</span></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{k.lastUsedAt ? fmt(k.lastUsedAt) : "—"}</td>
                        <td className="px-4 py-2.5"><button onClick={() => toggleKey.mutate({ id: k.id, isActive: !k.isActive })}>{k.isActive ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/70" />}</button></td>
                        <td className="px-4 py-2.5"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteKey.mutate(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ─── MUHASEBE ENTEGRASYONu ──────────────────────────────── */}
      {tab === "accounting" && (
        <div className="space-y-4">
          {showAccForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Muhasebe Entegrasyonu Ekle</p>
                <button onClick={() => setShowAccForm(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Sağlayıcı *</label>
                  <select value={accForm.provider} onChange={e => setAccForm(p => ({ ...p, provider: e.target.value }))} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Seçiniz...</option>
                    {accProviders.map(p => <option key={p.id} value={p.id}>{p.logo} {p.name}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-muted-foreground">Görünen Ad</label><Input value={accForm.displayName} onChange={e => setAccForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Opsiyonel" className="mt-1" /></div>
                <div><label className="text-xs text-muted-foreground">API Key</label><Input type="password" value={accForm.apiKey} onChange={e => setAccForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="API anahtarı" className="mt-1" /></div>
                <div><label className="text-xs text-muted-foreground">API Secret</label><Input type="password" value={accForm.apiSecret} onChange={e => setAccForm(p => ({ ...p, apiSecret: e.target.value }))} placeholder="API gizli anahtarı" className="mt-1" /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveAcc.mutate({ provider: accForm.provider, displayName: accForm.displayName, credentials: { apiKey: accForm.apiKey, apiSecret: accForm.apiSecret } })} disabled={!accForm.provider || saveAcc.isPending}>{saveAcc.isPending ? "Kaydediliyor..." : "Ekle"}</Button>
                <Button variant="outline" onClick={() => setShowAccForm(false)}>İptal</Button>
              </div>
            </div>
          )}

          {/* Sağlayıcı galerisi */}
          {accIntegrations.length === 0 && (
            <div className="grid grid-cols-3 gap-3 mb-2">
              {accProviders.map(p => (
                <div key={p.id} className="bg-card border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-primary transition-colors" onClick={() => { setAccForm(f => ({ ...f, provider: p.id })); setShowAccForm(true); }}>
                  <span className="text-2xl">{p.logo}</span>
                  <div><p className="font-semibold text-sm">{p.name}</p><p className="text-[11px] text-muted-foreground">{p.description}</p></div>
                </div>
              ))}
            </div>
          )}

          {accQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
            : accIntegrations.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed rounded-xl">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Henüz muhasebe entegrasyonu yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {accIntegrations.map(i => {
                  const provider = accProviders.find(p => p.id === i.provider);
                  const isExpanded = expandedLogs?.type === "acc" && expandedLogs.id === i.id;
                  return (
                    <div key={i.id} className="bg-card border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{provider?.logo ?? "📊"}</span>
                          <div>
                            <p className="font-semibold text-sm">{i.displayName ?? provider?.name}</p>
                            <p className="text-xs text-muted-foreground">{provider?.name} · {fmtTime(i.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          {i.lastSyncStatus === "success" && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Başarılı</span>}
                          {i.lastSyncStatus === "failed" && <span className="text-xs text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" />Hatalı</span>}
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => syncAcc.mutate({ id: i.id, syncType: "sales" })} disabled={syncAcc.isPending}>
                            <PlayCircle className="h-3 w-3" />Senkronize Et
                          </Button>
                          <button onClick={() => setExpandedLogs(isExpanded ? null : { type: "acc", id: i.id })}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteAcc.mutate(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      {i.lastSyncAt && <p className="text-xs text-muted-foreground mt-1">Son sync: {fmtTime(i.lastSyncAt)}</p>}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-semibold mb-2">Senkronizasyon Geçmişi</p>
                          {logsQ.isLoading ? <p className="text-xs text-muted-foreground">Yükleniyor...</p>
                            : syncLogs.length === 0 ? <p className="text-xs text-muted-foreground">Henüz senkronizasyon yok</p>
                              : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {syncLogs.map(l => (
                                    <div key={l.id} className="flex items-center gap-2 text-xs">
                                      {l.status === "success" ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                                      <span className="font-mono">{l.syncType}</span>
                                      <span className="text-muted-foreground">{l.recordCount} kayıt</span>
                                      {l.errorMessage && <span className="text-red-500 truncate max-w-xs">{l.errorMessage}</span>}
                                      <span className="text-muted-foreground ml-auto">{fmtTime(l.startedAt)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* ─── E-TİCARET ENTEGRASYONu ──────────────────────────── */}
      {tab === "ecommerce" && (
        <div className="space-y-4">
          {showEcForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">E-Ticaret Mağazası Ekle</p>
                <button onClick={() => setShowEcForm(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Platform *</label>
                  <select value={ecForm.platform} onChange={e => setEcForm(p => ({ ...p, platform: e.target.value }))} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Seçiniz...</option>
                    {ecPlatforms.map(p => <option key={p.id} value={p.id}>{p.logo} {p.name}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-muted-foreground">Mağaza Adı *</label><Input value={ecForm.storeName} onChange={e => setEcForm(p => ({ ...p, storeName: e.target.value }))} placeholder="Mağaza adınız" className="mt-1" /></div>
                <div><label className="text-xs text-muted-foreground">API Key</label><Input type="password" value={ecForm.apiKey} onChange={e => setEcForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="API anahtarı" className="mt-1" /></div>
                <div><label className="text-xs text-muted-foreground">API Secret</label><Input type="password" value={ecForm.apiSecret} onChange={e => setEcForm(p => ({ ...p, apiSecret: e.target.value }))} placeholder="API gizli anahtarı" className="mt-1" /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveEc.mutate({ platform: ecForm.platform, storeName: ecForm.storeName, credentials: { apiKey: ecForm.apiKey, apiSecret: ecForm.apiSecret } })} disabled={!ecForm.platform || !ecForm.storeName.trim() || saveEc.isPending}>{saveEc.isPending ? "Kaydediliyor..." : "Mağaza Ekle"}</Button>
                <Button variant="outline" onClick={() => setShowEcForm(false)}>İptal</Button>
              </div>
            </div>
          )}

          {/* Platform galerisi */}
          {ecIntegrations.length === 0 && (
            <div className="grid grid-cols-3 gap-3 mb-2">
              {ecPlatforms.map(p => (
                <div key={p.id} className="bg-card border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-primary transition-colors" onClick={() => { setEcForm(f => ({ ...f, platform: p.id })); setShowEcForm(true); }}>
                  <span className="text-2xl">{p.logo}</span>
                  <div><p className="font-semibold text-sm">{p.name}</p><p className="text-[11px] text-muted-foreground">{p.description}</p></div>
                </div>
              ))}
            </div>
          )}

          {ecQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
            : ecIntegrations.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed rounded-xl">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Henüz e-ticaret mağazası bağlanmamış</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ecIntegrations.map(i => {
                  const platform = ecPlatforms.find(p => p.id === i.platform);
                  const isExpanded = expandedLogs?.type === "ec" && expandedLogs.id === i.id;
                  return (
                    <div key={i.id} className="bg-card border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{platform?.logo ?? "🛍️"}</span>
                          <div>
                            <p className="font-semibold text-sm">{i.storeName}</p>
                            <p className="text-xs text-muted-foreground">{platform?.name} · {fmtTime(i.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          {i.lastSyncStatus === "success" && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Başarılı</span>}
                          {i.lastSyncStatus === "failed" && <span className="text-xs text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" />Hatalı</span>}
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => syncEc.mutate({ id: i.id, syncType: "product_push" })} disabled={syncEc.isPending}>
                            <PlayCircle className="h-3 w-3" />Senkronize Et
                          </Button>
                          <button onClick={() => setExpandedLogs(isExpanded ? null : { type: "ec", id: i.id })}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEc.mutate(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      {i.lastSyncAt && <p className="text-xs text-muted-foreground mt-1">Son sync: {fmtTime(i.lastSyncAt)}</p>}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-semibold mb-2">Senkronizasyon Geçmişi</p>
                          {logsQ.isLoading ? <p className="text-xs text-muted-foreground">Yükleniyor...</p>
                            : syncLogs.length === 0 ? <p className="text-xs text-muted-foreground">Henüz senkronizasyon yok</p>
                              : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {syncLogs.map(l => (
                                    <div key={l.id} className="flex items-center gap-2 text-xs">
                                      {l.status === "success" ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                                      <span className="font-mono">{l.syncType}</span>
                                      <span className="text-muted-foreground">{l.recordCount} kayıt</span>
                                      {l.errorMessage && <span className="text-red-500 truncate max-w-xs">{l.errorMessage}</span>}
                                      <span className="text-muted-foreground ml-auto">{fmtTime(l.startedAt)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
