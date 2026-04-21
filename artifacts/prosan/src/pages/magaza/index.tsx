import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Store, Globe, Layers, Plus, Loader2, ExternalLink, Trash2,
  Settings as SettingsIcon, ShoppingBag, Sparkles,
} from "lucide-react";

type Storefront = {
  id: number;
  name: string;
  type: "embedded" | "hosted" | "aggregator";
  slug: string;
  customDomain: string | null;
  status: "draft" | "active" | "paused";
  paymentMode: "platform" | "merchant_pos" | "whatsapp_only";
  agreementCommissionPct: number;
  agreementNotes: string | null;
  productCount: number;
  createdAt: string;
};

const TYPE_LABEL: Record<Storefront["type"], string> = {
  embedded: "Müşteri Sitesi (Embed)",
  hosted: "Ticarium365 Hazır Mağaza",
  aggregator: "Merkezi Pazaryerimiz",
};
const TYPE_ICON: Record<Storefront["type"], any> = {
  embedded: Layers,
  hosted: Store,
  aggregator: Globe,
};
const PAYMENT_LABEL: Record<Storefront["paymentMode"], string> = {
  platform: "Biz tahsil edip aktarırız",
  merchant_pos: "İşletmenin POS'una yönlendirilir",
  whatsapp_only: "WhatsApp ile sipariş",
};
const STATUS_BADGE: Record<Storefront["status"], { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "bg-muted text-foreground/90" },
  active: { label: "Yayında", cls: "bg-emerald-500/15 text-emerald-300" },
  paused: { label: "Durduruldu", cls: "bg-amber-500/15 text-amber-300" },
};

export default function MagazaListesi() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [items, setItems] = useState<Storefront[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [form, setForm] = useState({
    name: "",
    type: "hosted" as Storefront["type"],
    paymentMode: "merchant_pos" as Storefront["paymentMode"],
    agreementCommissionPct: 0,
    customDomain: "",
    agreementNotes: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/storefronts", { credentials: "include" });
      const j = await r.json();
      setItems(j.items || []);
    } catch (e) {
      toast({ title: "Hata", description: "Mağaza listesi alınamadı", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Hata", description: "Mağaza adı zorunlu", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/storefronts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          paymentMode: form.paymentMode,
          agreementCommissionPct: Number(form.agreementCommissionPct) || 0,
          customDomain: form.customDomain.trim() || null,
          agreementNotes: form.agreementNotes.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message || "Oluşturulamadı");
      }
      const created = await r.json();
      toast({ title: "Mağaza oluşturuldu", description: `${form.name} taslak olarak hazırlandı.` });
      setOpenDialog(false);
      setForm({ name: "", type: "hosted", paymentMode: "merchant_pos", agreementCommissionPct: 0, customDomain: "", agreementNotes: "" });
      setLocation(`/magaza/${created.id}`);
    } catch (e: any) {
      toast({ title: "Hata", description: e.message || "Sunucu hatası", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Bu mağazayı silmek istediğinize emin misiniz?")) return;
    try {
      const r = await fetch(`/api/storefronts/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error();
      toast({ title: "Mağaza silindi" });
      load();
    } catch {
      toast({ title: "Silinemedi", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <Link href="/eticarium-merkezi" className="hover:underline">e-Ticarium Merkezi</Link>
            <span>/</span>
            <span>Hazır Mağaza</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Hazır Mağazalarım</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Üç farklı tipte mağaza kurabilirsiniz: <b>kendi web sitenize</b> Ticarium365 widget'ı eklemek,
            <b> firmaadi.ticarium365.shop</b> üzerinde hazır mağaza, ya da gelişmiş ürünlerinizi
            <b> Ticarium Pazar</b> merkezi e-ticaret sitemize çıkarmak.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setOpenDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" /> Yeni Mağaza
          </Button>
        )}
      </div>

      {/* Tip açıklamaları */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader>
            <div className="flex items-center gap-2"><Layers className="w-5 h-5 text-sky-600" />
              <CardTitle className="text-base">Müşteri Sitesi (Embed)</CardTitle></div>
            <CardDescription>
              Müşterinizin kendi sitesine Ticarium365 ürün vitrini + sepet widget'ı yerleştirin. Güven artar, müşteri kendi alan adında satar.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader>
            <div className="flex items-center gap-2"><Store className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base">Ticarium365 Hazır Mağaza</CardTitle></div>
            <CardDescription>
              <code className="text-xs bg-emerald-500/10 px-1 rounded">firmaadi.ticarium365.shop</code> alt alanında bizim hazır temayla mağaza. Sıfır geliştirme.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader>
            <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-purple-600" />
              <CardTitle className="text-base">Ticarium Pazar (yakında)</CardTitle></div>
            <CardDescription>
              Bizim merkezi e-ticaret sitemize ürün gönderin. En uygun fiyatlı eşleşen ürünleri kâr marjıyla biz satarız. Ayrı domain.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Liste */}
      <Card>
        <CardHeader>
          <CardTitle>Mağazalarım ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Store className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
              <div>Henüz hiç mağaza oluşturmadınız.</div>
              {isAdmin && (
                <Button onClick={() => setOpenDialog(true)} variant="outline" className="mt-4">
                  <Plus className="w-4 h-4 mr-2" /> İlk Mağazanı Kur
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((s) => {
                const Icon = TYPE_ICON[s.type];
                const sb = STATUS_BADGE[s.status];
                return (
                  <div key={s.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Icon className="w-5 h-5 text-foreground/90" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/magaza/${s.id}`} className="font-semibold hover:text-emerald-300 truncate">
                          {s.name}
                        </Link>
                        <Badge className={sb.cls}>{sb.label}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{TYPE_LABEL[s.type]}</span>
                        <span>·</span>
                        <span>{PAYMENT_LABEL[s.paymentMode]}</span>
                        {s.type === "hosted" && (
                          <>
                            <span>·</span>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {s.slug}.ticarium365.shop
                            </code>
                          </>
                        )}
                        {s.customDomain && (
                          <>
                            <span>·</span>
                            <a href={`https://${s.customDomain}`} target="_blank" rel="noreferrer"
                               className="text-emerald-300 hover:underline flex items-center gap-1">
                              {s.customDomain} <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                        <span>·</span>
                        <span><ShoppingBag className="w-3 h-3 inline mr-1" />{s.productCount} ürün</span>
                      </div>
                    </div>
                    <Link href={`/magaza/${s.id}`}>
                      <Button variant="outline" size="sm">
                        <SettingsIcon className="w-4 h-4 mr-1" /> Yönet
                      </Button>
                    </Link>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => remove(s.id)}
                              className="text-red-600 hover:text-red-300 hover:bg-red-500/150/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yeni mağaza dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Yeni Mağaza Oluştur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mağaza Adı *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="Örn: ABC Online Mağaza" />
            </div>
            <div>
              <Label>Tip</Label>
              <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hosted">Ticarium365 Hazır Mağaza ({"firmaadi.ticarium365.shop"})</SelectItem>
                  <SelectItem value="embedded">Müşterinin Kendi Sitesine Embed</SelectItem>
                  <SelectItem value="aggregator" disabled>Ticarium Pazar (yakında)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "embedded" && (
              <div>
                <Label>Müşteri Web Sitesi (opsiyonel)</Label>
                <Input value={form.customDomain}
                       onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
                       placeholder="ornek.com" />
                <div className="text-xs text-muted-foreground mt-1">
                  Bu siteye gömülecek widget kodu mağaza ayarlarında görünecek.
                </div>
              </div>
            )}
            <div>
              <Label>Ödeme Anlaşması</Label>
              <Select value={form.paymentMode} onValueChange={(v: any) => setForm({ ...form, paymentMode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merchant_pos">İşletmenin kendi POS'una yönlendir (komisyonsuz)</SelectItem>
                  <SelectItem value="platform">Ticarium365 üzerinden tahsil et + işletmeye aktar</SelectItem>
                  <SelectItem value="whatsapp_only">Sadece WhatsApp ile sipariş al</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentMode === "platform" && (
              <div>
                <Label>Platform Komisyonu (%)</Label>
                <Input type="number" min={0} max={20} step={0.5}
                       value={form.agreementCommissionPct}
                       onChange={(e) => setForm({ ...form, agreementCommissionPct: Number(e.target.value) })} />
              </div>
            )}
            <div>
              <Label>Anlaşma Notları (opsiyonel)</Label>
              <Textarea rows={2} value={form.agreementNotes}
                        onChange={(e) => setForm({ ...form, agreementNotes: e.target.value })}
                        placeholder="Müşteriyle yapılan özel anlaşma detayları" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>İptal</Button>
            <Button onClick={submit} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700">
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
