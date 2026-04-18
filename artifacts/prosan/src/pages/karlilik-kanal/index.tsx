import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
  pos: { label: "Mağaza POS", color: "bg-emerald-100 text-emerald-800" },
  storefront: { label: "Hazır Mağaza", color: "bg-blue-100 text-blue-800" },
  trendyol: { label: "Trendyol", color: "bg-orange-100 text-orange-800" },
  hepsiburada: { label: "Hepsiburada", color: "bg-amber-100 text-amber-800" },
  n11: { label: "N11", color: "bg-purple-100 text-purple-800" },
  amazon: { label: "Amazon", color: "bg-yellow-100 text-yellow-800" },
  ciceksepeti: { label: "ÇiçekSepeti", color: "bg-pink-100 text-pink-800" },
  pttavm: { label: "PTT AVM", color: "bg-yellow-100 text-yellow-800" },
  pazarama: { label: "Pazarama", color: "bg-indigo-100 text-indigo-800" },
  whatsapp: { label: "WhatsApp", color: "bg-green-100 text-green-800" },
  b2b: { label: "B2B Portal", color: "bg-slate-100 text-slate-800" },
};

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;
}

export default function KarlilikKanalPage() {
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ items: ChannelRow[]; totals: ChannelRow } | null>(null);
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

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

  const maxRevenue = Math.max(1, ...(data?.items || []).map((x) => x.revenue));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <Link href="/eticarium-merkezi" className="hover:underline">e-Ticarium Merkezi</Link>
            <span>/</span>
            <span>Karlılık Analizi</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="w-7 h-7 text-emerald-600" /> Kanal Karşılaştırma
          </h1>
          <p className="text-slate-600 mt-1 max-w-2xl">
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
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : !data || data.items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          Bu dönemde satış bulunamadı.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<DollarSign className="w-5 h-5" />} label="Toplam Ciro" value={fmt(data.totals.revenue)} sub={`${data.totals.orderCount} sipariş`} />
            <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Brüt Kâr" value={fmt(data.totals.grossProfit)} sub={`Maliyet: ${fmt(data.totals.cogs)}`} />
            <KpiCard icon={<TrendingDown className="w-5 h-5 text-red-500" />} label="Komisyon + Kargo" value={fmt(data.totals.commission + data.totals.shipping)} sub="Toplam giderler" />
            <KpiCard icon={<Percent className="w-5 h-5 text-emerald-600" />} label="Net Marj" value={fmtPct(data.totals.netMarginPct)} sub={`Net: ${fmt(data.totals.netProfit)}`} highlight />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Kanal Karşılaştırma Tablosu</CardTitle>
              <CardDescription>Bir kanala tıklayarak en kârlı ürünlerini görebilirsiniz.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.items.map((row) => {
                  const meta = CHANNEL_LABELS[row.channelKey] || { label: row.channelKey, color: "bg-slate-100 text-slate-800" };
                  const widthPct = (row.revenue / maxRevenue) * 100;
                  const isLoss = row.netProfit < 0;
                  return (
                    <button key={row.channelKey} onClick={() => loadTop(row.channelKey)}
                      className={`w-full text-left p-4 border-2 rounded-lg hover:shadow-md transition ${selectedChannel === row.channelKey ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200"}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className={meta.color}>{meta.label}</Badge>
                        <span className="text-sm text-slate-500">{row.orderCount} sipariş · {row.totalQty} adet</span>
                        <div className="ml-auto text-right">
                          <div className={`text-lg font-bold ${isLoss ? "text-red-600" : "text-emerald-700"}`}>
                            {fmt(row.netProfit)} <span className="text-sm text-slate-400">net</span>
                          </div>
                          <div className="text-xs text-slate-500">Marj {fmtPct(row.netMarginPct)} · Ciro {fmt(row.revenue)}</div>
                        </div>
                      </div>
                      <div className="mt-3 h-2 bg-slate-100 rounded overflow-hidden">
                        <div className={`h-full ${isLoss ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${widthPct}%` }} />
                      </div>
                      <div className="mt-2 text-xs text-slate-500 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <span>Ciro: <b className="text-slate-700">{fmt(row.revenue)}</b></span>
                        <span>COGS: <b className="text-slate-700">{fmt(row.cogs)}</b></span>
                        <span>Komisyon: <b className="text-amber-700">{fmt(row.commission)}</b></span>
                        <span>Kargo: <b className="text-amber-700">{fmt(row.shipping)}</b></span>
                      </div>
                      {isLoss && (
                        <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Bu kanal zarar yazıyor — komisyon/kargo cironun üzerine çıkmış.
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
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
                    <div key={p.product_id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded text-sm">
                      <div className="text-xs font-mono text-slate-400 w-8">#{i + 1}</div>
                      <ShoppingBag className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.product_name}</div>
                        <div className="text-xs text-slate-400">{p.product_code} · {p.qty} adet</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-700">{fmt(Number(p.net_profit))}</div>
                        <div className="text-xs text-slate-400">Ciro {fmt(Number(p.revenue))}</div>
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
  );
}

function KpiCard({ icon, label, value, sub, highlight }: { icon: React.ReactNode; label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-emerald-500" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold ${highlight ? "text-emerald-700" : ""}`}>{value}</div>
        <div className="text-xs text-slate-400 mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}
