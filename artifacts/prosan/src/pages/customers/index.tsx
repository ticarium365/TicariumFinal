import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Plus, Search, UserCircle, Phone, MapPin,
  ChevronLeft, ChevronRight, Pencil, Trash2, RotateCcw,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { EmptyState } from "@/components/empty-state";
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

interface Customer {
  id: number;
  code: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  creditLimit: number;
  currentBalance: number;
  isActive: boolean;
  notes: string | null;
}

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
    staleTime: 10_000,
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Müşteriler</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total} müşteri kayıtlı
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditCustomer(null); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Yeni Müşteri
          </Button>
        )}
      </div>

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
          variant={showInactive ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowInactive(!showInactive); setPage(1); }}
        >
          {showInactive ? "Tümü" : "Sadece Aktif"}
        </Button>
      </div>

      {/* Tablo */}
      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">Yükleniyor...</div>
        ) : customers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={UserCircle}
              title={debouncedSearch ? "Aramaya uyan müşteri bulunamadı" : "Henüz müşteri eklenmemiş"}
              description={debouncedSearch ? "Farklı bir kelime deneyin veya filtreleri temizleyin." : "Müşterilerinizi ekleyerek bakiye, sipariş ve sadakat takibini başlatın."}
              primaryAction={isAdmin ? { label: "İlk Müşteriyi Ekle", onClick: () => { setEditCustomer(null); setModalOpen(true); }, testId: "empty-add-customer" } : undefined}
            />
          </div>
        ) : (
          <>
            {/* Desktop tablo */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kod</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ad</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefon</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Şehir</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bakiye</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Durum</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.code}</td>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${c.id}`}>
                          <span className="font-medium text-primary hover:underline cursor-pointer">{c.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />{c.phone}
                          </a>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.city ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />{c.city}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <BalanceBadge balance={c.currentBalance} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={c.isActive ? "default" : "secondary"} className="text-xs">
                          {c.isActive ? "Aktif" : "Pasif"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && c.isActive && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { setEditCustomer(c); setModalOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && c.isActive && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
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
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)} className="bg-destructive text-white hover:bg-destructive/90">
                                    Sil
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {isAdmin && !c.isActive && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400"
                              onClick={() => restoreMutation.mutate(c.id)}>
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

            {/* Mobil kart görünüm */}
            <div className="md:hidden divide-y">
              {customers.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/customers/${c.id}`}>
                        <p className="font-semibold text-primary hover:underline truncate">{c.name}</p>
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={c.isActive ? "default" : "secondary"} className="text-xs">
                        {c.isActive ? "Aktif" : "Pasif"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-foreground">
                        <Phone className="h-3 w-3" />{c.phone}
                      </a>
                    )}
                    {c.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{c.city}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <BalanceBadge balance={c.currentBalance} />
                    <div className="flex gap-1">
                      {isAdmin && c.isActive && (
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditCustomer(c); setModalOpen(true); }}>
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

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} / {total} müşteri
          </p>
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
