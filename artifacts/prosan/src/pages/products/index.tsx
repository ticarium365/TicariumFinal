import { useState, useCallback, useEffect, type ReactNode } from "react";
import { useSearch } from "wouter";
import {
  useListProducts,
  useUpdateProduct,
  useDeleteProduct,
  useListCategories,
  useListBrands,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Search,
  Filter,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Package,
  PackageX,
  AlertTriangle,
  Bell,
  Flame,
  Sparkles,
  Snail,
  ChevronRight as ChevronRightIcon,
  FileDown,
  FileUp,
  Loader2,
  Tags,
  DollarSign,
} from "lucide-react";
import { ImportProductsModal } from "@/components/import-products-modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLowStockAlerts } from "@/hooks/use-low-stock-alerts";
import { SkeletonTable } from "@/components/ui/skeleton";

/** Üst sınır yoksa türetilmiş tavan (min × 5, en az 20) — fazla stok rozeti için */
function stockCeiling(minStock: number) {
  return Math.max(minStock * 5, 20);
}

function stockLevel(stock: number, minStock: number): "critical" | "normal" | "high" {
  if (stock < minStock) return "critical";
  if (stock > stockCeiling(minStock)) return "high";
  return "normal";
}

function ProductThumb({ name }: { name: string }) {
  const initial = name.trim().slice(0, 2).toUpperCase() || "?";
  return (
    <div
      className="h-10 w-10 shrink-0 rounded-[6px] border border-border/80 bg-muted/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground"
      aria-hidden
    >
      {initial}
    </div>
  );
}

// E4 — Hızlı mover / yavaş mover / yeni ürün rozetleri
function MoverBadges({
  sales30Days,
  createdAt,
  stock,
}: {
  sales30Days?: number;
  createdAt?: string | null;
  stock: number;
}) {
  const sales = sales30Days ?? 0;
  const createdMs = createdAt ? new Date(createdAt).getTime() : 0;
  const ageDays = createdMs ? (Date.now() - createdMs) / 86_400_000 : Infinity;

  const isHot = sales >= 5;
  const isNew = ageDays <= 14 && createdMs > 0;
  const isSlow = !isHot && !isNew && sales === 0 && stock > 0 && ageDays > 60;

  if (!isHot && !isNew && !isSlow) return null;

  return (
    <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
      {isHot && (
        <span
          title={`Son 30 günde ${sales} adet satıldı`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200"
        >
          <Flame className="h-2.5 w-2.5" /> Çok satıyor
        </span>
      )}
      {isNew && (
        <span
          title="Son 14 gün içinde eklendi"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200"
        >
          <Sparkles className="h-2.5 w-2.5" /> Yeni
        </span>
      )}
      {isSlow && (
        <span
          title="60+ gündür hareketsiz"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200"
        >
          <Snail className="h-2.5 w-2.5" /> Yavaş
        </span>
      )}
    </span>
  );
}

function InlineEdit({
  value,
  type = "text",
  onSave,
  className = "",
  renderDisplay,
}: {
  value: string | number;
  type?: string;
  onSave: (v: string) => Promise<void>;
  className?: string;
  renderDisplay?: (displayValue: string | number) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const [saving, setSaving] = useState(false);

  const start = () => {
    setVal(String(value));
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (val === String(value)) { setEditing(false); return; }
    setSaving(true);
    await onSave(val);
    setSaving(false);
    setEditing(false);
  };

  if (!editing) {
    if (renderDisplay) {
      return (
        <span className={`inline-flex items-center gap-1 group ${className}`}>
          <button
            type="button"
            className="p-0 border-0 bg-transparent cursor-pointer inline-flex items-center"
            onClick={start}
            title="Düzenlemek için tıkla"
          >
            {renderDisplay(value)}
          </button>
          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 shrink-0 cursor-pointer" onClick={start} />
        </span>
      );
    }
    return (
      <span
        className={`cursor-pointer hover:bg-muted/70 rounded px-1 py-0.5 transition-colors group inline-flex items-center gap-1 ${className}`}
        onClick={start}
        title="Düzenlemek için tıkla"
      >
        {value}
        <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 shrink-0" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-7 w-24 text-xs px-1.5"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
      />
      <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600" onClick={save} disabled={saving}>
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={cancel}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}

const PAGE_SIZE = 50;

export default function ProductsList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const searchStr = useSearch();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");
  const [brand, setBrand] = useState("__all__");
  const [lowStock, setLowStock] = useState(() => {
    const params = new URLSearchParams(searchStr);
    return params.get("lowStock") === "true";
  });
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkPriceVal, setBulkPriceVal] = useState("");
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkCatVal, setBulkCatVal] = useState<string>("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  // URL parametresi değiştiğinde lowStock filtresi güncelle
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    setLowStock(params.get("lowStock") === "true");
  }, [searchStr]);
  useEffect(() => {
    setSelected(new Set());
  }, [page, category, brand, lowStock]);

  const queryParams = {
    search: debouncedSearch || undefined,
    category: category !== "__all__" ? category : undefined,
    brand: brand !== "__all__" ? brand : undefined,
    lowStock: lowStock ? true : undefined,
    page,
    limit: PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc" as const,
  };

  const { data, isLoading } = useListProducts(queryParams);
  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  }, [queryClient]);

  const handleQuickUpdate = useCallback(
    async (id: number, field: string, raw: string) => {
      const val =
        ["stock", "minStock"].includes(field)
          ? parseInt(raw)
          : ["purchasePrice", "salePrice", "profitPercent"].includes(field)
          ? parseFloat(raw)
          : raw;

      // For profit calc: get the current product data
      const currentProduct = data?.products.find((p) => p.id === id);

      let extra: Record<string, number> = {};
      if (field === "salePrice" && currentProduct?.purchasePrice) {
        const sp = Number(val);
        const pp = Number(currentProduct.purchasePrice);
        if (pp > 0) extra.profitPercent = Math.round(((sp - pp) / pp) * 100 * 100) / 100;
      } else if (field === "profitPercent" && currentProduct?.purchasePrice) {
        const pct = Number(val);
        const pp = Number(currentProduct.purchasePrice);
        extra.salePrice = Math.round(pp * (1 + pct / 100) * 100) / 100;
      } else if (field === "purchasePrice" && currentProduct?.profitPercent) {
        const pp = Number(val);
        const pct = Number(currentProduct.profitPercent);
        extra.salePrice = Math.round(pp * (1 + pct / 100) * 100) / 100;
      }

      try {
        await updateProduct.mutateAsync({
          id,
          data: { [field]: val, ...extra },
        });
        invalidate();
        toast({ title: "Güncellendi", description: "Değişiklik kaydedildi." });
      } catch {
        toast({ title: "Hata", description: "Güncellenemedi.", variant: "destructive" });
      }
    },
    [data, updateProduct, invalidate, toast]
  );

  const handleDelete = async (id: number, name: string) => {
    try {
      await deleteProduct.mutateAsync({ id });
      invalidate();
      toast({ title: "Silindi", description: `"${name}" silindi.` });
    } catch {
      toast({ title: "Hata", description: "Ürün silinemedi.", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ sortBy: "name", sortOrder: "asc" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category !== "__all__") params.set("category", category);
      if (brand !== "__all__") params.set("brand", brand);
      if (lowStock) params.set("lowStock", "true");

      const res = await fetch(`/api/products/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("API hatası");
      const json = await res.json() as { products: any[] };

      const rows = json.products.map((p: any) => ({
        "Ürün Kodu": p.productCode ?? "",
        "Barkod": p.barcode ?? "",
        "Ürün Adı": p.name,
        "Marka": p.brand ?? "",
        "Kategori": p.category ?? "",
        "Stok": p.stock,
        "Min. Stok": p.minStock,
        "Alış Fiyatı (TL)": Number(p.purchasePrice).toFixed(2),
        "Satış Fiyatı (TL)": Number(p.salePrice).toFixed(2),
        "Kâr (%)": Number(p.profitPercent).toFixed(2),
        "Açıklama": p.description ?? "",
      }));

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = [
        { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 18 },
        { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 30 },
      ];
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ürünler");

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `ticarium365-urunler-${date}.xlsx`);

      toast({ title: "Excel indirildi", description: `${rows.length} ürün dışa aktarıldı.` });
    } catch {
      toast({ title: "Hata", description: "Excel oluşturulamadı.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSelected = async () => {
    const rows = (data?.products ?? []).filter((p) => selected.has(p.id));
    if (!rows.length) return;
    setExporting(true);
    try {
      const mapped = rows.map((p: any) => ({
        "Ürün Kodu": p.productCode ?? "",
        Barkod: p.barcode ?? "",
        "Ürün Adı": p.name,
        Marka: p.brand ?? "",
        Kategori: p.category ?? "",
        Stok: p.stock,
        "Min. Stok": p.minStock,
        "Alış Fiyatı (TL)": Number(p.purchasePrice).toFixed(2),
        "Satış Fiyatı (TL)": Number(p.salePrice).toFixed(2),
        "Kâr (%)": Number(p.profitPercent).toFixed(2),
        Açıklama: p.description ?? "",
      }));
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(mapped);
      ws["!cols"] = [
        { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 18 },
        { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Seçili");
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `ticarium365-urunler-secili-${date}.xlsx`);
      toast({ title: "Excel indirildi", description: `${mapped.length} satır dışa aktarıldı.` });
    } catch {
      toast({ title: "Hata", description: "Excel oluşturulamadı.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!isAdmin) return;
    const ids = [...selected];
    setBulkDeleting(true);
    let ok = 0;
    for (const id of ids) {
      try {
        await deleteProduct.mutateAsync({ id });
        ok++;
      } catch {
        /* continue */
      }
    }
    setBulkDeleting(false);
    setSelected(new Set());
    invalidate();
    toast({
      title: "Toplu silme",
      description: ok === ids.length ? `${ok} ürün silindi.` : `${ok}/${ids.length} ürün silindi; bazıları atlandı.`,
      variant: ok === 0 ? "destructive" : "default",
    });
  };

  const handleBulkPriceApply = async () => {
    const price = parseFloat(bulkPriceVal.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      toast({ title: "Geçersiz fiyat", variant: "destructive" });
      return;
    }
    const ids = [...selected];
    for (const id of ids) {
      const current = data?.products.find((p) => p.id === id);
      let extra: Record<string, number> = {};
      if (current?.purchasePrice !== undefined) {
        const pp = Number(current.purchasePrice);
        if (pp > 0) extra.profitPercent = Math.round(((price - pp) / pp) * 100 * 100) / 100;
      }
      try {
        await updateProduct.mutateAsync({ id, data: { salePrice: price, ...extra } });
      } catch {
        /* continue */
      }
    }
    setBulkPriceOpen(false);
    setBulkPriceVal("");
    setSelected(new Set());
    invalidate();
    toast({ title: "Satış fiyatı güncellendi", description: `${ids.length} ürün.` });
  };

  const handleBulkCategoryApply = async () => {
    const cat = bulkCatVal.trim();
    if (!cat) {
      toast({ title: "Kategori seçin", variant: "destructive" });
      return;
    }
    const ids = [...selected];
    for (const id of ids) {
      try {
        await updateProduct.mutateAsync({ id, data: { category: cat } });
      } catch {
        /* continue */
      }
    }
    setBulkCatOpen(false);
    setBulkCatVal("");
    setSelected(new Set());
    invalidate();
    toast({ title: "Kategori atandı", description: `${ids.length} ürün.` });
  };

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const colCount = isAdmin ? 10 : 8;
  const allOnPageSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleAllPage = () => {
    setSelected((s) => {
      const n = new Set(s);
      const allSelected = products.every((p) => n.has(p.id));
      if (allSelected) products.forEach((p) => n.delete(p.id));
      else products.forEach((p) => n.add(p.id));
      return n;
    });
  };

  const resetPage = () => setPage(1);

  // E1 + E5 — Kritik stok özeti (mevcut hook'tan)
  const { data: lowStockData } = useLowStockAlerts();
  const criticalCount = lowStockData?.critical ?? 0;
  const lowCount = lowStockData?.low ?? 0;
  const totalAlerts = lowStockData?.count ?? 0;
  const previewLowProducts = (lowStockData?.products ?? []).slice(0, 4);

  return (
    <div className={selected.size > 0 ? "space-y-4 pb-24 md:pb-28" : "space-y-4"}>
      {/* Başlık */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Ürün Yönetimi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} ürün kayıtlı</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={exporting}
            title="Tüm ürünleri Excel olarak indir"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Excel'e Aktar</span>
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowImportModal(true)}
              title="Excel veya CSV dosyasından ürün içe aktar"
            >
              <FileUp className="h-4 w-4" />
              <span className="hidden sm:inline">İçe Aktar</span>
            </Button>
          )}
          {(isAdmin || user?.role === "staff") && (
            <Link href="/products/new">
              <Button className="gap-2 shadow">
                <Plus className="h-4 w-4" />
                Yeni Ürün
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* E5 — KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Toplam Ürün</p>
            <p className="text-xl font-bold tabular-nums leading-tight">{total}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-rose-500 to-red-500 text-white flex items-center justify-center shrink-0">
            <PackageX className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Tükenen</p>
            <p className="text-xl font-bold tabular-nums leading-tight text-rose-600">{criticalCount}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Kritik Düşük</p>
            <p className="text-xl font-bold tabular-nums leading-tight text-amber-600">{lowCount}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 text-white flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Toplam Uyarı</p>
            <p className="text-xl font-bold tabular-nums leading-tight">{totalAlerts}</p>
          </div>
        </div>
      </div>

      {/* E1 — Kritik stok uyarı şeridi (sadece kritik ürün varsa görünür) */}
      {totalAlerts > 0 && (
        <div
          className="rounded-xl border border-amber-300/60 shadow-sm p-3 sm:p-4"
          style={{
            background: "linear-gradient(135deg, rgba(255,237,213,0.55) 0%, rgba(254,226,226,0.45) 100%)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-amber-900">
                  {totalAlerts} ürün dikkat istiyor
                  <span className="text-xs font-normal text-amber-800/80 ml-1.5">
                    ({criticalCount} tükendi · {lowCount} kritik seviyede)
                  </span>
                </p>
                <button
                  onClick={() => { setLowStock(true); resetPage(); }}
                  className="text-xs font-semibold text-amber-900 hover:text-amber-700 inline-flex items-center gap-0.5 whitespace-nowrap"
                  data-testid="btn-show-critical"
                >
                  Tümünü göster
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {previewLowProducts.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {previewLowProducts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/70 hover:bg-white px-2.5 py-1 rounded-full border border-amber-200/60 text-amber-900 transition-colors"
                    >
                      <span className="truncate max-w-[140px]">{p.name}</span>
                      <span className={`tabular-nums font-bold ${p.stock === 0 ? "text-rose-600" : "text-amber-600"}`}>
                        {p.stock}/{p.minStock}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Arama + Filtreler */}
      <div className="bg-card border rounded-xl p-3 shadow-sm space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Ürün adı, kodu, barkod veya marka..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters((v) => !v)}
            title="Filtrele"
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button
            variant={lowStock ? "destructive" : "outline"}
            size="sm"
            onClick={() => { setLowStock((v) => !v); resetPage(); }}
            className="gap-1.5 whitespace-nowrap"
          >
            Kritik Stok
          </Button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Kategori</p>
              <Select value={category} onValueChange={(v) => { setCategory(v); resetPage(); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tümü</SelectItem>
                  {(categories as string[] | undefined)?.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Marka</p>
              <Select value={brand} onValueChange={(v) => { setBrand(v); resetPage(); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tümü</SelectItem>
                  {(brands as string[] | undefined)?.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Tablo */}
      {isLoading ? (
        <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
          <SkeletonTable rows={12} columns={colCount} rowHeight={40} />
        </div>
      ) : (
      <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="w-10 px-2 py-2.5">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={() => toggleAllPage()}
                    aria-label="Sayfadaki tümünü seç"
                  />
                </th>
                <th className="w-12 px-1 py-2.5" aria-hidden />
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[88px]">SKU</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider min-w-[180px]">Ürün</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[88px]">Stok</th>
                {isAdmin && (
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell w-[88px]">Alış</th>
                )}
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[96px]">Satış</th>
                {isAdmin && (
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell w-[72px]">Kâr %</th>
                )}
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[100px]">Durum</th>
                <th className="w-[72px]" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="p-6">
                    <EmptyState
                      icon={Package}
                      title={
                        search || category !== "__all__" || brand !== "__all__" || lowStock
                          ? "Filtrelere uyan ürün yok"
                          : "Henüz ürün eklenmedi"
                      }
                      description={
                        search || category !== "__all__" || brand !== "__all__" || lowStock
                          ? "Filtreleri sıfırlayıp tekrar deneyin veya arama terimini değiştirin."
                          : "İlk ürününüzü ekleyerek stok takibine başlayın."
                      }
                      action={
                        search || category !== "__all__" || brand !== "__all__" || lowStock
                          ? {
                              label: "Filtreleri temizle",
                              onClick: () => {
                                setSearch("");
                                setCategory("__all__");
                                setBrand("__all__");
                                setLowStock(false);
                                setPage(1);
                              },
                              testId: "empty-clear-filters",
                            }
                          : isAdmin
                            ? { label: "Ürün Ekle", href: "/products/new", testId: "empty-add-product" }
                            : undefined
                      }
                      secondaryAction={
                        isAdmin && !(search || category !== "__all__" || brand !== "__all__" || lowStock)
                          ? { label: "Excel'den İçe Aktar", href: "/ice-aktarim", testId: "empty-import-product" }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isActive = (p as { isActive?: boolean }).isActive !== false;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-2 py-2.5 align-middle">
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(p.id)) n.delete(p.id);
                              else n.add(p.id);
                              return n;
                            })
                          }
                          aria-label={`Seç: ${p.name}`}
                        />
                      </td>
                      <td className="px-1 py-2.5 align-middle">
                        <ProductThumb name={p.name} />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className="font-mono text-xs text-muted-foreground">{p.productCode}</span>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div>
                          <span className="inline-flex items-center flex-wrap gap-y-0.5">
                            <InlineEdit
                              value={p.name}
                              onSave={(v) => handleQuickUpdate(p.id, "name", v)}
                              className="font-medium"
                            />
                            <MoverBadges
                              sales30Days={(p as any).sales30Days}
                              createdAt={(p as any).createdAt}
                              stock={p.stock}
                            />
                          </span>
                          {p.barcode && (
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{p.barcode}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center align-middle">
                        <InlineEdit
                          value={p.stock}
                          type="number"
                          onSave={(v) => handleQuickUpdate(p.id, "stock", v)}
                          className="justify-center"
                          renderDisplay={(v) => {
                            const n = typeof v === "number" ? v : parseInt(String(v), 10);
                            const stockNum = Number.isFinite(n) ? n : p.stock;
                            const lvl = stockLevel(stockNum, p.minStock);
                            const tone = lvl === "critical" ? "danger" : lvl === "high" ? "info" : "neutral";
                            const title =
                              lvl === "critical"
                                ? `Kritik (min. ${p.minStock})`
                                : lvl === "high"
                                  ? `Fazla (ref. üst sınır ~${stockCeiling(p.minStock)})`
                                  : `Normal · min. ${p.minStock}`;
                            return (
                              <Badge tone={tone} size="sm" className="font-mono tabular-nums justify-center min-w-[2.25rem]" title={title}>
                                {v}
                              </Badge>
                            );
                          }}
                        />
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2.5 text-right align-middle hidden md:table-cell">
                          <InlineEdit
                            value={Number(p.purchasePrice).toFixed(2)}
                            type="number"
                            onSave={(v) => handleQuickUpdate(p.id, "purchasePrice", v)}
                            className="font-mono text-sm text-muted-foreground"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right align-middle">
                        <InlineEdit
                          value={Number(p.salePrice).toFixed(2)}
                          type="number"
                          onSave={(v) => handleQuickUpdate(p.id, "salePrice", v)}
                          className="font-mono font-bold text-primary"
                        />
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2.5 text-right align-middle hidden lg:table-cell">
                          <InlineEdit
                            value={Number(p.profitPercent).toFixed(1)}
                            type="number"
                            onSave={(v) => handleQuickUpdate(p.id, "profitPercent", v)}
                            className="font-mono text-sm text-emerald-600"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-center align-middle">
                        <Badge tone={isActive ? "success" : "neutral"} size="sm">
                          {isActive ? "Yayında" : "Pasif"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/products/${p.id}/edit`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Düzenle">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title="Sil"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Ürünü Sil</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    <strong>{p.name}</strong> silinecek. Bu işlem geri alınamaz.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>İptal</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive hover:bg-destructive/90"
                                    onClick={() => handleDelete(p.id, p.name)}
                                  >
                                    Sil
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Sayfalama */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total} ürün
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 py-1 border rounded-md bg-card font-medium">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm font-medium tabular-nums">
              <strong>{selected.size}</strong> ürün seçili
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setSelected(new Set())}>
                Temizle
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleExportSelected}
                disabled={exporting}
                className="gap-1.5"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Dışa aktar
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="gap-1.5"
                onClick={() => {
                  setBulkPriceVal("");
                  setBulkPriceOpen(true);
                }}
              >
                <DollarSign className="h-4 w-4" />
                Fiyat güncelle
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="gap-1.5"
                onClick={() => {
                  setBulkCatVal("");
                  setBulkCatOpen(true);
                }}
              >
                <Tags className="h-4 w-4" />
                Kategori ata
              </Button>
              {isAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  className="gap-1.5"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Sil
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={bulkPriceOpen} onOpenChange={setBulkPriceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu satış fiyatı</DialogTitle>
            <DialogDescription>Seçili {selected.size} ürün için yeni satış fiyatı (TL).</DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={bulkPriceVal}
            onChange={(e) => setBulkPriceVal(e.target.value)}
            placeholder="0,00"
            className="font-mono"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" type="button" onClick={() => setBulkPriceOpen(false)}>
              İptal
            </Button>
            <Button type="button" onClick={handleBulkPriceApply}>
              Uygula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkCatOpen}
        onOpenChange={(o) => {
          setBulkCatOpen(o);
          if (!o) setBulkCatVal("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu kategori</DialogTitle>
            <DialogDescription>Seçili {selected.size} ürün için kategori.</DialogDescription>
          </DialogHeader>
          <Select value={bulkCatVal || "__pick__"} onValueChange={(v) => v !== "__pick__" && setBulkCatVal(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Kategori seçin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__pick__" disabled>
                Kategori seçin
              </SelectItem>
              {(categories as string[] | undefined)?.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" type="button" onClick={() => setBulkCatOpen(false)}>
              İptal
            </Button>
            <Button type="button" onClick={handleBulkCategoryApply}>
              Uygula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportProductsModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={invalidate}
      />
    </div>
  );
}
