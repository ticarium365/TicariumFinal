import { useState, useCallback } from "react";
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
} from "lucide-react";
import { Link } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface EditState {
  productId: number;
  field: string;
  value: string;
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock === 0) return <Badge variant="destructive" className="text-xs font-mono">{stock}</Badge>;
  if (stock <= minStock) return <Badge className="bg-amber-500 hover:bg-amber-600 text-xs font-mono">{stock}</Badge>;
  return <Badge variant="secondary" className="text-xs font-mono">{stock}</Badge>;
}

function InlineEdit({
  value,
  type = "text",
  onSave,
  className = "",
}: {
  value: string | number;
  type?: string;
  onSave: (v: string) => Promise<void>;
  className?: string;
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
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");
  const [brand, setBrand] = useState("__all__");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

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

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ürün Yönetimi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} ürün kayıtlı</p>
        </div>
        <Link href="/products/new">
          <Button className="gap-2 shadow">
            <Plus className="h-4 w-4" />
            Yeni Ürün
          </Button>
        </Link>
      </div>

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
      <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[100px]">Kod</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ürün Adı</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Marka</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Kategori</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[80px]">Stok</th>
                {isAdmin && (
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell w-[100px]">Alış (TL)</th>
                )}
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[100px]">Satış (TL)</th>
                {isAdmin && (
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell w-[80px]">Kâr %</th>
                )}
                <th className="w-[80px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: isAdmin ? 9 : 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-muted rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 7} className="py-16 text-center text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>Ürün bulunamadı.</p>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors group">
                    {/* Kod */}
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-muted-foreground">{p.productCode}</span>
                    </td>

                    {/* Ad */}
                    <td className="px-3 py-2.5">
                      <div>
                        <InlineEdit
                          value={p.name}
                          onSave={(v) => handleQuickUpdate(p.id, "name", v)}
                          className="font-medium"
                        />
                        {p.barcode && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{p.barcode}</p>
                        )}
                      </div>
                    </td>

                    {/* Marka */}
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <InlineEdit
                        value={p.brand ?? "—"}
                        onSave={(v) => handleQuickUpdate(p.id, "brand", v)}
                        className="text-sm text-muted-foreground"
                      />
                    </td>

                    {/* Kategori */}
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      {p.category ? (
                        <InlineEdit
                          value={p.category}
                          onSave={(v) => handleQuickUpdate(p.id, "category", v)}
                          className="text-xs"
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* Stok */}
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center">
                        <InlineEdit
                          value={p.stock}
                          type="number"
                          onSave={(v) => handleQuickUpdate(p.id, "stock", v)}
                          className="font-mono font-bold"
                        />
                      </div>
                      {p.stock <= p.minStock && (
                        <div className="text-[9px] text-amber-600 font-medium mt-0.5">min:{p.minStock}</div>
                      )}
                    </td>

                    {/* Alış */}
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-right hidden md:table-cell">
                        <InlineEdit
                          value={Number(p.purchasePrice).toFixed(2)}
                          type="number"
                          onSave={(v) => handleQuickUpdate(p.id, "purchasePrice", v)}
                          className="font-mono text-sm text-muted-foreground"
                        />
                      </td>
                    )}

                    {/* Satış */}
                    <td className="px-3 py-2.5 text-right">
                      <InlineEdit
                        value={Number(p.salePrice).toFixed(2)}
                        type="number"
                        onSave={(v) => handleQuickUpdate(p.id, "salePrice", v)}
                        className="font-mono font-bold text-primary"
                      />
                    </td>

                    {/* Kâr */}
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-right hidden lg:table-cell">
                        <InlineEdit
                          value={Number(p.profitPercent).toFixed(1)}
                          type="number"
                          onSave={(v) => handleQuickUpdate(p.id, "profitPercent", v)}
                          className="font-mono text-sm text-emerald-700"
                        />
                      </td>
                    )}

                    {/* İşlemler */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
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
    </div>
  );
}
