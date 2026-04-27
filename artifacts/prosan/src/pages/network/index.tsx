import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Building2, MapPin, Star, Search, Globe, Phone, ChevronRight, RefreshCw, Users, Filter, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiBase } from "@/lib/api";
import { initialLetter } from "@/lib/display-initial";
import { useToast } from "@/hooks/use-toast";

interface NetworkCompany {
  id: number;
  companyId: number;
  companyName: string;
  companySubdomain: string;
  companyLogo: string | null;
  companyColor: string;
  sector: string | null;
  city: string | null;
  district: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  acceptOffers: boolean;
  acceptOrders: boolean;
  trustScore: number;
  reviewCount: number;
  tags: string[];
  isOnline: boolean;
  isAnonymous: boolean;
}

interface NetworkResponse {
  companies: NetworkCompany[];
  total: number;
  page: number;
  totalPages: number;
}

function StarRating({ score, count }: { score: number; count: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${s <= Math.round(score) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {score > 0 ? score.toFixed(1) : "—"} ({count})
      </span>
    </div>
  );
}

function CompanyCard({ company }: { company: NetworkCompany }) {
  return (
    <Card className="group hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden">
      <div className="h-1.5 w-full" style={{ backgroundColor: company.companyColor }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {company.companyLogo ? (
              <img src={company.companyLogo} alt={company.companyName} className="h-10 w-10 rounded-lg object-contain border" />
            ) : (
              <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: company.companyColor }}>
                {initialLetter(company.companyName)}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {company.companyName}
              </h3>
              {company.sector && (
                <span className="text-xs text-muted-foreground">{company.sector}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {company.isOnline && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Çevrimiçi
              </span>
            )}
          </div>
        </div>

        {company.description && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{company.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {company.city && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {company.city}{company.district ? `, ${company.district}` : ""}
            </span>
          )}
          {company.phone && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {company.phone}
            </span>
          )}
          {company.website && (
            <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              <Globe className="h-3 w-3" />
              Web Sitesi
            </a>
          )}
        </div>

        {company.tags && company.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {company.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <StarRating score={company.trustScore} count={company.reviewCount} />
          <div className="flex items-center gap-1.5">
            {company.acceptOffers && (
              <Badge variant="outline" className="text-xs border-blue-500/20 text-blue-300">Teklif Alır</Badge>
            )}
            {company.acceptOrders && (
              <Badge variant="outline" className="text-xs border-green-500/20 text-green-300">Sipariş Alır</Badge>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t">
          <Link href={`/network/${company.companySubdomain}`}>
            <Button variant="ghost" size="sm" className="w-full justify-between text-primary hover:text-primary hover:bg-primary/5">
              Profili Görüntüle
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NetworkPage() {
  const { toast } = useToast();
  const [data, setData] = useState<NetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [sector, setSector] = useState("all");
  const [cities, setCities] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/network/meta/cities`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${apiBase}/network/meta/sectors`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([c, s]) => {
      setCities(c);
      setSectors(s);
    });
  }, []);

  async function fetchNetwork() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "18" });
      if (city && city !== "all") params.set("city", city);
      if (sector && sector !== "all") params.set("sector", sector);
      const res = await fetch(`${apiBase}/network?${params}`, { credentials: "include" });
      const json = await res.json();
      setData(json);
    } catch {
      toast({ title: "Hata", description: "Ağ listesi yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNetwork();
  }, [page, city, sector]);

  const filtered = search
    ? (data?.companies ?? []).filter(
        (c) =>
          c.companyName.toLowerCase().includes(search.toLowerCase()) ||
          c.sector?.toLowerCase().includes(search.toLowerCase()) ||
          c.description?.toLowerCase().includes(search.toLowerCase()) ||
          c.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : (data?.companies ?? []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            B2B Tedarik Ağı
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {data?.total ?? "..."} firma ağ üzerinde aktif
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchNetwork} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
          <Link href="/network/my-profile">
            <Button size="sm">
              <Users className="h-4 w-4 mr-2" />
              Profilimi Yönet
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Firma adı, sektör veya etiket ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={city} onValueChange={(v) => { setCity(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Şehir" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Şehirler</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sector} onValueChange={(v) => { setSector(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-52">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sektör" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Sektörler</SelectItem>
            {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-1.5 w-full bg-muted" />
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Firma Bulunamadı</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {search || city !== "all" || sector !== "all"
              ? "Filtrelerinizi değiştirerek tekrar arayın"
              : "Henüz ağa katılmış firma yok"}
          </p>
          <Link href="/network/my-profile">
            <Button className="mt-4" size="sm">
              İlk Firma Siz Olun →
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Önceki
              </Button>
              <span className="text-sm text-muted-foreground">
                Sayfa {page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sonraki →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
