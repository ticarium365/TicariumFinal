import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Building2, Loader2, ArrowRight } from "lucide-react";

type Seller = {
  id: number;
  name: string;
  subdomain: string;
  sector: string | null;
  logoUrl: string | null;
  primaryColor: string;
};

async function fetchJson(path: string) {
  const r = await fetch(`/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export default function Discovery() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["sellers", active],
    queryFn: () => fetchJson(`/buyer/sellers${active ? `?q=${encodeURIComponent(active)}` : ""}`),
  });

  return (
    <div className="space-y-6" data-testid="page-discovery">
      <div>
        <h2 className="text-2xl font-semibold">Tedarikçi Keşfet</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Aktif satıcı firmaları arayın, profillerine göz atın ve teklif talebi gönderin.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setActive(q.trim());
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Firma adı ile ara..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
                data-testid="input-seller-search"
              />
            </div>
            <Button type="submit" data-testid="btn-search">Ara</Button>
            {active && (
              <Button type="button" variant="ghost" onClick={() => { setQ(""); setActive(""); }}>
                Temizle
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="sellers-grid">
          {(data?.sellers ?? []).map((s: Seller) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow" data-testid={`seller-card-${s.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold"
                    style={{ backgroundColor: s.primaryColor }}
                  >
                    {s.logoUrl ? (
                      <img src={s.logoUrl} alt={s.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base truncate">{s.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{s.subdomain}.ticarium365</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {s.sector && <Badge variant="outline" className="text-[10px]">{s.sector}</Badge>}
                <Link href={`/rfqs/new?sellerId=${s.id}`}>
                  <Button size="sm" variant="outline" className="w-full" data-testid={`btn-rfq-${s.id}`}>
                    Teklif İste <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
          {(data?.sellers?.length ?? 0) === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground" data-testid="empty-sellers">
              {active ? `"${active}" ile eşleşen satıcı bulunamadı.` : "Henüz aktif satıcı yok."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
