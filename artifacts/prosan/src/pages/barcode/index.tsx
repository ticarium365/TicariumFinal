import { useState, useEffect, useRef } from "react";
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useGetProductByBarcode } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ScanLine, Loader2, Search, ArrowRight, SwitchCamera } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function BarcodeScanner() {
  const [scannedCode, setScannedCode] = useState<string>("");
  const [manualCode, setManualCode] = useState<string>("");
  const [isScanning, setIsScanning] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);

  const { data: product, isLoading, isError } = useGetProductByBarcode(
    scannedCode,
    { query: { enabled: !!scannedCode, retry: false } }
  );

  useEffect(() => {
    if (!isScanning) return;

    const startScanner = async () => {
      if (!videoRef.current) return;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      const reader = new ZXingBrowserReader();
      try {
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode } },
          videoRef.current,
          (result) => {
            if (result) {
              setScannedCode(result.getText());
              setIsScanning(false);
            }
          }
        );
      } catch (err) {
        console.error("Camera access error:", err);
      }
    };

    const t = setTimeout(startScanner, 100);
    return () => {
      clearTimeout(t);
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [isScanning, facingMode]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode) {
      setScannedCode(manualCode);
      setIsScanning(false);
    }
  };

  const resetScanner = () => {
    setScannedCode("");
    setManualCode("");
    setIsScanning(true);
  };

  const flipCamera = () => {
    setFacingMode(m => m === "environment" ? "user" : "environment");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Barkod Tarama</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden bg-zinc-950 text-zinc-50 border-zinc-800">
          <CardHeader className="bg-zinc-900 border-b border-zinc-800 pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-primary" />
                Kamera
              </span>
              {isScanning && (
                <button
                  className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-1.5 transition-colors"
                  onClick={flipCamera}
                  title={facingMode === "environment" ? "Ön kameraya geç" : "Arka kameraya geç"}
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative aspect-square md:aspect-auto md:h-[400px] flex flex-col">
            {isScanning ? (
              <div className="relative flex-1 bg-black">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 border-[4px] border-primary/50 m-12 rounded-lg z-10 pointer-events-none">
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-primary/80 animate-pulse shadow-[0_0_8px_2px_rgba(234,88,12,0.6)]"></div>
                </div>
                {/* Kamera çevir butonu (video üzerinde) */}
                <button
                  className="absolute bottom-3 right-3 bg-zinc-900/80 hover:bg-zinc-700/90 text-white rounded-full p-2 z-20 transition-colors"
                  onClick={flipCamera}
                  title={facingMode === "environment" ? "Ön kameraya geç" : "Arka kameraya geç"}
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-900">
                <div className="text-center space-y-4">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700">
                    <ScanLine className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Taranan Barkod</p>
                    <p className="text-2xl font-mono tracking-widest mt-1 font-bold text-white">{scannedCode}</p>
                  </div>
                  <Button onClick={resetScanner} variant="outline" className="text-zinc-950 w-full border-zinc-700">
                    Yeniden Tara
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Manuel Giriş</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualSearch} className="flex gap-2">
                <Input
                  placeholder="Barkod veya ürün kodu"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                />
                <Button type="submit">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {scannedCode && (
            <Card className="border-primary/50 shadow-md">
              <CardHeader className="pb-3 border-b bg-muted/30">
                <CardTitle className="text-lg">Tarama Sonucu</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : isError || !product ? (
                  <div className="text-center py-6 space-y-4">
                    <div className="text-destructive font-medium">Ürün bulunamadı</div>
                    <p className="text-sm text-muted-foreground">Sistemde bu barkoda ({scannedCode}) sahip bir ürün yok.</p>
                    <Link href={`/products/new?barcode=${scannedCode}`}>
                      <Button className="w-full mt-2">
                        Yeni Ürün Ekle
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-xl">{product.name}</h3>
                      <p className="text-sm text-muted-foreground">{product.productCode} • {product.category || 'Kategorisiz'}</p>
                    </div>

                    <div className="bg-muted/50 p-3 rounded-md space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Stok</p>
                          <p className="text-lg font-mono font-bold">{product.stock}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Alış</p>
                          <p className="text-base font-semibold">{product.purchasePrice.toFixed(2)} TL</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Satış Fiyatı</p>
                          <p className="text-lg font-bold text-primary">{product.salePrice.toFixed(2)} TL</p>
                        </div>
                        {(product.discountSalePct ?? 0) > 0 && (
                          <div>
                            <p className="text-xs text-amber-600 uppercase tracking-wider font-semibold">İskontolu Fiyat</p>
                            <p className="text-lg font-bold text-amber-600">
                              {(product.purchasePrice * (1 + (product.discountSalePct ?? 0) / 100)).toFixed(2)} TL
                            </p>
                            <p className="text-[10px] text-muted-foreground">%{(product.discountSalePct ?? 0).toFixed(1)} marj</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Link href={`/sales?product=${product.id}`} className="flex-1">
                        <Button className="w-full">Satışa Ekle</Button>
                      </Link>
                      <Link href={`/products/${product.id}`} className="flex-1">
                        <Button variant="secondary" className="w-full">Detaylar</Button>
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
