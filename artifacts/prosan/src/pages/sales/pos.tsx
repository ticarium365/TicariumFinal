import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ScanLine, Trash2, Plus, Minus, ShoppingCart, CheckCircle2,
  CreditCard, Banknote, Smartphone, Search,
} from "lucide-react";

type Product = {
  id: number; name: string; productCode: string; barcode: string | null;
  salePrice: number; stock: number; category: string | null;
};
type Customer = { id: number; name: string; code: string };
type CartItem = { product: Product; quantity: number; unitPrice: number };

const PAYMENT_METHODS = [
  { value: "cash", label: "Nakit", icon: Banknote },
  { value: "card", label: "Kart", icon: CreditCard },
  { value: "transfer", label: "Havale", icon: Smartphone },
  { value: "credit", label: "Veresiye", icon: ShoppingCart },
];

export default function POSPage() {
  const { toast } = useToast();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [discount, setDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ count: number; total: number } | null>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const r = await fetch("/api/products?limit=500", { credentials: "include" });
      const d = await r.json();
      return Array.isArray(d) ? d : (d.products || d.items || d.data || []);
    },
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const r = await fetch("/api/customers?limit=500", { credentials: "include" });
      const d = await r.json();
      return Array.isArray(d) ? d : (d.customers || d.items || d.data || []);
    },
  });

  // Auto-focus barcode input
  useEffect(() => { scanInputRef.current?.focus(); }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.productCode.toLowerCase().includes(q) ||
      (p.barcode || "").toLowerCase().includes(q)
    ).slice(0, 24);
  }, [products, search]);

  function addToCart(p: Product, qty = 1) {
    if (p.stock <= 0) {
      toast({ title: "Stok yok", description: `${p.name} stokta yok`, variant: "destructive" });
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === p.id);
      if (idx >= 0) {
        const newQty = prev[idx].quantity + qty;
        if (newQty > p.stock) {
          toast({ title: "Stok yetersiz", description: `Mevcut: ${p.stock}`, variant: "destructive" });
          return prev;
        }
        const next = [...prev]; next[idx] = { ...next[idx], quantity: newQty }; return next;
      }
      return [...prev, { product: p, quantity: qty, unitPrice: p.salePrice }];
    });
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const p = products.find((x) => x.barcode === code || x.productCode === code);
    if (!p) {
      toast({ title: "Ürün bulunamadı", description: code, variant: "destructive" });
    } else {
      addToCart(p, 1);
    }
    setScan("");
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }

  function updateQty(productId: number, delta: number) {
    setCart((prev) => prev.flatMap((c) => {
      if (c.product.id !== productId) return [c];
      const newQty = c.quantity + delta;
      if (newQty <= 0) return [];
      if (newQty > c.product.stock) {
        toast({ title: "Stok yetersiz", description: `Mevcut: ${c.product.stock}`, variant: "destructive" });
        return [c];
      }
      return [{ ...c, quantity: newQty }];
    }));
  }
  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }
  function setItemPrice(productId: number, price: number) {
    setCart((prev) => prev.map((c) => c.product.id === productId ? { ...c, unitPrice: price } : c));
  }

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  async function checkout() {
    if (cart.length === 0) { toast({ title: "Sepet boş", variant: "destructive" }); return; }
    if (paymentMethod === "credit" && customerId === "0") {
      { toast({ title: "Veresiye için müşteri seç", variant: "destructive" }); return; }
    }
    setBusy(true);
    const errors: string[] = [];
    let ok = 0;
    // Pro-rata discount per line
    const discountRatio = subtotal > 0 ? discount / subtotal : 0;
    for (const item of cart) {
      try {
        const adjustedPrice = item.unitPrice * (1 - discountRatio);
        const r = await fetch("/api/sales", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: adjustedPrice,
            paymentMethod,
            customerId: customerId !== "0" ? Number(customerId) : null,
            saleType,
            channelKey: "pos",
          }),
        });
        if (!r.ok) {
          const t = await r.text();
          errors.push(`${item.product.name}: ${t.slice(0, 80)}`);
        } else { ok++; }
      } catch (e: any) {
        errors.push(`${item.product.name}: ${String(e).slice(0, 80)}`);
      }
    }
    setBusy(false);
    if (errors.length === 0) {
      setSuccess({ count: ok, total });
      setCart([]); setDiscount(0); setScan("");
      setTimeout(() => scanInputRef.current?.focus(), 100);
    } else {
      toast({
        title: `${ok} satır eklendi, ${errors.length} hata`,
        description: errors.slice(0, 3).join(" • "),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="container mx-auto py-4 px-2 md:px-4" data-testid="page-pos">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SOL: ürünler */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <form onSubmit={handleScan} className="flex gap-2">
                <div className="flex-1 relative">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                  <Input
                    ref={scanInputRef}
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                    placeholder="Barkod tara veya ürün kodu yaz..."
                    className="pl-10 text-lg font-mono h-12"
                    data-testid="input-scan"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" size="lg" data-testid="btn-scan-add">Ekle</Button>
              </form>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ürün ara (isim/kod/barkod)..."
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="text-left border rounded-md p-3 hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid={`product-card-${p.id}`}
              >
                <div className="font-semibold text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">{p.productCode}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-primary">₺{p.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                  <Badge variant={p.stock > 5 ? "secondary" : "destructive"} className="text-xs">{p.stock}</Badge>
                </div>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-8">Ürün bulunamadı</div>
            )}
          </div>
        </div>

        {/* SAĞ: sepet */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Sepet ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
              {cart.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Sepet boş. Barkod tarayın veya ürüne tıklayın.
                </div>
              )}
              {cart.map((c) => (
                <div key={c.product.id} className="border rounded p-2 space-y-2" data-testid={`cart-item-${c.product.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium flex-1 truncate">{c.product.name}</div>
                    <button onClick={() => removeFromCart(c.product.id)} className="text-destructive hover:text-destructive/80" data-testid={`btn-remove-${c.product.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(c.product.id, -1)} data-testid={`btn-minus-${c.product.id}`}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center font-mono" data-testid={`qty-${c.product.id}`}>{c.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(c.product.id, 1)} data-testid={`btn-plus-${c.product.id}`}><Plus className="h-3 w-3" /></Button>
                    <Input
                      type="number" step="0.01" min="0"
                      value={c.unitPrice}
                      onChange={(e) => setItemPrice(c.product.id, Number(e.target.value) || 0)}
                      className="h-7 text-sm flex-1"
                    />
                    <span className="text-sm font-semibold w-20 text-right">₺{(c.unitPrice * c.quantity).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <Label className="text-xs">Müşteri</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger data-testid="select-customer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Geçici (Adsız)</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Satış Tipi</Label>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => setSaleType("retail")}
                    className={`p-2 border rounded text-xs font-medium transition-colors ${saleType === "retail" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                    data-testid="saletype-retail"
                  >Perakende</button>
                  <button
                    type="button"
                    onClick={() => setSaleType("wholesale")}
                    className={`p-2 border rounded text-xs font-medium transition-colors ${saleType === "wholesale" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                    data-testid="saletype-wholesale"
                  >Toptan</button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Ödeme Yöntemi</Label>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {PAYMENT_METHODS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.value}
                        onClick={() => setPaymentMethod(p.value)}
                        className={`flex flex-col items-center gap-1 p-2 border rounded text-xs ${paymentMethod === p.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                        data-testid={`pay-${p.value}`}
                      >
                        <Icon className="h-4 w-4" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">İndirim (₺)</Label>
                <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} data-testid="input-discount" />
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Ara Toplam:</span><span data-testid="subtotal">₺{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>İndirim:</span><span>-₺{discount.toFixed(2)}</span></div>
                <div className="flex justify-between text-lg font-bold pt-1 border-t"><span>Toplam:</span><span data-testid="total" className="text-primary">₺{total.toFixed(2)}</span></div>
              </div>
              <Button onClick={checkout} disabled={busy || cart.length === 0} className="w-full h-12 text-base" data-testid="btn-checkout">
                {busy ? "Kaydediliyor..." : `Satışı Tamamla (${cart.length})`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" /> Satış Başarılı
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <div className="text-4xl font-bold text-primary" data-testid="success-total">₺{success?.total.toFixed(2)}</div>
            <div className="text-muted-foreground mt-2">{success?.count} satır eklendi</div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSuccess(null)} className="w-full" data-testid="btn-success-ok">Yeni Satışa Başla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
