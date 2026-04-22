import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Search, Truck, Phone, MapPin,
  ChevronLeft, ChevronRight, Pencil, Trash2, RotateCcw,
  TrendingUp, Minus, AlertCircle, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SupplierModal } from "./supplier-modal";

interface Supplier {
  id: number; code: string; name: string;
  phone: string | null; email: string | null; city: string | null;
  contactPerson: string | null; currentBalance: number; isActive: boolean;
}

async function apiFetch(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method, credentials: "include",
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-300 border border-orange-500/20">
      <TrendingUp className="h-3 w-3" />
      {balance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ borç
    </span>
  );
  if (balance < 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-300 border border-green-500/20">
      {Math.abs(balance).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ alacak
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
      <Minus className="h-3 w-3" />Bakiyesiz
    </span>
  );
}

export default function SuppliersList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", debouncedSearch, showInactive, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page), limit: "20",
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(!showInactive && { active: "true" }),
      });
      return apiFetch("GET", `/suppliers?${params}`);
    },
    staleTime: 10_000,
  });

  // Dalga 29 — KPI count fetches + top creditors (admin-only)
  const isAdminUser = user?.role === "admin";
  const { data: activeCountData } = useQuery({
    queryKey: ["suppliers", "count", "active"],
    queryFn: () => apiFetch("GET", `/suppliers?page=1&limit=1&active=true`),
    staleTime: 30_000,
  });
  const { data: allCountData } = useQuery({
    queryKey: ["suppliers", "count", "all"],
    queryFn: () => apiFetch("GET", `/suppliers?page=1&limit=1`),
    staleTime: 30_000,
  });
  const { data: topCreditorsData } = useQuery({
    queryKey: ["suppliers", "top-creditors"],
    queryFn: () => apiFetch("GET", `/suppliers/top-creditors`),
    enabled: isAdminUser,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch("DELETE", `/suppliers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast({ title: "Tedarikçi silindi" }); },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => apiFetch("PATCH", `/suppliers/${id}/restore`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast({ title: "Tedarikçi geri yüklendi" }); },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  const suppliers: Supplier[] = data?.suppliers ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;
  const isAdmin = user?.role === "admin";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Tedarikçiler</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{total} tedarikçi kayıtlı</p>
        </div>
        <div className="flex gap-2">
          <Link href="/purchases/new">
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Alış Faturası
            </Button>
          </Link>
          {isAdmin && (
            <Button onClick={() => { setEditSupplier(null); setModalOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Tedarikçi
            </Button>
          )}
        </div>
      </div>

      {/* Dalga 29 — KPI strip (Toplam · Aktif · Pasif · Borçlu Tedarikçi) */}
      {(() => {
        const totalAll = allCountData?.total;
        const totalActive = activeCountData?.total;
        const totalPassive = (typeof totalAll === "number" && typeof totalActive === "number")
          ? Math.max(0, totalAll - totalActive) : undefined;
        const creditors = topCreditorsData?.suppliers ?? [];
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shrink-0">
                <Truck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium">Toplam Tedarikçi</p>
                <p className="text-lg font-bold tabular-nums leading-tight">{totalAll ?? "—"}</p>
              </div>
            </div>
            <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0">
                <Truck className="h-4 w-4" />
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
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Borç Verilen {creditors.length === 10 ? "(ilk 10)" : ""}
                  </p>
                  <p className="text-lg font-bold tabular-nums leading-tight text-orange-600">
                    {creditors.length}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3 opacity-50">
                <div className="h-9 w-9 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-medium">Borç Verilen</p>
                  <p className="text-xs text-muted-foreground">Yetki gerekli</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Dalga 29 — En Yüksek Borçlu 5 Tedarikçi (admin-only) */}
      {isAdminUser && (topCreditorsData?.suppliers?.length ?? 0) > 0 && (
        <div
          className="rounded-xl border border-orange-200/60 shadow-sm p-4 mb-4"
          style={{
            background: "linear-gradient(135deg, rgba(255,237,213,0.50) 0%, rgba(254,226,226,0.40) 100%)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              En Yüksek Borç Bakiyesi (Tedarikçi)
            </p>
            <span className="text-[10px] text-orange-700/70">öncelikli ödeme listesi</span>
          </div>
          <ul className="space-y-1.5">
            {(topCreditorsData?.suppliers ?? []).slice(0, 5).map((s: Supplier, idx: number) => (
              <li key={s.id}>
                <Link href={`/suppliers/${s.id}`}>
                  <div
                    className="group flex items-center gap-2 bg-white/70 hover:bg-white rounded-lg px-3 py-2 cursor-pointer transition-colors border border-transparent hover:border-orange-200"
                    data-testid={`top-creditor-${s.id}`}
                  >
                    <span className={`shrink-0 h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      idx === 0 ? "bg-orange-100 text-orange-700" :
                      idx === 1 ? "bg-amber-100 text-amber-700" :
                      idx === 2 ? "bg-yellow-100 text-yellow-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-slate-800 group-hover:text-orange-700">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {s.code}{s.contactPerson ? ` · ${s.contactPerson}` : (s.phone ? ` · ${s.phone}` : "")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-orange-600">
                        {s.currentBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                      </p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 text-orange-400 group-hover:text-orange-700 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="İsim, kod veya telefon ara..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Button variant={showInactive ? "default" : "outline"} size="sm"
          onClick={() => { setShowInactive(!showInactive); setPage(1); }}>
          {showInactive ? "Tümü" : "Sadece Aktif"}
        </Button>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">Yükleniyor...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Truck}
              title={search ? "Aramaya uyan tedarikçi bulunamadı" : "Henüz tedarikçi eklenmemiş"}
              description={search ? "Farklı bir kelime deneyin veya filtreleri temizleyin." : "Tedarikçilerinizi ekleyerek alış faturalarını ve borç bakiyesini takip edin."}
              primaryAction={isAdmin && !search ? { label: "İlk Tedarikçiyi Oluştur", onClick: () => setModalOpen(true), testId: "empty-add-supplier" } : undefined}
            />
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kod</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ad</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">İrtibat</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Şehir</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bakiye</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Durum</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.code}</td>
                      <td className="px-4 py-3">
                        <Link href={`/suppliers/${s.id}`}>
                          <span className="font-medium text-primary hover:underline cursor-pointer">{s.name}</span>
                        </Link>
                        {s.contactPerson && <p className="text-xs text-muted-foreground mt-0.5">{s.contactPerson}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />{s.phone}
                          </a>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {s.city ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />{s.city}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right"><BalanceBadge balance={s.currentBalance} /></td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                          {s.isActive ? "Aktif" : "Pasif"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && s.isActive && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { setEditSupplier(s); setModalOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && s.isActive && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Tedarikçiyi sil?</AlertDialogTitle>
                                  <AlertDialogDescription>{s.name} tedarikçisi pasif yapılacak. Cari hareketler korunur.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>İptal</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(s.id)} className="bg-destructive text-white hover:bg-destructive/90">Sil</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {isAdmin && !s.isActive && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400" onClick={() => restoreMutation.mutate(s.id)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobil */}
            <div className="md:hidden divide-y">
              {suppliers.map((s) => (
                <div key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/suppliers/${s.id}`}>
                        <p className="font-semibold text-primary hover:underline truncate">{s.name}</p>
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{s.code}</p>
                    </div>
                    <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                      {s.isActive ? "Aktif" : "Pasif"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</a>}
                    {s.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.city}</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <BalanceBadge balance={s.currentBalance} />
                    <div className="flex gap-1">
                      {isAdmin && s.isActive && (
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditSupplier(s); setModalOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">{((page - 1) * 20) + 1}–{Math.min(page * 20, total)} / {total} tedarikçi</p>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {isAdmin && (
        <SupplierModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditSupplier(null); }}
          supplier={editSupplier}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["suppliers"] })}
        />
      )}
    </div>
  );
}
