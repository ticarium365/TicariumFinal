import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Info, Loader2, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface PreviewRow {
  row: number;
  productCode: string;
  productName: string;
  mode: string;
  quantity: number;
  currentStock: number;
  newStock: number;
  note: string;
}

interface ImportError {
  row: number;
  code: string;
  message: string;
}

interface ImportResult {
  dryRun: boolean;
  total: number;
  willUpdate?: number;
  updated?: number;
  skipped: number;
  errors: ImportError[];
  preview?: PreviewRow[];
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  set: { label: "Çek", color: "bg-blue-100 text-blue-800" },
  add: { label: "Ekle", color: "bg-green-100 text-green-800" },
  subtract: { label: "Düş", color: "bg-orange-100 text-orange-800" },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BulkStockModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f: File) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(f.name);
    if (!ok) {
      toast({ title: "Geçersiz dosya", description: "Yalnızca .xlsx, .xls veya .csv dosyaları kabul edilir.", variant: "destructive" });
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const runDryRun = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/stock/import?dryRun=true", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Hata", description: data.error?.message || "Önizleme başarısız.", variant: "destructive" });
        return;
      }
      setPreview(data);
    } catch {
      toast({ title: "Ağ hatası", description: "Sunucuya bağlanılamadı.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/stock/import?dryRun=false", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Hata", description: data.error?.message || "İçe aktarma başarısız.", variant: "destructive" });
        return;
      }
      setResult(data);
      // Stok listelerini yenile
      queryClient.invalidateQueries({ queryKey: ["listProducts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    } catch {
      toast({ title: "Ağ hatası", description: "Sunucuya bağlanılamadı.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const res = await fetch("/api/stock/import-template", { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "toplu-stok-sablonu.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const stockDiff = (current: number, next: number) => {
    const d = next - current;
    if (d === 0) return <span className="text-muted-foreground font-mono">0</span>;
    return d > 0
      ? <span className="text-green-600 font-mono font-bold">+{d}</span>
      : <span className="text-red-600 font-mono font-bold">{d}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Toplu Stok Güncelleme
          </DialogTitle>
          <DialogDescription>
            Excel veya CSV dosyasıyla birden fazla ürünün stokunu aynı anda güncelleyin.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">

          {/* Sonuç ekranı */}
          {result && (
            <div className="space-y-4">
              <div className={`rounded-lg p-4 flex items-start gap-3 ${result.errors.length === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                <CheckCircle2 className={`h-5 w-5 mt-0.5 shrink-0 ${result.errors.length === 0 ? "text-green-600" : "text-amber-600"}`} />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">İşlem tamamlandı</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span><span className="font-bold text-green-700">{result.updated}</span> ürün güncellendi</span>
                    {result.skipped > 0 && <span><span className="font-bold text-muted-foreground">{result.skipped}</span> atlandı</span>}
                    {result.errors.length > 0 && <span><span className="font-bold text-red-600">{result.errors.length}</span> hata</span>}
                  </div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-destructive">Hatalar:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-xs flex gap-2 p-2 bg-destructive/5 rounded border border-destructive/10">
                        <span className="font-mono text-muted-foreground shrink-0">Satır {e.row}:</span>
                        <span>{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={reset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Yeni Dosya Yükle
              </Button>
            </div>
          )}

          {/* Önizleme ekranı */}
          {!result && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.willUpdate}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Güncellenecek</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{preview.skipped}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Atlanacak</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className={`text-2xl font-bold ${preview.errors.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>{preview.errors.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Hata</p>
                </div>
              </div>

              {preview.preview && preview.preview.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Önizleme ({preview.preview.length} satır):</p>
                  <div className="border rounded-lg overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2">Ürün</th>
                          <th className="text-center px-3 py-2">Mod</th>
                          <th className="text-right px-3 py-2">Mevcut</th>
                          <th className="text-right px-3 py-2">Fark</th>
                          <th className="text-right px-3 py-2">Yeni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.preview.map((row, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <p className="font-medium truncate max-w-[160px]">{row.productName}</p>
                              <p className="text-muted-foreground font-mono">{row.productCode}</p>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${MODE_LABELS[row.mode]?.color}`}>
                                {MODE_LABELS[row.mode]?.label ?? row.mode}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{row.currentStock}</td>
                            <td className="px-3 py-2 text-right">{stockDiff(row.currentStock, row.newStock)}</td>
                            <td className="px-3 py-2 text-right font-bold font-mono">{row.newStock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-destructive">Hatalar ({preview.errors.length}):</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {preview.errors.map((e, i) => (
                      <div key={i} className="text-xs flex gap-2 p-2 bg-destructive/5 rounded border border-destructive/10">
                        <span className="font-mono text-muted-foreground shrink-0">Satır {e.row}:</span>
                        <span>{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={reset}>
                  <X className="h-4 w-4 mr-2" />
                  İptal
                </Button>
                <Button
                  className="flex-1"
                  onClick={runImport}
                  disabled={loading || (preview.willUpdate ?? 0) === 0}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {(preview.willUpdate ?? 0)} Ürünü Güncelle
                </Button>
              </div>
            </div>
          )}

          {/* Dosya yükleme ekranı */}
          {!result && !preview && (
            <div className="space-y-4">
              {/* Mod açıklamaları */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mod Açıklamaları</p>
                <div className="flex items-start gap-2 text-xs">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium shrink-0">set</span>
                  <span>Stoku tam olarak belirtilen değere çeker. Mevcut stoktan bağımsızdır.</span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium shrink-0">add</span>
                  <span>Mevcut stoğa ekler. Yeni alım ve girişler için kullanın.</span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 font-medium shrink-0">subtract</span>
                  <span>Mevcut stoktan düşer. Fire, zarar veya düzeltme için kullanın.</span>
                </div>
              </div>

              {/* Şablon indir */}
              <Button variant="outline" size="sm" className="w-full" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Excel Şablonunu İndir
              </Button>

              {/* Drag & drop */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                {file ? (
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">Dosyayı buraya sürükleyin</p>
                    <p className="text-xs text-muted-foreground mt-1">veya seçmek için tıklayın · .xlsx, .xls, .csv · maks 5 MB</p>
                  </div>
                )}
              </div>

              {file && (
                <Button className="w-full" onClick={runDryRun} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Info className="h-4 w-4 mr-2" />}
                  Önizleme Oluştur
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
