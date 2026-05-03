import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft, Search, X, Check, AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle2, Clock, Lock, Download, Scan, ListFilter,
  PackagePlus, Trash2, RefreshCw, ChevronDown, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Session {
  id: number;
  name: string;
  status: "open" | "closed" | "approved";
  notes?: string | null;
  totalProducts: number;
  totalDiff: number;
  openedAt: string;
  closedAt?: string | null;
  approvedAt?: string | null;
}

interface CountItem {
  id: number;
  productId: number;
  productCode: string;
  productName: string;
  systemStock: number;
  countedQty: number;
  diff: number;
  isAdjusted: boolean;
  notes?: string | null;
}

interface Product {
  id: number;
  productCode: string;
  name: string;
  barcode?: string | null;
  stock: number;
}

type FilterMode = "all" | "diff" | "ok" | "pending";

const FILTER_OPTS: { id: FilterMode; label: string }[] = [
  { id: "all",     label: "Tümü" },
  { id: "diff",    label: "Fark Olanlar" },
  { id: "ok",      label: "Eşleşenler" },
  { id: "pending", label: "Bekleyenler" },
];

export default function StockCountDetail({ id }: { id: string }) {
  const sid = Number(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchProduct, setSearchProduct] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [editQty, setEditQty] = useState<Record<number, string>>({});
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery<{ session: Session; items: CountItem[] }>({
    queryKey: ["stock-count-detail", sid],
    queryFn: async () => {
      const res = await fetch(`/api/stock-counts/${sid}`, { credentials: "include" });
      if (!res.ok) throw new Error("Oturum yüklenemedi");
      return res.json();
    },
  });

  const { data: productsData } = useQuery<{ products: Product[] }>({
    queryKey: ["products-for-count"],
    queryFn: async () => {
      const res = await fetch("/api/products?limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Ürünler yüklenemedi");
      return res.json();
    },
    enabled: showProductPicker,
    staleTime: 60_000,
  });

  // ─── Mutasyonlar ───────────────────────────────────────────────────────────
  const upsertItem = useMutation({
    mutationFn: async (payload: { productCode?: string; barcode?: string; productId?: number; countedQty: number; notes?: string }) => {
      const res = await fetch(`/api/stock-counts/${sid}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kaydedilemedi");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-count-detail", sid] });
      qc.invalidateQueries({ queryKey: ["stock-count-sessions"] });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`/api/stock-counts/${sid}/items/${itemId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-count-detail", sid] });
      qc.invalidateQueries({ queryKey: ["stock-count-sessions"] });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const loadAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/stock-counts/${sid}/load-all`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Yüklenemedi");
      return json;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["stock-count-detail", sid] });
      qc.invalidateQueries({ queryKey: ["stock-count-sessions"] });
      toast({ title: `${d.added} ürün eklendi`, description: `Toplam ${d.total} ürün var` });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/stock-counts/${sid}/close`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kapatılamadı");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-count-detail", sid] });
      qc.invalidateQueries({ queryKey: ["stock-count-sessions"] });
      setConfirmClose(false);
      toast({ title: "Oturum kapatıldı", description: "Artık düzeltmeleri onaylayabilirsiniz" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/stock-counts/${sid}/approve`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Onaylanamadı");
      return json;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["stock-count-detail", sid] });
      qc.invalidateQueries({ queryKey: ["stock-count-sessions"] });
      setConfirmApprove(false);
      toast({ title: "Düzeltmeler uygulandı", description: `${d.adjusted} ürün stoku güncellendi` });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  // ─── Barkod ile sayım ─────────────────────────────────────────────────────
  const handleBarcodeSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const value = barcodeInput.trim();
    if (!value) return;

    const existing = data?.items.find(i => i.productCode === value);
    const newQty = (existing?.countedQty ?? 0) + 1;

    upsertItem.mutate(
      { barcode: value, productCode: value, countedQty: newQty },
      {
        onSuccess: () => {
          setBarcodeInput("");
          barcodeRef.current?.focus();
        },
      }
    );
  }, [barcodeInput, data?.items, upsertItem]);

  const handleQtyBlur = useCallback((item: CountItem, rawVal: string) => {
    const val = parseInt(rawVal, 10);
    if (isNaN(val) || val < 0) return;
    if (val === item.countedQty) return;
    upsertItem.mutate({ productId: item.productId, countedQty: val });
    setEditQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  }, [upsertItem]);

  // ─── CSV export ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    const res = await fetch(`/api/stock-counts/${sid}/export`, { credentials: "include" });
    if (!res.ok) { toast({ title: "Export başarısız", variant: "destructive" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sayim_${sid}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>;
  if (!data) return <div className="p-8 text-center text-destructive">Oturum bulunamadı</div>;

  const { session, items } = data;
  const isOpen = session.status === "open";
  const isClosed = session.status === "closed";
  const isApproved = session.status === "approved";

  const diffItems = items.filter(i => i.diff !== 0);
  const okItems = items.filter(i => i.diff === 0);
  const pendingItems = items.filter(i => i.diff !== 0 && !i.isAdjusted);

  const displayItems = filterMode === "diff"    ? diffItems
                     : filterMode === "ok"      ? okItems
                     : filterMode === "pending" ? pendingItems
                     : items;

  const filteredProducts = (productsData?.products ?? []).filter(p =>
    !searchProduct ||
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.productCode.toLowerCase().includes(searchProduct.toLowerCase())
  );

  const totalCountedUnits = items.reduce((s, i) => s + i.countedQty, 0);
  const totalDiffSum = items.reduce((s, i) => s + i.diff, 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 pb-36 md:pb-32">
      {/* Başlık */}
      <div className="flex items-start gap-3">
        <Link href="/stock-counts">
          <Button variant="ghost" size="icon" className="-ml-2 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{session.name}</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              isOpen ? "text-amber-600 bg-amber-500/10 border-amber-500/20" :
              isClosed ? "text-blue-600 bg-blue-500/10 border-blue-500/20" :
              "text-green-600 bg-green-500/10 border-green-500/20"
            }`}>
              {isOpen ? "Açık" : isClosed ? "Kapalı" : "Onaylandı"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Açılış: {format(new Date(session.openedAt), "d MMMM yyyy HH:mm", { locale: tr })}
            {session.notes && ` • ${session.notes}`}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          {isOpen && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 h-8"
                onClick={() => loadAllMutation.mutate()}
                disabled={loadAllMutation.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 ${loadAllMutation.isPending ? "animate-spin" : ""}`} />
                Tümünü Yükle
              </Button>
              <Button size="sm" className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-700"
                onClick={() => setConfirmClose(true)}>
                <Lock className="h-3.5 w-3.5" /> Kapat
              </Button>
            </>
          )}
          {isClosed && (
            <Button size="sm" className="gap-1.5 h-8 bg-green-600 hover:bg-green-700"
              onClick={() => setConfirmApprove(true)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Onayla ve Düzelt
            </Button>
          )}
        </div>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Sayılan Ürün",  value: items.length,        color: "text-foreground" },
          { label: "Fark Olan",     value: diffItems.length,     color: "text-amber-600" },
          { label: "Eşleşen",       value: okItems.length,       color: "text-green-600" },
          { label: "Onay Bekleyen", value: pendingItems.length,  color: "text-blue-600" },
        ].map(c => (
          <div key={c.label} className="bg-card border rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Barkod giriş / ürün ekleme (sadece open) */}
      {isOpen && (
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold">Ürün Say</p>
          <div className="flex gap-2">
            <form onSubmit={handleBarcodeSubmit} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={barcodeRef}
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  placeholder="Barkod okut veya ürün kodu gir..."
                  className="pl-9"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey && displayItems.length > 0) {
                      e.preventDefault();
                      document
                        .querySelector<HTMLInputElement>(
                          `input[data-count-row="${displayItems[0].id}"]`
                        )
                        ?.focus();
                    }
                  }}
                />
              </div>
              <Button type="submit" disabled={!barcodeInput.trim() || upsertItem.isPending}>
                Ekle (+1)
              </Button>
            </form>
            <Button variant="outline" className="gap-1.5 shrink-0"
              onClick={() => setShowProductPicker(v => !v)}>
              <PackagePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Listeden Seç</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>

          {/* Ürün picker */}
          {showProductPicker && (
            <div className="border rounded-xl overflow-hidden">
              <div className="p-2 border-b flex items-center gap-2 bg-muted/30">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchProduct}
                  onChange={e => setSearchProduct(e.target.value)}
                  placeholder="Ürün ara..."
                  className="border-0 p-0 h-auto focus-visible:ring-0 text-sm bg-transparent"
                  autoFocus
                />
                {searchProduct && <button onClick={() => setSearchProduct("")}><X className="h-4 w-4" /></button>}
              </div>
              <div className="max-h-48 overflow-y-auto divide-y">
                {filteredProducts.slice(0, 50).map(p => {
                  const existing = items.find(i => i.productId === p.id);
                  return (
                    <div key={p.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        const newQty = (existing?.countedQty ?? 0) + 1;
                        upsertItem.mutate({ productId: p.id, countedQty: newQty });
                      }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.productCode}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        Stok: {p.stock}
                        {existing && <p className="text-primary font-semibold">Sayılan: {existing.countedQty}</p>}
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtreler */}
      <div className="flex items-center gap-2 flex-wrap">
        <ListFilter className="h-4 w-4 text-muted-foreground" />
        {FILTER_OPTS.map(opt => (
          <button key={opt.id} onClick={() => setFilterMode(opt.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filterMode === opt.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
            }`}>
            {opt.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{displayItems.length} kayıt</span>
      </div>

      {/* Tablo */}
      {displayItems.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
          {items.length === 0 ? "Henüz ürün eklenmedi" : "Bu filtreye uyan ürün yok"}
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Ürün</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase w-24">Sistem</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase w-32">Sayılan</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase w-24">Fark</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase w-24">Durum</th>
                  {isOpen && <th className="w-12" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayItems.map(item => {
                  const rawQty = editQty[item.id];
                  const displayQty = rawQty !== undefined ? rawQty : String(item.countedQty);
                  const diff = item.diff;
                  return (
                    <tr key={item.id} className={`hover:bg-muted/20 ${diff !== 0 && !item.isAdjusted ? "bg-amber-500/10" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.productCode}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{item.systemStock}</td>
                      <td className="px-4 py-3">
                        {isOpen ? (
                          <Input
                            type="number"
                            min="0"
                            value={displayQty}
                            onChange={e => setEditQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                            onBlur={e => handleQtyBlur(item, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Tab" && !e.shiftKey) {
                                const idx = displayItems.findIndex((x) => x.id === item.id);
                                const next = displayItems[idx + 1];
                                if (next) {
                                  e.preventDefault();
                                  const el = document.querySelector<HTMLInputElement>(
                                    `input[data-count-row="${next.id}"]`
                                  );
                                  el?.focus();
                                }
                              }
                            }}
                            data-count-row={item.id}
                            className="w-20 mx-auto text-center h-7 text-sm font-mono"
                          />
                        ) : (
                          <p className="text-center font-mono font-semibold">{item.countedQty}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {diff === 0 ? (
                          <span className="text-green-600 font-semibold">±0</span>
                        ) : diff > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-blue-600 font-semibold">
                            <TrendingUp className="h-3.5 w-3.5" />+{diff}
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1 text-red-600 font-semibold">
                            <TrendingDown className="h-3.5 w-3.5" />{diff}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.isAdjusted ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold">
                            <Check className="h-3.5 w-3.5" />Düzeltildi
                          </span>
                        ) : diff === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />Eşleşiyor
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" />Bekliyor
                          </span>
                        )}
                      </td>
                      {isOpen && (
                        <td className="px-2 py-3 text-center">
                          <button onClick={() => deleteItem.mutate(item.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onayla özet (sadece closed) */}
      {isClosed && pendingItems.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-blue-300">{pendingItems.length} ürün düzeltme bekliyor</p>
            <p className="text-sm text-blue-600">Onaylandığında stoklar güncellenir ve hareket kaydı oluşur</p>
          </div>
          <Button className="bg-green-600 hover:bg-green-700 shrink-0" onClick={() => setConfirmApprove(true)}>
            <CheckCircle2 className="h-4 w-4 mr-2" />Toplu Onayla
          </Button>
        </div>
      )}

      {/* Oturumu kapat onayı */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Lock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-lg">Oturumu Kapat?</p>
                <p className="text-sm text-muted-foreground">Kapatıldıktan sonra yeni ürün eklenemez</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}>
                {closeMutation.isPending ? "Kapatılıyor..." : "Evet, Kapat"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmClose(false)}>İptal</Button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu onayla */}
      {isOpen && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Sayılan adet</p>
                <p className="text-xl font-bold tabular-nums">{totalCountedUnits}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Net fark Σ</p>
                <p className={`text-xl font-bold tabular-nums ${totalDiffSum === 0 ? "text-green-600" : "text-amber-600"}`}>
                  {totalDiffSum > 0 ? "+" : ""}
                  {totalDiffSum}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Enter: miktarı kaydet · Tab: sonraki satır (liste sırasına göre). Taslak için tarayıcı oturumunu kapatmayın;
              kesin kayıt &quot;Kapat&quot; ve ardından &quot;Onayla&quot; ile yapılır.
            </p>
          </div>
        </div>
      )}

      {confirmApprove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-lg">Düzeltmeleri Onayla?</p>
                <p className="text-sm text-muted-foreground">{pendingItems.length} ürün stoku güncellenecek ve hareket kaydı oluşacak</p>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1 max-h-40 overflow-y-auto">
              {pendingItems.map(i => (
                <div key={i.id} className="flex justify-between">
                  <span className="truncate mr-2">{i.productName}</span>
                  <span className={`font-mono font-semibold shrink-0 ${i.diff > 0 ? "text-blue-600" : "text-red-600"}`}>
                    {i.systemStock} → {i.countedQty}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}>
                {approveMutation.isPending ? "Uygulanıyor..." : "Evet, Onayla"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmApprove(false)}>İptal</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

