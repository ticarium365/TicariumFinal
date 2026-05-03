import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useGetProductByBarcode, getGetProductByBarcodeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  ScanLine,
  Loader2,
  Search,
  ArrowRight,
  SwitchCamera,
  Volume2,
  Vibrate,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type RecentScan = {
  code: string;
  at: number;
  ok: boolean;
  label: string;
};

const RECENT_MAX = 5;

export default function BarcodeScanner() {
  const [scannedCode, setScannedCode] = useState<string>("");
  const [manualCode, setManualCode] = useState<string>("");
  const [isScanning, setIsScanning] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "err" | "idle">("idle");

  const playFeedback = useCallback((kind: "ok" | "err") => {
    setFeedbackKind(kind);
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = kind === "ok" ? 880 : 220;
        g.gain.value = 0.08;
        o.start();
        setTimeout(() => {
          o.stop();
          ctx.close();
        }, kind === "ok" ? 120 : 200);
      }
    } catch {
      /* no audio */
    }
    try {
      if (kind === "ok" && navigator.vibrate) navigator.vibrate(40);
      if (kind === "err" && navigator.vibrate) navigator.vibrate([30, 40, 30]);
    } catch {
      /* no vibration */
    }
    setTimeout(() => setFeedbackKind("idle"), 600);
  }, []);

  const { data: product, isLoading, isError } = useGetProductByBarcode(
    scannedCode,
    { query: { queryKey: getGetProductByBarcodeQueryKey(scannedCode), enabled: !!scannedCode, retry: false } }
  );

  useEffect(() => {
    if (!scannedCode) return;
    if (isLoading) return;
    const ok = !isError && !!product;
    const label = ok && product ? product.name : "Bulunamadı";
    setRecent((prev) => {
      const next: RecentScan[] = [
        { code: scannedCode, at: Date.now(), ok, label },
        ...prev.filter((r) => r.code !== scannedCode),
      ].slice(0, RECENT_MAX);
      return next;
    });
    playFeedback(ok ? "ok" : "err");
  }, [scannedCode, isLoading, isError, product, playFeedback]);

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
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-8">
      <div>
        <h1
          className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Barkod Tarama
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Okuma alanı büyütüldü; son 5 tarama aşağıda. Ses ve titreşim tarayıcı iznine bağlıdır.
        </p>
      </div>

      <Card className="overflow-hidden bg-zinc-950 text-zinc-50 border-zinc-800 shadow-xl">
        <CardHeader className="bg-zinc-900 border-b border-zinc-800 pb-3">
          <CardTitle className="text-lg flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <ScanLine className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">Tarama alanı</span>
            </span>
            {isScanning && (
              <button
                type="button"
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-2 transition-colors shrink-0"
                onClick={flipCamera}
                title={facingMode === "environment" ? "Ön kameraya geç" : "Arka kameraya geç"}
              >
                <SwitchCamera className="h-4 w-4" />
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isScanning ? (
            <div className="relative aspect-[4/5] sm:aspect-video bg-black">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-6 sm:inset-10 rounded-2xl border-[3px] border-primary/70 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              <div className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/60 animate-pulse" />
              <button
                type="button"
                className="absolute bottom-4 right-4 bg-zinc-900/85 hover:bg-zinc-700/90 text-white rounded-full p-3 z-20 transition-colors"
                onClick={flipCamera}
                title={facingMode === "environment" ? "Ön kameraya geç" : "Arka kameraya geç"}
              >
                <SwitchCamera className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-14 bg-zinc-900 min-h-[280px]">
              <div className="text-center space-y-4 w-full max-w-sm">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700">
                  <ScanLine className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Taranan barkod</p>
                  <p className="text-2xl font-mono tracking-widest mt-1 font-bold text-white break-all">{scannedCode}</p>
                </div>
                <Button onClick={resetScanner} variant="outline" className="text-zinc-950 w-full border-zinc-700">
                  Yeniden Tara
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Badge
          variant="outline"
          className={`gap-1.5 py-1.5 px-3 text-xs ${
            feedbackKind === "ok"
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700"
              : feedbackKind === "err"
                ? "border-red-500/50 bg-red-500/10 text-red-700"
                : ""
          }`}
        >
          {feedbackKind === "ok" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Ses / titreşim: başarılı
            </>
          ) : feedbackKind === "err" ? (
            <>
              <XCircle className="h-3.5 w-3.5" /> Ses / titreşim: uyarı
            </>
          ) : (
            <>
              <Volume2 className="h-3.5 w-3.5" />
              <Vibrate className="h-3.5 w-3.5" /> Geri bildirim hazır
            </>
          )}
        </Badge>
      </div>

      {recent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Son taramalar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {recent.map((r) => (
              <div
                key={`${r.code}-${r.at}`}
                className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground break-all">{r.code}</p>
                  <p className="font-medium truncate">{r.label}</p>
                </div>
                {r.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manuel giriş</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSearch} className="flex gap-2">
            <Input
              placeholder="Barkod veya ürün kodu"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="font-mono"
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
            <CardTitle className="text-lg">Tarama sonucu</CardTitle>
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
                <Link href={`/products/new?barcode=${encodeURIComponent(scannedCode)}`}>
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
                  <p className="text-sm text-muted-foreground">
                    {product.productCode} • {product.category || "Kategorisiz"}
                  </p>
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
                    <Button variant="secondary" className="w-full">
                      Detaylar
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
