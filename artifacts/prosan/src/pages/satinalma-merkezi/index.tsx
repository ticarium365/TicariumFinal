import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search, Filter, Download, FileSpreadsheet, FileText, Printer,
  Star, Mail, ShoppingBasket, ArrowUpDown, X, GitCompare, Send,
  Building2, Package, Tag, Loader2, MapPin, ShieldCheck, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// ─── tipler ──────────────────────────────────────────────────────────────────
type CatalogItem = {
  id: number;
  companyId: number;
  companyName: string;
  companySubdomain: string;
  name: string;
  code: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  listPrice: string | number | null;
  currency: string;
  minOrderQty: number | string;
  leadDays: number | null;
  imageUrl: string | null;
  createdAt: string;
  // Sprint I genişletmeler
  companyCity: string | null;
  companyVerified: boolean | null;
  productBrand: string | null;
  productStock: number | null;
};

type CompanyFilter = { id: number; name: string; subdomain: string };
type Favorite = { sellerCompanyId: number; sellerName: string };

// ─── küçük fetch helper ──────────────────────────────────────────────────────
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
}

// ─── ana sayfa ────────────────────────────────────────────────────────────────
export default function SatinalmaMerkeziPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // filtreler
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("__all__");
  const [companyId, setCompanyId] = useState<string>("__all__");
  const [city, setCity] = useState<string>("__all__");
  const [brand, setBrand] = useState<string>("__all__");
  const [sort, setSort] = useState<"new" | "price_asc" | "price_desc" | "name">("new");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [maxMinOrder, setMaxMinOrder] = useState<string>("");
  const [fastOnly, setFastOnly] = useState(false);
  const [certifiedOnly, setCertifiedOnly] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // karşılaştırma seçimi (id seti)
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  // iletişim modal
  const [contactSeller, setContactSeller] = useState<CompanyFilter | null>(null);
  const [contactMessage, setContactMessage] = useState("");

  // ── veri yüklemeleri ───────────────────────────────────────────────────────
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (category && category !== "__all__") params.set("category", category);
  if (companyId && companyId !== "__all__") params.set("companyId", companyId);
  if (city && city !== "__all__") params.set("city", city);
  if (brand && brand !== "__all__") params.set("brand", brand);
  if (maxMinOrder && Number(maxMinOrder) > 0) params.set("minOrderQty", maxMinOrder);
  if (fastOnly) params.set("fastOnly", "1");
  if (certifiedOnly) params.set("certifiedOnly", "1");
  params.set("sort", sort);
  params.set("limit", "100");

  const itemsQ = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["b2b-marketplace", q, category, companyId, city, brand, maxMinOrder, fastOnly, certifiedOnly, sort],
    queryFn: () => api(`/b2b/catalog/marketplace?${params.toString()}`),
  });

  const catsQ = useQuery<string[]>({
    queryKey: ["b2b-marketplace-cats"],
    queryFn: () => api(`/b2b/catalog/marketplace/categories`),
  });

  const cosQ = useQuery<CompanyFilter[]>({
    queryKey: ["b2b-marketplace-cos"],
    queryFn: () => api(`/b2b/catalog/marketplace/companies`),
  });

  const citiesQ = useQuery<string[]>({
    queryKey: ["b2b-marketplace-cities"],
    queryFn: () => api(`/b2b/catalog/marketplace/cities`),
  });

  const brandsQ = useQuery<string[]>({
    queryKey: ["b2b-marketplace-brands"],
    queryFn: () => api(`/b2b/catalog/marketplace/brands`),
  });

  const favQ = useQuery<{ favorites: Array<{ sellerCompanyId: number; sellerName: string }> }>({
    queryKey: ["buyer-favorites"],
    queryFn: () => api(`/buyer/favorites`),
  });
  const favIds = useMemo(
    () => new Set((favQ.data?.favorites ?? []).map((f) => f.sellerCompanyId)),
    [favQ.data],
  );

  const addFav = useMutation({
    mutationFn: (sellerCompanyId: number) =>
      api(`/buyer/favorites`, { method: "POST", body: JSON.stringify({ sellerCompanyId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["buyer-favorites"] }),
  });
  const rmFav = useMutation({
    mutationFn: (sellerCompanyId: number) =>
      api(`/buyer/favorites/${sellerCompanyId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["buyer-favorites"] }),
  });

  const sendContact = useMutation({
    mutationFn: ({ sellerCompanyId, message }: { sellerCompanyId: number; message: string }) =>
      api(`/buyer/sellers/${sellerCompanyId}/contact`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }).catch(async (err) => {
        // fallback: super-admin contact-requests endpoint'i
        await api(`/contact`, {
          method: "POST",
          body: JSON.stringify({
            type: "b2b_contact",
            companyId: sellerCompanyId,
            message,
          }),
        });
      }),
    onSuccess: () => {
      toast({ title: "Mesaj gönderildi", description: "Tedarikçiye iletildi." });
      setContactSeller(null);
      setContactMessage("");
    },
    onError: () => toast({ title: "Gönderilemedi", variant: "destructive" }),
  });

  // ── client-side filtreleme (price, favorites) ─────────────────────────────
  const items = useMemo(() => {
    let xs = itemsQ.data?.items ?? [];
    if (minPrice) {
      const n = Number(minPrice);
      if (Number.isFinite(n)) xs = xs.filter((i) => Number(i.listPrice ?? 0) >= n);
    }
    if (maxPrice) {
      const n = Number(maxPrice);
      if (Number.isFinite(n)) xs = xs.filter((i) => Number(i.listPrice ?? 0) <= n);
    }
    if (onlyFavorites) {
      xs = xs.filter((i) => favIds.has(i.companyId));
    }
    return xs;
  }, [itemsQ.data, minPrice, maxPrice, onlyFavorites, favIds]);

  const compareItems = useMemo(
    () => items.filter((i) => compareIds.has(i.id)),
    [items, compareIds],
  );

  // ── export işlemleri ───────────────────────────────────────────────────────
  function exportRows() {
    // Sprint I Phase 1 şartname: 11 kolon (Ürün/Firma odaklı, Birim & Para fiyat ile birleşik)
    return items.map((i) => ({
      "Ürün Kodu": i.code ?? "",
      "Ürün Adı": i.name,
      "Marka": i.productBrand ?? "",
      "Kategori": i.category ?? "",
      "Tedarikçi": i.companyName,
      "Şehir": i.companyCity ?? "",
      "Sertifikalı": i.companyVerified ? "Evet" : "Hayır",
      "Fiyat": i.listPrice != null ? `${i.listPrice} ${i.currency}` : "",
      "Stok": i.productStock ?? "",
      "Min. Sip.": `${i.minOrderQty} ${i.unit}`,
      "Teslim (gün)": i.leadDays ?? "",
    }));
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows());
    XLSX.utils.book_append_sheet(wb, ws, "Vitrin");
    XLSX.writeFile(wb, `b2b-vitrin-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportCSV() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `b2b-vitrin-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPDF() {
    // tarayıcı yazdırma diyaloğu — PDF olarak kaydet seçeneği
    window.print();
  }

  function toggleCompare(id: number) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      else toast({ title: "En fazla 6 ürün karşılaştırılabilir", variant: "destructive" });
      return next;
    });
  }

  function clearFilters() {
    setQ("");
    setCategory("__all__");
    setCompanyId("__all__");
    setCity("__all__");
    setBrand("__all__");
    setMinPrice("");
    setMaxPrice("");
    setMaxMinOrder("");
    setFastOnly(false);
    setCertifiedOnly(false);
    setOnlyFavorites(false);
  }

  function teklifIste(item: CatalogItem) {
    navigate(`/satinalma/rfqs/new?sellerId=${item.companyId}&productName=${encodeURIComponent(item.name)}`);
  }

  return (
    <TooltipProvider>
      <div className="space-y-4 p-4 md:p-6 print:p-0">
        {/* başlık */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingBasket className="h-6 w-6 text-blue-600" />
              Satınalma Merkezi
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              İşletmelerin paylaştığı aktif stoklu ürünler — gelişmiş B2B vitrin
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/satinalma/rfqs")} data-testid="btn-my-rfqs">
              <FileText className="h-4 w-4 mr-1.5" /> Tekliflerim
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} data-testid="btn-export-excel">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} data-testid="btn-export-csv">
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} data-testid="btn-export-pdf">
              <Printer className="h-4 w-4 mr-1.5" /> PDF / Yazdır
            </Button>
          </div>
        </header>

        {/* filtre paneli */}
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" /> Gelişmiş Filtreler
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-3 relative">
              <Search className="h-4 w-4 absolute left-2.5 top-3 text-muted-foreground" />
              <Input
                placeholder="Ürün, kod, marka, tedarikçi ara…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
                data-testid="input-search"
              />
            </div>

            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="sel-category"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tüm kategoriler</SelectItem>
                {(catsQ.data ?? []).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger data-testid="sel-company"><SelectValue placeholder="Tedarikçi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tüm tedarikçiler</SelectItem>
                {(cosQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as any)}>
              <SelectTrigger data-testid="sel-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">En Yeni</SelectItem>
                <SelectItem value="price_asc">Fiyat ↑</SelectItem>
                <SelectItem value="price_desc">Fiyat ↓</SelectItem>
                <SelectItem value="name">Ad (A-Z)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={city} onValueChange={setCity}>
              <SelectTrigger data-testid="sel-city">
                <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Şehir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tüm şehirler</SelectItem>
                {(citiesQ.data ?? []).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger data-testid="sel-brand">
                <Tag className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Marka" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tüm markalar</SelectItem>
                {(brandsQ.data ?? []).map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2 items-center md:col-span-2">
              <Input
                placeholder="Min ₺"
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="text-xs"
                data-testid="input-min-price"
              />
              <Input
                placeholder="Max ₺"
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="text-xs"
                data-testid="input-max-price"
              />
            </div>

            <Input
              placeholder="Min sip. ≤"
              type="number"
              value={maxMinOrder}
              onChange={(e) => setMaxMinOrder(e.target.value)}
              className="text-xs"
              data-testid="input-max-min-order"
            />

            <div className="md:col-span-6 flex items-center justify-between flex-wrap gap-3 pt-1 border-t">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={onlyFavorites}
                    onCheckedChange={(v) => setOnlyFavorites(!!v)}
                    data-testid="cb-only-fav"
                  />
                  <Star className="h-3.5 w-3.5 text-amber-500" /> Favori tedarikçi
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={fastOnly}
                    onCheckedChange={(v) => setFastOnly(!!v)}
                    data-testid="cb-fast-only"
                  />
                  <Zap className="h-3.5 w-3.5 text-orange-500" /> Hızlı teslimat (≤3 gün)
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={certifiedOnly}
                    onCheckedChange={(v) => setCertifiedOnly(!!v)}
                    data-testid="cb-certified-only"
                  />
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Sertifikalı firma
                </label>
              </div>
              <div className="flex gap-2">
                {compareIds.size > 0 && (
                  <Button size="sm" variant="default" onClick={() => setCompareOpen(true)} data-testid="btn-open-compare">
                    <GitCompare className="h-4 w-4 mr-1.5" />
                    Karşılaştır ({compareIds.size})
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1.5" /> Temizle
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* sonuç tablosu */}
        <Card>
          <CardHeader className="pb-2 flex-row justify-between items-center">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              {itemsQ.isLoading ? "Yükleniyor…" : `${items.length} ürün`}
              {itemsQ.data?.total != null && itemsQ.data.total > items.length && (
                <span className="text-xs text-muted-foreground font-normal">/ {itemsQ.data.total} toplam</span>
              )}
            </CardTitle>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> {sort === "new" ? "En yeni" : sort === "price_asc" ? "Fiyat ↑" : sort === "price_desc" ? "Fiyat ↓" : "Ad"}
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {itemsQ.isLoading ? (
              <div className="p-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                Filtrelere uygun ürün bulunamadı.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 print:hidden"></TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Şehir</TableHead>
                    <TableHead className="text-right">Fiyat</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead>Teslim Süresi</TableHead>
                    <TableHead className="text-right print:hidden">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const isFav = favIds.has(i.companyId);
                    const isCompared = compareIds.has(i.id);
                    const isFast = i.leadDays != null && i.leadDays <= 3;
                    return (
                      <TableRow key={i.id} data-testid={`row-product-${i.id}`}>
                        <TableCell className="print:hidden">
                          <Checkbox
                            checked={isCompared}
                            onCheckedChange={() => toggleCompare(i.id)}
                            data-testid={`cb-compare-${i.id}`}
                          />
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="font-medium truncate">{i.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            {i.code && <span>#{i.code}</span>}
                            {i.productBrand && (
                              <span className="inline-flex items-center gap-0.5"><Tag className="h-3 w-3" />{i.productBrand}</span>
                            )}
                            <span className="text-[10px]">Min: {i.minOrderQty} {i.unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{i.companyName}</span>
                            {i.companyVerified && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                                </TooltipTrigger>
                                <TooltipContent>Sertifikalı tedarikçi</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {i.category ? <Badge variant="outline" className="text-[10px]">{i.category}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {i.companyCity ? (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{i.companyCity}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">
                          {i.listPrice != null ? `${Number(i.listPrice).toLocaleString("tr-TR")} ${i.currency}` : <span className="text-muted-foreground text-xs font-sans">Görüşmeli</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {i.productStock != null ? (
                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              {Number(i.productStock).toLocaleString("tr-TR")} {i.unit}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Stokta</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {i.leadDays != null ? (
                            <span className={`inline-flex items-center gap-1 ${isFast ? "text-orange-600 font-medium" : ""}`}>
                              {isFast && <Zap className="h-3 w-3" />}
                              {i.leadDays} gün
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right print:hidden">
                          <div className="flex justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => isFav ? rmFav.mutate(i.companyId) : addFav.mutate(i.companyId)}
                                  data-testid={`btn-fav-${i.id}`}
                                >
                                  <Star className={`h-4 w-4 ${isFav ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{isFav ? "Favoriden çıkar" : "Favori tedarikçi ekle"}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => setContactSeller({ id: i.companyId, name: i.companyName, subdomain: i.companySubdomain })}
                                  data-testid={`btn-contact-${i.id}`}
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>İletişime geç</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => window.open(`/magaza/${i.companySubdomain}`, "_blank")}
                                  data-testid={`btn-profile-${i.id}`}
                                >
                                  <Building2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Firma profiline git</TooltipContent>
                            </Tooltip>
                            <Button
                              size="sm" variant="default" className="h-7"
                              onClick={() => teklifIste(i)}
                              data-testid={`btn-rfq-${i.id}`}
                            >
                              <Send className="h-3 w-3 mr-1" /> Teklif İste
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* karşılaştırma modali */}
        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitCompare className="h-5 w-5" /> Ürün Karşılaştırma ({compareItems.length})
              </DialogTitle>
              <DialogDescription>Seçtiğiniz ürünlerin teknik ve ticari özelliklerini yan yana inceleyin.</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Özellik</TableHead>
                    {compareItems.map((i) => (
                      <TableHead key={i.id} className="min-w-[180px]">
                        <div className="font-semibold">{i.name}</div>
                        <div className="text-xs text-muted-foreground font-normal">{i.companyName}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-semibold">Kod</TableCell>
                    {compareItems.map((i) => <TableCell key={i.id}>{i.code ?? "—"}</TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Kategori</TableCell>
                    {compareItems.map((i) => <TableCell key={i.id}>{i.category ?? "—"}</TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Fiyat</TableCell>
                    {compareItems.map((i) => (
                      <TableCell key={i.id} className="font-mono">
                        {i.listPrice != null ? `${Number(i.listPrice).toLocaleString("tr-TR")} ${i.currency}` : "Görüşmeli"}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Birim / Min. Sip.</TableCell>
                    {compareItems.map((i) => <TableCell key={i.id}>{i.unit} / {i.minOrderQty}</TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Teslim Süresi</TableCell>
                    {compareItems.map((i) => <TableCell key={i.id}>{i.leadDays != null ? `${i.leadDays} gün` : "—"}</TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Açıklama</TableCell>
                    {compareItems.map((i) => <TableCell key={i.id} className="text-xs">{i.description ?? "—"}</TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell></TableCell>
                    {compareItems.map((i) => (
                      <TableCell key={i.id}>
                        <Button size="sm" onClick={() => { setCompareOpen(false); teklifIste(i); }}>
                          <Send className="h-3 w-3 mr-1" /> Teklif İste
                        </Button>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCompareIds(new Set()); setCompareOpen(false); }}>Seçimi Temizle</Button>
              <Button onClick={() => setCompareOpen(false)}>Kapat</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* iletişim modali */}
        <Dialog open={!!contactSeller} onOpenChange={(o) => { if (!o) setContactSeller(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" /> {contactSeller?.name} ile iletişim
              </DialogTitle>
              <DialogDescription>Tedarikçiye doğrudan mesaj gönderin. Yanıt için e-posta/iletişim bilgileri profilinizden alınır.</DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="Sorunuz veya talebiniz…"
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              rows={5}
              data-testid="input-contact-message"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setContactSeller(null)}>İptal</Button>
              <Button
                disabled={contactMessage.trim().length < 5 || sendContact.isPending}
                onClick={() => contactSeller && sendContact.mutate({ sellerCompanyId: contactSeller.id, message: contactMessage.trim() })}
                data-testid="btn-send-contact"
              >
                {sendContact.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Gönder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
