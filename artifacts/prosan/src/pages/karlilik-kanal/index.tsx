import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Loader2, Sparkles, Trophy, AlertCircle,
  ShoppingBag, DollarSign, Percent, Package,
} from "lucide-react";

type ChannelRow = {
  channelKey: string;
  orderCount: number;
  totalQty: number;
  revenue: number;
  cogs: number;
  commission: number;
  shipping: number;
  grossProfit: number;
  netProfit: number;
  netMarginPct: number;
};

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  pos: { label: "Mağaza POS", color: "bg-emerald-500/15 text-emerald-300" },
  storefront: { label: "Hazır Mağaza", color: "bg-blue-500/15 text-blue-300" },
  trendyol: { label: "Trendyol", color: "bg-orange-500/15 text-orange-300" },
  hepsiburada: { label: "Hepsiburada", color: "bg-amber-500/15 text-amber-300" },
  n11: { label: "N11", color: "bg-purple-500/15 text-purple-300" },
  amazon: { label: "Amazon", color: "bg-yellow-500/15 text-yellow-300" },
  ciceksepeti: { label: "ÇiçekSepeti", color: "bg-pink-500/15 text-pink-300" },
  pttavm: { label: "PTT AVM", color: "bg-yellow-500/15 text-yellow-300" },
  pazarama: { label: "Pazarama", color: "bg-blue-500/15 text-blue-300" },
  whatsapp: { label: "WhatsApp", color: "bg-green-500/15 text-green-300" },
  b2b: { label: "B2B Portal", color: "bg-muted text-foreground" },
};

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;
}

type MarginSort = "margin_desc" | "margin_asc" | "revenue_desc";

export default function KarlilikKanalPage() {
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ items: ChannelRow[]; totals: ChannelRow } | null>(null);
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [marginSort, setMarginSort] = useState<MarginSort>("margin_desc");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/profit-engine/by-channel?days=${days}`, { credentials: "include" });
      const j = await r.json();
      setData(j);
    } catch { toast({ title: "Veri alınamadı", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const loadTop = async (ch: string) => {
    setSelectedChannel(ch);
    const r = await fetch(`/api/profit-engine/by-channel/${ch}/top-products?days=${days}`, { credentials: "include" });
    const j = await r.json();
    setTopProducts(j.items || []);
  };

  useEffect(() => { load(); }, [days]);

  const sortedItems = useMemo(() => {
    const items = [...(data?.items ?? [])];
    items.sort((a, b) => {
      if (marginSort === "revenue_desc") return b.revenue - a.revenue;
      if (marginSort === "margin_asc") return a.netMarginPct - b.netMarginPct;
      return b.netMarginPct - a.netMarginPct;
    });
    return items;
  }, [data?.items, marginSort]);

  return (
    <OnlineSalesFeatureGate title="Kanal karlılığı paketinizde kapalı">
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <Link href="/eticarium-merkezi" className="hover:underline">Online Satış Merkezi</Link>
            <span>/</span>
            <span>Karlılık Analizi</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="w-7 h-7 text-emerald-600" /> Kanal Karşılaştırma
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Hangi satış kanalı gerçekte ne kadar para kazandırıyor? Komisyon ve kargo maliyetleri düşüldükten sonra net kâr.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Son 7 gün</SelectItem>
            <SelectItem value="30">Son 30 gün</SelectItem>
            <SelectItem value="90">Son 90 gün</SelectItem>
            <SelectItem value="365">Son 1 yıl</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" /></div>
      ) : !data || data.items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
          Bu dönemde satış bulunamadı.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<DollarSign className="w-5 h-5" />} label="Toplam Ciro" value={fmt(data.totals.revenue)} sub={`${data.totals.orderCount} sipariş`} />
            <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Brüt Kâr" value={fmt(data.totals.grossProfit)} sub={`Maliyet: ${fmt(data.totals.cogs)}`} />
            <KpiCard icon={<TrendingDown className="w-5 h-5 text-red-500" />} label="Komisyon + Kargo" value={fmt(data.totals.commission + data.totals.shipping)} sub="Toplam giderler" />
            <KpiCard
              icon={<Percent className="w-5 h-5 text-emerald-600" />}
              label="Net Marj"
              value={
                <span className="inline-flex flex-wrap items-baseline gap-2">
                  <span>{fmt(data.totals.netProfit)}</span>
                  <span className="text-lg text-muted-foreground/90">{fmtPct(data.totals.netMarginPct)}</span>
                </span>
              }
              sub="Net kâr (TL) ve marj oranı"
              highlight
            />
          </div>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <CardTitle>Kanal Karşılaştırma Tablosu</CardTitle>
                <CardDescription>Bir kanala tıklayarak en kârlı ürünlerini görebilirsiniz.</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sırala:</span>
                <Select value={marginSort} onValueChange={(v) => setMarginSort(v as MarginSort)}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="margin_desc">Marj % (yüksek → düşük)</SelectItem>
                    <SelectItem value="margin_asc">Marj % (düşük → yüksek)</SelectItem>
                    <SelectItem value="revenue_desc">Ciro (yüksek → düşük)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kanal</TableHead>
                    <TableHead className="text-right">Sipariş</TableHead>
                    <TableHead className="text-right">Ciro</TableHead>
                    <TableHead className="text-right">Net kâr</TableHead>
                    <TableHead className="text-right">Marj %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((row) => {
                    const meta = CHANNEL_LABELS[row.channelKey] || { label: row.channelKey, color: "bg-muted text-foreground" };
                    const negMargin = row.netMarginPct < 0;
                    return (
                      <TableRow
                        key={row.channelKey}
                        data-state={selectedChannel === row.channelKey ? "selected" : undefined}
                        className={`cursor-pointer ${negMargin ? "bg-[color-mix(in_srgb,var(--color-semantic-danger)_10%,var(--color-surface-card))]" : ""} ${selectedChannel === row.channelKey ? "ring-1 ring-emerald-500/40" : ""}`}
                        onClick={() => loadTop(row.channelKey)}
                      >
                        <TableCell>
                          <Badge className={meta.color}>{meta.label}</Badge>
                          <div className="text-xs text-muted-foreground mt-1">{row.totalQty} adet</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.orderCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(row.revenue)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${row.netProfit < 0 ? "text-[color:var(--color-semantic-danger)]" : "text-emerald-700 dark:text-emerald-300"}`}>
                          {fmt(row.netProfit)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${negMargin ? "text-[color:var(--color-semantic-danger)] font-medium" : ""}`}>
                          {fmtPct(row.netMarginPct)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {sortedItems.some((r) => r.netProfit < 0) && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Negatif marjlı satırlar vurgulandı — komisyon ve kargo ciro üzerinde.
                </p>
              )}
            </CardContent>
          </Card>

          {selectedChannel && topProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{CHANNEL_LABELS[selectedChannel]?.label || selectedChannel} — En Kârlı Ürünler</CardTitle>
                <CardDescription>Net kâr (komisyon + kargo düşülmüş) bazında top 20</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {topProducts.map((p: any, i: number) => (
                    <div key={p.product_id} className="flex items-center gap-3 p-2 hover:bg-muted/30 rounded text-sm">
                      <div className="text-xs font-mono text-muted-foreground/70 w-8">#{i + 1}</div>
                      <ShoppingBag className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.product_name}</div>
                        <div className="text-xs text-muted-foreground/70">{p.product_code} · {p.qty} adet</div>
                      </div>
                      <div className="text-right space-y-0.5">
                        <div className="inline-flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0 font-semibold text-emerald-700 dark:text-emerald-300">
                          <span>{fmt(Number(p.net_profit))}</span>
                          {p.margin_pct != null && (
                            <span className="text-xs font-normal text-muted-foreground tabular-nums">
                              {fmtPct(Number(p.margin_pct))}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground/70">Ciro {fmt(Number(p.revenue))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
    </OnlineSalesFeatureGate>
  );
}

function KpiCard({ icon, label, value, sub, highlight }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-emerald-500" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold ${highlight ? "text-emerald-300" : ""}`}>{value}</div>
        <div className="text-xs text-muted-foreground/70 mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}
