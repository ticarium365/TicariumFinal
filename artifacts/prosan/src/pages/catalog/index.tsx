import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Package, Phone, Mail, MapPin, Filter, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

interface CatalogProduct {
  id: number;
  productCode: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  stock: number;
  minStock: number;
  salePrice: number;
  barcode: string | null;
}

interface CatalogResponse {
  products: CatalogProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categories: string[];
  brands: string[];
}

function PELogo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pe-grad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4a7fbf" />
          <stop offset="1" stopColor="#2c5f9e" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="52" height="52" rx="8" fill="url(#pe-grad)" />
      <text x="9" y="38" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="26" fill="white" letterSpacing="-1">PE</text>
    </svg>
  );
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock === 0) return <Badge variant="destructive" className="text-xs">Stok Yok</Badge>;
  if (stock <= minStock) return <Badge className="text-xs bg-amber-500 hover:bg-amber-600">Kritik Stok</Badge>;
  return <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700">Stokta Var</Badge>;
}

function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3 hover:shadow-md hover:border-primary/40 transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-muted-foreground/70 mb-1">{product.productCode}</p>
          <h3 className="font-semibold text-foreground leading-snug line-clamp-2">{product.name}</h3>
        </div>
        <StockBadge stock={product.stock} minStock={product.minStock} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {product.category && (
          <span className="text-xs bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-medium">
            {product.category}
          </span>
        )}
        {product.brand && (
          <span className="text-xs bg-blue-500/10 text-blue-300 rounded-md px-2 py-0.5 font-medium">
            {product.brand}
          </span>
        )}
      </div>

      {product.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
      )}

      <div className="mt-auto pt-2 border-t border-border/70 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">Satış Fiyatı</span>
        <span className="text-lg font-bold text-orange-600">
          {Number(product.salePrice).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
        </span>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "48",
      ...(search && { search }),
      ...(selectedCategory && { category: selectedCategory }),
      ...(selectedBrand && { brand: selectedBrand }),
    });

    setLoading(true);
    fetch(`${API_BASE}/api/catalog?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, selectedCategory, selectedBrand, page]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, selectedBrand]);

  const hasFilters = search || selectedCategory || selectedBrand;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-[#1a2435] text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PELogo size={44} />
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black tracking-tight leading-none">PRO</span>
                <span className="text-xl font-black tracking-tight leading-none text-orange-400">SAN</span>
                <span className="text-base font-semibold tracking-widest uppercase text-muted-foreground/60 ml-1">ENDÜSTRİ</span>
              </div>
              <p className="text-xs text-muted-foreground/70 font-medium tracking-widest uppercase">ENDÜSTRİYEL ÜRÜNLER</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground/60">
            <a href="tel:02623355556" className="flex items-center gap-1.5 hover:text-orange-400 transition-colors">
              <Phone className="h-3.5 w-3.5" />
              0 262 335 55 56
            </a>
            <a href="mailto:info@prosanendustri.com.tr" className="flex items-center gap-1.5 hover:text-orange-400 transition-colors">
              <Mail className="h-3.5 w-3.5" />
              info@prosanendustri.com.tr
            </a>
          </div>
        </div>
      </header>

      {/* Hero strip */}
      <div className="bg-[#1f2d42] text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Ürün Kataloğu</h1>
          <p className="text-muted-foreground/70 text-sm">Endüstriyel ekipman ve yedek parça stok listesi</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search & Filters Bar */}
        <div className="bg-card rounded-xl border border-border p-4 mb-6 shadow-sm">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                placeholder="Ürün adı, kodu veya marka ara..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className={`gap-2 ${showFilters ? "bg-orange-500/10 border-orange-400 text-orange-300" : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtrele</span>
            </Button>
            {hasFilters && (
              <Button
                variant="ghost"
                className="gap-1 text-muted-foreground"
                onClick={() => { setSearch(""); setSelectedCategory(""); setSelectedBrand(""); }}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Temizle</span>
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/70">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Kategori</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">Tümü</option>
                  {data?.categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Marka</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                >
                  <option value="">Tümü</option>
                  {data?.brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Result count */}
        {data && (
          <p className="text-sm text-muted-foreground mb-4">
            <span className="font-semibold text-foreground/90">{data.total}</span> ürün bulundu
          </p>
        )}

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5 h-44 animate-pulse">
                <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                <div className="h-4 bg-muted rounded w-2/3 mb-4" />
                <div className="h-3 bg-muted rounded w-1/4 mb-2" />
                <div className="h-6 bg-muted rounded w-1/3 mt-auto" />
              </div>
            ))}
          </div>
        ) : data?.products.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground/70">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-muted-foreground">Ürün bulunamadı</p>
            <p className="text-sm mt-1">Arama kriterlerini değiştirmeyi deneyin</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data?.products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Önceki
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-[#1a2435] text-muted-foreground/70 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <PELogo size={36} />
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-black text-white">PRO</span>
                  <span className="text-sm font-black text-orange-400">SAN</span>
                  <span className="text-xs font-semibold text-muted-foreground/70 ml-1 uppercase tracking-widest">ENDÜSTRİ</span>
                </div>
                <p className="text-xs text-muted-foreground">Endüstriyel Ürünler</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span>Sanayi Mh. Ayşenur Sk. No:1/1 İzmit / KOCAELİ</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span>0 262 335 55 56 &nbsp;|&nbsp; Faks: 0 262 335 55 54</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span>info@prosanendustri.com.tr</span>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-6 pt-4 text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} PROSAN ENDÜSTRİ — Tüm fiyatlar KDV hariçtir. Stok ve fiyat değişiklik hakkı saklıdır.
          </div>
        </div>
      </footer>
    </div>
  );
}
