import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import {
  Tag, Plus, Loader2, Trash2, Sparkles, Play, Save, ArrowRight,
  TrendingUp, TrendingDown, Minus, AlertCircle,
} from "lucide-react";

type Rule = {
  id: number;
  name: string;
  description: string | null;
  priority: number;
  isActive: boolean;
  channelKey: string | null;
  categoryFilter: string[] | null;
  brandFilter: string[] | null;
  productIds: number[] | null;
  mode: string;
  value: number;
  minPrice: number | null;
  maxPrice: number | null;
  roundingMode: string;
};

const MODE_LABEL: Record<string, string> = {
  markup_pct: "Satış üzerine + %",
  markup_amount: "Satış üzerine + TL",
  fixed_price: "Sabit fiyat",
  cost_plus_pct: "Maliyet + %",
  discount_pct: "İndirim %",
};
const ROUNDING_LABEL: Record<string, string> = {
  none: "Yuvarlama yok",
  nearest_1: "En yakın 1 TL",
  nearest_5: "En yakın 5 TL",
  ceil_99: ".99'a yuvarla",
  ceil_95: ".95'e yuvarla",
  psychological_9: "Psikolojik (99.99)",
};
const CHANNELS = [
  { key: "trendyol", label: "Trendyol" },
  { key: "hepsiburada", label: "Hepsiburada" },
  { key: "n11", label: "N11" },
  { key: "amazon_tr", label: "Amazon TR" },
  { key: "shopify", label: "Shopify" },
  { key: "own_site", label: "Kendi Sitem" },
  { key: "supplier_network", label: "Tedarik Ağı (B2B)" },
  { key: "public_catalog", label: "Public Katalog" },
];

export default function FiyatMotoru() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/pricing-rules", { credentials: "include" });
      const j = await r.json();
      setRules(j.items || []);
    } catch {
      toast({ title: "Kurallar alınamadı", variant: "destructive" });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const newRule = () => {
    setEditing({
      id: 0, name: "", description: null, priority: 100, isActive: true,
      channelKey: null, categoryFilter: null, brandFilter: null, productIds: null,
      mode: "markup_pct", value: 15, minPrice: null, maxPrice: null, roundingMode: "ceil_99",
    });
    setOpen(true);
  };

  const remove = async (id: number) => {
    if (!confirm("Bu kuralı silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/pricing-rules/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Kural silindi" });
    load();
  };

  const toggleActive = async (r: Rule) => {
    await fetch(`/api/pricing-rules/${r.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    load();
  };

  return (
    <OnlineSalesFeatureGate title="Fiyat Motoru paketinizde kapalı">
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <Link href="/eticarium-merkezi" className="hover:underline">Online Satış Merkezi</Link>
            <span>/</span>
            <span>Fiyat Motoru</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Tag className="w-7 h-7 text-emerald-600" /> Fiyat Motoru
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Kanal bazlı fiyat kuralları. Sıralama (önceliğe göre) çalışır — ilk eşleşen kural uygulanır.
            Önce taslak çalıştırıp etki analizini görebilir, sonra uygulayabilirsiniz.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={newRule} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" /> Yeni Kural
          </Button>
        )}
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Kurallar ({rules.length})</TabsTrigger>
          <TabsTrigger value="preview">Etki Önizlemesi</TabsTrigger>
          <TabsTrigger value="apply">Toplu Uygula</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" /></div>
              ) : rules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
                  <div>Henüz kural yok.</div>
                  {isAdmin && (
                    <Button onClick={newRule} variant="outline" className="mt-4">
                      <Plus className="w-4 h-4 mr-2" /> İlk Kuralı Oluştur
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((r) => (
                    <div key={r.id} className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors">
                      <div className="flex flex-wrap items-start gap-3 justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground tabular-nums">#{r.priority}</span>
                          <Switch checked={r.isActive} onCheckedChange={() => isAdmin && toggleActive(r)} disabled={!isAdmin} />
                          <button
                            type="button"
                            onClick={() => isAdmin && (setEditing(r), setOpen(true))}
                            className="font-semibold text-left hover:text-emerald-600 dark:hover:text-emerald-300"
                          >
                            {r.name}
                          </button>
                        </div>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => remove(r.id)}
                                  className="text-red-600 hover:text-red-300 shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="mt-3 grid md:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Koşul <span className="font-normal normal-case opacity-80">(eşleşirse)</span>
                          </div>
                          <ul className="space-y-1 text-foreground/90">
                            <li>
                              <span className="text-muted-foreground">Kanal:</span>{" "}
                              {r.channelKey ? (
                                <Badge variant="secondary" className="ml-1">{r.channelKey}</Badge>
                              ) : (
                                <span>Tüm kanallar</span>
                              )}
                            </li>
                            {r.categoryFilter?.length ? (
                              <li><span className="text-muted-foreground">Kategori:</span> {r.categoryFilter.join(", ")}</li>
                            ) : null}
                            {r.brandFilter?.length ? (
                              <li><span className="text-muted-foreground">Marka:</span> {r.brandFilter.join(", ")}</li>
                            ) : null}
                            {r.productIds?.length ? (
                              <li><span className="text-muted-foreground">Ürün:</span> {r.productIds.length} seçili kayıt</li>
                            ) : null}
                            {(r.minPrice != null || r.maxPrice != null) && (
                              <li className="tabular-nums">
                                <span className="text-muted-foreground">Fiyat aralığı:</span>{" "}
                                {r.minPrice != null ? `≥ ₺${r.minPrice}` : ""}
                                {r.minPrice != null && r.maxPrice != null ? " · " : ""}
                                {r.maxPrice != null ? `≤ ₺${r.maxPrice}` : ""}
                              </li>
                            )}
                            {r.description ? (
                              <li className="text-xs text-muted-foreground pt-1 border-t border-border/50">{r.description}</li>
                            ) : null}
                          </ul>
                        </div>
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300 mb-2">
                            Uygula <span className="font-normal normal-case opacity-80">(sonuç)</span>
                          </div>
                          <div className="font-medium text-foreground">
                            {MODE_LABEL[r.mode]}{" "}
                            <span className="tabular-nums">
                              {r.mode === "fixed_price"
                                ? `→ ₺${r.value}`
                                : `→ ${r.value}${r.mode.includes("pct") ? "%" : " TL"}`}
                            </span>
                          </div>
                          {r.roundingMode !== "none" && (
                            <div className="text-xs text-muted-foreground mt-2">
                              Yuvarlama: {ROUNDING_LABEL[r.roundingMode]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <PreviewPanel />
        </TabsContent>

        <TabsContent value="apply" className="mt-4">
          <ApplyPanel canApply={isAdmin} reload={load} />
        </TabsContent>
      </Tabs>

      {open && editing && (
        <RuleDialog
          rule={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSaved={() => { setOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
    </OnlineSalesFeatureGate>
  );
}

function RuleDialog({ rule, onClose, onSaved }: { rule: Rule; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({
    name: rule.name,
    description: rule.description || "",
    priority: rule.priority,
    isActive: rule.isActive,
    channelKey: rule.channelKey || "all",
    mode: rule.mode,
    value: rule.value,
    roundingMode: rule.roundingMode,
    minPrice: rule.minPrice ?? "",
    maxPrice: rule.maxPrice ?? "",
    categoryFilter: rule.categoryFilter?.join(", ") || "",
    brandFilter: rule.brandFilter?.join(", ") || "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!f.name.trim()) { toast({ title: "Ad zorunlu", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      priority: Number(f.priority) || 100,
      isActive: f.isActive,
      channelKey: f.channelKey === "all" ? null : f.channelKey,
      mode: f.mode,
      value: Number(f.value),
      roundingMode: f.roundingMode,
      minPrice: f.minPrice === "" ? null : Number(f.minPrice),
      maxPrice: f.maxPrice === "" ? null : Number(f.maxPrice),
      categoryFilter: f.categoryFilter.split(",").map(s => s.trim()).filter(Boolean) || null,
      brandFilter: f.brandFilter.split(",").map(s => s.trim()).filter(Boolean) || null,
    };
    if (!payload.categoryFilter?.length) (payload as any).categoryFilter = null;
    if (!payload.brandFilter?.length) (payload as any).brandFilter = null;

    try {
      const url = rule.id ? `/api/pricing-rules/${rule.id}` : "/api/pricing-rules";
      const method = rule.id ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message || "Kaydedilemedi");
      }
      toast({ title: rule.id ? "Kural güncellendi" : "Kural oluşturuldu" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{rule.id ? "Kuralı Düzenle" : "Yeni Fiyat Kuralı"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Kural Adı *</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Örn: Trendyol +%18 komisyon kuralı" /></div>
            <div><Label>Öncelik (düşük = önce)</Label>
              <Input type="number" value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-3">
              <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
              <span className="text-sm">{f.isActive ? "Aktif" : "Pasif"}</span>
            </div>
            <div className="col-span-2"><Label>Açıklama</Label>
              <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3 text-sm">Kapsam (boş = hepsi)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Kanal</Label>
                <Select value={f.channelKey} onValueChange={(v) => setF({ ...f, channelKey: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm kanallar</SelectItem>
                    {CHANNELS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div></div>
              <div className="col-span-2"><Label>Kategoriler (virgülle ayır)</Label>
                <Input value={f.categoryFilter} onChange={(e) => setF({ ...f, categoryFilter: e.target.value })} placeholder="Örn: Elektrik, Hidrolik" /></div>
              <div className="col-span-2"><Label>Markalar (virgülle ayır)</Label>
                <Input value={f.brandFilter} onChange={(e) => setF({ ...f, brandFilter: e.target.value })} placeholder="Örn: Bosch, Makita" /></div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3 text-sm">Hesaplama</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Mod</Label>
                <Select value={f.mode} onValueChange={(v) => setF({ ...f, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Değer</Label>
                <Input type="number" step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} /></div>
              <div><Label>Yuvarlama</Label>
                <Select value={f.roundingMode} onValueChange={(v) => setF({ ...f, roundingMode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROUNDING_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div></div>
              <div><Label>Min Fiyat (₺)</Label>
                <Input type="number" step="0.01" value={f.minPrice} onChange={(e) => setF({ ...f, minPrice: e.target.value as any })} placeholder="opsiyonel" /></div>
              <div><Label>Max Fiyat (₺)</Label>
                <Input type="number" step="0.01" value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: e.target.value as any })} placeholder="opsiyonel" /></div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewPanel() {
  const { toast } = useToast();
  const [channelKey, setChannelKey] = useState("trendyol");
  const [products, setProducts] = useState<Array<{id:number;name:string;productCode:string}>>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/products?limit=50", { credentials: "include" })
      .then(r => r.json()).then(j => setProducts(j.items || j.data || j || []));
  }, []);

  const run = async () => {
    if (selected.size === 0) { toast({ title: "Ürün seçin" }); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/pricing-rules/preview", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKey, productIds: Array.from(selected) }),
      });
      const j = await r.json();
      setResults(j.items || []);
    } catch { toast({ title: "Önizleme alınamadı", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Test Parametreleri</CardTitle><CardDescription>Hangi ürünlerde, hangi kanal için simüle edelim?</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Kanal</Label>
            <Select value={channelKey} onValueChange={setChannelKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNELS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Ürünler ({selected.size} seçili)</Label>
            <div className="border rounded max-h-72 overflow-y-auto p-2 space-y-1">
              {products.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm hover:bg-muted/30 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={selected.has(p.id)}
                         onChange={() => { const s = new Set(selected); s.has(p.id) ? s.delete(p.id) : s.add(p.id); setSelected(s); }} />
                  <span className="truncate">{p.productCode} — {p.name}</span>
                </label>
              ))}
            </div>
          </div>
          <Button onClick={run} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Önizle
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sonuç</CardTitle></CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-center text-muted-foreground/70 py-8">Önizleme yapılmadı</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((r) => (
                <div key={r.productId} className="flex items-center gap-2 p-2 border rounded text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.matchedRuleName ? `Kural: ${r.matchedRuleName}` : <span className="text-amber-600">Eşleşen kural yok</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground/70 line-through">₺{r.basePrice}</div>
                    <div className="font-semibold">₺{r.computedPrice}</div>
                  </div>
                  <div className={`flex items-center gap-1 text-xs w-20 justify-end ${r.delta > 0 ? "text-emerald-600" : r.delta < 0 ? "text-red-600" : "text-muted-foreground/70"}`}>
                    {r.delta > 0 ? <TrendingUp className="w-3 h-3" /> : r.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {r.deltaPct > 0 ? "+" : ""}{r.deltaPct}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApplyPanel({ canApply, reload }: { canApply: boolean; reload: () => void }) {
  const { toast } = useToast();
  const [channelKey, setChannelKey] = useState("trendyol");
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const run = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const r = await fetch("/api/pricing-rules/apply", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKey, dryRun }),
      });
      const j = await r.json();
      setResult(j);
      if (!dryRun) {
        toast({ title: "Uygulandı", description: `${j.updated} ürün güncellendi.` });
        reload();
      }
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setRunning(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Toplu Uygula</CardTitle>
        <CardDescription>
          Aktif kuralları seçili kanalda <b>tüm aktif ürünlere</b> uygular ve fiyatları kanal listesine yazar.
          Önce <b>taslak (dry-run)</b> çalıştırıp etkiyi görmenizi öneririz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Hedef Kanal</Label>
          <Select value={channelKey} onValueChange={setChannelKey}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CHANNELS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run(true)} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Taslak Çalıştır
          </Button>
          {canApply && (
            <Button onClick={() => {
              if (confirm("Bu işlem kanal fiyatlarını GÜNCELLER. Devam edilsin mi?")) run(false);
            }} disabled={running} className="bg-emerald-600 hover:bg-emerald-700">
              <ArrowRight className="w-4 h-4 mr-2" /> Gerçekten Uygula
            </Button>
          )}
        </div>
        {result && (
          <div className="border rounded p-4 bg-muted/30 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              {result.dryRun ? <AlertCircle className="w-4 h-4 text-amber-600" /> : <Sparkles className="w-4 h-4 text-emerald-600" />}
              {result.dryRun ? "Taslak Sonucu" : "Uygulandı"}
            </div>
            <div>İşlenen ürün: <b>{result.processed}</b></div>
            <div>Güncellenen: <b className="text-emerald-300">{result.updated}</b></div>
            <div>Atlanan (eşleşmeyen): <b className="text-muted-foreground">{result.skipped}</b></div>
            {result.sample?.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold text-xs">İlk 5 örnek:</div>
                <ul className="text-xs space-y-0.5 ml-4 list-disc">
                  {result.sample.map((s: any, i: number) => (
                    <li key={i}>Ürün #{s.productId} → ₺{s.computedPrice} (kural #{s.ruleId})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
