import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Save, ExternalLink, Plus, Trash2, Code, Globe, Store, Layers, Sparkles,
} from "lucide-react";

type Storefront = any;
type Product = { id: number; productCode: string; name: string; salePrice: number; stock: number };
type LinkedProduct = {
  id: number; productId: number; productName: string; productCode: string;
  basePrice: number; stock: number;
  isActive: boolean; customTitle: string | null; customPrice: number | null; displayOrder: number;
};

export default function MagazaDetay() {
  const params = useParams();
  const id = Number(params.id);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [sf, setSf] = useState<Storefront | null>(null);
  const [linked, setLinked] = useState<LinkedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/storefronts/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setSf(j);
      setLinked(j.products || []);
    } catch {
      toast({ title: "Mağaza yüklenemedi", variant: "destructive" });
      setLocation("/magaza");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const save = async (patch: Partial<Storefront>) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/storefronts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setSf({ ...sf, ...j });
      toast({ title: "Kaydedildi" });
    } catch {
      toast({ title: "Kaydedilemedi", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !sf) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" /></div>;
  }

  const TypeIcon = sf.type === "hosted" ? Store : sf.type === "embedded" ? Layers : Globe;
  const publicUrl = sf.type === "hosted"
    ? `https://${sf.slug}.ticarium365.shop`
    : sf.customDomain ? `https://${sf.customDomain}` : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <Link href="/eticarium-merkezi" className="hover:underline">e-Ticarium Merkezi</Link>
          <span>/</span>
          <Link href="/magaza" className="hover:underline">Hazır Mağaza</Link>
          <span>/</span>
          <span>{sf.name}</span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <TypeIcon className="w-8 h-8 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-bold">{sf.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{sf.status === "active" ? "Yayında" : sf.status === "paused" ? "Durduruldu" : "Taslak"}</Badge>
                {publicUrl && (
                  <a href={publicUrl} target="_blank" rel="noreferrer"
                     className="text-emerald-300 hover:underline flex items-center gap-1">
                    {publicUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <Link href="/magaza">
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Listeye Dön</Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Genel</TabsTrigger>
          <TabsTrigger value="products">Ürünler ({linked.length})</TabsTrigger>
          <TabsTrigger value="payment">Ödeme & Anlaşma</TabsTrigger>
          <TabsTrigger value="theme">Tema</TabsTrigger>
          {sf.type === "embedded" && <TabsTrigger value="embed">Widget Kodu</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <GeneralTab sf={sf} onSave={save} saving={saving} canEdit={isAdmin} />
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <ProductsTab storefrontId={id} linked={linked} reload={load} canEdit={isAdmin} />
        </TabsContent>

        <TabsContent value="payment" className="space-y-4 mt-4">
          <PaymentTab sf={sf} onSave={save} saving={saving} canEdit={isAdmin} />
        </TabsContent>

        <TabsContent value="theme" className="mt-4">
          <ThemeTab sf={sf} onSave={save} saving={saving} canEdit={isAdmin} />
        </TabsContent>

        {sf.type === "embedded" && (
          <TabsContent value="embed" className="mt-4">
            <EmbedTab sf={sf} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function GeneralTab({ sf, onSave, saving, canEdit }: any) {
  const [name, setName] = useState(sf.name);
  const [status, setStatus] = useState(sf.status);
  const [seoTitle, setSeoTitle] = useState(sf.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(sf.seoDescription || "");
  return (
    <Card>
      <CardHeader><CardTitle>Genel Bilgiler</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div><Label>Mağaza Adı</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></div>
        <div>
          <Label>Durum</Label>
          <Select value={status} onValueChange={setStatus} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Taslak (yayında değil)</SelectItem>
              <SelectItem value="active">Yayında</SelectItem>
              <SelectItem value="paused">Geçici olarak durduruldu</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>SEO Başlık</Label><Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={!canEdit} /></div>
        <div><Label>SEO Açıklama</Label><Textarea rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} disabled={!canEdit} /></div>
        {canEdit && (
          <Button onClick={() => onSave({ name, status, seoTitle: seoTitle || null, seoDescription: seoDescription || null })}
                  disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentTab({ sf, onSave, saving, canEdit }: any) {
  const [paymentMode, setPaymentMode] = useState(sf.paymentMode);
  const [commission, setCommission] = useState(sf.agreementCommissionPct || 0);
  const [notes, setNotes] = useState(sf.agreementNotes || "");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ödeme Modeli & Anlaşma</CardTitle>
        <CardDescription>
          Ödemeler nasıl tahsil edilecek? Anlaşmaya göre farklı modeller seçebilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Ödeme Modu</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="merchant_pos">İşletmenin POS'una yönlendir (Ticarium komisyon almaz)</SelectItem>
              <SelectItem value="platform">Ticarium365 tahsil edip aktarır (komisyonlu)</SelectItem>
              <SelectItem value="whatsapp_only">Sadece WhatsApp ile sipariş — ödeme telefonda</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentMode === "platform" && (
          <div>
            <Label>Platform Komisyonu (%)</Label>
            <Input type="number" min={0} max={20} step={0.5} value={commission}
                   onChange={(e) => setCommission(Number(e.target.value))} disabled={!canEdit} />
            <div className="text-xs text-muted-foreground mt-1">
              Aylık satış üzerinden Ticarium365'in alacağı komisyon. Anlaşma %0 ise pass-through gibi davranır.
            </div>
          </div>
        )}
        <div>
          <Label>Anlaşma Notları</Label>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit}
                    placeholder="Aktarım sıklığı, IBAN, özel komisyon kademeleri..." />
        </div>
        {canEdit && (
          <Button onClick={() => onSave({ paymentMode, agreementCommissionPct: commission, agreementNotes: notes || null })}
                  disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ThemeTab({ sf, onSave, saving, canEdit }: any) {
  const t = sf.themeConfig || {};
  const [primaryColor, setPrimaryColor] = useState(t.primaryColor || "#10B981");
  const [logoUrl, setLogoUrl] = useState(t.logoUrl || "");
  const [headline, setHeadline] = useState(t.headline || "");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tema</CardTitle>
        <CardDescription>Mağaza vitrini görünümü.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Ana Renk</Label>
          <div className="flex gap-2">
            <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                   disabled={!canEdit} className="w-16 h-10 p-1" />
            <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <div><Label>Logo URL</Label><Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit} placeholder="https://..." /></div>
        <div><Label>Vitrin Başlığı</Label><Input value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={!canEdit} placeholder="Hoş geldiniz..." /></div>
        {canEdit && (
          <Button onClick={() => onSave({ themeConfig: { primaryColor, logoUrl, headline } })}
                  disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Temayı Kaydet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function EmbedTab({ sf }: any) {
  const snippet = `<!-- Ticarium365 Vitrin -->
<div id="ticarium365-storefront" data-slug="${sf.slug}"></div>
<script src="https://cdn.ticarium365.shop/embed.js" async defer></script>`;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><Code className="w-5 h-5" /><CardTitle>Müşteri Sitesine Eklenecek Kod</CardTitle></div>
        <CardDescription>
          Bu kodu müşteri web sitesinde ürünleri göstermek istediğiniz yere yapıştırın. Vitrin + sepet + ödeme akışı otomatik gelir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="bg-slate-900 text-slate-100 text-sm p-4 rounded-lg overflow-x-auto">{snippet}</pre>
        <Button variant="outline" className="mt-3" onClick={() => { navigator.clipboard.writeText(snippet); }}>
          Kodu Kopyala
        </Button>
        <div className="mt-4 text-sm text-muted-foreground">
          Not: Müşteri kendi alan adında sattığı için <b>güven oranı yüksek olur</b>. Embed widget Türkçe ve mobil uyumludur.
        </div>
      </CardContent>
    </Card>
  );
}

function ProductsTab({ storefrontId, linked, reload, canEdit }: any) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  const openPicker = async () => {
    setOpen(true);
    setSelected(new Set());
    try {
      const r = await fetch("/api/products?limit=200", { credentials: "include" });
      const j = await r.json();
      setProducts(j.items || j.data || j || []);
    } catch {
      toast({ title: "Ürünler alınamadı", variant: "destructive" });
    }
  };

  const linkedIds = new Set(linked.map((l: LinkedProduct) => l.productId));
  const filtered = products
    .filter((p) => !linkedIds.has(p.id))
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.productCode.toLowerCase().includes(search.toLowerCase()));

  const addSelected = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      const r = await fetch(`/api/storefronts/${storefrontId}/products`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: Array.from(selected) }),
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      toast({ title: `${j.added} ürün eklendi` });
      setOpen(false);
      reload();
    } catch {
      toast({ title: "Eklenemedi", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const togglePicker = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleActive = async (link: LinkedProduct) => {
    await fetch(`/api/storefronts/${storefrontId}/products/${link.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !link.isActive }),
    });
    reload();
  };

  const unlink = async (linkId: number) => {
    if (!confirm("Bu ürünü mağazadan kaldırmak istediğinize emin misiniz?")) return;
    await fetch(`/api/storefronts/${storefrontId}/products/${linkId}`, { method: "DELETE", credentials: "include" });
    reload();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Vitrin Ürünleri</CardTitle>
            <CardDescription>Mağazada hangi ürünler gösterilecek?</CardDescription>
          </div>
          {canEdit && (
            <Button onClick={openPicker} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Ürün Ekle
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {linked.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">Henüz ürün eklenmemiş.</div>
        ) : (
          <div className="space-y-2">
            {linked.map((l: LinkedProduct) => (
              <div key={l.id} className="flex items-center gap-3 p-3 border rounded">
                <Switch checked={l.isActive} onCheckedChange={() => canEdit && toggleActive(l)} disabled={!canEdit} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.customTitle || l.productName}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.productCode} · ₺{(l.customPrice ?? l.basePrice).toFixed(2)}
                    {l.customPrice != null && <span className="text-amber-600"> (özel)</span>}
                    · Stok: {l.stock}
                  </div>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => unlink(l.id)}
                          className="text-red-600 hover:text-red-300 hover:bg-red-500/150/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Ürün Seç</DialogTitle></DialogHeader>
          <Input placeholder="Ürün ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
          <div className="flex-1 overflow-y-auto space-y-1">
            {filtered.length === 0 && <div className="text-center text-muted-foreground/70 py-8">Eklenebilir ürün yok</div>}
            {filtered.map((p) => (
              <label key={p.id} className="flex items-center gap-3 p-2 border rounded hover:bg-muted/30 cursor-pointer">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePicker(p.id)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.productCode} · ₺{Number(p.salePrice).toFixed(2)} · Stok: {p.stock}</div>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button onClick={addSelected} disabled={adding || selected.size === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {selected.size} ürün ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
