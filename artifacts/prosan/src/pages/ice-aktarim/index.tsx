import { useState, useRef, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileText,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Info,
  Download,
  ChevronRight,
  Ban,
} from "lucide-react";

const KIND_LABELS: Record<string, { tr: string; sample: string[][] }> = {
  customers: {
    tr: "Müşteriler",
    sample: [
      ["Unvan", "Vergi No", "Vergi Dairesi", "Telefon", "E-Posta", "Sehir", "Acilis Bakiye"],
      ["Acme Ltd", "1234567890", "Kadıköy", "0555 111 22 33", "info@acme.com", "İstanbul", "5000,50"],
    ],
  },
  suppliers: {
    tr: "Tedarikçiler",
    sample: [
      ["Unvan", "Vergi No", "Vergi Dairesi", "Telefon", "Sehir", "Acilis Bakiye"],
      ["Tedarik AŞ", "9988776655", "Çankaya", "0312 222 33 44", "Ankara", "0"],
    ],
  },
  products: {
    tr: "Ürünler",
    sample: [
      ["Stok Kodu", "Barkod", "Urun Adi", "Kategori", "Marka", "Alis Fiyati", "Satis Fiyati", "Stok"],
      ["P-001", "8690000000017", "Test Ürün", "Elektronik", "MarkaX", "100,00", "150,00", "25"],
    ],
  },
  expenses: {
    tr: "Giderler",
    sample: [
      ["Tarih", "Aciklama", "Tutar", "Kategori"],
      ["12.04.2026", "Kira Ödemesi", "5000,00", "Kira"],
    ],
  },
};

const STEPS = [
  { id: 1, label: "Yükle" },
  { id: 2, label: "Doğrula" },
  { id: 3, label: "Önizleme" },
  { id: 4, label: "İçe aktar" },
] as const;

type ValidationIssue = { row: number; column: string; issue: string };

function downloadSampleCsv(kind: string) {
  const k = KIND_LABELS[kind];
  if (!k) return;
  const csv = k.sample
    .map((r) => r.map((c) => (/[;",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ornek-${kind}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildMappingIssues(kind: string, mapping: Record<string, number>): string[] {
  const issues: string[] = [];
  const idx = (k: string) => mapping[k];
  if (kind === "customers" || kind === "suppliers") {
    if (idx("name") === undefined || idx("name")! < 0) issues.push("Unvan / ad alanı için bir kolon seçmelisiniz (name).");
  }
  if (kind === "products") {
    if (idx("name") === undefined || idx("name")! < 0) issues.push("Ürün adı (name) kolonu eşlenmeli.");
  }
  if (kind === "expenses") {
    if (idx("amount") === undefined || idx("amount")! < 0) issues.push("Tutar (amount) kolonu eşlenmeli.");
  }
  return issues;
}

function buildRowIssues(
  kind: string,
  preview: { headers: string[]; sample: string[][] },
  mapping: Record<string, number>
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const { headers, sample } = preview;
  const maxRows = Math.min(sample.length, 20);

  for (let i = 0; i < maxRows; i++) {
    const row = sample[i];
    const rowNum = i + 2;
    if (kind === "customers" || kind === "suppliers" || kind === "products") {
      const j = mapping.name;
      if (j !== undefined && j >= 0) {
        const cell = row[j];
        if (!cell || !String(cell).trim()) {
          out.push({ row: rowNum, column: headers[j] || `Kolon ${j}`, issue: "Ürün / unvan hücresi boş" });
        }
      }
    }
    if (kind === "expenses") {
      const ja = mapping.amount;
      if (ja !== undefined && ja >= 0) {
        const raw = row[ja];
        const n = parseFloat(String(raw ?? "").replace(/\./g, "").replace(",", "."));
        if (!raw || !String(raw).trim() || !Number.isFinite(n) || n <= 0) {
          out.push({ row: rowNum, column: headers[ja] || `Kolon ${ja}`, issue: "Geçerli tutar yok" });
        }
      }
    }
  }
  return out;
}

export default function ImportPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState("customers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    kind: string;
    totalRows: number;
    headers: string[];
    sample: string[][];
    mapping: Record<string, number>;
    fields: string[];
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const importAbort = useRef<AbortController | null>(null);

  const previewRows = useMemo(() => {
    if (!preview?.sample) return [];
    return preview.sample.slice(0, 20);
  }, [preview]);

  const mappingIssues = useMemo(() => {
    if (!preview) return [];
    return buildMappingIssues(kind, mapping);
  }, [preview, kind, mapping]);

  const rowIssues = useMemo(() => {
    if (!preview) return [];
    return buildRowIssues(kind, preview, mapping);
  }, [preview, kind, mapping]);

  const validationBlocked = mappingIssues.length > 0 || rowIssues.length > 0;

  async function handlePreview() {
    if (!file) {
      toast({ title: "Önce dosya seç", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      const r = await fetch("/api/import/preview", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setPreview(data);
      setMapping(data.mapping || {});
      setResult(null);
      setStep(2);
    } catch (e: unknown) {
      toast({ title: "Önizleme hatası", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const goToPreviewStep = useCallback(() => {
    if (validationBlocked) {
      toast({
        title: "Doğrulama hatası",
        description: "Aşağıdaki sorunları giderin veya eşleştirmeyi düzeltin.",
        variant: "destructive",
      });
      return;
    }
    setStep(3);
  }, [validationBlocked, toast]);

  async function handleImport(dryRun: boolean) {
    if (!file || !preview) return;
    if (importAbort.current) importAbort.current.abort();
    const ac = new AbortController();
    importAbort.current = ac;
    setBusy(true);
    setProgress(12);
    setStep(4);
    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + 7));
    }, 280);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("dryRun", String(dryRun));
      const r = await fetch("/api/import/run", {
        method: "POST",
        body: fd,
        credentials: "include",
        signal: ac.signal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "fail");
      setProgress(100);
      setResult({ dryRun, ...data });
      toast({
        title: dryRun ? "Ön kontrol tamamlandı" : "İçe aktarım tamamlandı",
        description: `${data.created} eklendi, ${data.updated} güncellendi, ${data.skipped} atlandı, ${data.errors?.length || 0} hata.`,
      });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast({ title: "İptal edildi", description: "İçe aktarma kullanıcı tarafından durduruldu." });
        setStep(3);
      } else {
        setStep(3);
        toast({ title: "Hata", description: String(e), variant: "destructive" });
      }
    } finally {
      clearInterval(tick);
      setBusy(false);
      importAbort.current = null;
    }
  }

  const cancelImport = () => {
    importAbort.current?.abort();
  };

  const resetFlow = () => {
    importAbort.current?.abort();
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setStep(1);
    setProgress(0);
  };

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl" data-testid="page-import">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Upload className="h-7 w-7 text-primary" />
          Veri İçe Aktarımı
        </h1>
        <p className="text-muted-foreground">
          Paraşüt, Bizim Hesap, Logo, Mikro veya Excel dosyalarınızı Ticarium365&apos;e taşıyın.
        </p>
      </div>

      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold border-2 ${
                    step >= s.id ? "border-primary bg-primary text-primary-foreground" : "border-muted text-muted-foreground"
                  }`}
                >
                  {step > s.id ? <CheckCircle className="h-4 w-4" /> : s.id}
                </div>
                <span className={`text-sm font-medium ${step >= s.id ? "" : "text-muted-foreground"}`}>{s.label}</span>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />}
              </div>
            ))}
          </div>
          <Progress value={step === 4 ? progress : step * 25} className="mt-4 h-2" />
          {step === 4 && busy && (
            <div className="flex justify-end mt-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={cancelImport}>
                <Ban className="h-4 w-4" />
                İçe aktarmayı iptal et
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-500/10 dark:bg-blue-900/20 border-blue-500/20 dark:border-blue-800">
        <CardContent className="pt-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p>
              <strong>Akış:</strong> Dosyayı yükleyin → Eşleştirmeyi doğrulayın → Önizlemeyi kontrol edin → İçe aktarın.
              Sunucu hataları satır numarası ve mesajla listelenir; ön doğrulama örnek satırlar üzerindendir (en fazla 20).
            </p>
            <p className="mt-1 text-muted-foreground">
              UTF-8 + noktalı virgül (;) ayırıcısı önerilir. Excel&apos;den kaydederken &quot;CSV UTF-8 (;)&quot; formatını seçin.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={kind}
        onValueChange={(v) => {
          setKind(v);
          resetFlow();
        }}
      >
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
              {v.tr}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(KIND_LABELS).map(([k, v]) => (
          <TabsContent key={k} value={k} className="mt-6 space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {v.tr} İçe Aktarımı
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadSampleCsv(k)} data-testid={`btn-sample-${k}`}>
                  <Download className="h-4 w-4 mr-1" />
                  Örnek CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {step === 1 && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Input
                      type="file"
                      accept=".csv,.txt"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      data-testid={`input-file-${k}`}
                    />
                    <Button onClick={handlePreview} disabled={!file || busy} data-testid={`btn-preview-${k}`}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Yükle ve devam
                    </Button>
                  </div>
                )}

                {preview && preview.kind === k && step >= 2 && step <= 3 && (
                  <>
                    {step === 2 && (
                      <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          Doğrulama (eşleştirme + örnek satırlar)
                        </h4>
                        {mappingIssues.length > 0 && (
                          <ul className="text-sm list-disc pl-5 space-y-1 text-amber-900 dark:text-amber-100">
                            {mappingIssues.map((msg, i) => (
                              <li key={i}>{msg}</li>
                            ))}
                          </ul>
                        )}
                        {rowIssues.length > 0 && (
                          <div className="overflow-x-auto rounded-md border bg-card">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-20">Satır</TableHead>
                                  <TableHead>Kolon</TableHead>
                                  <TableHead>Sorun</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {rowIssues.map((err, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-mono">{err.row}</TableCell>
                                    <TableCell>{err.column}</TableCell>
                                    <TableCell className="text-destructive">{err.issue}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        {mappingIssues.length === 0 && rowIssues.length === 0 && (
                          <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" /> Örnek satırlarda engelleyici sorun yok.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="text-sm text-muted-foreground">
                      Toplam <strong>{preview.totalRows}</strong> satır, {preview.headers.length} kolon bulundu.
                    </div>

                    {(step === 2 || step === 3) && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Kolon eşleşmesi</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 border rounded-md">
                          {(preview.fields as string[]).map((field) => (
                            <div key={field} className="flex items-center gap-2">
                              <Label className="text-xs w-32 flex-shrink-0 capitalize">{field}</Label>
                              <Select
                                value={mapping[field] !== undefined ? String(mapping[field]) : "__none__"}
                                onValueChange={(val) =>
                                  setMapping({ ...mapping, [field]: val === "__none__" ? -1 : Number(val) })
                                }
                              >
                                <SelectTrigger className="h-8 text-sm" data-testid={`map-${field}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— eşleşme yok —</SelectItem>
                                  {(preview.headers as string[]).map((h, i) => (
                                    <SelectItem key={i} value={String(i)}>
                                      {h}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Önizleme (en fazla 20 satır, tüm kolonlar)</h4>
                        <div className="border rounded-md overflow-x-auto max-h-[420px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {(preview.headers as string[]).map((h, i) => (
                                  <TableHead key={i} className="text-xs whitespace-nowrap">
                                    {h}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewRows.map((row, ri) => (
                                <TableRow key={ri}>
                                  {row.map((c, ci) => (
                                    <TableCell key={ci} className="text-xs whitespace-nowrap max-w-[240px] truncate">
                                      {c}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {step === 2 && (
                        <>
                          <Button variant="secondary" type="button" onClick={() => setStep(1)}>
                            Geri
                          </Button>
                          <Button type="button" onClick={goToPreviewStep}>
                            Önizlemeye geç
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </>
                      )}
                      {step === 3 && (
                        <>
                          <Button variant="secondary" type="button" onClick={() => setStep(2)}>
                            Geri
                          </Button>
                          <Button variant="outline" onClick={() => handleImport(true)} disabled={busy} data-testid={`btn-dryrun-${k}`}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Ön kontrol (kayıt yok)
                          </Button>
                          <Button onClick={() => handleImport(false)} disabled={busy} data-testid={`btn-import-${k}`}>
                            <Upload className="h-4 w-4 mr-2" />
                            İçe aktar
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}

                {preview && preview.kind === k && step === 4 && busy && !result && (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                    <Upload className="h-10 w-10 animate-pulse text-primary" />
                    <p className="text-sm font-medium">Dosya işleniyor… İptal için üstteki düğmeyi kullanın.</p>
                  </div>
                )}

                {preview && preview.kind === k && step === 4 && result && (
                  <div className="flex justify-end pt-2">
                    <Button variant="outline" type="button" onClick={resetFlow}>
                      Yeni dosya
                    </Button>
                  </div>
                )}

                {result && (
                  <Card className={result.errors?.length ? "border-amber-500/30" : "border-emerald-500/30"}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        {result.errors?.length ? (
                          <AlertTriangle className="h-6 w-6 text-amber-500" />
                        ) : (
                          <CheckCircle className="h-6 w-6 text-emerald-500" />
                        )}
                        <div>
                          <div className="font-semibold">{result.dryRun ? "Ön kontrol sonucu" : "İçe aktarım sonucu"}</div>
                          <div className="text-sm text-muted-foreground flex flex-wrap gap-1">
                            <Badge variant="default" className="mr-1">
                              {result.created} eklendi
                            </Badge>
                            <Badge variant="secondary" className="mr-1">
                              {result.updated} güncellendi
                            </Badge>
                            <Badge variant="outline" className="mr-1">
                              {result.skipped} atlandı
                            </Badge>
                            {result.errors?.length > 0 && <Badge variant="destructive">{result.errors.length} hata</Badge>}
                          </div>
                        </div>
                      </div>
                      {result.errors?.length > 0 && (
                        <div className="max-h-52 overflow-y-auto text-xs space-y-2 bg-muted/50 p-3 rounded-md">
                          {result.errors.map((e: { row: number; error: string; name?: string; description?: string }, i: number) => (
                            <div key={i} className="border-b border-border/40 pb-2 last:border-0">
                              <span className="font-mono font-semibold">Satır {e.row}</span>
                              {e.name != null && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · kayıt: <span className="text-foreground">{String(e.name)}</span>
                                </span>
                              )}
                              {e.description != null && e.name == null && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · <span className="text-foreground">{String(e.description)}</span>
                                </span>
                              )}
                              <div className="text-red-600 mt-0.5">{e.error}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
