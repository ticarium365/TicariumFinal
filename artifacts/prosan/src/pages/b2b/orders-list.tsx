import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import {
  Inbox,
  Send,
  Package,
  Hourglass,
  CheckCircle2,
  Truck,
  PackageCheck,
  XCircle,
  Search,
  CircleDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Order {
  id: number;
  code: string;
  quoteId: number;
  buyerCompanyId: number;
  sellerCompanyId: number;
  status: string;
  totalAmount: number;
  currency: string;
  shippingCity: string | null;
  trackingNo: string | null;
  carrier: string | null;
  createdAt: string;
  buyerCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
  sellerCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
}

interface Stats {
  inbox: { pending: number; confirmed: number; shipped: number; delivered: number; completed: number; cancelled: number };
  outbox: { pending: number; confirmed: number; shipped: number; delivered: number; completed: number; cancelled: number };
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Beklemede", color: "bg-amber-500/10 text-amber-300 border-amber-500/20", icon: Hourglass },
  confirmed: { label: "Onaylandı", color: "bg-blue-500/10 text-blue-300 border-blue-500/20", icon: CheckCircle2 },
  shipped: { label: "Kargoda", color: "bg-violet-500/10 text-violet-300 border-violet-500/20", icon: Truck },
  delivered: { label: "Teslim Edildi", color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20", icon: PackageCheck },
  completed: { label: "Tamamlandı", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  cancelled: { label: "İptal", color: "bg-rose-500/10 text-rose-300 border-rose-500/20", icon: XCircle },
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

const PAGE_SIZE = 30;

export default function OrdersListPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"inbox" | "outbox">("outbox");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (statusFilter !== "all") q.set("status", statusFilter);
      q.set("limit", String(PAGE_SIZE));
      q.set("page", String(page));
      if (searchDebounced.trim().length >= 2) {
        q.set("q", searchDebounced.trim());
      }
      const qs = q.toString();
      const url = `${apiBase}/b2b/orders/${tab}${qs ? `?${qs}` : ""}`;
      const [listRes, s] = await Promise.all([
        fetch(url, { credentials: "include" }).then((r) => r.json()),
        fetch(`${apiBase}/b2b/orders/stats`, { credentials: "include" }).then((r) => r.json()),
      ]);
      if (listRes && typeof listRes === "object" && Array.isArray(listRes.items)) {
        setData(listRes.items);
        setTotal(Number(listRes.total ?? 0));
      } else if (Array.isArray(listRes)) {
        setData(listRes);
        setTotal(listRes.length);
      } else {
        setData([]);
        setTotal(0);
      }
      setStats(s);
    } catch {
      toast({ title: "Hata", description: "Siparişler yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    fetchData();
  }, [tab, statusFilter, page, searchDebounced]);

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, searchDebounced]);

  const serverSearch = searchDebounced.trim().length >= 2;
  const filtered = serverSearch
    ? data
    : searchInput.trim()
      ? data.filter(
          (o) =>
            o.code.toLowerCase().includes(searchInput.toLowerCase()) ||
            o.buyerCompany?.name?.toLowerCase().includes(searchInput.toLowerCase()) ||
            o.sellerCompany?.name?.toLowerCase().includes(searchInput.toLowerCase()) ||
            o.trackingNo?.toLowerCase().includes(searchInput.toLowerCase())
        )
      : data;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentStats = stats?.[tab];

  const orderColumns = useMemo((): DataTableColumn<Order>[] => {
    const mode = tab;
    return [
      {
        id: "code",
        header: "Kod",
        sortable: true,
        sortValue: (o) => o.code,
        cell: (o) => (
          <Link href={`/b2b/orders/${o.id}`}>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:underline">{o.code}</code>
          </Link>
        ),
      },
      {
        id: "status",
        header: "Durum",
        sortable: true,
        sortValue: (o) => o.status,
        cell: (o) => (
          <div className="flex flex-col gap-1 items-start">
            <StatusBadge status={o.status} />
            {o.trackingNo ? (
              <Badge variant="outline" className="gap-1 text-xs max-w-[180px] truncate">
                <Truck className="h-3 w-3 shrink-0" />
                <span className="truncate">{o.carrier ?? "Kargo"}: {o.trackingNo}</span>
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "counterparty",
        header: mode === "inbox" ? "Alıcı" : "Satıcı",
        sortable: true,
        sortValue: (o) => (mode === "inbox" ? o.buyerCompany?.name : o.sellerCompany?.name) ?? "",
        cell: (o) => {
          const cp = mode === "inbox" ? o.buyerCompany : o.sellerCompany;
          return (
            <div className="flex items-center gap-2 min-w-0 max-w-[200px]">
              {cp?.logoUrl ? (
                <img src={cp.logoUrl} alt="" className="h-8 w-8 rounded-md object-contain border shrink-0" />
              ) : (
                <div
                  className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: cp?.primaryColor ?? "var(--color-neutral-500)" }}
                >
                  {cp?.name?.charAt(0) ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <span className="truncate text-sm block">{cp?.name ?? "—"}</span>
                {o.shippingCity ? (
                  <span className="text-[11px] text-muted-foreground truncate block">{o.shippingCity}</span>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: "total",
        header: "Tutar",
        headerClassName: "text-right",
        className: "text-right",
        sortable: true,
        sortValue: (o) => o.totalAmount,
        cell: (o) => (
          <span className="text-sm font-bold tabular-nums inline-flex items-center gap-1 justify-end">
            <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:inline" />
            {o.totalAmount.toLocaleString("tr-TR")} {o.currency}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Tarih",
        sortable: true,
        sortValue: (o) => new Date(o.createdAt).getTime(),
        headerClassName: "hidden md:table-cell",
        className: "hidden md:table-cell text-sm text-muted-foreground",
        cell: (o) => new Date(o.createdAt).toLocaleDateString("tr-TR"),
      },
    ];
  }, [tab]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <PageHeader
        title="Siparişler"
        subtitle="Kabul edilen tekliflerden oluşan siparişler ve sevkiyat takibi"
        right={
          <Link href="/b2b/quotes">
            <Button variant="secondary">Tekliflere dön</Button>
          </Link>
        }
        className="!pb-4"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 w-full sm:w-80">
          <TabsTrigger value="outbox" className="gap-2">
            <Send className="h-4 w-4" />
            Alımlarım ({(stats?.outbox?.pending ?? 0) + (stats?.outbox?.confirmed ?? 0) + (stats?.outbox?.shipped ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            Satışlarım ({(stats?.inbox?.pending ?? 0) + (stats?.inbox?.confirmed ?? 0) + (stats?.inbox?.shipped ?? 0)})
          </TabsTrigger>
        </TabsList>

        {currentStats && (
          <div className="flex flex-wrap gap-2 mt-4">
            <StatChip label="Beklemede" value={currentStats.pending} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
            <StatChip label="Onaylandı" value={currentStats.confirmed} color="bg-blue-500/10 text-blue-300 border-blue-500/20" />
            <StatChip label="Kargoda" value={currentStats.shipped} color="bg-violet-500/10 text-violet-300 border-violet-500/20" />
            <StatChip label="Teslim" value={currentStats.delivered} color="bg-cyan-500/10 text-cyan-300 border-cyan-500/20" />
            <StatChip label="Tamamlandı" value={currentStats.completed} color="bg-emerald-500/10 text-emerald-300 border-emerald-500/20" />
            <StatChip label="İptal" value={currentStats.cancelled} color="bg-rose-500/10 text-rose-300 border-rose-500/20" />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Kod, firma veya kargo no ara (2+ harf: tüm kayıtlar)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
            {!serverSearch && total > PAGE_SIZE && (
              <p className="text-[11px] text-muted-foreground mt-1 pl-1">
                Kısa arama: yalnızca bu sayfadaki {PAGE_SIZE} kayıt içinde filtrelenir.
              </p>
            )}
            {serverSearch && (
              <p className="text-[11px] text-muted-foreground mt-1 pl-1">
                Sunucu tüm siparişlerde arar; sonuçlar sayfalanır.
              </p>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", "pending", "confirmed", "shipped", "delivered", "completed", "cancelled"].map((s) => (
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

        <TabsContent value="outbox" className="mt-5 space-y-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <SkeletonTable rows={8} columns={5} rowHeight={40} />
              ) : (
                <DataTable<Order>
                  columns={orderColumns}
                  data={filtered}
                  getRowId={(o) => String(o.id)}
                  enableRowSelection={false}
                  showFooterPagination={false}
                  emptyState={
                    <EmptyState
                      icon={Package}
                      title="Henüz alım siparişiniz yok"
                      description="Kabul ettiğiniz teklifler siparişe dönüşünce burada listelenir."
                      action={{ label: "Tekliflere git", href: "/b2b/quotes" }}
                    />
                  }
                />
              )}
            </CardContent>
          </Card>
          {!loading && total > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
              <p className="text-xs text-muted-foreground tabular-nums">
                Toplam {total} kayıt · sayfa {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="inbox" className="mt-5 space-y-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <SkeletonTable rows={8} columns={5} rowHeight={40} />
              ) : (
                <DataTable<Order>
                  columns={orderColumns}
                  data={filtered}
                  getRowId={(o) => String(o.id)}
                  enableRowSelection={false}
                  showFooterPagination={false}
                  emptyState={
                    <EmptyState
                      icon={Inbox}
                      title="Henüz B2B siparişi yok"
                      description="Müşterilerinizin verdiği siparişler burada görünür; önce teklif sürecini kullanın."
                      action={{ label: "Tekliflere git", href: "/b2b/quotes" }}
                    />
                  }
                />
              )}
            </CardContent>
          </Card>
          {!loading && total > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
              <p className="text-xs text-muted-foreground tabular-nums">
                Toplam {total} kayıt · sayfa {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
