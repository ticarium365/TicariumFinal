import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, ShoppingCart, Plus, Minus, X, Check, AlertCircle, Store } from "lucide-react";
import { initialLetter } from "@/lib/display-initial";

type Storefront = {
  id: number;
  slug: string;
  name: string;
  type: string;
  status: string;
  paymentMode: string;
  themeConfig: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    welcomeText?: string;
  } | null;
  paymentConfig: {
    redirectUrl?: string;
    whatsappNumber?: string;
  } | null;
};
type StorefrontProduct = {
  linkId: number;
  productId: number;
  title: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  productCode: string;
  stockQty: number;
};

type CartItem = { productId: number; title: string; price: number; qty: number };

export default function PublicStorefrontPage() {
  const [, params] = useRoute("/s/:slug");
  const slug = params?.slug;
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await fetch(`/api/public/v1/storefronts/${encodeURIComponent(slug)}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error?.message || "Mağaza bulunamadı");
        }
        const j = await r.json();
        setStorefront(j.storefront);
        setProducts(j.products || []);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  const primary = storefront?.themeConfig?.primaryColor || "#10b981";
  const cartTotal = useMemo(() => cart.reduce((s, x) => s + x.price * x.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, x) => s + x.qty, 0), [cart]);

  const addToCart = (p: StorefrontProduct) => {
    setCart((prev) => {
      const ex = prev.find((x) => x.productId === p.productId);
      if (ex) return prev.map((x) => x.productId === p.productId ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { productId: p.productId, title: p.title, price: p.price, qty: 1 }];
    });
  };
  const updateQty = (pid: number, d: number) => {
    setCart((prev) => prev.flatMap((x) => x.productId === pid ? (x.qty + d <= 0 ? [] : [{ ...x, qty: x.qty + d }]) : [x]));
  };
  const removeFromCart = (pid: number) => setCart((prev) => prev.filter((x) => x.productId !== pid));

  if (loading) return <FullCenter><Loader2 className="w-8 h-8 animate-spin text-muted-foreground/70" /></FullCenter>;
  if (error) return <FullCenter><div className="text-center"><AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-2" /><div className="text-foreground/90">{error}</div></div></FullCenter>;
  if (!storefront) return <FullCenter><div className="text-muted-foreground">Mağaza yüklenemedi</div></FullCenter>;

  if (storefront.status !== "active") {
    return <FullCenter><div className="text-center max-w-sm">
      <Store className="w-12 h-12 text-muted-foreground/70 mx-auto mb-3" />
      <h1 className="text-xl font-bold mb-2">{storefront.name}</h1>
      <p className="text-muted-foreground">Bu mağaza şu anda yayında değil.</p>
    </div></FullCenter>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {storefront.themeConfig?.logoUrl ? (
              <img src={storefront.themeConfig.logoUrl} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <div className="h-10 w-10 rounded flex items-center justify-center text-white font-bold" style={{ background: primary }}>
                {initialLetter(storefront.name)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold truncate">{storefront.name}</h1>
              <div className="text-xs text-muted-foreground">Ticarium365 ile güçlendirildi</div>
            </div>
          </div>
          <button onClick={() => setCartOpen(true)} className="relative px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2"
                  style={{ background: primary }}>
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Sepet</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">{cartCount}</span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {storefront.themeConfig?.welcomeText && (
          <div className="bg-card border rounded-lg p-4 text-foreground/90">{storefront.themeConfig.welcomeText}</div>
        )}
        {products.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">Henüz ürün yok.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <div key={p.linkId} className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition flex flex-col">
                <div className="aspect-square bg-muted">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <Store className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="font-medium line-clamp-2 text-sm">{p.title}</h3>
                  <div className="text-xs text-muted-foreground/70 mt-1">{p.productCode}</div>
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    <div className="font-bold text-lg" style={{ color: primary }}>₺{p.price.toFixed(2)}</div>
                    {p.stockQty > 0 ? (
                      <button onClick={() => addToCart(p)} className="px-3 py-1.5 rounded text-white text-sm font-medium" style={{ background: primary }}>
                        + Sepet
                      </button>
                    ) : (
                      <span className="text-xs text-red-500">Stokta yok</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setCartOpen(false)} />
          <div className="w-full sm:w-96 bg-card shadow-xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">Sepet ({cartCount})</h2>
              <button onClick={() => { setCartOpen(false); setCheckoutMode(false); }}><X className="w-5 h-5" /></button>
            </div>
            {cart.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/70">
                <div className="text-center"><ShoppingCart className="w-12 h-12 mx-auto mb-2 text-slate-300" />Sepetiniz boş</div>
              </div>
            ) : checkoutMode ? (
              <CheckoutForm storefront={storefront} cart={cart} cartTotal={cartTotal} primary={primary}
                onBack={() => setCheckoutMode(false)}
                onSuccess={() => { setCart([]); setCheckoutMode(false); setCartOpen(false); }} />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {cart.map((c) => (
                    <div key={c.productId} className="flex items-center gap-2 p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.title}</div>
                        <div className="text-xs text-muted-foreground">₺{c.price.toFixed(2)} × {c.qty} = ₺{(c.price * c.qty).toFixed(2)}</div>
                      </div>
                      <button onClick={() => updateQty(c.productId, -1)} className="p-1 border rounded hover:bg-muted/30"><Minus className="w-3 h-3" /></button>
                      <span className="w-6 text-center text-sm">{c.qty}</span>
                      <button onClick={() => updateQty(c.productId, 1)} className="p-1 border rounded hover:bg-muted/30"><Plus className="w-3 h-3" /></button>
                      <button onClick={() => removeFromCart(c.productId)} className="p-1 text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-muted-foreground">Ara Toplam</span>
                    <span className="font-bold text-xl">₺{cartTotal.toFixed(2)}</span>
                  </div>
                  <button onClick={() => setCheckoutMode(true)} className="w-full py-3 rounded text-white font-medium" style={{ background: primary }}>
                    Sipariş Oluştur
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckoutForm({ storefront, cart, cartTotal, primary, onBack, onSuccess }: {
  storefront: Storefront; cart: CartItem[]; cartTotal: number; primary: string;
  onBack: () => void; onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ orderNo: string; redirectUrl?: string; whatsappUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) { setError("Ad soyad gerekli"); return; }
    if (phone.trim().length < 7) { setError("Geçerli bir telefon girin"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/v1/storefronts/${storefront.slug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name, customerPhone: phone, customerEmail: email || undefined,
          customerAddress: address || undefined, note: note || undefined,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.qty })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Sipariş oluşturulamadı");
      setDone({ orderNo: j.orderNo, redirectUrl: j.redirectUrl, whatsappUrl: j.whatsappUrl });
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: primary }}>
          <Check className="w-8 h-8 text-white" />
        </div>
        <h3 className="font-bold text-xl mb-1">Siparişiniz alındı!</h3>
        <p className="text-muted-foreground mb-4">Sipariş No: <span className="font-mono">{done.orderNo}</span></p>
        {done.redirectUrl && (
          <a href={done.redirectUrl} className="px-4 py-2 rounded text-white font-medium mb-2" style={{ background: primary }}>
            Ödemeye Git
          </a>
        )}
        {done.whatsappUrl && (
          <a href={done.whatsappUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded bg-green-600 text-white font-medium mb-2">
            WhatsApp'tan İletişim
          </a>
        )}
        <button onClick={onSuccess} className="text-muted-foreground underline text-sm mt-2">Alışverişe devam et</button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground/90">← Sepete dön</button>
        <Input label="Ad Soyad *" value={name} onChange={setName} />
        <Input label="Telefon *" value={phone} onChange={setPhone} placeholder="05xx xxx xx xx" />
        <Input label="E-posta" value={email} onChange={setEmail} />
        <Input label="Adres" value={address} onChange={setAddress} multi />
        <Input label="Not" value={note} onChange={setNote} multi />
        {error && <div className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</div>}
      </div>
      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center justify-between mb-3">
          <span className="text-muted-foreground">Toplam</span>
          <span className="font-bold text-xl">₺{cartTotal.toFixed(2)}</span>
        </div>
        <button onClick={submit} disabled={submitting} className="w-full py-3 rounded text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: primary }}>
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {storefront.paymentMode === "merchant_pos" ? "Ödemeye Geç" : storefront.paymentMode === "whatsapp_only" ? "WhatsApp ile Sipariş" : "Sipariş Ver"}
        </button>
      </div>
    </>
  );
}

function Input({ label, value, onChange, placeholder, multi }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multi?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm text-foreground/90">{label}</span>
      {multi ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                  className="mt-1 w-full px-3 py-2 border rounded text-sm" rows={2} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
               className="mt-1 w-full px-3 py-2 border rounded text-sm" />
      )}
    </label>
  );
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">{children}</div>;
}
