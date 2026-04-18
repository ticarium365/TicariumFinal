import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Factory, Plus, Trash2, Play, Ban, FileText, Layers } from "lucide-react";

type Product = { id: number; name: string; productCode: string; stock: number; purchasePrice: number };
type Recipe = { id: number; productId: number; productName: string; productCode: string; name: string; outputQuantity: number; isActive: boolean };
type Component = { componentProductId: number; quantity: number; unit?: string | null; productName?: string; productCode?: string; stock?: number };
type Order = {
  id: number; recipeId: number; productId: number; recipeName: string;
  productName: string; productCode: string;
  plannedQuantity: number; producedQuantity: number; scrapQuantity: number;
  status: string; createdAt: string; completedAt: string | null;
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "outline", in_progress: "secondary", completed: "default", cancelled: "destructive",
};

export default function ProductionPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [completeDialog, setCompleteDialog] = useState<Order | null>(null);

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/production/recipes"],
    queryFn: async () => (await fetch("/api/production/recipes", { credentials: "include" })).json(),
  });
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/production/orders"],
    queryFn: async () => (await fetch("/api/production/orders", { credentials: "include" })).json(),
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const d = await (await fetch("/api/products?limit=500", { credentials: "include" })).json();
      return Array.isArray(d) ? d : (d.products || d.items || []);
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/production/recipes"] });
    qc.invalidateQueries({ queryKey: ["/api/production/orders"] });
    qc.invalidateQueries({ queryKey: ["/api/products"] });
  }

  async function deleteRecipe(id: number) {
    if (!confirm("Reçeteyi silmek istediğine emin misin?")) return;
    const r = await fetch(`/api/production/recipes/${id}`, { method: "DELETE", credentials: "include" });
    if (!r.ok) toast({ title: "Hata", description: (await r.json()).error, variant: "destructive" });
    else { toast({ title: "Reçete silindi" }); refresh(); }
  }
  async function cancelOrder(id: number) {
    if (!confirm("Üretim emrini iptal etmek istediğine emin misin?")) return;
    const r = await fetch(`/api/production/orders/${id}/cancel`, { method: "POST", credentials: "include" });
    if (r.ok) { toast({ title: "Emir iptal edildi" }); refresh(); }
    else toast({ title: "Hata", variant: "destructive" });
  }

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-production">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Factory className="h-7 w-7 text-primary" /> Üretim & Reçete
          </h1>
          <p className="text-muted-foreground">Hammaddeden mamul üretim, BOM (Bill of Materials), fire takibi.</p>
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders"><Play className="h-4 w-4 mr-1" />Üretim Emirleri ({orders.length})</TabsTrigger>
          <TabsTrigger value="recipes" data-testid="tab-recipes"><Layers className="h-4 w-4 mr-1" />Reçeteler ({recipes.length})</TabsTrigger>
        </TabsList>

        {/* ÜRETİM EMİRLERİ */}
        <TabsContent value="orders" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setOrderDialogOpen(true)} disabled={recipes.length === 0} data-testid="btn-new-order">
              <Plus className="h-4 w-4 mr-1" /> Yeni Üretim Emri
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Reçete / Mamul</TableHead>
                    <TableHead className="text-right">Planlanan</TableHead>
                    <TableHead className="text-right">Üretilen</TableHead>
                    <TableHead className="text-right">Fire</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Henüz üretim emri yok.</TableCell></TableRow>
                  )}
                  {orders.map((o) => (
                    <TableRow key={o.id} data-testid={`order-row-${o.id}`}>
                      <TableCell className="text-xs">{new Date(o.createdAt).toLocaleDateString("tr-TR")}</TableCell>
                      <TableCell>
                        <div className="font-medium">{o.productName}</div>
                        <div className="text-xs text-muted-foreground">{o.recipeName} • {o.productCode}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{o.plannedQuantity}</TableCell>
                      <TableCell className="text-right font-mono">{o.producedQuantity || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-amber-600">{o.scrapQuantity || "-"}</TableCell>
                      <TableCell><Badge variant={STATUS_BADGE[o.status] || "outline"}>{o.status}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        {(o.status === "planned" || o.status === "in_progress") && (
                          <>
                            <Button size="sm" onClick={() => setCompleteDialog(o)} data-testid={`btn-complete-${o.id}`}>
                              <Play className="h-3 w-3 mr-1" /> Tamamla
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)}>
                              <Ban className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REÇETELER */}
        <TabsContent value="recipes" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setRecipeDialogOpen(true)} data-testid="btn-new-recipe">
              <Plus className="h-4 w-4 mr-1" /> Yeni Reçete
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reçete</TableHead>
                    <TableHead>Mamul</TableHead>
                    <TableHead className="text-right">Çıktı (1 batch)</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipes.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Henüz reçete yok.</TableCell></TableRow>
                  )}
                  {recipes.map((r) => (
                    <TableRow key={r.id} data-testid={`recipe-row-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.productName} <span className="text-xs text-muted-foreground">({r.productCode})</span></TableCell>
                      <TableCell className="text-right font-mono">{r.outputQuantity}</TableCell>
                      <TableCell>{r.isActive ? <Badge variant="default">Aktif</Badge> : <Badge variant="secondary">Pasif</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => deleteRecipe(r.id)} data-testid={`btn-del-recipe-${r.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RecipeDialog open={recipeDialogOpen} setOpen={setRecipeDialogOpen} products={products} onCreated={refresh} />
      <OrderDialog open={orderDialogOpen} setOpen={setOrderDialogOpen} recipes={recipes} onCreated={refresh} />
      <CompleteDialog order={completeDialog} setOrder={setCompleteDialog} onCompleted={refresh} />
    </div>
  );
}

// ─── DIALOGS ───
function RecipeDialog({ open, setOpen, products, onCreated }: any) {
  const { toast } = useToast();
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("Standart");
  const [output, setOutput] = useState(1);
  const [components, setComponents] = useState<{ componentProductId: string; quantity: number; unit: string }[]>([
    { componentProductId: "", quantity: 1, unit: "adet" },
  ]);
  const [busy, setBusy] = useState(false);

  function addRow() { setComponents([...components, { componentProductId: "", quantity: 1, unit: "adet" }]); }
  function delRow(i: number) { setComponents(components.filter((_, idx) => idx !== i)); }
  function updRow(i: number, patch: any) { setComponents(components.map((c, idx) => idx === i ? { ...c, ...patch } : c)); }

  async function save() {
    if (!productId || !name) return toast({ title: "Mamul ürün ve reçete adı zorunlu", variant: "destructive" });
    const validComps = components.filter((c) => c.componentProductId && c.quantity > 0);
    if (validComps.length === 0) return toast({ title: "En az bir bileşen ekle", variant: "destructive" });
    setBusy(true);
    const r = await fetch("/api/production/recipes", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: Number(productId), name, outputQuantity: Number(output) || 1,
        components: validComps.map((c) => ({ componentProductId: Number(c.componentProductId), quantity: c.quantity, unit: c.unit })),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const e = await r.json();
      return toast({ title: "Hata", description: e.error, variant: "destructive" });
    }
    toast({ title: "Reçete oluşturuldu" });
    setOpen(false); setProductId(""); setName("Standart"); setOutput(1);
    setComponents([{ componentProductId: "", quantity: 1, unit: "adet" }]);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Yeni Reçete (BOM)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mamul Ürün</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger data-testid="select-recipe-product"><SelectValue placeholder="Seç..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p: Product) => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.productCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reçete Adı</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-recipe-name" />
            </div>
            <div>
              <Label>1 batch çıktısı</Label>
              <Input type="number" min="0.01" step="0.01" value={output} onChange={(e) => setOutput(Number(e.target.value) || 1)} data-testid="input-recipe-output" />
            </div>
          </div>

          <div className="border rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-sm">Bileşenler (Hammaddeler)</h4>
              <Button size="sm" variant="outline" onClick={addRow} data-testid="btn-add-component"><Plus className="h-3 w-3 mr-1" /> Bileşen</Button>
            </div>
            {components.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Select value={c.componentProductId} onValueChange={(v) => updRow(i, { componentProductId: v })}>
                    <SelectTrigger className="h-9" data-testid={`select-component-${i}`}><SelectValue placeholder="Hammadde seç" /></SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((p: Product) => String(p.id) !== productId)
                        .map((p: Product) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input type="number" min="0.01" step="0.01" value={c.quantity} onChange={(e) => updRow(i, { quantity: Number(e.target.value) || 0 })} placeholder="Miktar" data-testid={`input-component-qty-${i}`} />
                </div>
                <div className="col-span-2">
                  <Input value={c.unit} onChange={(e) => updRow(i, { unit: e.target.value })} placeholder="Birim" />
                </div>
                <div className="col-span-1">
                  <Button size="icon" variant="outline" onClick={() => delRow(i)} className="h-9 w-9"><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
          <Button onClick={save} disabled={busy} data-testid="btn-save-recipe">{busy ? "Kaydediliyor..." : "Kaydet"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDialog({ open, setOpen, recipes, onCreated }: any) {
  const { toast } = useToast();
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!recipeId || qty <= 0) return toast({ title: "Reçete ve miktar zorunlu", variant: "destructive" });
    setBusy(true);
    const r = await fetch("/api/production/orders", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: Number(recipeId), plannedQuantity: qty }),
    });
    setBusy(false);
    if (!r.ok) return toast({ title: "Hata", description: (await r.json()).error, variant: "destructive" });
    toast({ title: "Üretim emri oluşturuldu" });
    setOpen(false); setRecipeId(""); setQty(1); onCreated();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Yeni Üretim Emri</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reçete</Label>
            <Select value={recipeId} onValueChange={setRecipeId}>
              <SelectTrigger data-testid="select-order-recipe"><SelectValue placeholder="Seç..." /></SelectTrigger>
              <SelectContent>
                {recipes.map((r: Recipe) => <SelectItem key={r.id} value={String(r.id)}>{r.productName} — {r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Planlanan Mamul Miktarı</Label>
            <Input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} data-testid="input-order-qty" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
          <Button onClick={save} disabled={busy} data-testid="btn-save-order">Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ order, setOrder, onCompleted }: { order: Order | null; setOrder: (o: Order | null) => void; onCompleted: () => void }) {
  const { toast } = useToast();
  const [produced, setProduced] = useState(0);
  const [scrap, setScrap] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (order) { setProduced(order.plannedQuantity); setScrap(0); } }, [order]);
  async function complete() {
    if (!order) return;
    if (produced <= 0) return toast({ title: "Üretilen miktar > 0 olmalı", variant: "destructive" });
    setBusy(true);
    const r = await fetch(`/api/production/orders/${order.id}/complete`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producedQuantity: produced, scrapQuantity: scrap }),
    });
    setBusy(false);
    if (!r.ok) {
      const e = await r.json();
      return toast({ title: "Hata", description: e.error, variant: "destructive" });
    }
    toast({ title: "Üretim tamamlandı, stoklar güncellendi" });
    setOrder(null); onCompleted();
  }
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && setOrder(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Üretimi Tamamla — {order?.productName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Bileşen stokları otomatik düşülecek, mamul stoğu üretilen miktar kadar artacak.</div>
          <div>
            <Label>Üretilen Miktar (sağlam)</Label>
            <Input type="number" min="0" step="0.01" value={produced} onChange={(e) => setProduced(Number(e.target.value) || 0)} data-testid="input-produced" />
          </div>
          <div>
            <Label>Fire Miktarı</Label>
            <Input type="number" min="0" step="0.01" value={scrap} onChange={(e) => setScrap(Number(e.target.value) || 0)} data-testid="input-scrap" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOrder(null)}>İptal</Button>
          <Button onClick={complete} disabled={busy} data-testid="btn-confirm-complete">Tamamla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
