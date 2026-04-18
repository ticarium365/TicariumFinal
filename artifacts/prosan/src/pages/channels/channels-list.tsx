import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Radio, ChevronRight, Store, ShoppingBag, Network, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiBase } from "@/lib/api";

interface ChannelDef {
  key: string;
  label: string;
  category: string;
  color: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  marketplace: "Pazaryeri",
  ecommerce: "E-Ticaret",
  b2b: "B2B",
};
const CATEGORY_ICON: Record<string, any> = {
  marketplace: Store,
  ecommerce: ShoppingBag,
  b2b: Network,
};

export default function ChannelsListPage() {
  const [channels, setChannels] = useState<ChannelDef[]>([]);
  const [stats, setStats] = useState<Record<string, { enabled: number; total: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/channels`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${apiBase}/channels/stats`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([defs, s]) => {
        setChannels(Array.isArray(defs) ? defs : []);
        setStats(s ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = channels.reduce<Record<string, ChannelDef[]>>((acc, c) => {
    (acc[c.category] = acc[c.category] ?? []).push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" />
            Satış Kanalları
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hangi ürün hangi kanalda? Fiyatları ve stokları kanal bazlı yönet.
          </p>
        </div>
        <Link href="/channels/bulk">
          <Button variant="outline">Toplu İşlem Merkezi</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        Object.entries(grouped).map(([category, list]) => {
          const Icon = CATEGORY_ICON[category] ?? Radio;
          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[category] ?? category}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((c) => {
                  const s = stats[c.key];
                  return (
                    <Link key={c.key} href={`/channels/${c.key}`}>
                      <Card className="cursor-pointer hover:shadow-md transition-shadow group">
                        <div className="h-1.5" style={{ backgroundColor: c.color }} />
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h3 className="font-semibold text-base">{c.label}</h3>
                              {s ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                  >
                                    {s.enabled} aktif
                                  </Badge>
                                  <span>{s.total} kayıt</span>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">Henüz hiç ürün yayınlanmadı</p>
                              )}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-muted-foreground transition" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
