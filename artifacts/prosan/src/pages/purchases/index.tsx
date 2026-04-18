import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, FileText, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-context";

interface Purchase {
  id: number; supplierId: number; supplierName: string; invoiceNo: string | null;
  invoiceDate: string; totalAmount: number; paymentStatus: string;
}

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Yükleme hatası");
  return res.json();
}

const STATUS_LABEL: Record<string, string> = { unpaid: "Ödenmedi", partial: "Kısmi Ödeme", paid: "Ödendi" };
const STATUS_COLOR: Record<string, string> = {
  unpaid: "bg-red-500/10 text-red-300 border-red-500/20",
  partial: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
  paid: "bg-green-500/10 text-green-300 border-green-500/20",
};

export default function PurchasesList() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", page],
    queryFn: () => apiFetch(`/purchases?page=${page}&limit=20`),
    staleTime: 10_000,
  });

  const purchases: Purchase[] = data?.purchases ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Alış Faturaları</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{total} fatura kayıtlı</p>
        </div>
        {(isAdmin || user?.role === "staff") && (
          <Link href="/purchases/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Alış Faturası
            </Button>
          </Link>
        )}
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">Yükleniyor...</div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <FileText className="h-12 w-12 opacity-30" />
            <p>Henüz alış faturası girilmemiş</p>
            {(isAdmin || user?.role === "staff") && (
              <Link href="/purchases/new">
                <Button variant="outline" size="sm" className="mt-2 gap-1"><Plus className="h-3.5 w-3.5" /> Fatura gir</Button>
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tedarikçi</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fatura No</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tutar</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(p.invoiceDate).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/suppliers/${p.supplierId}`}>
                          <span className="font-medium text-primary hover:underline cursor-pointer flex items-center gap-1">
                            <Truck className="h-3.5 w-3.5 text-muted-foreground" />{p.supplierName}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.invoiceNo ?? `#${p.id}`}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {p.totalAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLOR[p.paymentStatus] ?? ""}`}>
                          {STATUS_LABEL[p.paymentStatus] ?? p.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobil */}
            <div className="md:hidden divide-y">
              {purchases.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/suppliers/${p.supplierId}`}>
                        <p className="font-semibold text-primary hover:underline">{p.supplierName}</p>
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{p.invoiceNo ?? `#${p.id}`}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${STATUS_COLOR[p.paymentStatus] ?? ""}`}>
                      {STATUS_LABEL[p.paymentStatus] ?? p.paymentStatus}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{new Date(p.invoiceDate).toLocaleDateString("tr-TR")}</p>
                    <p className="font-bold text-sm">{p.totalAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">{((page - 1) * 20) + 1}–{Math.min(page * 20, total)} / {total} fatura</p>
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
    </div>
  );
}
