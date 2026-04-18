import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Search,
  Filter,
  Loader2,
  Package,
  PackageOpen,
  Building2,
  ArrowDownAZ,
  Clock,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Tag,
  Store,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { apiBase } from "@/lib/api";

interface MarketplaceItem {
  id: number;
  companyId: number;
  name: string;
  code: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  listPrice: number | null;
  currency: string;
  minOrderQty: number;
  leadDays: number | null;
  imageUrl: string | null;
  createdAt: string;
  companyName: string;
  companySubdomain: string;
}

interface CompanyChip {
  id: number;
  name: string;
  subdomain: string;
}

const PAGE_SIZE = 24;

function formatPrice(price: number | null, currency: string) {
  if (price == null || price <= 0) return null;
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price.toLocaleString("tr-TR")} ${currency}`;
  }
}

export default function B2BVitrinPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [companyId, setCompanyId] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<string>("new");
  const [page, setPage] = useState(0);

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyChip[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Arama debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Filtre değişince ilk sayfaya dön
  useEffect(() => {
    setPage(0);
  }, [companyId, category, sort]);

  // Firma + kategori listesini bir kez çek
  useEffect(() => {
    fetch(`${apiBase}/b2b/catalog/marketplace/companies`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setCompanies(data))
      .catch(() => {});
    fetch(`${apiBase}/b2b/catalog/marketplace/categories`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setCategories(data))
      .catch(() => {});
  }, []);

  // Vitrin verisini çek (race condition guard ile)
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (companyId !== "all") params.set("companyId", companyId);
    if (category !== "all") params.set("category", category);
    params.set("sort", sort);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    fetch(`${apiBase}/b2b/catalog/marketplace?${params.toString()}`, {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Vitrin yüklenemedi");
        return r.json();
      })
      .then((data) => {
        setItems(Array.isArray(data?.items) ? data.items : []);
        setTotal(typeof data?.total === "number" ? data.total : 0);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Hata");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [debouncedQ, companyId, category, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE);

  const handleQuoteRequest = (item: MarketplaceItem) => {
    try {
      sessionStorage.setItem(
        "b2b_quote_prefill",
        JSON.stringify({
          subdomain: item.companySubdomain,
          companyName: item.companyName,
          items: [{ productName: item.name, quantity: item.minOrderQty || 1, unit: item.unit }],
        })
      );
    } catch {
      /* ignore */
    }
    window.location.href = `/b2b/quotes/new?subdomain=${encodeURIComponent(item.companySubdomain)}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="B2B Vitrin"
        description="Ağdaki firmaların paylaştığı tüm ürünler tek bir akışta — fiyat, özellik ve teklif kolaylığıyla."
      />

      {/* Filtre çubuğu */}
      <Card className="t365-glass p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ürün adı, kod, açıklama veya firma ara..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-10"
              data-testid="input-vitrin-search"
            />
          </div>
          <div className="md:col-span-3">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-10" data-testid="select-vitrin-company">
                <Building2 className="h-4 w-4 mr-2 opacity-70" />
                <SelectValue placeholder="Firma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Firmalar</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10" data-testid="select-vitrin-category">
                <Tag className="h-4 w-4 mr-2 opacity-70" />
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kategoriler</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-10" data-testid="select-vitrin-sort">
                <Filter className="h-4 w-4 mr-2 opacity-70" />
                <SelectValue placeholder="Sırala" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">
                  <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> En Yeni</div>
                </SelectItem>
                <SelectItem value="price_asc">
                  <div className="flex items-center gap-2"><TrendingDown className="h-3.5 w-3.5" /> Ucuzdan Pahalıya</div>
                </SelectItem>
                <SelectItem value="price_desc">
                  <div className="flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" /> Pahalıdan Ucuza</div>
                </SelectItem>
                <SelectItem value="name">
                  <div className="flex items-center gap-2"><ArrowDownAZ className="h-3.5 w-3.5" /> İsme Göre</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <div>
            {loading ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Yükleniyor...</span>
            ) : (
              <span><span className="t365-numeric text-foreground">{total}</span> ürün bulundu · {showingFrom}-{showingTo} arası gösteriliyor</span>
            )}
          </div>
          <div className="hidden md:block opacity-70">
            Vitrindeki firma sayısı: <span className="t365-numeric text-foreground/80">{companies.length}</span>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/10 text-destructive-foreground text-sm">
          {error}
        </Card>
      )}

      {/* Sıralı liste */}
      <div className="space-y-2">
        {!loading && items.length === 0 && (
          <Card className="t365-glass p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
            <h3 className="font-semibold text-foreground">
              {debouncedQ || companyId !== "all" || category !== "all"
                ? "Eşleşen ürün bulunamadı"
                : "Vitrin henüz boş"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {debouncedQ || companyId !== "all" || category !== "all"
                ? "Farklı bir arama, firma veya kategori deneyin."
                : "Henüz hiçbir firma vitrine ürün eklemedi. İlk paylaşan sen ol!"}
            </p>
            {!(debouncedQ || companyId !== "all" || category !== "all") && (
              <Link href="/b2b/catalog">
                <Button size="sm" data-testid="button-vitrin-empty-add">
                  <PackageOpen className="h-4 w-4 mr-2" /> Kendi Katalogumu Düzenle
                </Button>
              </Link>
            )}
          </Card>
        )}

        {items.map((item) => {
          const price = formatPrice(item.listPrice, item.currency);
          return (
            <Card
              key={item.id}
              className="t365-glass t365-card-hover p-4 md:grid md:grid-cols-12 md:gap-4 md:items-center flex flex-col gap-3"
              data-testid={`vitrin-item-${item.id}`}
            >
              {/* Mobil üst satır: görsel + info (flex), Desktop: sadece görsel */}
              <div className="flex gap-3 md:contents">
                {/* Görsel */}
                <div className="md:col-span-1 shrink-0">
                  <div className="h-14 w-14 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center overflow-hidden shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground/50" />
                    )}
                  </div>
                </div>

                {/* Ürün bilgisi */}
                <div className="md:col-span-5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground truncate" title={item.name}>
                    {item.name}
                  </h3>
                  {item.code && (
                    <span className="t365-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                      {item.code}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3 w-3" /> Min: <span className="t365-numeric text-foreground/80">{item.minOrderQty}</span> {item.unit}
                  </span>
                  {item.leadDays != null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {item.leadDays} gün teslim
                    </span>
                  )}
                  {item.category && (
                    <Badge variant="outline" className="h-5 text-[10px] font-normal border-border/70">
                      <Tag className="h-2.5 w-2.5 mr-1" /> {item.category}
                    </Badge>
                  )}
                </div>
                </div>
              </div>

              {/* Firma */}
              <div className="md:col-span-3 min-w-0">
                <Link
                  href={`/network/${item.companySubdomain}`}
                  className="inline-flex items-center gap-2 group"
                  data-testid={`vitrin-company-${item.companySubdomain}`}
                >
                  <span className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground/90 truncate group-hover:text-primary transition-colors">
                      {item.companyName}
                    </span>
                    <span className="block text-[10px] text-muted-foreground t365-mono truncate">
                      {item.companySubdomain}
                    </span>
                  </span>
                </Link>
              </div>

              {/* Mobil alt satır: fiyat + aksiyon, Desktop: ayrı sütunlar */}
              <div className="flex items-center justify-between gap-3 md:contents">
                {/* Fiyat */}
                <div className="md:col-span-2 md:text-right">
                  {price ? (
                    <>
                      <div className="t365-numeric text-base font-semibold text-foreground">{price}</div>
                      <div className="text-[10px] text-muted-foreground">/ {item.unit}</div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Fiyat sor</span>
                  )}
                </div>

                {/* Aksiyon */}
                <div className="md:col-span-1 md:flex md:justify-end">
                  <Button
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => handleQuoteRequest(item)}
                    data-testid={`vitrin-quote-${item.id}`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Teklif İste
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {/* Loading skeletons */}
        {loading && items.length === 0 && Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="t365-glass p-4 h-20 animate-pulse" />
        ))}
      </div>

      {/* Sayfalama */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            data-testid="button-vitrin-prev"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Önceki
          </Button>
          <span className="text-xs text-muted-foreground px-3">
            <span className="t365-numeric text-foreground">{page + 1}</span> / <span className="t365-numeric">{totalPages}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            data-testid="button-vitrin-next"
          >
            Sonraki <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
