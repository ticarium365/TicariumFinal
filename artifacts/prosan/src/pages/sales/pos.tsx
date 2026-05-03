import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ScanLine, Trash2, Plus, Minus, ShoppingCart, CheckCircle2,
  CreditCard, Banknote, Smartphone, Search, Package,
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

function SwipeableCartRow({
  children,
  onSwipeRemove,
}: {
  children: React.ReactNode;
  onSwipeRemove: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  return (
    <div
      className="touch-pan-y"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = touchStartX.current - e.changedTouches[0].clientX;
        touchStartX.current = null;
        if (dx > 56) onSwipeRemove();
      }}
    >
      {children}
    </div>
  );
}

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
    <div className="container mx-auto px-2 py-4 md:px-4" data-testid="page-pos">
      <PageHeader
        className="pb-4"
        title="Hızlı Satış (POS)"
        subtitle="Barkod veya ızgaradan ürün ekleyin; sepeti sağda yönetin."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <form onSubmit={handleScan} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--color-brand-600)]" />
                  <Input
                    ref={scanInputRef}
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                    placeholder="Barkod tara veya ürün kodu yaz..."
                    className="h-12 pl-10 font-mono text-lg"
                    data-testid="input-scan"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" size="lg" data-testid="btn-scan-add">Ekle</Button>
              </form>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-neutral-500)]" />
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

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {filteredProducts.map((p) => (
              <Card
                key={p.id}
                variant="flat"
                className={`cursor-pointer transition-shadow hover:shadow-[var(--shadow-sm)] ${p.stock <= 0 ? "pointer-events-none opacity-40" : ""}`}
                data-testid={`product-card-${p.id}`}
              >
                <CardContent className="p-3" onClick={() => addToCart(p)}>
                  <div className="truncate text-sm font-[var(--font-weight-semibold)] text-[color:var(--color-neutral-900)]">{p.name}</div>
                  <div className="truncate text-xs text-[color:var(--color-neutral-600)]">{p.productCode}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-[var(--font-weight-bold)] text-[color:var(--color-brand-700)]">₺{p.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                    <Badge variant={p.stock > 5 ? "secondary" : "danger"} className="text-xs">{p.stock}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-3 py-10 text-center text-[color:var(--color-neutral-600)]">
                <Package className="h-12 w-12 text-[color:var(--color-neutral-400)]" />
                <p className="text-sm">Ürün bulunamadı.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-5 w-5" /> Sepet ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[400px] space-y-2 overflow-y-auto">
              {cart.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-8 text-center text-[color:var(--color-neutral-600)]">
                  <Package className="h-10 w-10 text-[color:var(--color-neutral-400)]" />
                  <p className="text-sm">Sepet boş. Barkod tarayın veya ürüne tıklayın.</p>
                  <p className="text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-500)] lg:hidden">Mobilde satırı sola kaydırarak silebilirsiniz.</p>
                </div>
              )}
              {cart.map((c) => (
                <SwipeableCartRow key={c.product.id} onSwipeRemove={() => removeFromCart(c.product.id)}>
                  <div className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] p-2" data-testid={`cart-item-${c.product.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 truncate text-sm font-[var(--font-weight-medium)]">{c.product.name}</div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[color:var(--color-semantic-danger)]" onClick={() => removeFromCart(c.product.id)} data-testid={`btn-remove-${c.product.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => updateQty(c.product.id, -1)} data-testid={`btn-minus-${c.product.id}`}><Minus className="h-3 w-3" /></Button>
                      <span className="w-8 text-center font-mono" data-testid={`qty-${c.product.id}`}>{c.quantity}</span>
                      <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => updateQty(c.product.id, 1)} data-testid={`btn-plus-${c.product.id}`}><Plus className="h-3 w-3" /></Button>
                      <Input
                        type="number" step="0.01" min="0"
                        value={c.unitPrice}
                        onChange={(e) => setItemPrice(c.product.id, Number(e.target.value) || 0)}
                        className="h-7 flex-1 text-sm"
                      />
                      <span className="w-20 text-right text-sm font-[var(--font-weight-semibold)]">₺{(c.unitPrice * c.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                </SwipeableCartRow>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
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
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={saleType === "retail" ? "primary" : "secondary"}
                    className="h-auto py-2 text-xs"
                    onClick={() => setSaleType("retail")}
                    data-testid="saletype-retail"
                  >Perakende</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={saleType === "wholesale" ? "primary" : "secondary"}
                    className="h-auto py-2 text-xs"
                    onClick={() => setSaleType("wholesale")}
                    data-testid="saletype-wholesale"
                  >Toptan</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Ödeme Yöntemi</Label>
                <div className="mt-1 grid grid-cols-4 gap-1">
                  {PAYMENT_METHODS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <Button
                        key={p.value}
                        type="button"
                        size="sm"
                        variant={paymentMethod === p.value ? "primary" : "secondary"}
                        className="flex h-auto flex-col gap-1 py-2 text-xs"
                        onClick={() => setPaymentMethod(p.value)}
                        data-testid={`pay-${p.value}`}
                      >
                        <Icon className="h-4 w-4" />
                        {p.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">İndirim (₺)</Label>
                <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} data-testid="input-discount" />
              </div>
              <div className="space-y-1 border-t border-[color:var(--color-border-subtle)] pt-3 text-sm">
                <div className="flex justify-between"><span>Ara Toplam:</span><span data-testid="subtotal">₺{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-[color:var(--color-neutral-600)] text-[length:var(--font-size-sm)]"><span>İndirim:</span><span>-₺{discount.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-[color:var(--color-border-subtle)] pt-1 text-lg font-[var(--font-weight-bold)]"><span>Toplam:</span><span data-testid="total" className="text-[color:var(--color-brand-700)]">₺{total.toFixed(2)}</span></div>
              </div>
              <Button onClick={checkout} disabled={busy || cart.length === 0} className="h-12 w-full text-base" data-testid="btn-checkout" loading={busy}>
                {busy ? null : `Satışı Tamamla (${cart.length})`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        open={!!success}
        onOpenChange={(o) => { if (!o) setSuccess(null); }}
        size="lg"
        title={
          <span className="flex items-center gap-2 text-[color:var(--color-semantic-success)]">
            <CheckCircle2 className="h-6 w-6" /> Satış Başarılı
          </span>
        }
        footer={
          <Button className="w-full sm:w-auto" onClick={() => setSuccess(null)} data-testid="btn-success-ok">Yeni Satışa Başla</Button>
        }
      >
        <div className="py-4 text-center">
          <div className="text-4xl font-[var(--font-bold)] text-[color:var(--color-brand-700)]" data-testid="success-total">₺{success?.total.toFixed(2)}</div>
          <div className="mt-2 text-[color:var(--color-neutral-600)]">{success?.count} satır eklendi</div>
        </div>
      </Modal>
    </div>
  );
}
