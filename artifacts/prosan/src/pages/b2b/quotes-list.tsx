import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Inbox, Send, FileText, Clock, CheckCircle2, XCircle, Search, ChevronRight, Plus, Hourglass, Target, TrendingUp, AlertCircle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface Quote {
  id: number;
  code: string;
  fromCompanyId: number;
  toCompanyId: number;
  subject: string;
  status: string;
  quotedTotalAmount: number | null;
  quotedCurrency: string | null;
  validUntil: string | null;
  createdAt: string;
  fromCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
  toCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
}

interface Stats {
  inbox: { pending: number; quoted: number; accepted: number; rejected: number };
  outbox: { pending: number; quoted: number; accepted: number; rejected: number };
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Bekliyor", color: "bg-amber-500/10 text-amber-300 border-amber-500/20", icon: Hourglass },
  quoted: { label: "Yanıtlandı", color: "bg-blue-500/10 text-blue-300 border-blue-500/20", icon: FileText },
  accepted: { label: "Kabul Edildi", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Reddedildi", color: "bg-rose-500/10 text-rose-300 border-rose-500/20", icon: XCircle },
  cancelled: { label: "İptal", color: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.color}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function QuoteCard({ q, mode }: { q: Quote; mode: "inbox" | "outbox" }) {
  const counterparty = mode === "inbox" ? q.fromCompany : q.toCompany;
  return (
    <Link href={`/b2b/quotes/${q.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex items-center gap-4">
          {counterparty?.logoUrl ? (
            <img src={counterparty.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain border shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: counterparty?.primaryColor ?? "#666" }}>
              {counterparty?.name?.charAt(0) ?? "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{q.code}</code>
              <StatusBadge status={q.status} />
            </div>
            <h3 className="font-semibold mt-1 truncate">{q.subject}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {mode === "inbox" ? "Gönderen: " : "Alıcı: "}
              <span className="font-medium">{counterparty?.name ?? "—"}</span>
            </p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            {q.quotedTotalAmount != null && q.status === "quoted" ? (
              <p className="text-sm font-bold">
                {q.quotedTotalAmount.toLocaleString("tr-TR")} {q.quotedCurrency}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(q.createdAt).toLocaleDateString("tr-TR")}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

export default function QuotesListPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"inbox" | "outbox">("inbox");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Quote[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const url = `${apiBase}/b2b/quotes/${tab}${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`;
      const [list, s] = await Promise.all([
        fetch(url, { credentials: "include" }).then((r) => r.json()),
        fetch(`${apiBase}/b2b/quotes/stats`, { credentials: "include" }).then((r) => r.json()),
      ]);
      setData(list);
      setStats(s);
    } catch {
      toast({ title: "Hata", description: "Teklifler yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [tab, statusFilter]);

  const filtered = search
    ? data.filter(
        (q) =>
          q.code.toLowerCase().includes(search.toLowerCase()) ||
          q.subject.toLowerCase().includes(search.toLowerCase()) ||
          q.fromCompany?.name?.toLowerCase().includes(search.toLowerCase()) ||
          q.toCompany?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const currentStats = stats?.[tab];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            B2B Teklifler
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tedarik ağındaki firmalarla teklif alışverişi
          </p>
        </div>
        <Link href="/network">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Teklif İste
          </Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 w-full sm:w-80">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            Gelen ({(stats?.inbox.pending ?? 0) + (stats?.inbox.quoted ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="outbox" className="gap-2">
            <Send className="h-4 w-4" />
            Giden
          </TabsTrigger>
        </TabsList>

        {currentStats && (
          <div className="flex flex-wrap gap-2 mt-4">
            <StatChip label="Bekliyor" value={currentStats.pending} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
            <StatChip label="Yanıtlandı" value={currentStats.quoted} color="bg-blue-500/10 text-blue-300 border-blue-500/20" />
            <StatChip label="Kabul" value={currentStats.accepted} color="bg-emerald-500/10 text-emerald-300 border-emerald-500/20" />
            <StatChip label="Red" value={currentStats.rejected} color="bg-rose-500/10 text-rose-300 border-rose-500/20" />
          </div>
        )}

        {/* Dalga 33 — KPI Performans Strip (sadece ekleme, mevcut stats'tan türetilmiş) */}
        {currentStats && (() => {
          const total = currentStats.pending + currentStats.quoted + currentStats.accepted + currentStats.rejected;
          const responded = currentStats.quoted + currentStats.accepted + currentStats.rejected;
          const decided = currentStats.accepted + currentStats.rejected;
          const responseRate = total > 0 ? (responded / total) * 100 : 0;
          const acceptanceRate = decided > 0 ? (currentStats.accepted / decided) * 100 : 0;
          // Acil: en yaşlı pending (data filtrelenmiş — current tab pending varsa hesapla)
          const oldestPending = data
            .filter((q) => q.status === "pending")
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
          const oldestPendingDays = oldestPending
            ? Math.floor((Date.now() - new Date(oldestPending.createdAt).getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4" data-testid="b2b-kpi-strip">
              <Card data-testid="kpi-total-quotes">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Toplam Teklif</div>
                      <div className="text-2xl font-bold mt-1">{total}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{tab === "inbox" ? "gelen kutusu" : "giden kutusu"}</div>
                    </div>
                    <Activity className="h-7 w-7 text-blue-500 opacity-70" />
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-response-rate">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">{tab === "inbox" ? "Yanıt Oranımız" : "Karşı Yanıt Oranı"}</div>
                      <div className={`text-2xl font-bold mt-1 ${responseRate >= 80 ? "text-emerald-600" : responseRate >= 50 ? "text-amber-600" : "text-red-600"}`}>%{responseRate.toFixed(0)}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{responded} / {total}</div>
                    </div>
                    <TrendingUp className={`h-7 w-7 opacity-70 ${responseRate >= 80 ? "text-emerald-500" : responseRate >= 50 ? "text-amber-500" : "text-red-500"}`} />
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-acceptance-rate">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Kabul Oranı</div>
                      <div className={`text-2xl font-bold mt-1 ${acceptanceRate >= 60 ? "text-emerald-600" : acceptanceRate >= 30 ? "text-amber-600" : "text-slate-500"}`}>{decided > 0 ? `%${acceptanceRate.toFixed(0)}` : "—"}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{currentStats.accepted} / {decided} karar</div>
                    </div>
                    <Target className={`h-7 w-7 opacity-70 ${acceptanceRate >= 60 ? "text-emerald-500" : "text-slate-400"}`} />
                  </div>
                </CardContent>
              </Card>
              <Card className={oldestPendingDays >= 3 ? "border-red-200" : oldestPendingDays >= 1 ? "border-amber-200" : ""} data-testid="kpi-oldest-pending">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">En Eski Bekleyen</div>
                      <div className={`text-2xl font-bold mt-1 ${oldestPendingDays >= 3 ? "text-red-600" : oldestPendingDays >= 1 ? "text-amber-600" : "text-slate-500"}`}>
                        {oldestPending ? `${oldestPendingDays}g` : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={oldestPending?.subject}>
                        {oldestPending ? oldestPending.code : "yok"}
                      </div>
                    </div>
                    <AlertCircle className={`h-7 w-7 opacity-70 ${oldestPendingDays >= 3 ? "text-red-500" : oldestPendingDays >= 1 ? "text-amber-500" : "text-slate-400"}`} />
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Dalga 33 — "Yanıt Bekleyen — En Acil 3 Teklif" widget (sadece ekleme, inbox tab) */}
        {tab === "inbox" && (() => {
          const urgent = data
            .filter((q) => q.status === "pending")
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .slice(0, 3);
          if (urgent.length === 0) return null;
          return (
            <Card className="mt-4 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20" data-testid="urgent-quotes-widget">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Hourglass className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold">Yanıt Bekleyen — En Acil Teklifler</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {urgent.map((q, i) => {
                    const daysAgo = Math.floor((Date.now() - new Date(q.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                    const rankColor = i === 0 ? "bg-red-100 text-red-700 border-red-200"
                      : i === 1 ? "bg-orange-100 text-orange-700 border-orange-200"
                      : "bg-amber-100 text-amber-700 border-amber-200";
                    return (
                      <Link key={q.id} href={`/b2b/quotes/${q.id}`}>
                        <div className="p-3 rounded-lg border bg-card hover:shadow-md transition-shadow cursor-pointer" data-testid={`urgent-quote-${q.id}`}>
                          <div className="flex items-start justify-between mb-1.5">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${rankColor}`}>#{i + 1}</Badge>
                            <span className={`text-[10px] font-semibold ${daysAgo >= 3 ? "text-red-600" : "text-amber-600"}`}>{daysAgo}g önce</span>
                          </div>
                          <div className="text-sm font-medium truncate" title={q.subject}>{q.subject}</div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            <code className="font-mono">{q.code}</code> · {q.fromCompany?.name ?? "—"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Kod, konu veya firma ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", "pending", "quoted", "accepted", "rejected"].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "Tümü" : STATUS_META[s]?.label ?? s}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="inbox" className="space-y-3 mt-5">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Henüz gelen teklif yok</p>
            </div>
          ) : (
            filtered.map((q) => <QuoteCard key={q.id} q={q} mode="inbox" />)
          )}
        </TabsContent>

        <TabsContent value="outbox" className="space-y-3 mt-5">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Send className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Henüz gönderilmiş teklif yok</p>
              <Link href="/network">
                <Button size="sm" className="mt-4">Ağa Göz At →</Button>
              </Link>
            </div>
          ) : (
            filtered.map((q) => <QuoteCard key={q.id} q={q} mode="outbox" />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
