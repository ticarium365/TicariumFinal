import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Webhook, Key, Plus, X, Pencil, Trash2, CheckCircle, XCircle,
  Send, Eye, EyeOff, Copy, RefreshCw, Activity, Zap,
  BookOpen, ShoppingCart, PlayCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

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

function fmt(d: string) { return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(d: string) { return new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("webhooks");

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

  // ─── Sorgular ─────────────────────────────────────────────────────────────
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); setShowHookForm(false); setEditHook(null); setHookForm({ name: "", url: "", events: [], secret: "" }); toast({ title: "Webhook kaydedildi" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteHook = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/integrations/webhooks/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); toast({ title: "Webhook silindi" }); },
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
      qc.invalidateQueries({ queryKey: ["api-keys"] }); setShowKeyForm(false); setKeyForm({ name: "", scopes: "read" });
      setRevealedKey(d.apiKey.rawKey); setShowRawKey(true);
      toast({ title: "API Key oluşturuldu — yalnızca bir kez gösterilir!" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteKey = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/integrations/api-keys/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast({ title: "API Key silindi" }); },
  });
  const toggleKey = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(`/api/integrations/api-keys/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  // ─── Ext Integration Mutasyonları ─────────────────────────────────────────
  const saveAcc = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/ext-integrations/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acc-integrations"] }); setShowAccForm(false); setAccForm({ provider: "", displayName: "", apiKey: "", apiSecret: "" }); toast({ title: "Muhasebe entegrasyonu eklendi" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteAcc = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/ext-integrations/accounting/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acc-integrations"] }); toast({ title: "Entegrasyon silindi" }); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ec-integrations"] }); setShowEcForm(false); setEcForm({ platform: "", storeName: "", apiKey: "", apiSecret: "" }); toast({ title: "E-ticaret entegrasyonu eklendi" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const deleteEc = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/ext-integrations/ecommerce/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ec-integrations"] }); toast({ title: "Entegrasyon silindi" }); },
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
          <h1 className="text-2xl font-bold">Entegrasyon Merkezi</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Webhook, API ve harici entegrasyon yönetimi</p>
        </div>
        <div className="flex gap-2">
          {tab === "webhooks" && <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditHook(null); setHookForm({ name: "", url: "", events: [], secret: "" }); setShowHookForm(true); }}><Plus className="h-3.5 w-3.5" />Webhook Ekle</Button>}
          {tab === "api-keys" && <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowKeyForm(true)}><Plus className="h-3.5 w-3.5" />API Key Oluştur</Button>}
          {tab === "accounting" && <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowAccForm(true)}><Plus className="h-3.5 w-3.5" />Entegrasyon Ekle</Button>}
          {tab === "ecommerce" && <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowEcForm(true)}><Plus className="h-3.5 w-3.5" />Mağaza Ekle</Button>}
        </div>
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
                          <div className={`h-2.5 w-2.5 rounded-full ${h.isActive ? "bg-green-500" : "bg-gray-300"}`} />
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
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-amber-800">⚠️ API Key — Yalnızca bir kez gösterilir!</p>
              <p className="text-xs text-amber-700">Bu anahtarı güvenli bir yere kaydedin.</p>
              <div className="flex items-center gap-2 bg-white rounded-lg border p-2">
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
                        <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${k.scopes === "admin" ? "bg-red-100 text-red-700" : k.scopes === "write" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{k.scopes === "read" ? "Okuma" : k.scopes === "write" ? "Okuma+Yazma" : "Tam Yetki"}</span></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{k.lastUsedAt ? fmt(k.lastUsedAt) : "—"}</td>
                        <td className="px-4 py-2.5"><button onClick={() => toggleKey.mutate({ id: k.id, isActive: !k.isActive })}>{k.isActive ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-400" />}</button></td>
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
