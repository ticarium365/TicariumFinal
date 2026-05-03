import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  useListProducts,
  getListProductsQueryKey,
  customFetch,
  ApiError,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PackagePlus, Search, Check, Camera, CameraOff,
  SwitchCamera, Loader2, X, History, FileSpreadsheet,
  Save,
} from "lucide-react";
import { BrowserMultiFormatReader as ZXingBrowserReader } from "@zxing/browser";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-context";
import { BulkStockModal } from "@/components/bulk-stock-modal";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/skeleton";

const DRAFT_KEY = "ticarium-stock-entry-draft-v1";

interface EntryLine {
  id: string;
  barcode: string;
  productId: number | null;
  name: string;
  qty: number;
  error?: string;
}

function newLine(): EntryLine {
  return {
    id: crypto.randomUUID(),
    barcode: "",
    productId: null,
    name: "",
    qty: 1,
  };
}

function useStockEntry() {
  return useMutation({
    mutationFn: async (data: {
      productId: number;
      quantity: number;
      purchasePrice?: number;
      note?: string;
    }) => {
      try {
        return await customFetch("/api/stock/entry", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          responseType: "json",
        });
      } catch (e: unknown) {
        if (e instanceof ApiError) {
          const body = e.data as { message?: string } | null;
          throw new Error(body?.message ?? e.message ?? "Stok girişi başarısız");
        }
        throw e;
      }
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

  const [lines, setLines] = useState<EntryLine[]>(() => [newLine()]);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const barcodeRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowBulkModal(true);
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as EntryLine[];
      if (Array.isArray(parsed) && parsed.length && parsed.every((l) => l.id && typeof l.barcode === "string")) {
        setLines(parsed.map((l) => ({ ...newLine(), ...l, id: l.id || crypto.randomUUID() })));
        toast({ title: "Taslak yüklendi", description: "Kaydedilmiş satırlar geri getirildi." });
      }
    } catch {
      /* ignore */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(lines));
        setDraftSavedAt(Date.now());
      } catch {
        /* ignore */
      }
    }, 400);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [lines]);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const scanLockRef = useRef(false);

  const { data: searchResults, isFetching: searchProductsFetching } = useListProducts(
    { search: debouncedSearch, limit: 8 },
    { query: { queryKey: getListProductsQueryKey({ search: debouncedSearch, limit: 8 }), enabled: !!debouncedSearch } }
  );

  const appendResolvedLine = useCallback((product: { id: number; name: string; productCode: string }) => {
    setLines((prev) => {
      const empty = prev.find((l) => !l.productId && !l.barcode.trim());
      if (empty) {
        const targetId = empty.id;
        setTimeout(() => qtyRefs.current[targetId]?.focus(), 0);
        return prev.map((l) =>
          l.id === empty.id
            ? {
                ...l,
                barcode: product.productCode,
                productId: product.id,
                name: product.name,
                qty: Math.max(1, l.qty || 1),
                error: undefined,
              }
            : l
        );
      }
      const nl = {
        id: crypto.randomUUID(),
        barcode: product.productCode,
        productId: product.id,
        name: product.name,
        qty: 1,
      };
      setTimeout(() => qtyRefs.current[nl.id]?.focus(), 0);
      return [...prev, nl];
    });
    setSearchTerm("");
  }, []);

  useEffect(() => {
    if (!scannedCode) return;
    const code = scannedCode;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/products/barcode/${encodeURIComponent(code)}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) {
          toast({ title: "Bulunamadı", description: "Bu barkoda ürün yok.", variant: "destructive" });
          return;
        }
        const product = await res.json();
        appendResolvedLine(product);
      } catch {
        /* aborted */
      } finally {
        setScannedCode(null);
        setCameraOpen(false);
      }
    })();
    return () => ac.abort();
  }, [scannedCode, appendResolvedLine, toast]);

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
    }
    stopCamera();
    return undefined;
  }, [cameraOpen, facingMode, startCamera, stopCamera]);

  const resolveBarcode = useCallback(async (lineId: string, code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, productId: null, name: "", error: undefined } : l)));
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, error: undefined } : l)));
    try {
      const res = await fetch(`/api/products/barcode/${encodeURIComponent(trimmed)}`, { credentials: "include" });
      if (!res.ok) {
        setLines((prev) =>
          prev.map((l) =>
            l.id === lineId ? { ...l, productId: null, name: "", error: "Ürün bulunamadı" } : l
          )
        );
        return;
      }
      const product = await res.json();
      setLines((prev) => {
        const next = prev.map((l) =>
          l.id === lineId
            ? {
                ...l,
                barcode: trimmed,
                productId: product.id,
                name: product.name,
                error: undefined,
              }
            : l
        );
        const hasEmpty = next.some((l) => !l.productId && !l.barcode.trim());
        if (!hasEmpty) next.push(newLine());
        return next;
      });
      setTimeout(() => qtyRefs.current[lineId]?.focus(), 0);
    } catch {
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, error: "Ağ hatası" } : l))
      );
    }
  }, []);

  const runningTotalQty = useMemo(
    () => lines.filter((l) => l.productId && l.qty > 0).reduce((s, l) => s + l.qty, 0),
    [lines]
  );
  const readyLines = useMemo(() => lines.filter((l) => l.productId && l.qty > 0), [lines]);

  const focusNextBarcode = useCallback((currentId: string) => {
    const idx = lines.findIndex((l) => l.id === currentId);
    const next = lines[idx + 1];
    if (next) {
      setTimeout(() => barcodeRefs.current[next.id]?.focus(), 0);
    } else {
      const nl = newLine();
      setLines((prev) => [...prev, nl]);
      setTimeout(() => barcodeRefs.current[nl.id]?.focus(), 0);
    }
  }, [lines]);

  const handleSaveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(lines));
      setDraftSavedAt(Date.now());
      toast({ title: "Taslak kaydedildi", description: `${lines.length} satır yerel olarak saklandı.` });
    } catch {
      toast({ title: "Kaydedilemedi", variant: "destructive" });
    }
  }, [lines, toast]);

  const handleFinalize = async () => {
    if (!readyLines.length) {
      toast({ title: "Satır yok", description: "Önce barkod okutup miktar girin.", variant: "destructive" });
      return;
    }
    setFinalizing(true);
    let ok = 0;
    for (const line of readyLines) {
      try {
        await stockEntry.mutateAsync({
          productId: line.productId!,
          quantity: line.qty,
        });
        ok++;
      } catch (e: unknown) {
        toast({
          title: "Kısmi hata",
          description: e instanceof Error ? e.message : "Kayıt başarısız",
          variant: "destructive",
        });
      }
    }
    setFinalizing(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    localStorage.removeItem(DRAFT_KEY);
    setLines([newLine()]);
    setDraftSavedAt(null);
    toast({
      title: "Stok girişi tamamlandı",
      description: `${ok}/${readyLines.length} satır işlendi.`,
    });
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setLines([newLine()]);
    setDraftSavedAt(null);
    toast({ title: "Taslak temizlendi" });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-36">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackagePlus className="h-7 w-7 text-primary" />
            Stok Girişi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Barkod alanı odaklıdır: Enter miktar alanına geçer, Tab sonraki satıra. Taslak tarayıcıda saklanır.
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hızlı giriş</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={cameraOpen ? "destructive" : "outline"}
              size="sm"
              type="button"
              onClick={() => setCameraOpen((v) => !v)}
              className="shrink-0"
            >
              {cameraOpen ? (
                <>
                  <CameraOff className="h-4 w-4 mr-1.5" />
                  Kapat
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-1.5" />
                  Barkod Tara
                </>
              )}
            </Button>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Ürün adı veya kod ile ara (liste)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {cameraOpen && (
            <div className="relative rounded-lg overflow-hidden bg-zinc-950">
              <video ref={videoRef} className="w-full" style={{ maxHeight: 240 }} playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-24 border-2 border-primary rounded-lg" />
              </div>
              <button
                type="button"
                className="absolute bottom-2 right-2 bg-zinc-900/80 text-white rounded-full p-2"
                onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
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

          {debouncedSearch && (
            <div className="border rounded-md divide-y shadow-sm max-h-48 overflow-y-auto">
              {searchProductsFetching ? (
                <div className="divide-y">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <SkeletonLine width="72%" height={16} />
                        <SkeletonLine width="40%" height={12} />
                      </div>
                      <SkeletonBlock width={72} height={22} borderRadius={9999} />
                    </div>
                  ))}
                </div>
              ) : searchResults?.products ? (
                <>
                  {searchResults.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full p-3 flex items-center justify-between hover:bg-muted text-left"
                      onClick={() => {
                        appendResolvedLine(p);
                        setSearchTerm("");
                      }}
                    >
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.productCode}</p>
                      </div>
                      <Badge tone={p.stock <= (p.minStock || 5) ? "danger" : "neutral"}>
                        Stok: {p.stock}
                      </Badge>
                    </button>
                  ))}
                  {!searchResults.products.length && (
                    <div className="p-4 text-center text-sm text-muted-foreground">Ürün bulunamadı.</div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Satırlar</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const nl = newLine();
              setLines((prev) => [...prev, nl]);
              setTimeout(() => barcodeRefs.current[nl.id]?.focus(), 0);
            }}
          >
            Satır ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 w-[30%]">Barkod / Kod</th>
                  <th className="px-3 py-2">Ürün</th>
                  <th className="px-3 py-2 w-28 text-center">Miktar</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, index) => (
                  <tr key={line.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 align-top">
                      <Input
                        ref={(el) => {
                          barcodeRefs.current[line.id] = el;
                        }}
                        className="font-mono h-9"
                        placeholder="Okut veya yaz..."
                        value={line.barcode}
                        autoFocus={index === 0}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.id === line.id
                                ? { ...l, barcode: e.target.value, productId: null, name: "", error: undefined }
                                : l
                            )
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            resolveBarcode(line.id, line.barcode);
                          } else if (e.key === "Tab" && !e.shiftKey) {
                            e.preventDefault();
                            focusNextBarcode(line.id);
                          }
                        }}
                      />
                      {line.error && <p className="text-[10px] text-destructive mt-0.5">{line.error}</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {line.productId ? (
                        <span className="text-sm font-medium leading-9">{line.name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm leading-9">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        ref={(el) => {
                          qtyRefs.current[line.id] = el;
                        }}
                        type="number"
                        min={1}
                        className="h-9 text-center font-mono"
                        disabled={!line.productId}
                        value={line.qty || ""}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.id === line.id
                                ? { ...l, qty: Math.max(0, parseInt(e.target.value, 10) || 0) }
                                : l
                            )
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                            e.preventDefault();
                            focusNextBarcode(line.id);
                          }
                        }}
                      />
                    </td>
                    <td className="px-1 py-2 align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground"
                        onClick={() =>
                          setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== line.id)))
                        }
                        aria-label="Satırı sil"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-5 flex items-start gap-3">
          <History className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Stok hareketleri</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              &quot;Tamamla&quot; ile girişler kaydedilir. &quot;Taslak kaydet&quot; yalnızca tarayıcıda saklar; stok değişmez.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Toplam miktar (hazır satırlar)</p>
            <p className="text-2xl font-bold tabular-nums text-primary">{runningTotalQty}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {readyLines.length} ürün satırı ·{" "}
              {draftSavedAt
                ? `Taslak: ${new Date(draftSavedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
                : "Otomatik taslak"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={clearDraft} className="gap-1.5">
              Taslağı sıfırla
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleSaveDraft} className="gap-1.5">
              <Save className="h-4 w-4" />
              Taslak kaydet
            </Button>
            <Button
              type="button"
              size="lg"
              className="gap-2 font-semibold"
              disabled={finalizing || !readyLines.length}
              onClick={handleFinalize}
            >
              {finalizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Tamamla ve kaydet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
