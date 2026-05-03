import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Radio,
  ChevronRight,
  Store,
  ShoppingBag,
  Network,
  Loader2,
  Settings2,
  Wand2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import { apiBase } from "@/lib/api";

interface OverviewItem {
  key: string;
  label: string;
  category: string;
  color: string;
  listingEnabled: number;
  listingTotal: number;
  adapter: boolean;
  connectionStatus: "connected" | "error" | "pending" | "n/a";
  lastSyncAt: string | null;
  healthMessage: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  marketplace: "Pazaryeri",
  ecommerce: "E-Ticaret",
  b2b: "B2B",
};
const CATEGORY_ICON: Record<string, typeof Radio> = {
  marketplace: Store,
  ecommerce: ShoppingBag,
  b2b: Network,
};

function fmtSync(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function ConnectionBadge({ status }: { status: OverviewItem["connectionStatus"] }) {
  if (status === "n/a") {
    return (
      <Badge tone="neutral" size="sm" variant="outline">
        Liste
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge tone="success" dot size="sm">
        Bağlı
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge tone="danger" dot size="sm">
        Hata
      </Badge>
    );
  }
  return (
    <Badge tone="warning" dot size="sm">
      Askıda
    </Badge>
  );
}

function HealthDot({
  status,
  detail,
}: {
  status: OverviewItem["connectionStatus"];
  detail: string | null;
}) {
  if (status === "n/a") return null;
  const color =
    status === "connected"
      ? "bg-[var(--color-semantic-success)]"
      : status === "error"
        ? "bg-[var(--color-semantic-danger)]"
        : "bg-[var(--color-semantic-warning)]";
  const label =
    detail ||
    (status === "connected"
      ? "Bağlantı sağlıklı"
      : status === "error"
        ? "Bağlantı veya senkron hatası"
        : "Yapılandırma veya aktivasyon bekleniyor");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${color} ring-2 ring-background`}
          aria-label="Bağlantı sağlığı"
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function ChannelsListPage() {
  const [items, setItems] = useState<OverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/channels/overview`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data.items) ? data.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const grouped = items.reduce<Record<string, OverviewItem[]>>((acc, c) => {
    (acc[c.category] = acc[c.category] ?? []).push(c);
    return acc;
  }, {});

  return (
    <OnlineSalesFeatureGate title="Satış kanalları paketinizde kapalı">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="h-6 w-6 text-primary" />
              Satış Kanalları
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kanal bazlı fiyat ve stok; bağlantı durumu ve son senkron burada.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/channels/bulk">
              <Button variant="outline" size="sm">
                <Wand2 className="h-4 w-4 mr-1.5" />
                Toplu İşlem
              </Button>
            </Link>
          </div>
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
                  {list.map((c) => (
                    <Card
                      key={c.key}
                      className="overflow-hidden hover:shadow-md transition-shadow"
                      data-testid={`channel-card-${c.key}`}
                    >
                      <div className="h-1.5" style={{ backgroundColor: c.color }} />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div
                            className="h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border border-border/60"
                            style={{
                              backgroundColor: `${c.color}22`,
                              color: c.color,
                            }}
                          >
                            {c.label.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-base leading-tight">{c.label}</h3>
                              <HealthDot status={c.connectionStatus} detail={c.healthMessage} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <ConnectionBadge status={c.connectionStatus} />
                              <span className="text-xs text-muted-foreground">
                                {c.listingEnabled}/{c.listingTotal} yayında
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 border-t pt-3">
                          <RefreshCw className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span>Son senkron:</span>
                          <span className="text-foreground/90 font-medium">{fmtSync(c.lastSyncAt)}</span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Link href={`/channels/${c.key}`} className="flex-1">
                            <Button variant="default" size="sm" className="w-full gap-1">
                              <Settings2 className="h-3.5 w-3.5" />
                              Kanalı yönet
                              <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-70" />
                            </Button>
                          </Link>
                          <Link href="/channels/bulk">
                            <Button variant="outline" size="sm" title="Toplu işlem merkezi">
                              Toplu
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </OnlineSalesFeatureGate>
  );
}
