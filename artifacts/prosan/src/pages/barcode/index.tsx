import { useState, useEffect, useRef } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library"; // Fallback to zxing/library if browser isn't fully working, though user specified @zxing/browser, @zxing/library is often more reliable in react. We'll use BrowserMultiFormatReader from @zxing/browser.
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useGetProductByBarcode } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ScanLine, Loader2, Search, ArrowRight, Package } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function BarcodeScanner() {
  const [scannedCode, setScannedCode] = useState<string>("");
  const [manualCode, setManualCode] = useState<string>("");
  const [isScanning, setIsScanning] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<ZXingBrowserReader | null>(null);

  const { data: product, isLoading, isError, error } = useGetProductByBarcode(
    scannedCode, 
    { query: { enabled: !!scannedCode, retry: false } }
  );

  useEffect(() => {
    let controls: any;

    const startScanner = async () => {
      if (!videoRef.current) return;
      readerRef.current = new ZXingBrowserReader();
      try {
        const videoInputDevices = await ZXingBrowserReader.listVideoInputDevices();
        if (videoInputDevices.length > 0) {
          const selectedDeviceId = videoInputDevices[0].deviceId;
          controls = await readerRef.current.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current,
            (result, err) => {
              if (result) {
                setScannedCode(result.getText());
                setIsScanning(false);
                // controls.stop();
              }
            }
          );
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    };

    if (isScanning) {
      startScanner();
    }

    return () => {
      if (controls) {
        controls.stop();
      }
    };
  }, [isScanning]);

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Barkod Tarama</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden bg-zinc-950 text-zinc-50 border-zinc-800">
          <CardHeader className="bg-zinc-900 border-b border-zinc-800 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Kamera
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative aspect-square md:aspect-auto md:h-[400px] flex flex-col">
            {isScanning ? (
              <div className="relative flex-1 bg-black">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-[4px] border-primary/50 m-12 rounded-lg z-10 pointer-events-none">
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-primary/80 animate-pulse shadow-[0_0_8px_2px_rgba(234,88,12,0.6)]"></div>
                </div>
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
                    
                    <div className="grid grid-cols-2 gap-2 bg-muted/50 p-3 rounded-md">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Stok</p>
                        <p className="text-lg font-mono font-bold">{product.stock}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Fiyat</p>
                        <p className="text-lg font-bold text-primary">{product.salePrice.toFixed(2)} TL</p>
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