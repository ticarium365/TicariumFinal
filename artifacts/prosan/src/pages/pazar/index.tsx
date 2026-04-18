import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBasket, Search, Store, Package } from "lucide-react";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(n || 0));

export default function PazarPage() {
  const [items, setItems] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/public/v1/pazar?limit=120${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      const d = await r.json();
      setItems(d.items || []);
      setCount(d.count || 0);
    } catch {
      setItems([]); setCount(0);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto py-4 px-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ShoppingBasket className="h-7 w-7 text-orange-500" />
            <div>
              <div className="font-bold text-lg leading-tight">Ticarium Pazar</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">Tüm tedarikçiler tek pazarda</div>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex-1 flex gap-2 max-w-2xl ml-auto">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün, marka, kategori veya barkod ara..." />
            <Button type="submit"><Search className="h-4 w-4 mr-1" /> Ara</Button>
          </form>
        </div>
      </header>

      <div className="container mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            {loading ? "Yükleniyor..." : `${count} ürün listeleniyor`}
          </div>
          <Badge variant="outline" className="gap-1"><Store className="h-3 w-3" /> Çoklu Tedarikçi</Badge>
        </div>

        {!loading && items.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="mx-auto h-14 w-14 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-lg">Henüz ürün yok</p>
              <p className="text-sm text-muted-foreground mt-1">Tedarikçilerimiz ürünlerini eklemeye başladığında burada listelenecek.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((it: any) => (
            <Card key={it.id} className="overflow-hidden hover:shadow-lg transition">
              <div className="aspect-square bg-muted flex items-center justify-center">
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-12 w-12 text-muted-foreground/40" />
                )}
              </div>
              <CardContent className="p-3 space-y-1.5">
                <div className="font-medium text-sm line-clamp-2 leading-tight" title={it.name}>{it.name}</div>
                {it.brand && <div className="text-[11px] text-muted-foreground">{it.brand}</div>}
                <div className="text-base font-bold text-orange-600">{fmt(it.price)}</div>
                <div className="flex items-center justify-between pt-1 border-t">
                  <div className="text-[10px] text-muted-foreground truncate" title={it.seller}>
                    <Store className="inline h-3 w-3 mr-0.5" />{it.seller}
                  </div>
                  <Badge variant={it.stock > 0 ? "default" : "secondary"} className="text-[10px]">
                    {it.stock > 0 ? `${it.stock}+` : "yok"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <footer className="border-t bg-card mt-8 py-6 text-center text-xs text-muted-foreground">
        Ticarium Pazar — Türkiye'nin yeni nesil B2B/B2C aggregator pazarı
      </footer>
    </div>
  );
}
