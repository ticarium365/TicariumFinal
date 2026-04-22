import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useListProducts, useCreateSale, useGetTodaySales, useGetProductByBarcode, getGetTodaySalesQueryKey, getListProductsQueryKey, getGetProductByBarcodeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Package, ScanBarcode, X, Loader2, Camera, CameraOff, SwitchCamera, Banknote, CreditCard, ArrowLeftRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

interface CartItem {
  productId: number;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

export default function SalesScreen() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSale = useCreateSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "other">("cash");

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
          data: { productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, paymentMethod }
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
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* Sol Panel */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Barkod Kamera Paneli */}
        <Card className={`overflow-hidden transition-all ${cameraOpen ? "border-primary shadow-md" : ""}`}>
          <CardHeader className="pb-3 pt-4 px-4 border-b bg-zinc-950 text-white">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ScanBarcode className="h-5 w-5 text-primary" />
                Barkod ile Ürün Ekle
              </CardTitle>
              <Button
                variant={cameraOpen ? "destructive" : "outline"}
                size="sm"
                className={cameraOpen ? "" : "bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"}
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
                  style={{ maxHeight: 280, background: "#000" }}
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
                <button
                  className="absolute bottom-2 right-2 bg-zinc-900/80 hover:bg-zinc-700/90 text-white rounded-full p-2 z-20 transition-colors"
                  onClick={() => setFacingMode(m => m === "environment" ? "user" : "environment")}
                  title={facingMode === "environment" ? "Ön kameraya geç" : "Arka kameraya geç"}
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
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
                className="pl-10 h-12 text-base"
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
              <div className="flex flex-col items-center justify-center text-muted-foreground p-8 gap-3 min-h-[120px]">
                <Package className="h-12 w-12 opacity-20" />
                <p className="text-sm">Sepet boş. Barkod okutun veya ürün arayın.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-background sticky top-0">
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-center w-[120px]">Adet</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.map(item => (
                    <TableRow key={item.productId}>
                      <TableCell className="py-2">
                        <p className="font-medium text-sm leading-tight">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{item.productCode} · {Number(item.unitPrice).toFixed(2)} TL</p>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center justify-center gap-1 bg-muted/50 rounded-md p-1 border">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.productId, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-7 text-center font-bold font-mono text-sm">{item.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.productId, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm py-2">{(item.quantity * item.unitPrice).toFixed(2)} TL</TableCell>
                      <TableCell className="py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => removeFromCart(item.productId)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sağ Panel — Ödeme & Özet */}
      <div className="w-full lg:w-72 flex flex-col gap-4">
        <Card className="bg-zinc-950 text-white border-zinc-800 shadow-xl">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Ödenecek Tutar</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-4xl font-bold tracking-tighter text-primary">
              {totalAmount.toFixed(2)}
              <span className="text-xl ml-1 text-zinc-300">TL</span>
            </div>

            {/* Ödeme Yöntemi */}
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {([
                { value: "cash", label: "Nakit", Icon: Banknote },
                { value: "card", label: "Kart", Icon: CreditCard },
                { value: "transfer", label: "Havale", Icon: ArrowLeftRight },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setPaymentMethod(value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2 px-1 text-xs font-medium transition-colors ${
                    paymentMethod === value
                      ? "border-primary bg-primary text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <Button
                size="lg"
                className="w-full h-14 text-base font-bold shadow-lg"
                disabled={cart.length === 0 || createSale.isPending}
                onClick={completeSale}
              >
                {createSale.isPending
                  ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  : <CheckCircle2 className="mr-2 h-5 w-5" />}
                Satışı Tamamla
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full text-zinc-950"
                disabled={cart.length === 0}
                onClick={() => setCart([])}
              >
                Sepeti Temizle
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader className="pb-2 border-b py-3 px-4">
            <CardTitle className="text-sm font-medium">Günlük Özet</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 pb-4 px-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Satış Sayısı</span>
              <span className="font-bold font-mono">{todaySales?.totalSales || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Satılan Ürün</span>
              <span className="font-bold font-mono">{todaySales?.totalQuantity || 0}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-bold">Günlük Ciro</span>
              <span className="font-bold text-primary">{(todaySales?.grossRevenue || 0).toFixed(2)} TL</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
