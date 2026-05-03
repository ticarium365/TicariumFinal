import { useCallback, useMemo, useState } from "react";
import { useListSales, getListSalesQueryKey } from "@workspace/api-client-react";
import type { Sale } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { History, RotateCcw, Loader2, FileText, Send, Eye, Receipt, Trophy, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

function useReturnSale() {
  return useMutation({
    mutationFn: async ({ saleId, note }: { saleId: number; note?: string }) => {
      const res = await fetch(`/api/sales/${saleId}/return`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "İade başarısız");
      }
      return res.json();
    },
  });
}

export default function SalesHistory() {
  const [page, setPage] = useState(1);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [saleTypeFilter, setSaleTypeFilter] = useState<"all" | "retail" | "wholesale">("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const returnSale = useReturnSale();
  const [, setLocation] = useLocation();

  const [returnDialog, setReturnDialog] = useState<{ id: number; name: string; qty: number } | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [invoicing, setInvoicing] = useState(false);

  // ─── Sprint G — Tek tıkla fatura + XML önizleme ─────────────────────────────
  const [quickSaleId, setQuickSaleId] = useState<number | null>(null);
  const [previewOutbox, setPreviewOutbox] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const openQuickInvoice = async (saleId: number) => {
    setQuickSaleId(saleId);
    setPreviewLoading(true);
    setPreviewOutbox(null);
    try {
      const r = await fetch("/api/einvoice/from-sales", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds: [saleId] }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || body?.detail || "Faturalama başarısız");
      const detail = await fetch(`/api/einvoice/outbox/${body.id}`, { credentials: "include" });
      const detailJson = await detail.json();
      if (!detail.ok) throw new Error(detailJson?.error || detailJson?.detail || "Outbox detayı alınamadı");
      setPreviewOutbox(detailJson);
    } catch (e: any) {
      toast({ title: "Fatura kesilemedi", description: e?.message || String(e), variant: "destructive" });
      setQuickSaleId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleQuickSend = async () => {
    if (!previewOutbox?.id) return;
    setSending(true);
    try {
      const r = await fetch(`/api/einvoice/outbox/${previewOutbox.id}/send`, {
        method: "POST",
        credentials: "include",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || body?.detail || "Gönderim başarısız");
      toast({
        title: "E-Fatura gönderildi",
        description: `Outbox #${previewOutbox.id} • Durum: ${body.status}`,
      });
      setPreviewOutbox(body);
    } catch (e: any) {
      toast({ title: "Gönderim hatası", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const previewXml: string | null = previewOutbox?.lastResponse?.xml
    ?? previewOutbox?.lastResponse?.body
    ?? null;

  const listParams = {
    startDate: dateStr,
    endDate: dateStr,
    page,
    limit: 50,
    ...(saleTypeFilter !== "all" ? { saleType: saleTypeFilter } : {}),
  } as any;

  const { data, isLoading } = useListSales(listParams, {
    query: {
      queryKey: getListSalesQueryKey(listParams),
      staleTime: 45_000,
    },
  });

  type DaySummary = {
    date: string;
    validCount: number;
    validRevenue: number;
    validProfit: number;
    topProducts: { name: string; qty: number; revenue: number }[];
    hourBuckets: number[];
    peakHour: number | null;
  };

  const { data: daySummary, isPending: summaryPending, isError: summaryErr } = useQuery<DaySummary>({
    queryKey: ["sales-day-summary", dateStr, saleTypeFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ date: dateStr });
      if (saleTypeFilter !== "all") qs.set("saleType", saleTypeFilter);
      const r = await fetch(`/api/sales/day-summary?${qs.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error("day-summary");
      return r.json();
    },
    staleTime: 60_000,
  });

  const handleReturn = async () => {
    if (!returnDialog) return;
    try {
      await returnSale.mutateAsync({ saleId: returnDialog.id, note: returnNote });
      toast({ title: "İade kaydedildi", description: `${returnDialog.name} — ${returnDialog.qty} adet iade edildi, stok güncellendi.` });
      setReturnDialog(null);
      setReturnNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["sales-day-summary"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    }
  };

  const totalRevenue = data?.sales?.filter(s => !(s as any).returned).reduce((s, r) => s + r.totalPrice, 0) ?? 0;
  const totalProfit = data?.sales?.filter(s => !(s as any).returned).reduce((s, r) => s + r.profit, 0) ?? 0;

  const validSales = useMemo(
    () => (data?.sales ?? []).filter(s => !(s as any).returned),
    [data?.sales]
  );
  const validCount = validSales.length;

  const kpiUsesDay = !summaryPending && daySummary != null && !summaryErr;
  const kpiCount = kpiUsesDay ? daySummary.validCount : validCount;
  const kpiRevenue = kpiUsesDay ? daySummary.validRevenue : totalRevenue;
  const kpiProfit = kpiUsesDay ? daySummary.validProfit : totalProfit;
  const kpiAvgTicket = kpiCount > 0 ? kpiRevenue / kpiCount : 0;

  const topProducts = daySummary?.topProducts ?? [];
  const hourBuckets = daySummary?.hourBuckets?.length === 24
    ? daySummary.hourBuckets
    : Array.from({ length: 24 }, () => 0);
  const peakHour = daySummary?.peakHour ?? null;
  const maxBucket = Math.max(1, ...hourBuckets);
  const dayWidgetCount = !summaryErr && daySummary ? daySummary.validCount : 0;

  // ─── Toplu Faturalama (Sprint 62 köprüsü) ───
  const invoiceableSales = useMemo(
    () => (data?.sales || []).filter((s) => !(s as any).returned && (s as any).customerId != null),
    [data?.sales]
  );
  const selectedSales = useMemo(
    () => invoiceableSales.filter((s) => selectedIds.has(s.id)),
    [invoiceableSales, selectedIds]
  );
  const selectedSameCustomer = useMemo(() => {
    if (selectedSales.length === 0) return true;
    const customerIds = new Set(selectedSales.map((s) => (s as any).customerId));
    return customerIds.size === 1;
  }, [selectedSales]);
  const selectedTotal = selectedSales.reduce((s, r) => s + r.totalPrice, 0);

  const toggleSale = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleInvoice = async () => {
    if (selectedSales.length === 0) return;
    if (!selectedSameCustomer) {
      toast({ title: "Faturalanamaz", description: "Seçili satışlar farklı müşterilere ait. Tek müşteri seçin.", variant: "destructive" });
      return;
    }
    setInvoicing(true);
    try {
      const r = await fetch("/api/einvoice/from-sales", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds: selectedSales.map((s) => s.id) }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || body?.detail || "Faturalama başarısız");
      toast({
        title: "Fatura taslağı oluşturuldu",
        description: `Outbox #${body.id} • ETTN ${body.externalId || "—"}. Göndermek için E-Fatura ekranına geçin.`,
      });
      setSelectedIds(new Set());
      setLocation("/einvoice");
    } catch (e: any) {
      toast({ title: "Fatura kesilemedi", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setInvoicing(false);
    }
  };

  const salesList = data?.sales ?? [];

  const columns: DataTableColumn<Sale>[] = [
    {
      id: "sel",
      header: "",
      headerClassName: "w-12",
      cell: (sale) => {
        const isReturned = (sale as { returned?: boolean }).returned === true;
        const hasCustomer = (sale as { customerId?: number | null }).customerId != null;
        if (isReturned || !hasCustomer) return <span className="inline-block w-4" />;
        return (
          <Checkbox
            checked={selectedIds.has(sale.id)}
            onCheckedChange={() => toggleSale(sale.id)}
            aria-label={`Satış #${sale.id} seç`}
            data-testid={`select-sale-${sale.id}`}
            className="border-[color:var(--color-border-subtle)] data-[state=checked]:border-[var(--color-brand-500)] data-[state=checked]:bg-[var(--color-brand-500)]"
          />
        );
      },
    },
    {
      id: "time",
      header: "Saat",
      sortable: true,
      sortValue: (s) => s.createdAt,
      cell: (sale) => (
        <span className="font-mono text-sm text-[color:var(--color-neutral-600)]">
          {new Date(sale.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      id: "product",
      header: "Ürün",
      sortable: true,
      sortValue: (s) => s.productName,
      cell: (sale) => {
        const isReturned = (sale as { returned?: boolean }).returned === true;
        return (
          <div>
            <div className="flex flex-wrap items-center gap-2 font-[var(--font-weight-medium)]">
              {sale.productName}
              {isReturned ? <Badge variant="secondary" className="h-4 px-1 text-[10px]">İade</Badge> : null}
            </div>
            <div className="font-mono text-xs text-[color:var(--color-neutral-600)]">{sale.productCode}</div>
          </div>
        );
      },
    },
    {
      id: "unitPrice",
      header: "Birim",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (s) => s.unitPrice,
      className: "text-right tabular-nums",
      cell: (sale) => `${sale.unitPrice.toFixed(2)} TL`,
    },
    {
      id: "quantity",
      header: "Adet",
      headerClassName: "text-center",
      sortable: true,
      sortValue: (s) => s.quantity,
      className: "text-center font-[var(--font-weight-bold)]",
      cell: (sale) => `×${sale.quantity}`,
    },
    {
      id: "totalPrice",
      header: "Toplam",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (s) => s.totalPrice,
      className: "text-right font-[var(--font-weight-bold)] text-[color:var(--color-brand-700)]",
      cell: (sale) => {
        const isReturned = (sale as { returned?: boolean }).returned === true;
        if (isReturned) {
          return <span className="text-[color:var(--color-neutral-500)] line-through">{sale.totalPrice.toFixed(2)} TL</span>;
        }
        return `${sale.totalPrice.toFixed(2)} TL`;
      },
    },
    {
      id: "profit",
      header: "Kâr",
      headerClassName: "hidden text-right md:table-cell",
      className: "hidden text-right md:table-cell",
      sortable: true,
      sortValue: (s) => s.profit,
      cell: (sale) => (
        <span className="font-[var(--font-weight-medium)] text-[color:var(--color-semantic-success)]">+{sale.profit.toFixed(2)} TL</span>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-[96px]",
      cell: (sale) => {
        const isReturned = (sale as { returned?: boolean }).returned === true;
        const hasCustomer = (sale as { customerId?: number | null }).customerId != null;
        if (isReturned) return null;
        return (
          <div className="flex flex-col gap-1">
            {hasCustomer ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-[color:var(--color-brand-700)]"
                onClick={() => openQuickInvoice(sale.id)}
                data-testid={`quick-invoice-${sale.id}`}
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                E-Fatura
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[color:var(--color-neutral-600)] hover:text-[color:var(--color-semantic-danger)]"
              onClick={() => {
                setReturnNote("");
                setReturnDialog({ id: sale.id, name: sale.productName, qty: sale.quantity });
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              İade
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Satış Geçmişi"
        subtitle="Günlük satış kayıtları, iade ve toplu e-fatura seçimi."
        right={
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap font-[var(--font-weight-medium)]" htmlFor="dateFilter">Tarih</Label>
              <Input
                id="dateFilter"
                type="date"
                value={dateStr}
                onChange={(e) => { setDateStr(e.target.value); setPage(1); }}
                className="w-auto"
              />
            </div>
            <div className="flex flex-wrap gap-1" data-testid="saletype-filter">
              {([
                { v: "all" as const, label: "Tümü" },
                { v: "retail" as const, label: "Perakende" },
                { v: "wholesale" as const, label: "Toptan" },
              ]).map((opt) => (
                <Button
                  key={opt.v}
                  type="button"
                  variant={saleTypeFilter === opt.v ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => { setSaleTypeFilter(opt.v); setPage(1); }}
                  data-testid={`saletype-chip-${opt.v}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        }
      />

      {/* Özet kartlar */}
      {kpiCount > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-[color:var(--color-neutral-600)]">Satış Adedi</p>
              <p className="text-xl font-[var(--font-weight-bold)] tabular-nums">{kpiCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-[color:var(--color-neutral-600)]">Toplam Ciro</p>
              <p className="text-xl font-[var(--font-weight-bold)] tabular-nums text-[color:var(--color-brand-700)]">{kpiRevenue.toFixed(2)} TL</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-[color:var(--color-neutral-600)]">Toplam Kâr</p>
              <p className="text-xl font-[var(--font-weight-bold)] tabular-nums text-[color:var(--color-semantic-success)]">{kpiProfit.toFixed(2)} TL</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="flex items-center gap-1 text-xs text-[color:var(--color-neutral-600)]">
                <Receipt className="h-3 w-3" /> Ortalama Sepet
              </p>
              <p className="text-xl font-[var(--font-weight-bold)] tabular-nums text-[color:var(--color-brand-700)]">{kpiAvgTicket.toFixed(2)} TL</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top 5 ürün + saat dağılımı — sunucu özeti (200 satır sınırı yok) */}
      {summaryPending && (
        <div className="grid lg:grid-cols-2 gap-3">
          <div className="bg-card border rounded-lg p-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Gün özeti yükleniyor…
          </div>
          <div className="bg-card border rounded-lg p-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Saat dağılımı yükleniyor…
          </div>
        </div>
      )}
      {!summaryPending && dayWidgetCount > 0 && (
        <div className="grid lg:grid-cols-2 gap-3">
          {/* En çok satan 5 ürün */}
          <div className="bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1.5 text-slate-700">
                <Trophy className="h-4 w-4 text-amber-500" /> En Çok Satan 5 Ürün
              </p>
              <span className="text-[10px] text-muted-foreground">
                Tüm gün · {dayWidgetCount} satış · İstanbul saati
              </span>
            </div>
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Veri yok</p>
            ) : (
              <ul className="space-y-2">
                {topProducts.map((p, idx) => {
                  const maxQty = topProducts[0].qty || 1;
                  const widthPct = (p.qty / maxQty) * 100;
                  return (
                    <li key={p.name} className="flex items-center gap-2">
                      <span className={`shrink-0 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        idx === 0 ? "bg-amber-100 text-amber-700" :
                        idx === 1 ? "bg-slate-200 text-slate-700" :
                        idx === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-medium truncate">{p.name}</span>
                          <span className="text-[11px] font-bold tabular-nums text-slate-700 whitespace-nowrap">
                            {p.qty} ad · {p.revenue.toFixed(0)}₺
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Saat bazlı yoğunluk */}
          <div className="bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1.5 text-slate-700">
                <Clock className="h-4 w-4 text-indigo-500" /> Saat Bazlı Yoğunluk
              </p>
              {peakHour !== null && (
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  Pik saat {String(peakHour).padStart(2, "0")}:00
                </span>
              )}
            </div>
            <div className="flex items-end gap-[2px] h-24">
              {hourBuckets.map((cnt, h) => {
                const heightPct = (cnt / maxBucket) * 100;
                const isPeak = peakHour === h;
                return (
                  <div
                    key={h}
                    title={`${String(h).padStart(2, "0")}:00 — ${cnt} satış`}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        cnt === 0 ? "bg-slate-100" :
                        isPeak ? "bg-gradient-to-t from-indigo-600 to-indigo-400" :
                        "bg-gradient-to-t from-indigo-300 to-indigo-200"
                      }`}
                      style={{ height: cnt === 0 ? "3px" : `${Math.max(heightPct, 6)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1.5 font-mono">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
            </div>
          </div>
        </div>
      )}

      {selectedSales.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3" data-testid="bulk-invoice-bar">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{selectedSales.length} satış seçildi</span>
            <span className="text-slate-500"> · Toplam {selectedTotal.toFixed(2)} TL</span>
            {!selectedSameCustomer && (
              <Badge variant="destructive" className="ml-2 text-[10px]">Farklı müşteriler</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Seçimi Temizle
            </Button>
            <Button
              size="sm"
              onClick={handleInvoice}
              disabled={invoicing || !selectedSameCustomer}
              data-testid="bulk-invoice-button"
            >
              {invoicing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Faturayı Oluştur
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <SkeletonTable rows={10} columns={8} rowHeight={40} />
          ) : (
            <DataTable<Sale>
              columns={columns}
              data={salesList}
              getRowId={(row) => String(row.id)}
              enableRowSelection={false}
              showFooterPagination={false}
              emptyState={(
                <div className="px-4 py-6">
                  <EmptyState
                    icon={Receipt}
                    title="Henüz satış yok"
                    description="İlk satışınızı yapmak için Satış Ekranı'nı kullanın."
                    action={{ label: "Satış Yap", href: "/sales" }}
                    secondaryAction={
                      dateStr !== new Date().toISOString().split("T")[0]
                        ? {
                            label: "Bugüne git",
                            onClick: () => {
                              setDateStr(new Date().toISOString().split("T")[0]);
                              setPage(1);
                            },
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            />
          )}
          {!isLoading && data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[color:var(--color-border-subtle)] p-4">
              <span className="text-sm text-[color:var(--color-neutral-600)]">Sayfa {page} / {data.totalPages}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Önceki</Button>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>Sonraki</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sprint G — Tek tıkla fatura + XML önizleme */}
      <Dialog open={quickSaleId !== null} onOpenChange={(o) => { if (!o) { setQuickSaleId(null); setPreviewOutbox(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              E-Fatura Önizleme
            </DialogTitle>
            <DialogDescription>
              {previewLoading
                ? "Taslak hazırlanıyor..."
                : previewOutbox
                  ? `Outbox #${previewOutbox.id} • Durum: ${previewOutbox.status} • ETTN ${previewOutbox.externalId || "—"}`
                  : "Yükleniyor"}
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> XML hazırlanıyor...
            </div>
          ) : previewOutbox ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Alıcı:</span> <span className="font-medium">{previewOutbox.receiverName}</span></div>
                <div><span className="text-muted-foreground">Toplam:</span> <span className="font-bold text-primary">{Number(previewOutbox.totalAmount || 0).toFixed(2)} {previewOutbox.currency || "TRY"}</span></div>
              </div>
              <div className="rounded-md border bg-slate-950 text-slate-100 p-3 max-h-[360px] overflow-auto">
                <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all" data-testid="einvoice-xml-preview">
                  {previewXml || "XML henüz mevcut değil. (Provider lastResponse XML üretmedi)"}
                </pre>
              </div>
              {previewOutbox.statusMessage && (
                <div className="text-xs text-muted-foreground">Durum mesajı: {previewOutbox.statusMessage}</div>
              )}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setQuickSaleId(null); setPreviewOutbox(null); }}>
              Kapat
            </Button>
            <Button
              variant="outline"
              onClick={() => previewOutbox && setLocation("/einvoice")}
              disabled={!previewOutbox}
            >
              E-Fatura Listesine Git
            </Button>
            <Button
              onClick={handleQuickSend}
              disabled={
                sending ||
                !previewOutbox ||
                !["draft", "failed", "queued"].includes(previewOutbox?.status)
              }
              data-testid="quick-send-button"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {previewOutbox && !["draft", "failed", "queued"].includes(previewOutbox.status) ? "Gönderildi" : "Gönder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* İade Dialog */}
      <Dialog open={!!returnDialog} onOpenChange={() => { setReturnDialog(null); setReturnNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Satış İadesi</DialogTitle>
            <DialogDescription>
              <span className="font-bold">{returnDialog?.name}</span> — {returnDialog?.qty} adet iade edilecek.
              Stok otomatik olarak geri yüklenecek.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="returnNote">İade Notu (isteğe bağlı)</Label>
            <Input
              id="returnNote"
              placeholder="İade sebebi..."
              value={returnNote}
              onChange={e => setReturnNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnDialog(null)}>İptal</Button>
            <Button variant="destructive" onClick={handleReturn} disabled={returnSale.isPending}>
              {returnSale.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              İadeyi Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
