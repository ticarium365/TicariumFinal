import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileText, ArrowRight, CheckCircle, AlertTriangle, Info, Download } from "lucide-react";

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

function downloadSampleCsv(kind: string) {
  const k = KIND_LABELS[kind]; if (!k) return;
  const csv = k.sample.map((r) => r.map((c) => /[;",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `ornek-${kind}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState("customers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function handlePreview() {
    if (!file) return toast({ title: "Önce dosya seç", variant: "destructive" });
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("kind", kind); fd.append("file", file);
      const r = await fetch("/api/import/preview", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setPreview(data); setMapping(data.mapping || {}); setResult(null);
    } catch (e: any) {
      toast({ title: "Önizleme hatası", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleImport(dryRun: boolean) {
    if (!file || !preview) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind); fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("dryRun", String(dryRun));
      const r = await fetch("/api/import/run", { method: "POST", body: fd, credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "fail");
      setResult({ dryRun, ...data });
      toast({
        title: dryRun ? "Ön kontrol tamamlandı" : "İçe aktarım tamamlandı",
        description: `${data.created} eklendi, ${data.updated} güncellendi, ${data.skipped} atlandı, ${data.errors?.length || 0} hata.`,
      });
    } catch (e: any) {
      toast({ title: "Hata", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl" data-testid="page-import">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Upload className="h-7 w-7 text-primary" />
          Veri İçe Aktarımı
        </h1>
        <p className="text-muted-foreground">
          Paraşüt, Bizim Hesap, Logo, Mikro veya Excel dosyalarınızı Ticarium365'e taşıyın.
        </p>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p><strong>Nasıl çalışır:</strong> 1) Veri türünü seç → 2) CSV dosyasını yükle → 3) Kolon eşleşmesini onayla → 4) Önce "Ön Kontrol" yap → 5) "İçe Aktar" ile uygula.</p>
            <p className="mt-1 text-muted-foreground">UTF-8 + noktalı virgül (;) ayırıcısı önerilir. Excel'den kaydederken "CSV UTF-8 (;)" formatını seçin.</p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={kind} onValueChange={(v) => { setKind(v); setPreview(null); setResult(null); setFile(null); }}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>{v.tr}</TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(KIND_LABELS).map(([k, v]) => (
          <TabsContent key={k} value={k} className="mt-6 space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" />{v.tr} İçe Aktarımı</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadSampleCsv(k)} data-testid={`btn-sample-${k}`}>
                  <Download className="h-4 w-4 mr-1" />Örnek CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Input type="file" accept=".csv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid={`input-file-${k}`} />
                  <Button onClick={handlePreview} disabled={!file || busy} data-testid={`btn-preview-${k}`}>
                    <ArrowRight className="h-4 w-4 mr-2" />Önizle
                  </Button>
                </div>

                {preview && preview.kind === k && (
                  <>
                    <div className="text-sm text-muted-foreground">
                      Toplam <strong>{preview.totalRows}</strong> satır, {preview.headers.length} kolon bulundu.
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm mb-2">Kolon Eşleşmesi</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 border rounded-md">
                        {(preview.fields as string[]).map((field) => (
                          <div key={field} className="flex items-center gap-2">
                            <Label className="text-xs w-32 flex-shrink-0 capitalize">{field}</Label>
                            <Select
                              value={mapping[field] !== undefined ? String(mapping[field]) : "__none__"}
                              onValueChange={(val) => setMapping({ ...mapping, [field]: val === "__none__" ? -1 : Number(val) })}
                            >
                              <SelectTrigger className="h-8 text-sm" data-testid={`map-${field}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— eşleşme yok —</SelectItem>
                                {(preview.headers as string[]).map((h, i) => (
                                  <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm mb-2">İlk Satırlar Önizlemesi</h4>
                      <div className="border rounded-md overflow-x-auto max-h-64">
                        <Table>
                          <TableHeader>
                            <TableRow>{(preview.headers as string[]).map((h, i) => <TableHead key={i} className="text-xs">{h}</TableHead>)}</TableRow>
                          </TableHeader>
                          <TableBody>
                            {(preview.sample as string[][]).map((row, ri) => (
                              <TableRow key={ri}>
                                {row.map((c, ci) => <TableCell key={ci} className="text-xs whitespace-nowrap">{c}</TableCell>)}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button variant="outline" onClick={() => handleImport(true)} disabled={busy} data-testid={`btn-dryrun-${k}`}>
                        <CheckCircle className="h-4 w-4 mr-2" />Ön Kontrol (Yazmadan Test)
                      </Button>
                      <Button onClick={() => handleImport(false)} disabled={busy} data-testid={`btn-import-${k}`}>
                        <Upload className="h-4 w-4 mr-2" />İçe Aktar
                      </Button>
                    </div>
                  </>
                )}

                {result && (
                  <Card className={result.errors?.length ? "border-amber-300" : "border-emerald-300"}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        {result.errors?.length
                          ? <AlertTriangle className="h-6 w-6 text-amber-500" />
                          : <CheckCircle className="h-6 w-6 text-emerald-500" />}
                        <div>
                          <div className="font-semibold">{result.dryRun ? "Ön kontrol sonucu" : "İçe aktarım sonucu"}</div>
                          <div className="text-sm text-muted-foreground">
                            <Badge variant="default" className="mr-1">{result.created} eklendi</Badge>
                            <Badge variant="secondary" className="mr-1">{result.updated} güncellendi</Badge>
                            <Badge variant="outline" className="mr-1">{result.skipped} atlandı</Badge>
                            {result.errors?.length > 0 && <Badge variant="destructive">{result.errors.length} hata</Badge>}
                          </div>
                        </div>
                      </div>
                      {result.errors?.length > 0 && (
                        <div className="max-h-40 overflow-y-auto text-xs space-y-1 bg-muted/50 p-2 rounded">
                          {result.errors.slice(0, 20).map((e: any, i: number) => (
                            <div key={i}>Satır {e.row} ({e.name || e.description}): <span className="text-red-600">{e.error}</span></div>
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
