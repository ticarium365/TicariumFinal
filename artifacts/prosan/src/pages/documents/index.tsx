import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Upload, Folder, Search, Download, Trash2,
  Plus, Tag, Link2, Calendar, HardDrive, X, Edit2, ChevronDown,
  File, FileImage, FileSpreadsheet, FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";

// ─── Tipler ─────────────────────────────────────────────────────────────────
interface DocumentCategory {
  id: number; name: string; color: string; createdAt: string;
}
interface Document {
  id: number; companyId: number; categoryId?: number | null;
  name: string; description?: string | null;
  fileName: string; fileSize: number; mimeType: string; objectPath: string;
  entityType?: string | null; entityId?: number | null;
  tags: string[]; isPublic: boolean;
  uploadedBy?: number | null; createdAt: string;
}
interface DocumentsResponse {
  documents: Document[]; total: number; page: number; limit: number;
}

// ─── Yardımcılar ────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function mimeIcon(mime: string) {
  if (mime.startsWith("image/")) return <FileImage className="h-5 w-5 text-purple-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (mime.includes("pdf")) return <FileText className="h-5 w-5 text-red-500" />;
  if (mime.includes("json") || mime.includes("xml") || mime.includes("text"))
    return <FileCode className="h-5 w-5 text-blue-500" />;
  return <File className="h-5 w-5 text-gray-400" />;
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useCompany();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<DocumentCategory | null>(null);
  const [editDoc, setEditDoc] = useState<Document | null>(null);

  const base = `/api/${tenant}`;

  // ─── Kategoriler ──────────────────────────────────────────────────────────
  const catsQ = useQuery<DocumentCategory[]>({
    queryKey: ["doc-cats", tenant],
    queryFn: async () => {
      const r = await fetch(`${base}/documents/categories`, { credentials: "include" });
      if (!r.ok) throw new Error("Kategoriler yüklenemedi");
      return r.json();
    },
  });

  // ─── Evraklar ─────────────────────────────────────────────────────────────
  const docsQ = useQuery<DocumentsResponse>({
    queryKey: ["docs", tenant, search, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);
      if (selectedCategory) params.set("categoryId", String(selectedCategory));
      const r = await fetch(`${base}/documents?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Evraklar yüklenemedi");
      return r.json();
    },
  });

  // ─── Silme ────────────────────────────────────────────────────────────────
  const delDocMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${base}/documents/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["docs"] });
      toast({ title: "Evrak silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Evrak silinemedi", variant: "destructive" }),
  });

  const categories = catsQ.data ?? [];
  const docs = docsQ.data?.documents ?? [];
  const total = docsQ.data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evrak Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-0.5">Dosyalarınızı ve belgelerinizi merkezi olarak yönetin</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditCat(null); setCatModal(true); }}>
            <Folder className="h-4 w-4 mr-1.5" /> Kategori Ekle
          </Button>
          <Button onClick={() => setUploadModal(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> Dosya Yükle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sol: Kategoriler */}
        <div className="col-span-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Kategoriler</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 mb-1 transition-colors
                ${selectedCategory === null ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >
              <FileText className="h-4 w-4" /> Tüm Evraklar
              <span className="ml-auto text-xs text-gray-400">{total}</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 mb-1 transition-colors
                  ${selectedCategory === cat.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="truncate">{cat.name}</span>
                <button
                  className="ml-auto opacity-0 group-hover:opacity-100 hover:text-indigo-600"
                  onClick={(e) => { e.stopPropagation(); setEditCat(cat); setCatModal(true); }}
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </button>
            ))}
            {categories.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-2">Henüz kategori yok</p>
            )}
          </div>
        </div>

        {/* Sağ: Evrak Listesi */}
        <div className="col-span-9 space-y-4">
          {/* Arama */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Evrak adı ile ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Liste */}
          {docsQ.isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Yükleniyor...</div>
          ) : docs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Evrak bulunamadı</p>
              <p className="text-sm text-gray-400 mt-1">Yeni dosya yüklemek için "Dosya Yükle" butonunu kullanın</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">DOSYA</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">KATEGORİ</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">BOYUT</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">TARİH</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">İŞLEM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {docs.map((doc) => {
                    const cat = categories.find((c) => c.id === doc.categoryId);
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {mimeIcon(doc.mimeType)}
                            <div>
                              <p className="font-medium text-gray-900">{doc.name}</p>
                              <p className="text-xs text-gray-400">{doc.fileName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {cat ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatBytes(doc.fileSize)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(doc.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`${base}/documents/${doc.id}/download`}
                              download={doc.fileName}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-indigo-600 transition-colors"
                              title="İndir"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => {
                                if (confirm(`"${doc.name}" evrakını silmek istediğinizden emin misiniz?`))
                                  delDocMut.mutate(doc.id);
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                Toplam {total} evrak
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {uploadModal && (
        <UploadModal
          base={base}
          categories={categories}
          onClose={() => setUploadModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["docs"] });
            setUploadModal(false);
            toast({ title: "Dosya yüklendi" });
          }}
        />
      )}

      {/* Category Modal */}
      {catModal && (
        <CategoryModal
          base={base}
          existing={editCat}
          onClose={() => { setCatModal(false); setEditCat(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["doc-cats"] });
            setCatModal(false);
            setEditCat(null);
            toast({ title: editCat ? "Kategori güncellendi" : "Kategori oluşturuldu" });
          }}
        />
      )}
    </div>
  );
}

// ─── Upload Modal ────────────────────────────────────────────────────────────
function UploadModal({
  base, categories, onClose, onSuccess,
}: {
  base: string;
  categories: DocumentCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!file) { setError("Lütfen bir dosya seçin"); return; }
    if (!name.trim()) { setError("Evrak adı zorunludur"); return; }
    setError("");
    setUploading(true);
    setProgress(10);

    try {
      // 1) Presigned URL al
      const urlRes = await fetch(`${base}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Upload URL alınamadı");
      const { uploadURL, objectPath } = await urlRes.json();
      setProgress(30);

      // 2) GCS'e yükle
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Dosya yüklenemedi");
      setProgress(70);

      // 3) DB kaydı oluştur
      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const docRes = await fetch(`${base}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          objectPath,
          categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
          tags: tagArr.length > 0 ? tagArr : undefined,
        }),
      });
      if (!docRes.ok) throw new Error("Evrak kaydı oluşturulamadı");
      setProgress(100);
      setTimeout(onSuccess, 300);
    } catch (err: any) {
      setError(err.message ?? "Yükleme başarısız");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Dosya Yükle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Dosya Seç */}
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
              ${file ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}`}
          >
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            {file ? (
              <>
                <div className="text-2xl mb-2">{mimeIcon(file.type)}</div>
                <p className="text-sm font-medium text-indigo-700">{file.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatBytes(file.size)}</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Dosya seçmek için tıklayın</p>
                <p className="text-xs text-gray-400 mt-0.5">Tüm dosya türleri desteklenir</p>
              </>
            )}
          </div>

          {/* Evrak Adı */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Evrak Adı *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Evrak adını girin"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Kısa açıklama (opsiyonel)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Kategori */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Kategori</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">— Kategorisiz —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Etiketler */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Etiketler (virgülle ayırın)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="fatura, sözleşme, onaylı"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {uploading && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Yükleniyor...</span><span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={uploading}>İptal</Button>
          <Button className="flex-1" onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? "Yükleniyor..." : "Yükle"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Modal ──────────────────────────────────────────────────────────
function CategoryModal({
  base, existing, onClose, onSuccess,
}: {
  base: string;
  existing: DocumentCategory | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? "#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const COLORS = [
    "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
    "#ef4444", "#8b5cf6", "#06b6d4", "#f97316",
  ];

  const handleSave = async () => {
    if (!name.trim()) { setError("Kategori adı zorunludur"); return; }
    setSaving(true);
    try {
      const method = existing ? "PUT" : "POST";
      const url = existing
        ? `${base}/documents/categories/${existing.id}`
        : `${base}/documents/categories`;
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!r.ok) throw new Error("Kaydedilemedi");
      onSuccess();
    } catch (err: any) {
      setError(err.message ?? "Sunucu hatası");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{existing ? "Kategori Düzenle" : "Kategori Ekle"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Kategori Adı *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Faturalar, Sözleşmeler"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Renk</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-2 ring-gray-700 scale-110" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>İptal</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
