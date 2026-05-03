import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Inbox, Send, FileText, Clock, CheckCircle2, XCircle, Search, Plus, Hourglass, Target, TrendingUp, AlertCircle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

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

interface PipelineMetrics {
  sellerInboxPendingOver48h: number;
  sellerInboxPendingOver72h: number;
  buyerOutboxPendingOver48h: number;
  sellerInboxQuotedAwaitingBuyer: number;
  sellerAcceptedQuotesLast30Days: number;
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

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card variant="flat" className={cn("!flex !flex-row !items-center !gap-2 !py-2 !px-3", color)}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </Card>
  );
}

export default function QuotesListPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"inbox" | "outbox">("inbox");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Quote[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pipeline, setPipeline] = useState<PipelineMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const url = `${apiBase}/b2b/quotes/${tab}${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`;
      const [list, s, p] = await Promise.all([
        fetch(url, { credentials: "include" }).then((r) => r.json()),
        fetch(`${apiBase}/b2b/quotes/stats`, { credentials: "include" }).then((r) => r.json()),
        fetch(`${apiBase}/b2b/quotes/pipeline-metrics`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      setData(list);
      setStats(s);
      setPipeline(p && typeof p === "object" ? p : null);
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

  const quoteColumns = useMemo((): DataTableColumn<Quote>[] => {
    const mode = tab;
    return [
      {
        id: "code",
        header: "Kod",
        sortable: true,
        sortValue: (q) => q.code,
        cell: (q) => (
          <Link href={`/b2b/quotes/${q.id}`}>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:underline">{q.code}</code>
          </Link>
        ),
      },
      {
        id: "subject",
        header: "Konu",
        sortable: true,
        sortValue: (q) => q.subject,
        cell: (q) => (
          <Link href={`/b2b/quotes/${q.id}`}>
            <span className="font-medium text-foreground hover:underline line-clamp-2">{q.subject}</span>
          </Link>
        ),
      },
      {
        id: "status",
        header: "Durum",
        sortable: true,
        sortValue: (q) => q.status,
        cell: (q) => <StatusBadge status={q.status} />,
      },
      {
        id: "counterparty",
        header: mode === "inbox" ? "Gönderen" : "Alıcı",
        sortable: true,
        sortValue: (q) => (mode === "inbox" ? q.fromCompany?.name : q.toCompany?.name) ?? "",
        cell: (q) => {
          const cp = mode === "inbox" ? q.fromCompany : q.toCompany;
          return (
            <div className="flex items-center gap-2 min-w-0 max-w-[200px]">
              {cp?.logoUrl ? (
                <img src={cp.logoUrl} alt="" className="h-8 w-8 rounded-md object-contain border shrink-0" />
              ) : (
                <div
                  className="h-8 w-8 rounded-md flex items-center justify-center text-[color:var(--color-nav-text-active)] text-sm font-bold shrink-0"
                  style={{ backgroundColor: cp?.primaryColor ?? "var(--color-neutral-500)" }}
                >
                  {cp?.name?.charAt(0) ?? "?"}
                </div>
              )}
              <span className="truncate text-sm">{cp?.name ?? "—"}</span>
            </div>
          );
        },
      },
      {
        id: "amount",
        header: "Tutar",
        headerClassName: "text-right",
        className: "text-right",
        sortable: true,
        sortValue: (q) => q.quotedTotalAmount ?? 0,
        cell: (q) =>
          q.quotedTotalAmount != null && q.status === "quoted" ? (
            <span className="text-sm font-bold tabular-nums">
              {q.quotedTotalAmount.toLocaleString("tr-TR")} {q.quotedCurrency}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "createdAt",
        header: "Tarih",
        sortable: true,
        sortValue: (q) => new Date(q.createdAt).getTime(),
        headerClassName: "hidden md:table-cell",
        className: "hidden md:table-cell text-sm text-muted-foreground",
        cell: (q) => new Date(q.createdAt).toLocaleDateString("tr-TR"),
      },
    ];
  }, [tab]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <PageHeader
        title="Teklifler"
        subtitle="Tedarik ağındaki firmalarla teklif alışverişi"
        right={
          <Link href="/network">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Teklif İste
            </Button>
          </Link>
        }
        className="!pb-4"
      />

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

        {pipeline && (
          <div className="flex flex-wrap gap-2 mt-3 text-xs" data-testid="b2b-pipeline-sla">
            {tab === "inbox" && pipeline.sellerInboxPendingOver48h > 0 && (
              <Card className="!p-2.5 border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
                <span className="font-semibold tabular-nums">{pipeline.sellerInboxPendingOver48h}</span> gelen teklif 48+ saat yanıtsız
                {pipeline.sellerInboxPendingOver72h > 0 ? (
                  <span className="block text-[11px] opacity-90 mt-0.5 tabular-nums">
                    ({pipeline.sellerInboxPendingOver72h} adet 72+ saat)
                  </span>
                ) : null}
              </Card>
            )}
            {tab === "inbox" && pipeline.sellerInboxQuotedAwaitingBuyer > 0 && (
              <Card className="!p-2.5 border-blue-500/40 bg-blue-500/10 text-foreground">
                <span className="font-semibold tabular-nums">{pipeline.sellerInboxQuotedAwaitingBuyer}</span> teklif alıcı kararında
              </Card>
            )}
            {tab === "outbox" && pipeline.buyerOutboxPendingOver48h > 0 && (
              <Card className="!p-2.5 border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
                <span className="font-semibold tabular-nums">{pipeline.buyerOutboxPendingOver48h}</span> giden talep 48+ saat satıcı yanıtı bekliyor
              </Card>
            )}
            {tab === "inbox" && pipeline.sellerAcceptedQuotesLast30Days > 0 && (
              <Card className="!p-2.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100">
                Son 30 gün: <span className="font-semibold tabular-nums">{pipeline.sellerAcceptedQuotesLast30Days}</span> kabul (satıcı)
              </Card>
            )}
          </div>
        )}

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
                        <Card className="!p-3 hover:shadow-md transition-shadow cursor-pointer h-full" data-testid={`urgent-quote-${q.id}`}>
                          <div className="flex items-start justify-between mb-1.5">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${rankColor}`}>#{i + 1}</Badge>
                            <span className={`text-[10px] font-semibold ${daysAgo >= 3 ? "text-red-600" : "text-amber-600"}`}>{daysAgo}g önce</span>
                          </div>
                          <div className="text-sm font-medium truncate" title={q.subject}>{q.subject}</div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            <code className="font-mono">{q.code}</code> · {q.fromCompany?.name ?? "—"}
                          </div>
                        </Card>
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
                variant={statusFilter === s ? "primary" : "secondary"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "Tümü" : STATUS_META[s]?.label ?? s}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="inbox" className="mt-5">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataTable<Quote>
                columns={quoteColumns}
                data={filtered}
                getRowId={(q) => String(q.id)}
                loading={loading}
                enableRowSelection={false}
                showFooterPagination={false}
                emptyState={
                  <EmptyState
                    icon={Inbox}
                    title="Gelen teklif yok"
                    description="İş ağınızdaki firmalardan gelen talepler burada görünür."
                    action={{ label: "Teklif İste", href: "/network" }}
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbox" className="mt-5">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataTable<Quote>
                columns={quoteColumns}
                data={filtered}
                getRowId={(q) => String(q.id)}
                loading={loading}
                enableRowSelection={false}
                showFooterPagination={false}
                emptyState={
                  <EmptyState
                    icon={Send}
                    title="Gönderilen teklif yok"
                    description="Satın alma taleplerinizi ağınızdaki satıcılara iletmek için iş ağını kullanın."
                    action={{ label: "İş ağına git", href: "/network" }}
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
