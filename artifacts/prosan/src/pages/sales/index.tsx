import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useListProducts, useCreateSale, useGetTodaySales, useGetProductByBarcode, getGetTodaySalesQueryKey, getListProductsQueryKey, getGetProductByBarcodeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Package, ScanBarcode, X, Loader2, Camera, CameraOff, SwitchCamera, Banknote, CreditCard, ArrowLeftRight, ChevronsUpDown, User } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { Customer } from "@/pages/customers/types";

interface CartItem {
  productId: number;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

function CartLineRow({
  item,
  onDec,
  onInc,
  onRemove,
}: {
  item: CartItem;
  onDec: () => void;
  onInc: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex gap-2 border-b border-[color:var(--color-border-subtle)] py-3 last:border-b-0"
      data-testid={`cart-line-${item.productId}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-[var(--font-weight-medium)] leading-tight text-[color:var(--color-neutral-900)]">{item.name}</p>
        <p className="mt-0.5 font-mono text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-500)]">
          {item.productCode} · {Number(item.unitPrice).toFixed(2)} TL
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] bg-[var(--color-neutral-100)] p-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDec} aria-label="Azalt">
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-7 text-center font-mono text-sm font-[var(--font-weight-bold)]">{item.quantity}</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onInc} aria-label="Arttır">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-[var(--font-weight-bold)] text-[color:var(--color-brand-700)]">
          {(item.quantity * item.unitPrice).toFixed(2)} TL
        </p>
        <Button type="button" variant="ghost" size="icon" className="mt-1 h-7 w-7 text-[color:var(--color-semantic-danger)]" onClick={onRemove} aria-label="Kaldır">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CustomerCombobox({
  customers,
  value,
  onChange,
}: {
  customers: Customer[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value != null ? customers.find((c) => c.id === value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          className="justify-between font-normal"
          aria-expanded={open}
          data-testid="sales-customer-combobox"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-brand-500)] text-sm font-[var(--font-weight-bold)] text-[color:var(--color-semantic-info-fg)]">
                {selected.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate font-[var(--font-weight-medium)] text-[color:var(--color-neutral-900)]">{selected.name}</span>
                <span className="block truncate font-mono text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-500)]">
                  VN: {selected.taxNumber?.trim() || "—"}
                </span>
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[color:var(--color-neutral-600)]">
              <User className="h-4 w-4 shrink-0" />
              Müşteri seç (isteğe bağlı)
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(calc(100vw-2rem),22rem)] p-0"
        align="start"
        side="bottom"
      >
        <Command>
          <CommandInput placeholder="İsim, kod veya vergi no ara…" />
          <CommandList>
            <CommandEmpty>Kayıt bulunamadı.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__walkin"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Perakende (müşterisiz)
              </CommandItem>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.code} ${c.taxNumber ?? ""}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-neutral-200)] text-xs font-[var(--font-weight-bold)] text-[color:var(--color-neutral-800)]">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-[var(--font-weight-medium)]">{c.name}</span>
                      <span className="block truncate font-mono text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-500)]">
                        {c.code} · VN {c.taxNumber?.trim() || "—"}
                      </span>
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SalesScreen() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSale = useCreateSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "other">("cash");

  const { data: customersList = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers", "sales-screen"],
    queryFn: async () => {
      const r = await fetch("/api/customers?limit=500", { credentials: "include" });
      const d = await r.json();
      return Array.isArray(d) ? d : (d.customers ?? d.items ?? d.data ?? []);
    },
    staleTime: 60_000,
  });

  // Barkod kamera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const scanLockRef = useRef(false);

  const { data: searchResults, isLoading: searching } = useListProducts(
    { search: debouncedSearch, limit: 5 },
    { query: { queryKey: getListProductsQueryKey({ search: debouncedSearch, limit: 5 }), enabled: !!debouncedSearch } }
  );

  const { data: todaySales } = useGetTodaySales();

  const { data: scannedProduct, isLoading: scanLoading } = useGetProductByBarcode(
    scannedCode ?? "",
    { query: { queryKey: getGetProductByBarcodeQueryKey(scannedCode ?? ""), enabled: !!scannedCode, retry: false } }
  );

  // Kamerayı başlat
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCameraError(null);
    scanLockRef.current = false;
    try {
      const reader = new ZXingBrowserReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode } },
        videoRef.current,
        (result, err) => {
          if (result && !scanLockRef.current) {
            scanLockRef.current = true;
            setScannedCode(result.getText());
          }
        }
      );
    } catch (err: any) {
      setCameraError("Kamera erişim hatası. İzin verdiğinizden emin olun.");
    }
  }, [facingMode]);

  // Kamerayı durdur
  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    scanLockRef.current = false;
  }, []);

  useEffect(() => {
    if (cameraOpen) {
      stopCamera();
      const t = setTimeout(() => startCamera(), 100);
      return () => clearTimeout(t);
    } else {
      stopCamera();
      setScannedCode(null);
      return undefined;
    }
  }, [cameraOpen, facingMode, startCamera, stopCamera]);

  // Tekrar tara: okunan kodu sıfırla ve kilidi aç
  const rescan = () => {
    setScannedCode(null);
    scanLockRef.current = false;
  };

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast({ title: "Uyarı", description: "Yetersiz stok.", variant: "destructive" });
          return prev;
        }
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (product.stock <= 0) {
        toast({ title: "Uyarı", description: "Ürün stokta yok.", variant: "destructive" });
        return prev;
      }
      return [...prev, {
        productId: product.id,
        productCode: product.productCode,
        name: product.name,
        unitPrice: product.salePrice,
        quantity: 1,
        stock: product.stock,
      }];
    });
    setSearchTerm("");
  };

  const addScannedToCart = () => {
    if (!scannedProduct) return;
    addToCart(scannedProduct);
    toast({ title: "Sepete eklendi", description: scannedProduct.name });
    rescan();
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQ = item.quantity + delta;
        if (newQ > item.stock) {
          toast({ title: "Uyarı", description: "Yetersiz stok.", variant: "destructive" });
          return item;
        }
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const completeSale = async () => {
    if (cart.length === 0) return;
    try {
      await Promise.all(cart.map(item =>
        createSale.mutateAsync({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            paymentMethod,
            customerId: customerId ?? undefined,
          },
        })
      ));
      toast({ title: "Başarılı", description: "Satış tamamlandı." });
      setCart([]);
      queryClient.invalidateQueries({ queryKey: getGetTodaySalesQueryKey() });
    } catch {
      toast({ title: "Hata", description: "Satış tamamlanamadı.", variant: "destructive" });
    }
  };

  const totalAmount = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const totalItems = cart.reduce((a, c) => a + c.quantity, 0);

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-6">
      <PageHeader
        title="Satış Ekranı"
        subtitle="Barkod veya arama ile ürün ekleyin; müşteri ve ödeme yöntemini seçerek satışı tamamlayın."
      />
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* Sol Panel */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Barkod Kamera Paneli */}
        <Card className={`overflow-hidden transition-all ${cameraOpen ? "ring-2 ring-[color:color-mix(in_srgb,var(--color-brand-500)_45%,transparent)]" : ""}`}>
          <CardHeader className="border-b border-[color:var(--color-nav-800)] bg-[var(--color-nav-900)] pb-3 pt-4 text-[color:var(--color-nav-text-active)]">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-[color:var(--color-nav-text-active)]">
                <ScanBarcode className="h-5 w-5 text-[color:var(--color-brand-200)]" />
                Barkod ile Ürün Ekle
              </CardTitle>
              <Button
                variant={cameraOpen ? "danger" : "secondary"}
                size="sm"
                onClick={() => setCameraOpen(v => !v)}
              >
                {cameraOpen ? (
                  <><CameraOff className="h-4 w-4 mr-1.5" />Kapat</>
                ) : (
                  <><Camera className="h-4 w-4 mr-1.5" />Kamera Aç</>
                )}
              </Button>
            </div>
          </CardHeader>

          {cameraOpen && (
            <CardContent className="p-0 bg-zinc-950">
              {/* Kamera görüntüsü */}
              <div className="relative w-full" style={{ maxHeight: 280 }}>
                <video
                  ref={videoRef}
                  className="w-full object-cover"
                  style={{ maxHeight: 280, background: "var(--color-neutral-900)" }}
                  playsInline
                  muted
                />
                {/* Tarama çerçevesi */}
                {!scannedCode && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-32 border-2 border-primary rounded-lg">
                      <div className="absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-primary animate-pulse shadow-[0_0_6px_1px_rgba(249,115,22,0.7)]" />
                    </div>
                  </div>
                )}
                {/* Kamera çevir butonu */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute bottom-2 right-2 z-20 rounded-[var(--radius-full)] bg-[color:color-mix(in_srgb,var(--color-neutral-900)_55%,transparent)] text-[color:var(--color-nav-text-active)] hover:bg-[color:color-mix(in_srgb,var(--color-neutral-900)_72%,transparent)]"
                  onClick={() => setFacingMode(m => m === "environment" ? "user" : "environment")}
                  title={facingMode === "environment" ? "Ön kameraya geç" : "Arka kameraya geç"}
                >
                  <SwitchCamera className="h-5 w-5" />
                </Button>
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90">
                    <p className="text-sm text-destructive text-center px-4">{cameraError}</p>
                  </div>
                )}
              </div>

              {/* Taranan ürün önizlemesi */}
              {scannedCode && (
                <div className="p-4 bg-zinc-900 border-t border-zinc-800">
                  {scanLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-zinc-300">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-sm">Ürün aranıyor...</span>
                    </div>
                  ) : !scannedProduct ? (
                    <div className="space-y-3">
                      <p className="text-sm text-destructive font-medium">Ürün bulunamadı</p>
                      <p className="text-xs text-zinc-400 font-mono">{scannedCode}</p>
                      <Button variant="outline" size="sm" onClick={rescan} className="bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700 w-full">
                        Tekrar Tara
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-white leading-tight">{scannedProduct.name}</p>
                          <p className="text-xs text-zinc-400 font-mono mt-0.5">{scannedProduct.productCode}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-primary">{Number(scannedProduct.salePrice).toFixed(2)} TL</p>
                          <Badge variant={scannedProduct.stock > 0 ? "secondary" : "destructive"} className="text-xs">
                            Stok: {scannedProduct.stock}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 h-12 text-base font-bold" onClick={addScannedToCart} disabled={scannedProduct.stock <= 0}>
                          <ShoppingCart className="mr-2 h-5 w-5" />
                          Sepete Ekle
                        </Button>
                        <Button variant="outline" className="h-12 px-4 bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700" onClick={rescan}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!scannedCode && !cameraError && (
                <div className="py-2 pb-3 text-center text-xs text-zinc-500">
                  Barkodu çerçeve içine tutun
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Manuel Arama */}
        <Card>
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="sales-product-search"
                className="h-12 pl-10 text-base"
                placeholder="Ürün adı, kod veya barkod ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {debouncedSearch && searchResults?.products && (
              <div className="mt-2 border rounded-md divide-y shadow-sm">
                {searchResults.products.map(product => (
                  <div
                    key={product.id}
                    className="p-3 flex items-center justify-between hover:bg-muted cursor-pointer transition-colors active:bg-muted"
                    onClick={() => addToCart(product)}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{product.barcode || product.productCode} · Stok: {product.stock}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-bold text-primary">{Number(product.salePrice).toFixed(2)} TL</p>
                    </div>
                  </div>
                ))}
                {searchResults.products.length === 0 && !searching && (
                  <div className="p-4 text-center text-muted-foreground text-sm">Ürün bulunamadı.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sepet */}
        <Card className="flex-1 flex flex-col overflow-hidden min-h-[200px]">
          <CardHeader className="pb-2 border-b bg-muted/20 flex-none py-3 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Sepet
              {totalItems > 0 && (
                <Badge className="ml-1">{totalItems} ürün</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex min-h-[140px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-subtle)] bg-[var(--color-neutral-50)]">
                  <Package className="h-10 w-10 text-[color:var(--color-neutral-400)]" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-[var(--font-weight-medium)] text-[color:var(--color-neutral-800)]">Sepet boş</p>
                  <p className="text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-600)]">
                    Barkod okutun veya ürün arayarak satıra ekleyin.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const el = document.getElementById("sales-product-search");
                    el?.focus();
                  }}
                >
                  Ürün ara
                </Button>
              </div>
            ) : (
              <div className="px-4 py-2">
                {cart.map((item) => (
                  <CartLineRow
                    key={item.productId}
                    item={item}
                    onDec={() => updateQuantity(item.productId, -1)}
                    onInc={() => updateQuantity(item.productId, 1)}
                    onRemove={() => removeFromCart(item.productId)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sağ Panel — Ödeme & Özet (masaüstü) */}
      <div className="hidden w-full flex-col gap-4 lg:flex lg:w-72">
        <Card className="border-[color:var(--color-nav-800)] bg-[var(--color-nav-900)] text-[color:var(--color-nav-text-active)] shadow-[var(--shadow-lg)]">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-xs font-[var(--font-weight-medium)] uppercase tracking-wider text-[color:var(--color-nav-text)]">
              Ödenecek Tutar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            <div>
              <p className="mb-2 text-[length:var(--font-size-xs)] text-[color:var(--color-nav-text)]">Müşteri</p>
              <CustomerCombobox customers={customersList} value={customerId} onChange={setCustomerId} />
            </div>
            <div>
              <span className="text-4xl font-[var(--font-weight-bold)] tracking-tight text-[color:var(--color-brand-200)]">
                {totalAmount.toFixed(2)}
              </span>
              <span className="ml-1 text-xl text-[color:var(--color-nav-text)]">TL</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {([
                { value: "cash" as const, label: "Nakit", Icon: Banknote },
                { value: "card" as const, label: "Kart", Icon: CreditCard },
                { value: "transfer" as const, label: "Havale", Icon: ArrowLeftRight },
              ]).map(({ value, label, Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={paymentMethod === value ? "primary" : "ghost"}
                  size="sm"
                  className={
                    paymentMethod === value
                      ? "flex h-auto flex-col gap-1 py-2"
                      : "flex h-auto flex-col gap-1 border border-[color:var(--color-nav-700)] bg-transparent py-2 text-[color:var(--color-nav-text)] hover:bg-[var(--color-nav-item-hover)]"
                  }
                  onClick={() => setPaymentMethod(value)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Button
                size="lg"
                className="h-14 w-full text-base font-[var(--font-weight-bold)]"
                disabled={cart.length === 0 || createSale.isPending}
                onClick={completeSale}
              >
                {createSale.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                )}
                Satışı Tamamla
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full border-[color:var(--color-border-subtle)] text-[color:var(--color-neutral-900)]"
                disabled={cart.length === 0}
                onClick={() => setCart([])}
              >
                Sepeti Temizle
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card variant="flat">
          <CardHeader className="border-b border-[color:var(--color-border-subtle)] py-3">
            <CardTitle className="text-sm font-[var(--font-weight-medium)] text-[color:var(--color-neutral-900)]">Günlük Özet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[color:var(--color-neutral-600)]">Satış Sayısı</span>
              <span className="font-mono font-[var(--font-weight-bold)]">{todaySales?.totalSales || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[color:var(--color-neutral-600)]">Satılan Ürün</span>
              <span className="font-mono font-[var(--font-weight-bold)]">{todaySales?.totalQuantity || 0}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[color:var(--color-border-subtle)] pt-2">
              <span className="text-sm font-[var(--font-weight-semibold)] text-[color:var(--color-neutral-900)]">Günlük Ciro</span>
              <span className="font-[var(--font-weight-bold)] text-[color:var(--color-brand-700)]">{(todaySales?.grossRevenue || 0).toFixed(2)} TL</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobil: yapışkan özet çubuğu */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-3 shadow-[var(--shadow-lg)] lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 space-y-2">
          <p className="text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-600)]">Müşteri</p>
          <CustomerCombobox customers={customersList} value={customerId} onChange={setCustomerId} />
        </div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-600)]">Toplam</p>
            <p className="text-xl font-[var(--font-weight-bold)] text-[color:var(--color-brand-700)]">{totalAmount.toFixed(2)} TL</p>
          </div>
          <div className="flex gap-1">
            {(["cash", "card", "transfer"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={paymentMethod === v ? "primary" : "secondary"}
                className="min-w-[4rem] px-2"
                onClick={() => setPaymentMethod(v)}
              >
                {v === "cash" ? "Nakit" : v === "card" ? "Kart" : "Havale"}
              </Button>
            ))}
          </div>
        </div>
        <Button
          size="lg"
          className="h-12 w-full font-[var(--font-weight-bold)]"
          disabled={cart.length === 0 || createSale.isPending}
          onClick={completeSale}
        >
          {createSale.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
          Satışı Tamamla
        </Button>
      </div>
    </div>
    </div>
  );
}
