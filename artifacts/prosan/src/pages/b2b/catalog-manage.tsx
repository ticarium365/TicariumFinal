import { useState, useEffect } from "react";
import {
  PackageOpen,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface CatalogItem {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  listPrice: number | null;
  currency: string;
  minOrderQty: number;
  leadDays: number | null;
  imageUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
}

interface Product {
  id: number;
  productCode: string;
  name: string;
  category: string | null;
  salePrice: number;
}

const emptyForm = {
  name: "",
  code: "",
  description: "",
  category: "",
  unit: "adet",
  listPrice: "",
  currency: "TRY",
  minOrderQty: "1",
  leadDays: "",
  imageUrl: "",
  isPublished: true,
};

export default function CatalogManagePage() {
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [productLoading, setProductLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/b2b/catalog/mine`, { credentials: "include" });
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Hata", description: "Katalog yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEdit(it: CatalogItem) {
    setEditing(it);
    setForm({
      name: it.name,
      code: it.code ?? "",
      description: it.description ?? "",
      category: it.category ?? "",
      unit: it.unit,
      listPrice: it.listPrice != null ? String(it.listPrice) : "",
      currency: it.currency,
      minOrderQty: String(it.minOrderQty),
      leadDays: it.leadDays != null ? String(it.leadDays) : "",
      imageUrl: it.imageUrl ?? "",
      isPublished: it.isPublished,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ title: "Hata", description: "İsim gerekli", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        unit: form.unit.trim() || "adet",
        listPrice: form.listPrice.trim() ? Number(form.listPrice) : null,
        currency: form.currency,
        minOrderQty: Number(form.minOrderQty) || 1,
        leadDays: form.leadDays.trim() ? Number(form.leadDays) : null,
        imageUrl: form.imageUrl.trim() || null,
        isPublished: form.isPublished,
      };
      const url = editing ? `${apiBase}/b2b/catalog/${editing.id}` : `${apiBase}/b2b/catalog`;
      const r = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Hata");
      toast({ title: "Kaydedildi", description: editing ? "Güncellendi" : "Eklendi" });
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(it: CatalogItem) {
    try {
      await fetch(`${apiBase}/b2b/catalog/${it.id}/toggle`, { method: "POST", credentials: "include" });
      await load();
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    }
  }

  async function remove(it: CatalogItem) {
    if (!confirm(`"${it.name}" silinsin mi?`)) return;
    try {
      await fetch(`${apiBase}/b2b/catalog/${it.id}`, { method: "DELETE", credentials: "include" });
      await load();
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    }
  }

  async function openImport() {
    setImportOpen(true);
    setSelected(new Set());
    setProductLoading(true);
    try {
      const r = await fetch(`${apiBase}/products?limit=500`, { credentials: "include" });
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.items ?? data.products ?? [];
      setProducts(list);
    } catch {
      toast({ title: "Hata", description: "Ürünler yüklenemedi", variant: "destructive" });
    } finally {
      setProductLoading(false);
    }
  }

  async function doImport() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/b2b/catalog/import-from-products`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: Array.from(selected) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Hata");
      toast({
        title: "İçeri aktarıldı",
        description: `${d.inserted} eklendi, ${d.skipped} zaten vardı`,
      });
      setImportOpen(false);
      await load();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const filtered = search
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.code?.toLowerCase().includes(search.toLowerCase()) ||
          i.category?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const filteredProducts = productSearch
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.productCode.toLowerCase().includes(productSearch.toLowerCase())
      )
    : products;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackageOpen className="h-6 w-6 text-primary" />
            B2B Kataloğum
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tedarik ağındaki firmalara açtığınız ürünleri yönetin
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openImport}>
            <Download className="h-4 w-4 mr-2" /> Stoktan Aktar
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Yeni Kalem
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Ad, kod veya kategori ara..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <PackageOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Henüz kalem yok</p>
          <Button size="sm" className="mt-4" onClick={openNew}>
            İlk kalemi ekle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((it) => (
            <Card key={it.id} className={!it.isPublished ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{it.name}</h3>
                    {it.code && <code className="text-xs text-muted-foreground font-mono">{it.code}</code>}
                  </div>
                  {!it.isPublished && (
                    <Badge variant="outline" className="shrink-0">
                      Gizli
                    </Badge>
                  )}
                </div>
                {it.category && (
                  <Badge variant="secondary" className="text-xs">
                    {it.category}
                  </Badge>
                )}
                {it.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{it.description}</p>
                )}
                <div className="flex items-center justify-between text-sm pt-1">
                  <span className="text-muted-foreground">
                    Min: {it.minOrderQty} {it.unit}
                  </span>
                  <span className="font-bold">
                    {it.listPrice != null
                      ? `${it.listPrice.toLocaleString("tr-TR")} ${it.currency}`
                      : "Fiyat sorunuz"}
                  </span>
                </div>
                <div className="flex gap-1 pt-2 border-t">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => openEdit(it)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Düzenle
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(it)} title={it.isPublished ? "Gizle" : "Yayınla"}>
                    {it.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(it)} className="text-rose-600 hover:text-rose-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Kalemi Düzenle" : "Yeni Katalog Kalemi"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Ürün Adı *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Ürün Kodu</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Kategori</label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Açıklama</label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Birim</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Min. Sipariş Miktarı</label>
              <Input
                type="number"
                value={form.minOrderQty}
                onChange={(e) => setForm({ ...form, minOrderQty: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Liste Fiyatı (boş = "Fiyat sorunuz")</label>
              <Input
                type="number"
                value={form.listPrice}
                onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Para Birimi</label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Hazırlık Süresi (gün)</label>
              <Input
                type="number"
                value={form.leadDays}
                onChange={(e) => setForm({ ...form, leadDays: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="published"
                checked={form.isPublished}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              />
              <label htmlFor="published" className="text-sm">
                Ağda görünsün (yayınlı)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Stoktan Katalog'a Aktar</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ürün ara..."
              className="pl-9"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto flex-1 border rounded-lg divide-y">
            {productLoading ? (
              <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Ürün bulunamadı</div>
            ) : (
              filteredProducts.slice(0, 200).map((p) => {
                const isSel = selected.has(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => {
                        const s = new Set(selected);
                        if (isSel) s.delete(p.id);
                        else s.add(p.id);
                        setSelected(s);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.productCode}</p>
                    </div>
                    {p.salePrice > 0 && (
                      <span className="text-sm font-bold">₺{p.salePrice.toLocaleString("tr-TR")}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <span className="text-sm text-muted-foreground mr-auto">{selected.size} seçili</span>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button onClick={doImport} disabled={busy || selected.size === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `${selected.size} kalem aktar`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
