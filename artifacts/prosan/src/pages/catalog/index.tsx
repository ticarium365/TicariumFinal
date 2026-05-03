import { useState, useEffect } from "react";
import { Body, BodySmall, Caption, Heading1, Heading3 } from "@/components/ui/typography";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Package, Phone, Mail, MapPin, Filter, X } from "lucide-react";
import { apiBase } from "@/lib/api";

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
          <stop stopColor="var(--color-catalog-brand-1)" />
          <stop offset="1" stopColor="var(--color-catalog-brand-2)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="52" height="52" rx="8" fill="url(#pe-grad)" />
      <text x="9" y="38" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="26" fill="var(--color-nav-text-active)" letterSpacing="-1">PE</text>
    </svg>
  );
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock === 0) return <Badge variant="destructive" className="text-xs">Stok Yok</Badge>;
  if (stock <= minStock)
    return (
      <Badge className="text-xs bg-[var(--color-semantic-warning)] hover:opacity-90 text-[color:var(--color-semantic-warning-fg)]">
        Kritik Stok
      </Badge>
    );
  return (
    <Badge className="text-xs bg-[var(--color-semantic-success)] hover:opacity-90 text-[color:var(--color-semantic-success-fg)]">
      Stokta Var
    </Badge>
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3 hover:shadow-md hover:border-primary/40 transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Caption as="p" className="mb-1 font-mono text-muted-foreground/70">
            {product.productCode}
          </Caption>
          <Heading3 className="leading-snug line-clamp-2">{product.name}</Heading3>
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
          <span className="text-xs rounded-md px-2 py-0.5 font-medium bg-[color-mix(in_srgb,var(--color-brand-500)_12%,var(--color-surface-card))] text-[color:var(--color-brand-200)]">
            {product.brand}
          </span>
        )}
      </div>

      {product.description && (
        <Caption as="p" className="line-clamp-2 text-muted-foreground">
          {product.description}
        </Caption>
      )}

      <div className="mt-auto pt-2 border-t border-border/70 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">Satış Fiyatı</span>
        <span className="text-lg font-bold text-[color:var(--color-semantic-warning)]">
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
    fetch(`${apiBase}/catalog?${params}`)
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
      <header
        className="sticky top-0 z-30 shadow-lg text-[color:var(--color-nav-text-active)]"
        style={{ backgroundColor: "var(--color-catalog-navy-1)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PELogo size={44} />
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black tracking-tight leading-none">Ticarium</span>
                <span className="text-xl font-black tracking-tight leading-none text-[color:var(--color-semantic-warning)]">
                  365
                </span>
                <span className="text-base font-semibold tracking-widest uppercase text-muted-foreground/60 ml-1">KATALOG</span>
              </div>
              <Caption as="p" className="text-muted-foreground/70 font-medium tracking-widest uppercase">
                ENDÜSTRİYEL ÜRÜNLER
              </Caption>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground/60">
            <a href="tel:02623355556" className="flex items-center gap-1.5 transition-colors hover:text-[color:var(--color-semantic-warning)]">
              <Phone className="h-3.5 w-3.5" />
              0 262 335 55 56
            </a>
            <a href="mailto:destek@ticarium365.com" className="flex items-center gap-1.5 transition-colors hover:text-[color:var(--color-semantic-warning)]">
              <Mail className="h-3.5 w-3.5" />
              destek@ticarium365.com
            </a>
          </div>
        </div>
      </header>

      {/* Hero strip */}
      <div
        className="text-[color:var(--color-nav-text-active)]"
        style={{ backgroundColor: "var(--color-catalog-navy-2)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Heading1 className="mb-1 text-white text-[length:var(--font-size-2xl)] md:text-[length:var(--font-size-3xl)]">
            Ürün Kataloğu
          </Heading1>
          <Body className="text-muted-foreground/70 text-[length:var(--font-size-sm)]">
            Endüstriyel ekipman ve yedek parça stok listesi
          </Body>
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
              className={
                showFilters
                  ? "gap-2 border-[color:var(--color-semantic-warning)] bg-[color-mix(in_srgb,var(--color-semantic-warning)_12%,var(--color-surface-card))] text-[color:var(--color-semantic-warning)]"
                  : "gap-2"
              }
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
          <Body as="p" className="mb-4 text-muted-foreground text-[length:var(--font-size-sm)]">
            <span className="font-semibold text-foreground/90">{data.total}</span> ürün bulundu
          </Body>
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
      <footer
        className="text-muted-foreground/70 mt-16"
        style={{ backgroundColor: "var(--color-catalog-navy-1)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <PELogo size={36} />
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-black text-[color:var(--color-nav-text-active)]">Ticarium</span>
                  <span className="text-sm font-black text-[color:var(--color-semantic-warning)]">365</span>
                  <span className="text-xs font-semibold text-muted-foreground/70 ml-1 uppercase tracking-widest">KATALOG</span>
                </div>
                <Caption as="p" className="text-muted-foreground">
                  Endüstriyel Ürünler
                </Caption>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-semantic-warning)]" />
                <span>Sanayi Mh. Ayşenur Sk. No:1/1 İzmit / KOCAELİ</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-semantic-warning)]" />
                <span>0 262 335 55 56 &nbsp;|&nbsp; Faks: 0 262 335 55 54</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-semantic-warning)]" />
                <span>destek@ticarium365.com</span>
              </div>
            </div>
          </div>
          <div className="mt-6 border-t border-[color:color-mix(in_srgb,var(--color-nav-text-active)_25%,transparent)] pt-4 text-xs text-muted-foreground text-center space-y-1">
            <div>© {new Date().getFullYear()} Ticarium365 Demo Katalog — Tüm fiyatlar KDV hariçtir. Stok ve fiyat değişiklik hakkı saklıdır.</div>
            <div className="text-[11px] text-muted-foreground/70">
              Powered by <span className="font-semibold text-[color:var(--color-neutral-300)]">Ticarium365</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
