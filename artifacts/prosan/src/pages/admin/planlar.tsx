import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Eye, EyeOff, Power, PowerOff } from "lucide-react";

type Plan = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  maxUsers: number;
  maxProducts: number;
  maxBranches: number;
  maxMonthlySales: number;
  storageMb: number;
  maxEinvoiceMonthly: number;
  einvoiceOverageRate: string;
  maxOcrMonthly: number;
  maxApiCallsMonthly: number;
  maxCustomers: number;
  maxMarketplaceChannels: number;
  features: string;
  isActive: boolean;
  isPublic: boolean;
  requiredAccountType: string | null;
  sortOrder: number;
};

type FormState = Omit<Plan, "id"> & { features: string };

const EMPTY: FormState = {
  slug: "",
  name: "",
  description: "",
  priceMonthly: "0",
  priceYearly: "0",
  maxUsers: 5,
  maxProducts: 1000,
  maxBranches: 1,
  maxMonthlySales: 500,
  storageMb: 500,
  maxEinvoiceMonthly: 0,
  einvoiceOverageRate: "0.90",
  maxOcrMonthly: 0,
  maxApiCallsMonthly: 0,
  maxCustomers: 500,
  maxMarketplaceChannels: 0,
  features: "[]",
  isActive: true,
  isPublic: true,
  requiredAccountType: null,
  sortOrder: 0,
};

const NUMERIC_FIELDS: Array<keyof FormState> = [
  "maxUsers", "maxProducts", "maxBranches", "maxMonthlySales", "storageMb",
  "maxEinvoiceMonthly", "maxOcrMonthly", "maxApiCallsMonthly",
  "maxCustomers", "maxMarketplaceChannels", "sortOrder",
];

export default function AdminPlanlarPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/subscriptions/plans/all", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setPlans(j.plans || []);
    } catch (e: any) {
      toast({ title: "Yükleme hatası", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function startCreate() {
    setForm(EMPTY);
    setCreating(true);
    setEditing(null);
  }
  function startEdit(p: Plan) {
    let featuresStr = p.features;
    try {
      const arr = JSON.parse(p.features);
      if (Array.isArray(arr)) featuresStr = arr.join(", ");
    } catch { /* keep raw */ }
    setForm({ ...p, features: featuresStr });
    setEditing(p);
    setCreating(false);
  }
  function close() { setEditing(null); setCreating(false); }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function buildPayload(): Record<string, unknown> {
    const featuresArr = form.features
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean);
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description ?? null,
      priceMonthly: form.priceMonthly,
      priceYearly: form.priceYearly,
      einvoiceOverageRate: form.einvoiceOverageRate,
      features: featuresArr,
      isActive: form.isActive,
      isPublic: form.isPublic,
      requiredAccountType: form.requiredAccountType || null,
    };
    for (const k of NUMERIC_FIELDS) payload[k] = Number((form as any)[k]);
    if (creating) payload.slug = form.slug.trim();
    return payload;
  }

  async function save() {
    setSaving(true);
    try {
      const url = creating ? "/api/subscriptions/plans" : `/api/subscriptions/plans/${editing!.id}`;
      const method = creating ? "POST" : "PUT";
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
      toast({ title: creating ? "Plan oluşturuldu" : "Plan güncellendi" });
      close();
      await load();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function softDelete(p: Plan) {
    if (!confirm(`'${p.name}' planı pasif edilsin mi? (soft-delete; aktif aboneler engeller)`)) return;
    try {
      const r = await fetch(`/api/subscriptions/plans/${p.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
      toast({ title: "Plan pasif edildi" });
      await load();
    } catch (e: any) {
      toast({ title: "Silme başarısız", description: e.message, variant: "destructive" });
    }
  }

  async function toggleActive(p: Plan) {
    try {
      const r = await fetch(`/api/subscriptions/plans/${p.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  }
  async function togglePublic(p: Plan) {
    try {
      const r = await fetch(`/api/subscriptions/plans/${p.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !p.isPublic }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  }

  const sorted = useMemo(
    () => [...plans].sort((a, b) => (a.sortOrder - b.sortOrder) || a.id - b.id),
    [plans],
  );
  const open = creating || !!editing;

  return (
    <div className="p-6 space-y-4" data-testid="page-admin-planlar">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Paket Yönetimi</h1>
        <Button onClick={startCreate} data-testid="button-create-plan">
          <Plus className="w-4 h-4 mr-2" /> Yeni Paket
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Tüm Paketler ({plans.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sıra</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead className="text-right">Aylık (TL)</TableHead>
                  <TableHead className="text-right">Yıllık (TL)</TableHead>
                  <TableHead className="text-right">Kullanıcı</TableHead>
                  <TableHead className="text-right">Ürün</TableHead>
                  <TableHead className="text-right">e-Belge/ay</TableHead>
                  <TableHead className="text-right">OCR/ay</TableHead>
                  <TableHead className="text-right">API/ay</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(p => (
                  <TableRow key={p.id} data-testid={`row-plan-${p.slug}`}>
                    <TableCell>{p.sortOrder}</TableCell>
                    <TableCell><code className="text-xs">{p.slug}</code></TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{Number(p.priceMonthly).toLocaleString("tr-TR")}</TableCell>
                    <TableCell className="text-right">{Number(p.priceYearly).toLocaleString("tr-TR")}</TableCell>
                    <TableCell className="text-right">{p.maxUsers === -1 ? "∞" : p.maxUsers}</TableCell>
                    <TableCell className="text-right">{p.maxProducts === -1 ? "∞" : p.maxProducts}</TableCell>
                    <TableCell className="text-right">{p.maxEinvoiceMonthly === -1 ? "∞" : p.maxEinvoiceMonthly}</TableCell>
                    <TableCell className="text-right">{p.maxOcrMonthly === -1 ? "∞" : p.maxOcrMonthly}</TableCell>
                    <TableCell className="text-right">{p.maxApiCallsMonthly === -1 ? "∞" : p.maxApiCallsMonthly}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant={p.isActive ? "default" : "secondary"}>
                          {p.isActive ? "Aktif" : "Pasif"}
                        </Badge>
                        <Badge variant={p.isPublic ? "outline" : "secondary"}>
                          {p.isPublic ? "Görünür" : "Gizli"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => toggleActive(p)}
                          title={p.isActive ? "Pasifleştir" : "Aktifleştir"}
                          data-testid={`button-toggle-active-${p.slug}`}>
                          {p.isActive
                            ? <PowerOff className="w-4 h-4" />
                            : <Power className="w-4 h-4 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => togglePublic(p)}
                          title={p.isPublic ? "Gizle" : "Görünür yap"}
                          data-testid={`button-toggle-public-${p.slug}`}>
                          {p.isPublic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => startEdit(p)}
                          data-testid={`button-edit-${p.slug}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => softDelete(p)}
                          title="Pasif et (soft-delete)"
                          data-testid={`button-delete-${p.slug}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? "Yeni Paket" : `Paketi Düzenle — ${editing?.name}`}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {creating && (
              <div className="col-span-2">
                <Label>Slug (kalıcı, [a-z0-9_])</Label>
                <Input value={form.slug} onChange={e => setField("slug", e.target.value)}
                  placeholder="ör: pkg_starter" data-testid="input-slug" />
              </div>
            )}
            <div>
              <Label>Ad</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)}
                data-testid="input-name" />
            </div>
            <div>
              <Label>Sıra (sortOrder)</Label>
              <Input type="number" value={form.sortOrder}
                onChange={e => setField("sortOrder", Number(e.target.value))} />
            </div>
            <div className="col-span-2">
              <Label>Açıklama</Label>
              <Textarea value={form.description ?? ""}
                onChange={e => setField("description", e.target.value)} />
            </div>

            <div>
              <Label>Aylık Fiyat (TL)</Label>
              <Input type="number" step="0.01" value={form.priceMonthly}
                onChange={e => setField("priceMonthly", e.target.value)}
                data-testid="input-price-monthly" />
            </div>
            <div>
              <Label>Yıllık Fiyat (TL)</Label>
              <Input type="number" step="0.01" value={form.priceYearly}
                onChange={e => setField("priceYearly", e.target.value)}
                data-testid="input-price-yearly" />
            </div>

            <div>
              <Label>Max Kullanıcı (-1 = ∞)</Label>
              <Input type="number" value={form.maxUsers}
                onChange={e => setField("maxUsers", Number(e.target.value))} />
            </div>
            <div>
              <Label>Max Ürün</Label>
              <Input type="number" value={form.maxProducts}
                onChange={e => setField("maxProducts", Number(e.target.value))} />
            </div>
            <div>
              <Label>Max Şube</Label>
              <Input type="number" value={form.maxBranches}
                onChange={e => setField("maxBranches", Number(e.target.value))} />
            </div>
            <div>
              <Label>Aylık Max Satış</Label>
              <Input type="number" value={form.maxMonthlySales}
                onChange={e => setField("maxMonthlySales", Number(e.target.value))} />
            </div>
            <div>
              <Label>Depolama (MB)</Label>
              <Input type="number" value={form.storageMb}
                onChange={e => setField("storageMb", Number(e.target.value))} />
            </div>
            <div>
              <Label>Max Cari (müşteri+tedarikçi)</Label>
              <Input type="number" value={form.maxCustomers}
                onChange={e => setField("maxCustomers", Number(e.target.value))} />
            </div>

            <div>
              <Label>Aylık e-Belge Kontörü</Label>
              <Input type="number" value={form.maxEinvoiceMonthly}
                onChange={e => setField("maxEinvoiceMonthly", Number(e.target.value))} />
            </div>
            <div>
              <Label>Aşan e-Belge Birim Ücret (TL)</Label>
              <Input type="number" step="0.01" value={form.einvoiceOverageRate}
                onChange={e => setField("einvoiceOverageRate", e.target.value)} />
            </div>
            <div>
              <Label>Aylık OCR Kotası</Label>
              <Input type="number" value={form.maxOcrMonthly}
                onChange={e => setField("maxOcrMonthly", Number(e.target.value))} />
            </div>
            <div>
              <Label>Aylık API Çağrı Kotası</Label>
              <Input type="number" value={form.maxApiCallsMonthly}
                onChange={e => setField("maxApiCallsMonthly", Number(e.target.value))} />
            </div>
            <div>
              <Label>Pazaryeri Kanal Sayısı</Label>
              <Input type="number" value={form.maxMarketplaceChannels}
                onChange={e => setField("maxMarketplaceChannels", Number(e.target.value))} />
            </div>
            <div>
              <Label>Hesap Tipi Kısıtı (boş = tümü)</Label>
              <Input value={form.requiredAccountType ?? ""}
                placeholder="ör: purchasing"
                onChange={e => setField("requiredAccountType", e.target.value || null)} />
            </div>

            <div className="col-span-2">
              <Label>Özellikler (virgülle ayır, ör: inventory.core, sales.pos, einvoice.pro, *)</Label>
              <Textarea value={form.features} rows={3}
                onChange={e => setField("features", e.target.value)}
                data-testid="textarea-features" />
              <p className="text-xs text-muted-foreground mt-1">
                <code>*</code> = tüm özellikler açık (kurumsal/trial paketleri için)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.isActive}
                onCheckedChange={v => setField("isActive", v)} />
              <Label>Aktif</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isPublic}
                onCheckedChange={v => setField("isPublic", v)} />
              <Label>Pricing'de Görünür (isPublic)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>İptal</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-plan">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
