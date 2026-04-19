import { useState, useRef, useCallback, useEffect } from "react";
import { useListProducts, useGetProductByBarcode } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  PackagePlus, Search, Check, ScanBarcode, Camera, CameraOff,
  SwitchCamera, Loader2, X, History, FileSpreadsheet
} from "lucide-react";
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-context";
import { BulkStockModal } from "@/components/bulk-stock-modal";

interface EntryRow {
  productId: number;
  productCode: string;
  name: string;
  currentStock: number;
  quantity: number;
  purchasePrice: number;
  note: string;
}

function useStockEntry() {
  return useMutation({
    mutationFn: async (data: {
      productId: number;
      quantity: number;
      purchasePrice?: number;
      note?: string;
    }) => {
      const res = await fetch("/api/stock/entry", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Stok girişi başarısız");
      }
      return res.json();
    },
  });
}

export default function StockEntryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const stockEntry = useStockEntry();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [showBulkModal, setShowBulkModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowBulkModal(true);
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedProduct, setSelectedProduct] = useState<EntryRow | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const scanLockRef = useRef(false);

  const { data: searchResults } = useListProducts(
    { query: { enabled: !!debouncedSearch } },
    { search: debouncedSearch, limit: 5 }
  );

  const { data: scannedProduct } = useGetProductByBarcode(
    scannedCode ?? "",
    { query: { enabled: !!scannedCode, retry: false } }
  );

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCameraError(null);
    scanLockRef.current = false;
    try {
      const reader = new ZXingBrowserReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode } },
        videoRef.current,
        (result) => {
          if (result && !scanLockRef.current) {
            scanLockRef.current = true;
            setScannedCode(result.getText());
          }
        }
      );
    } catch {
      setCameraError("Kamera erişim hatası.");
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (controlsRef.current) { controlsRef.current.stop(); controlsRef.current = null; }
    scanLockRef.current = false;
  }, []);

  useEffect(() => {
    if (cameraOpen) { stopCamera(); const t = setTimeout(() => startCamera(), 100); return () => clearTimeout(t); }
    else { stopCamera(); setScannedCode(null); }
  }, [cameraOpen, facingMode, startCamera, stopCamera]);

  useEffect(() => {
    if (scannedProduct) {
      selectProduct(scannedProduct);
      setCameraOpen(false);
      setScannedCode(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedProduct]);

  const selectProduct = (product: any) => {
    setSelectedProduct({
      productId: product.id,
      productCode: product.productCode,
      name: product.name,
      currentStock: product.stock,
      quantity: 1,
      purchasePrice: product.purchasePrice,
      note: "",
    });
    setSearchTerm("");
  };

  const handleSubmit = async () => {
    if (!selectedProduct || selectedProduct.quantity <= 0) return;
    try {
      const result = await stockEntry.mutateAsync({
        productId: selectedProduct.productId,
        quantity: selectedProduct.quantity,
        purchasePrice: selectedProduct.purchasePrice || undefined,
        note: selectedProduct.note || undefined,
      });
      toast({
        title: "Stok girişi kaydedildi",
        description: `${selectedProduct.name} — ${selectedProduct.quantity} adet eklendi. Yeni stok: ${result.newStock}`,
      });
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackagePlus className="h-7 w-7 text-primary" />
            Stok Girişi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Depoya gelen ürünleri kaydedin. Stok otomatik olarak güncellenir.
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setShowBulkModal(true)} className="shrink-0">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Toplu Güncelle
          </Button>
        )}
      </div>

      <BulkStockModal open={showBulkModal} onClose={() => setShowBulkModal(false)} />

      {/* Ürün Seçimi */}
      {!selectedProduct && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ürün Seç</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Kamera ile barkod okuma */}
            <div className="flex gap-2">
              <Button
                variant={cameraOpen ? "destructive" : "outline"}
                size="sm"
                onClick={() => setCameraOpen(v => !v)}
                className="shrink-0"
              >
                {cameraOpen ? <><CameraOff className="h-4 w-4 mr-1.5" />Kapat</> : <><Camera className="h-4 w-4 mr-1.5" />Barkod Tara</>}
              </Button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Ürün adı veya kod ara..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Kamera */}
            {cameraOpen && (
              <div className="relative rounded-lg overflow-hidden bg-zinc-950">
                <video ref={videoRef} className="w-full" style={{ maxHeight: 240 }} playsInline muted />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-24 border-2 border-primary rounded-lg" />
                </div>
                <button
                  className="absolute bottom-2 right-2 bg-zinc-900/80 text-white rounded-full p-2"
                  onClick={() => setFacingMode(m => m === "environment" ? "user" : "environment")}
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90">
                    <p className="text-sm text-destructive text-center px-4">{cameraError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Arama sonuçları */}
            {debouncedSearch && searchResults?.products && (
              <div className="border rounded-md divide-y shadow-sm">
                {searchResults.products.map(p => (
                  <div key={p.id} className="p-3 flex items-center justify-between hover:bg-muted cursor-pointer" onClick={() => selectProduct(p)}>
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.productCode}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={p.stock <= (p.minStock || 5) ? "destructive" : "secondary"}>Stok: {p.stock}</Badge>
                    </div>
                  </div>
                ))}
                {!searchResults.products.length && (
                  <div className="p-4 text-center text-sm text-muted-foreground">Ürün bulunamadı.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Seçilen ürün giriş formu */}
      {selectedProduct && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">{selectedProduct.name}</CardTitle>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedProduct.productCode}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Mevcut Stok: {selectedProduct.currentStock}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedProduct(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Gelen Miktar *</Label>
                <Input
                  type="number"
                  min="1"
                  value={selectedProduct.quantity}
                  onChange={e => setSelectedProduct(p => p && ({ ...p, quantity: parseInt(e.target.value) || 0 }))}
                  className="text-lg font-bold h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Alış Fiyatı (TL)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedProduct.purchasePrice}
                  onChange={e => setSelectedProduct(p => p && ({ ...p, purchasePrice: parseFloat(e.target.value) || 0 }))}
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground">Boş bırakırsanız mevcut fiyat korunur.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Not (isteğe bağlı)</Label>
              <Input
                placeholder="Tedarikçi, irsaliye no, vb."
                value={selectedProduct.note}
                onChange={e => setSelectedProduct(p => p && ({ ...p, note: e.target.value }))}
              />
            </div>

            {/* Özet */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mevcut Stok</span>
                <span className="font-mono">{selectedProduct.currentStock}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Eklenecek</span>
                <span className="font-mono text-emerald-600">+{selectedProduct.quantity || 0}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-2 mt-2">
                <span>Yeni Stok</span>
                <span className="text-primary font-mono text-lg">{selectedProduct.currentStock + (selectedProduct.quantity || 0)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedProduct(null)}>İptal</Button>
              <Button
                className="flex-1 h-12 text-base font-bold"
                disabled={stockEntry.isPending || !selectedProduct.quantity}
                onClick={handleSubmit}
              >
                {stockEntry.isPending
                  ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  : <Check className="h-5 w-5 mr-2" />}
                Stok Girişini Kaydet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bilgi kartı */}
      {!selectedProduct && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-5 flex items-start gap-3">
            <History className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Stok hareketleri</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Her giriş, ürünün stok hareketi geçmişine otomatik olarak "Stok Girişi" olarak kaydedilir.
                Ürün detay sayfasından geçmişi görebilirsiniz.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
