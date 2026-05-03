import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Plus, Search, UserCircle, Phone, MapPin, Users,
  ChevronLeft, ChevronRight, Pencil, Trash2, RotateCcw,
  TrendingUp, TrendingDown, Minus, AlertCircle, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CustomerModal } from "./customer-modal";
import type { Customer } from "./types";

async function apiFetch(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error?.message || "İşlem başarısız");
  }
  return res.json();
}

function BalanceBadge({ balance }: { balance: number }) {
  if (balance > 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/20">
      <TrendingUp className="h-3 w-3" />
      {balance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
    </span>
  );
  if (balance < 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-300 border border-green-500/20">
      <TrendingDown className="h-3 w-3" />
      {Math.abs(balance).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ alacak
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
      <Minus className="h-3 w-3" />
      Bakiye yok
    </span>
  );
}

export default function CustomersList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setEditCustomer(null);
      setModalOpen(true);
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", debouncedSearch, showInactive, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(!showInactive && { active: "true" }),
      });
      return apiFetch("GET", `/customers?${params}`);
    },
    staleTime: 30_000,
  });

  // Dalga 28 — Sadece aktif müşteri toplam sayısı (KPI strip için)
  const { data: activeCountData } = useQuery({
    queryKey: ["customers", "count", "active"],
    queryFn: () => apiFetch("GET", `/customers?page=1&limit=1&active=true`),
    staleTime: 30_000,
  });

  // Dalga 28 — Tüm müşteri toplam sayısı (aktif + pasif)
  const { data: allCountData } = useQuery({
    queryKey: ["customers", "count", "all"],
    queryFn: () => apiFetch("GET", `/customers?page=1&limit=1`),
    staleTime: 30_000,
  });

  // Dalga 28 — Top 5 borçlu müşteri (admin-only endpoint)
  const isAdminUser = user?.role === "admin";
  const { data: topDebtorsData } = useQuery({
    queryKey: ["customers", "top-debtors"],
    queryFn: () => apiFetch("GET", `/customers/top-debtors`),
    enabled: isAdminUser,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch("DELETE", `/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Müşteri silindi" });
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => apiFetch("PATCH", `/customers/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Müşteri geri yüklendi" });
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  const customers: Customer[] = data?.customers ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;
  const isAdmin = user?.role === "admin";

  const columns: DataTableColumn<Customer>[] = [
    {
      id: "code",
      header: "Kod",
      sortable: true,
      sortValue: (c) => c.code,
      cell: (c) => <span className="font-mono text-xs text-[color:var(--color-neutral-600)]">{c.code}</span>,
    },
    {
      id: "name",
      header: "Ad",
      sortable: true,
      sortValue: (c) => c.name,
      cell: (c) => (
        <Link href={`/customers/${c.id}`}>
          <span className="cursor-pointer font-[var(--font-weight-medium)] text-[color:var(--color-brand-700)] hover:underline">{c.name}</span>
        </Link>
      ),
    },
    {
      id: "phone",
      header: "Telefon",
      sortable: true,
      sortValue: (c) => c.phone ?? "",
      cell: (c) =>
        c.phone ? (
          <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-[color:var(--color-neutral-600)] hover:text-[color:var(--color-neutral-900)]">
            <Phone className="h-3 w-3" />{c.phone}
          </a>
        ) : (
          <span className="text-[color:var(--color-neutral-400)]">—</span>
        ),
    },
    {
      id: "city",
      header: "Şehir",
      sortable: true,
      sortValue: (c) => c.city ?? "",
      cell: (c) =>
        c.city ? (
          <span className="flex items-center gap-1 text-[color:var(--color-neutral-600)]">
            <MapPin className="h-3 w-3" />{c.city}
          </span>
        ) : (
          <span className="text-[color:var(--color-neutral-400)]">—</span>
        ),
    },
    {
      id: "balance",
      header: "Bakiye",
      headerClassName: "text-right",
      sortable: true,
      sortValue: (c) => c.currentBalance,
      className: "text-right",
      cell: (c) => <BalanceBadge balance={c.currentBalance} />,
    },
    {
      id: "status",
      header: "Durum",
      headerClassName: "text-center",
      className: "text-center",
      cell: (c) => (
        <Badge variant={c.isActive ? "brand" : "neutral"} className="text-xs">{c.isActive ? "Aktif" : "Pasif"}</Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      cell: (c) => (
        <div className="flex justify-end gap-1">
          {isAdmin && c.isActive && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCustomer(c); setModalOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isAdmin && c.isActive && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-[color:var(--color-semantic-danger)] hover:text-[color:var(--color-semantic-danger)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Müşteriyi sil?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {c.name} müşterisi pasif yapılacak. Cari hareketler korunur.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>İptal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)} className="bg-[var(--color-semantic-danger)] text-[color:var(--color-semantic-danger-fg)] hover:opacity-90">
                    Sil
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isAdmin && !c.isActive && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-[color:var(--color-semantic-success)]" onClick={() => restoreMutation.mutate(c.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Müşteriler"
        subtitle={`${total} müşteri kayıtlı`}
        right={
          isAdmin ? (
            <Button onClick={() => { setEditCustomer(null); setModalOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Müşteri
            </Button>
          ) : undefined
        }
        className="mb-6"
      />

      {/* Dalga 28 — KPI strip (Toplam · Aktif · Pasif · Borçlu) */}
      {(() => {
        const totalAll = allCountData?.total;
        const totalActive = activeCountData?.total;
        const totalPassive = (typeof totalAll === "number" && typeof totalActive === "number")
          ? Math.max(0, totalAll - totalActive) : undefined;
        const debtors = topDebtorsData?.customers ?? [];
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shrink-0">
                <UserCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium">Toplam Müşteri</p>
                <p className="text-lg font-bold tabular-nums leading-tight">{totalAll ?? "—"}</p>
              </div>
            </div>
            <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0">
                <UserCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium">Aktif</p>
                <p className="text-lg font-bold tabular-nums leading-tight text-emerald-600">{totalActive ?? "—"}</p>
              </div>
            </div>
            <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center shrink-0">
                <Minus className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium">Pasif</p>
                <p className="text-lg font-bold tabular-nums leading-tight text-slate-500">{totalPassive ?? "—"}</p>
              </div>
            </div>
            {isAdminUser ? (
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-rose-500 to-red-500 text-white flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Borçlu {debtors.length === 10 ? "(ilk 10)" : ""}
                  </p>
                  <p className="text-lg font-bold tabular-nums leading-tight text-rose-600">
                    {debtors.length}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3 opacity-50">
                <div className="h-9 w-9 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-medium">Borçlu</p>
                  <p className="text-xs text-muted-foreground">Yetki gerekli</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Dalga 28 — Top 5 Borçlu Müşteri Widget (admin-only, mevcut /top-debtors endpoint) */}
      {isAdminUser && (topDebtorsData?.customers?.length ?? 0) > 0 && (
        <div
          className="rounded-xl border border-rose-200/60 shadow-sm p-4 mb-4"
          style={{
            background: "linear-gradient(135deg, rgba(254,226,226,0.45) 0%, rgba(255,237,213,0.40) 100%)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-rose-900 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              En Yüksek Bakiyeli 5 Müşteri
            </p>
            <span className="text-[10px] text-rose-700/70">tahsilat öncelik listesi</span>
          </div>
          <ul className="space-y-1.5">
            {(topDebtorsData?.customers ?? []).slice(0, 5).map((c: Customer, idx: number) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`}>
                  <div
                    className="group flex items-center gap-2 bg-white/70 hover:bg-white rounded-lg px-3 py-2 cursor-pointer transition-colors border border-transparent hover:border-rose-200"
                    data-testid={`top-debtor-${c.id}`}
                  >
                    <span className={`shrink-0 h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      idx === 0 ? "bg-rose-100 text-rose-700" :
                      idx === 1 ? "bg-orange-100 text-orange-700" :
                      idx === 2 ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-slate-800 group-hover:text-rose-700">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{c.code}{c.phone ? ` · ${c.phone}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-rose-600">
                        {c.currentBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                      </p>
                      {c.creditLimit > 0 && c.currentBalance > c.creditLimit && (
                        <p className="text-[10px] text-rose-700 font-semibold">limit aşıldı</p>
                      )}
                    </div>
                    <ChevronRightIcon className="h-4 w-4 text-rose-400 group-hover:text-rose-700 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filtreler */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="İsim, kod veya telefon ara..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Button
          variant={showInactive ? "primary" : "secondary"}
          size="sm"
          onClick={() => { setShowInactive(!showInactive); setPage(1); }}
        >
          {showInactive ? "Tümü" : "Sadece Aktif"}
        </Button>
      </div>

      {/* Tablo */}
      <Card>
        <CardContent className="p-0">
          <DataTable<Customer>
            columns={columns}
            data={customers}
            getRowId={(c) => String(c.id)}
            loading={isLoading}
            enableRowSelection={false}
            showFooterPagination={false}
            className="rounded-none border-0 shadow-none"
            emptyState={
              <div className="mx-auto max-w-md px-4 py-6">
                <EmptyState
                  icon={Users}
                  title={debouncedSearch ? "Aramaya uyan müşteri yok" : "Müşteri listesi boş"}
                  description={
                    debouncedSearch
                      ? "Farklı bir arama terimi deneyin veya aramayı temizleyin."
                      : "Yeni müşteri ekleyin veya mevcut verileri içe aktarın."
                  }
                  action={
                    debouncedSearch
                      ? { label: "Aramayı temizle", onClick: () => { setSearch(""); setPage(1); }, testId: "empty-clear-search" }
                      : isAdmin
                        ? { label: "Müşteri Ekle", onClick: () => { setEditCustomer(null); setModalOpen(true); }, testId: "empty-add-customer" }
                        : undefined
                  }
                />
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} / {total} müşteri
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal */}
      {isAdmin && (
        <CustomerModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditCustomer(null); }}
          customer={editCustomer}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["customers"] })}
        />
      )}
    </div>
  );
}
