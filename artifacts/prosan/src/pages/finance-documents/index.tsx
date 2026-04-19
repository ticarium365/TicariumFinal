import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Upload, Search, FolderPlus, Folder, FolderOpen, Filter,
  FileText, Receipt, FileSpreadsheet, FileSignature, FileCheck2,
  CircleDollarSign, Truck, Loader2, Trash2, Download, Eye, Star, Sparkles, ArrowRightLeft,
  RefreshCw, X, Tag,
} from "lucide-react";

const API = "/api/finance-documents";

// ───────────────────────────── Types ─────────────────────────────
type DocType =
  | "gelen_fatura" | "giden_fatura" | "e_arsiv" | "e_fatura"
  | "dekont" | "gider_fisi" | "irsaliye" | "sozlesme" | "diger";
type DocStatus = "yeni" | "islendi" | "onay_bekliyor" | "iptal" | "arsiv";

interface Folder {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  parentId: number | null;
  sortOrder: number;
}
interface Doc {
  id: number;
  folderId: number | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  objectPath: string;
  docType: DocType;
  status: DocStatus;
  source: string;
  title: string | null;
  description: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  supplierId: number | null;
  supplierName: string | null;
  customerId: number | null;
  customerName: string | null;
  partyName: string | null;
  partyTaxNumber: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  currency: string;
  tags: string[];
  isFavorite: boolean;
  hasOcr: boolean;
  convertedToType: string | null;
  convertedToId: number | null;
  createdAt: string;
}

// ───────────────────── Etiket / İkon Eşlemeleri ─────────────────────
const DOC_TYPE_LABEL: Record<DocType, string> = {
  gelen_fatura: "Gelen Fatura",
  giden_fatura: "Giden Fatura",
  e_arsiv: "E-Arşiv",
  e_fatura: "E-Fatura",
  dekont: "Dekont",
  gider_fisi: "Gider Fişi",
  irsaliye: "İrsaliye",
  sozlesme: "Sözleşme",
  diger: "Diğer",
};
const DOC_TYPE_ICON: Record<DocType, any> = {
  gelen_fatura: Receipt,
  giden_fatura: FileText,
  e_arsiv: FileSpreadsheet,
  e_fatura: FileCheck2,
  dekont: CircleDollarSign,
  gider_fisi: FileText,
  irsaliye: Truck,
  sozlesme: FileSignature,
  diger: FileText,
};
const STATUS_LABEL: Record<DocStatus, string> = {
  yeni: "Yeni",
  islendi: "İşlendi",
  onay_bekliyor: "Onay Bekliyor",
  iptal: "İptal",
  arsiv: "Arşiv",
};
const STATUS_COLOR: Record<DocStatus, string> = {
  yeni: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  islendi: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  onay_bekliyor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  iptal: "bg-red-500/15 text-red-300 border-red-500/30",
  arsiv: "bg-muted text-foreground/90 border-border",
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR");
}
function formatMoney(v: string | null, c = "TRY") {
  if (!v) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { style: "currency", currency: c });
}

// ─────────────────────────── Component ───────────────────────────
export default function FinanceDocumentsPage() {
  const { toast } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [activeFolderId, setActiveFolderId] = useState<number | "all" | "uncategorized">("all");
  const [activeStatus, setActiveStatus] = useState<DocStatus | "all">("all");
  const [activeType, setActiveType] = useState<DocType | "all">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Detay
  const [detail, setDetail] = useState<Doc | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);

  // Klasör dialog
  const [folderDialog, setFolderDialog] = useState(false);
  const [newFolder, setNewFolder] = useState({ name: "", color: "#6366f1" });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // AbortController ile request versiyonlama: hızlı filtre değişiminde
  // eski cevap geldiğinde yeniyi ezmeyi engeller (stale UI engeli).
  const abortRef = useRef<AbortController | null>(null);
  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const params = new URLSearchParams();
      if (activeFolderId === "uncategorized") params.set("folderId", "null");
      else if (activeFolderId !== "all") params.set("folderId", String(activeFolderId));
      if (activeStatus !== "all") params.set("status", activeStatus);
      if (activeType !== "all") params.set("docType", activeType);
      if (debounced.trim()) params.set("search", debounced.trim());
      params.set("limit", "100");

      const [fRes, dRes, sRes] = await Promise.all([
        fetch(`${API}/folders`, { credentials: "include", signal: ac.signal }),
        fetch(`${API}?${params.toString()}`, { credentials: "include", signal: ac.signal }),
        fetch(`${API}/stats`, { credentials: "include", signal: ac.signal }),
      ]);
      if (ac.signal.aborted) return;
      if (fRes.ok) setFolders(await fRes.json());
      if (dRes.ok) setDocs(await dRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [activeFolderId, activeStatus, activeType, debounced]);

  useEffect(() => {
    fetchAll();
    return () => abortRef.current?.abort();
  }, [fetchAll]);

  // ─────────────── Upload (drag-drop + click) ───────────────
  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploadingCount(arr.length);

    let okCount = 0;
    for (const file of arr) {
      try {
        // 1) Signed URL al
        const urlRes = await fetch(`/api/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (!urlRes.ok) throw new Error("URL alınamadı");
        const { uploadURL, objectPath } = await urlRes.json();

        // 2) GCS'e PUT
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error("Upload başarısız");

        // 3) DB kaydı
        const docType = guessDocTypeFromName(file.name);
        const create = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            objectPath,
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            docType,
            folderId: activeFolderId !== "all" && activeFolderId !== "uncategorized"
              ? activeFolderId : undefined,
          }),
        });
        if (create.ok) okCount++;
      } catch (e) {
        console.error("upload failed:", file.name, e);
      }
    }

    setUploadingCount(0);
    toast({
      title: okCount === arr.length ? "Yüklendi" : "Kısmen tamamlandı",
      description: `${okCount}/${arr.length} dosya başarıyla yüklendi`,
    });
    fetchAll();
  };

  const guessDocTypeFromName = (name: string): DocType => {
    const n = name.toLowerCase();
    if (n.includes("e-arsiv") || n.includes("earsiv")) return "e_arsiv";
    if (n.includes("e-fatura") || n.includes("efatura")) return "e_fatura";
    if (n.includes("dekont")) return "dekont";
    if (n.includes("irsaliye")) return "irsaliye";
    if (n.includes("sozlesme") || n.includes("sözleşme") || n.includes("kontrat")) return "sozlesme";
    if (n.includes("gider") || n.includes("fis")) return "gider_fisi";
    if (n.includes("alis") || n.includes("alış")) return "gelen_fatura";
    if (n.includes("satis") || n.includes("satış")) return "giden_fatura";
    return "diger";
  };

  // ─────────────── Drag handlers ───────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
  };

  // ─────────────── Folder ops ───────────────
  const createFolder = async () => {
    if (!newFolder.name.trim()) return;
    const res = await fetch(`${API}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(newFolder),
    });
    if (res.ok) {
      setFolderDialog(false);
      setNewFolder({ name: "", color: "#6366f1" });
      fetchAll();
      toast({ title: "Klasör eklendi" });
    }
  };

  // ─────────────── Detay ops ───────────────
  const updateDoc = async (patch: Partial<Doc>) => {
    if (!detail) return;
    setDetailBusy(true);
    try {
      const res = await fetch(`${API}/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetail({ ...detail, ...updated });
        fetchAll();
      }
    } finally {
      setDetailBusy(false);
    }
  };

  const deleteDoc = async (id: number) => {
    if (!confirm("Bu belgeyi silmek istediğinizden emin misiniz?")) return;
    const res = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setDetail(null);
      fetchAll();
      toast({ title: "Silindi" });
    }
  };

  const downloadDoc = (id: number) => {
    window.open(`${API}/${id}/download`, "_blank");
  };

  // ─────── Sprint 57 — OCR ───────
  const ocrDoc = async (id: number) => {
    setOcrBusy(true);
    try {
      const res = await fetch(`${API}/${id}/ocr`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "OCR başarısız", description: data?.error || data?.detail, variant: "destructive" });
        return;
      }
      if (data.document) setDetail(data.document);
      fetchAll();
      toast({ title: "OCR tamamlandı", description: "Belge bilgileri AI ile dolduruldu." });
    } catch (e: any) {
      toast({ title: "OCR hatası", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setOcrBusy(false);
    }
  };

  // ─────── Sprint 58 — Otomatik dönüşüm ───────
  const convertDoc = async (id: number, target: "purchase" | "expense") => {
    setConvertBusy(true);
    try {
      const url = `${API}/${id}/convert-to-${target}`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Dönüşüm başarısız", description: data?.error || data?.detail, variant: "destructive" });
        return;
      }
      toast({
        title: target === "purchase" ? "Alış faturasına çevrildi" : "Gidere çevrildi",
        description: target === "purchase"
          ? `Alış faturası #${data.purchase?.id} oluşturuldu.`
          : `Gider #${data.expense?.id} oluşturuldu.`,
      });
      // Detayı yenile
      const updated = await fetch(`${API}/${id}`, { credentials: "include" }).then(r => r.json());
      setDetail(updated);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Hata", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setConvertBusy(false);
    }
  };

  const toggleFavorite = (doc: Doc) => {
    fetch(`${API}/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isFavorite: !doc.isFavorite }),
    }).then(() => fetchAll());
  };

  // ─────────────── Render ───────────────
  const filteredCount = docs.length;
  const totalAmount = useMemo(
    () => docs.reduce((s, d) => s + (Number(d.totalAmount) || 0), 0),
    [docs],
  );

  return (
    <div className="space-y-4 p-4 md:p-6" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {/* Drag overlay */}
      {dragActive && (
        <div className="fixed inset-0 z-50 bg-indigo-600/20 border-4 border-dashed border-indigo-600 flex items-center justify-center pointer-events-none">
          <div className="bg-card rounded-xl shadow-xl px-8 py-6 text-center">
            <Upload className="h-12 w-12 mx-auto mb-2 text-indigo-600" />
            <p className="text-lg font-bold">Belgeleri buraya bırakın</p>
            <p className="text-sm text-muted-foreground">Birden fazla dosyayı aynı anda yükleyebilirsiniz</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-7 w-7 text-indigo-600" />
            <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Belge Merkezi</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Fatura, dekont, gider fişi ve sözleşmeler — hepsi tek yerde
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => fetchAll()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingCount > 0}>
            {uploadingCount > 0 ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Yükleniyor ({uploadingCount})
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Belge Yükle
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCard label="Toplam Belge" value={stats.total} icon={FileText} />
          <StatCard label="Yeni" value={stats.byStatus.yeni} icon={Inbox} color="text-indigo-600" />
          <StatCard label="Onay Bekliyor" value={stats.byStatus.onay_bekliyor} icon={Eye} color="text-amber-600" />
          <StatCard label="İşlendi" value={stats.byStatus.islendi} icon={FileCheck2} color="text-emerald-600" />
          <StatCard
            label="Toplam Tutar"
            value={Number(stats.totalAmount).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
            icon={CircleDollarSign}
            color="text-purple-600"
            small
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* SOL: Klasör + Tip filtreleri */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Klasörler</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFolderDialog(true)}>
                <FolderPlus className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <FolderItem
                label="Tüm Belgeler"
                icon={Inbox}
                active={activeFolderId === "all"}
                onClick={() => setActiveFolderId("all")}
                count={stats?.total}
              />
              <FolderItem
                label="Klasörsüz"
                icon={Folder}
                active={activeFolderId === "uncategorized"}
                onClick={() => setActiveFolderId("uncategorized")}
              />
              {folders.map((f) => (
                <FolderItem
                  key={f.id}
                  label={f.name}
                  icon={activeFolderId === f.id ? FolderOpen : Folder}
                  color={f.color}
                  active={activeFolderId === f.id}
                  onClick={() => setActiveFolderId(f.id)}
                />
              ))}
              {folders.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-2 py-1">Klasör yok</p>
              )}
            </div>
          </Card>

          <Card className="p-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Belge Tipi</h3>
            <div className="space-y-1">
              <FolderItem
                label="Hepsi"
                icon={Filter}
                active={activeType === "all"}
                onClick={() => setActiveType("all")}
              />
              {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => {
                const Icon = DOC_TYPE_ICON[t];
                return (
                  <FolderItem
                    key={t}
                    label={DOC_TYPE_LABEL[t]}
                    icon={Icon}
                    active={activeType === t}
                    onClick={() => setActiveType(t)}
                    count={stats?.byType?.[t]}
                  />
                );
              })}
            </div>
          </Card>
        </div>

        {/* SAĞ: Liste */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Başlık, dosya adı, fatura no, parti adı, açıklama..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={activeStatus} onValueChange={(v: any) => setActiveStatus(v)}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Durumlar</SelectItem>
                  {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {filteredCount} belge · Toplam {totalAmount.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
            </div>
          </Card>

          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : docs.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Henüz belge yok</p>
                <p className="text-sm mt-1">Yukarıdan "Belge Yükle" butonuyla veya bu sayfaya sürükleyip bırakarak ekleyin</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 w-8"></th>
                    <th className="text-left px-3 py-2">Belge</th>
                    <th className="text-left px-3 py-2">Tip</th>
                    <th className="text-left px-3 py-2">Karşı Taraf</th>
                    <th className="text-right px-3 py-2">Tutar</th>
                    <th className="text-left px-3 py-2">Tarih</th>
                    <th className="text-left px-3 py-2">Durum</th>
                    <th className="text-right px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => {
                    const Icon = DOC_TYPE_ICON[d.docType];
                    return (
                      <tr
                        key={d.id}
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDetail(d)}
                      >
                        <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); toggleFavorite(d); }}>
                          <Star className={`h-4 w-4 ${d.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{d.title || d.originalName}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.documentNumber && <span>{d.documentNumber} · </span>}
                            {formatBytes(d.fileSize)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs">{DOC_TYPE_LABEL[d.docType]}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {d.supplierName || d.customerName || d.partyName || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {formatMoney(d.totalAmount, d.currency)}
                        </td>
                        <td className="px-3 py-2 text-xs">{formatDate(d.documentDate || d.createdAt)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${STATUS_COLOR[d.status]}`}>
                            {STATUS_LABEL[d.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); downloadDoc(d.id); }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {/* Detay Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => { const I = DOC_TYPE_ICON[detail.docType]; return <I className="h-5 w-5" />; })()}
                  {detail.title || detail.originalName}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={STATUS_COLOR[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
                  <Badge variant="outline">{DOC_TYPE_LABEL[detail.docType]}</Badge>
                  <Badge variant="outline" className="text-xs">{detail.source}</Badge>
                  {detail.hasOcr && <Badge variant="outline" className="bg-purple-500/10">OCR</Badge>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Belge Tipi">
                    <Select value={detail.docType} onValueChange={(v: any) => updateDoc({ docType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                          <SelectItem key={t} value={t}>{DOC_TYPE_LABEL[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Durum">
                    <Select value={detail.status} onValueChange={(v: any) => updateDoc({ status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Klasör">
                    <Select
                      value={detail.folderId ? String(detail.folderId) : "_none"}
                      onValueChange={(v) => updateDoc({ folderId: v === "_none" ? null : Number(v) } as any)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Klasörsüz</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Belge No">
                    <Input
                      defaultValue={detail.documentNumber || ""}
                      onBlur={(e) => e.target.value !== (detail.documentNumber || "") && updateDoc({ documentNumber: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Belge Tarihi">
                    <Input
                      type="date"
                      defaultValue={detail.documentDate?.slice(0, 10) || ""}
                      onBlur={(e) => updateDoc({ documentDate: e.target.value || null } as any)}
                    />
                  </Field>
                  <Field label="Vade Tarihi">
                    <Input
                      type="date"
                      defaultValue={detail.dueDate?.slice(0, 10) || ""}
                      onBlur={(e) => updateDoc({ dueDate: e.target.value || null } as any)}
                    />
                  </Field>
                  <Field label="Karşı Taraf">
                    <Input
                      defaultValue={detail.partyName || ""}
                      onBlur={(e) => e.target.value !== (detail.partyName || "") && updateDoc({ partyName: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Vergi No">
                    <Input
                      defaultValue={detail.partyTaxNumber || ""}
                      onBlur={(e) => e.target.value !== (detail.partyTaxNumber || "") && updateDoc({ partyTaxNumber: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Ara Toplam">
                    <Input
                      type="number" step="0.01"
                      defaultValue={detail.subtotal || ""}
                      onBlur={(e) => updateDoc({ subtotal: e.target.value || null } as any)}
                    />
                  </Field>
                  <Field label="KDV">
                    <Input
                      type="number" step="0.01"
                      defaultValue={detail.vatAmount || ""}
                      onBlur={(e) => updateDoc({ vatAmount: e.target.value || null } as any)}
                    />
                  </Field>
                  <Field label="Toplam Tutar">
                    <Input
                      type="number" step="0.01"
                      defaultValue={detail.totalAmount || ""}
                      onBlur={(e) => updateDoc({ totalAmount: e.target.value || null } as any)}
                    />
                  </Field>
                  <Field label="Para Birimi">
                    <Select value={detail.currency} onValueChange={(v) => updateDoc({ currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRY">TRY ₺</SelectItem>
                        <SelectItem value="USD">USD $</SelectItem>
                        <SelectItem value="EUR">EUR €</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Açıklama">
                  <Textarea
                    rows={2}
                    defaultValue={detail.description || ""}
                    onBlur={(e) => e.target.value !== (detail.description || "") && updateDoc({ description: e.target.value || null })}
                  />
                </Field>

                <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
                  <div>Yüklenme: {new Date(detail.createdAt).toLocaleString("tr-TR")}</div>
                  <div>Dosya: {detail.originalName} · {formatBytes(detail.fileSize)} · {detail.mimeType}</div>
                </div>
              </div>

              {detail.convertedToType && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm rounded-md px-3 py-2 flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4" />
                  Bu belge <strong>{detail.convertedToType === "purchase" ? "Alış Faturası" : "Gider"}</strong> #{detail.convertedToId} olarak işlendi.
                </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <div className="flex flex-wrap gap-2 w-full">
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => ocrDoc(detail.id)}
                    disabled={ocrBusy}
                  >
                    {ocrBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    {detail.hasOcr ? "OCR'ı Tekrarla" : "AI OCR Çek"}
                  </Button>
                  {!detail.convertedToType && (
                    <>
                      {(detail.docType === "gelen_fatura" || detail.docType === "e_fatura" || detail.docType === "e_arsiv") && (
                        <Button variant="default" size="sm" onClick={() => convertDoc(detail.id, "purchase")} disabled={convertBusy}>
                          {convertBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                          Alış Faturasına Çevir
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => convertDoc(detail.id, "expense")} disabled={convertBusy}>
                        {convertBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CircleDollarSign className="h-4 w-4 mr-2" />}
                        Gidere Çevir
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex justify-between gap-2 w-full pt-2 border-t">
                  <Button variant="destructive" size="sm" onClick={() => deleteDoc(detail.id)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Sil
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadDoc(detail.id)}>
                      <Download className="h-4 w-4 mr-2" />
                      İndir
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
                      {detailBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Kapat
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Klasör Dialog */}
      <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Klasör</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Ad">
              <Input
                value={newFolder.name}
                onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                placeholder="Örn: 2026 Ocak Faturaları"
              />
            </Field>
            <Field label="Renk">
              <Input
                type="color"
                value={newFolder.color}
                onChange={(e) => setNewFolder({ ...newFolder, color: e.target.value })}
                className="h-10 w-20"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(false)}>Vazgeç</Button>
            <Button onClick={createFolder}>Oluştur</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ──────────────────── Helpers ────────────────────
function StatCard({ label, value, icon: Icon, color = "text-muted-foreground", small = false }: any) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`font-bold ${small ? "text-sm" : "text-xl"} mt-0.5`}>{value}</div>
        </div>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
    </Card>
  );
}
function FolderItem({ label, icon: Icon, color, active, onClick, count }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
        active ? "bg-indigo-500/15 text-indigo-200 font-medium" : "hover:bg-muted text-foreground"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" style={color ? { color } : {}} />
        <span className="truncate">{label}</span>
      </span>
      {count != null && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
