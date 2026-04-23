import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileUp,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  errors: { row: number; message: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportProductsModal({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast({ title: "Geçersiz dosya", description: "Yalnızca .xlsx, .xls veya .csv dosyaları kabul edilir.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);

      const res = await fetch("/api/products/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error?.message ?? "İçe aktarma hatası");
      }

      setResult(json as ImportResult);

      if (json.imported > 0 || json.updated > 0) {
        onSuccess();
      }
    } catch (err: any) {
      toast({ title: "Hata", description: err.message ?? "İçe aktarma başarısız.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleTemplateDownload = async () => {
    try {
      const res = await fetch("/api/products/import-template", { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "urun-import-sablonu.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Hata", description: "Şablon indirilemedi.", variant: "destructive" });
    }
  };

  const previewRows = useCallback(async (f: File): Promise<number> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]!]!;
          const rows = XLSX.utils.sheet_to_json(ws);
          resolve(rows.length);
        } catch {
          resolve(0);
        }
      };
      reader.readAsArrayBuffer(f);
    });
  }, []);

  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const handleFileChange = async (f: File) => {
    handleFile(f);
    const count = await previewRows(f);
    setPreviewCount(count);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            Ürün İçe Aktar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Şablon indir */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Excel şablonu</p>
              <p>Doğru format için şablonu indirin ve doldurun</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleTemplateDownload}>
              <Download className="h-3.5 w-3.5" />
              Şablon İndir
            </Button>
          </div>

          {/* Dosya yükleme alanı */}
          {!result && (
            <>
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                  ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
                />
                {file ? (
                  <div className="space-y-1">
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-green-500" />
                    <p className="font-medium text-sm">{file.name}</p>
                    {previewCount !== null && (
                      <p className="text-xs text-muted-foreground">{previewCount} satır tespit edildi</p>
                    )}
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive mt-1 inline-flex items-center gap-1"
                      onClick={(e) => { e.stopPropagation(); reset(); setPreviewCount(null); }}
                    >
                      <X className="h-3 w-3" /> Kaldır
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileUp className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium">Dosyayı sürükle bırak veya tıkla</p>
                    <p className="text-xs text-muted-foreground">.xlsx, .xls veya .csv — maks. 5 MB</p>
                  </div>
                )}
              </div>

              {/* Mod seçimi */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium whitespace-nowrap">Mevcut ürün:</label>
                <Select value={mode} onValueChange={(v) => setMode(v as "skip" | "update")}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Atla (ürün kodu zaten varsa geç)</SelectItem>
                    <SelectItem value="update">Güncelle (mevcut ürünü üzerine yaz)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Sonuç */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mb-1" />
                  <span className="text-xl font-bold text-green-700 dark:text-green-400">{result.imported}</span>
                  <span className="text-xs text-green-600">Eklendi</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 mb-1" />
                  <span className="text-xl font-bold text-blue-700 dark:text-blue-400">{result.updated}</span>
                  <span className="text-xs text-blue-600">Güncellendi</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-muted rounded-lg border">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xl font-bold">{result.skipped}</span>
                  <span className="text-xs text-muted-foreground">Atlandı</span>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {result.errors.length} satırda sorun var
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border bg-destructive/5 p-2 space-y-1">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <Badge variant="outline" className="shrink-0 text-xs">Satır {e.row}</Badge>
                        <span className="text-muted-foreground">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>Yeni Dosya</Button>
              <Button onClick={handleClose}>Kapat</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose}>İptal</Button>
              <Button
                onClick={handleImport}
                disabled={!file || importing}
                className="gap-2"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {importing ? "Aktarılıyor..." : "Aktarmayı Başlat"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
