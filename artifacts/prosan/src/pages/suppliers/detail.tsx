import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Truck, Phone, Mail, MapPin, Receipt, Building,
  CreditCard, FileText, Edit, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/hooks/use-toast";
import { SupplierModal } from "./supplier-modal";
import { SupplierPaymentModal } from "./payment-modal";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Yükleme hatası");
  }
  return res.json();
}

function TxBadge({ direction }: { direction: string }) {
  if (direction === "debit") return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-300 border border-orange-500/20">Borç</span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-300 border border-green-500/20">Ödeme</span>
  );
}

function TxTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    purchase: "Alış Faturası", payment: "Ödeme",
    adjustment: "Düzeltme", refund: "İade",
  };
  return <span>{labels[type] ?? type}</span>;
}

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"transactions" | "purchases" | "info">("transactions");
  const [txPage, setTxPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const { data: supplierData, isLoading } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => apiFetch(`/suppliers/${id}`),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["supplier-transactions", id, txPage],
    queryFn: () => apiFetch(`/suppliers/${id}/transactions?page=${txPage}&limit=20`),
    enabled: tab === "transactions",
  });

  const { data: purchasesData, isLoading: purchasesLoading } = useQuery({
    queryKey: ["supplier-purchases", id],
    queryFn: () => apiFetch(`/purchases?supplierId=${id}&limit=50`),
    enabled: tab === "purchases",
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Yükleniyor...</div>;
  if (!supplierData?.supplier) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-muted-foreground">Tedarikçi bulunamadı</p>
      <Button variant="outline" onClick={() => navigate("/suppliers")}>Listeye Dön</Button>
    </div>
  );

  const s = supplierData.supplier;
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff" || isAdmin;
  const txs = txData?.transactions ?? [];
  const txTotal = txData?.total ?? 0;
  const txTotalPages = txData?.totalPages ?? 1;
  const purchases = purchasesData?.purchases ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Geri + başlık */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/suppliers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold truncate">{s.name}</h1>
            <Badge variant={s.isActive ? "default" : "secondary"}>{s.isActive ? "Aktif" : "Pasif"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{s.code}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isStaff && s.isActive && s.currentBalance > 0 && (
            <Button size="sm" onClick={() => setPayOpen(true)} className="gap-1 bg-orange-600 hover:bg-orange-700 text-white">
              <CreditCard className="h-3.5 w-3.5" /> Ödeme Yap
            </Button>
          )}
          {isAdmin && s.isActive && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1">
              <Edit className="h-3.5 w-3.5" /> Düzenle
            </Button>
          )}
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className={`rounded-xl border p-4 ${s.currentBalance > 0 ? "bg-orange-500/10 border-orange-500/20" : "bg-card"}`}>
          <p className="text-xs text-muted-foreground mb-1">Güncel Borç</p>
          <p className={`text-xl font-bold ${s.currentBalance > 0 ? "text-orange-300" : "text-foreground"}`}>
            {s.currentBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-xs text-muted-foreground mb-1">Açılış Bakiyesi</p>
          <p className="text-xl font-bold">{s.openingBalance?.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) ?? "0,00"} ₺</p>
        </div>
        {s.phone && (
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs text-muted-foreground mb-1">Telefon</p>
            <a href={`tel:${s.phone}`} className="text-sm font-medium flex items-center gap-1 hover:underline">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />{s.phone}
            </a>
          </div>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b mb-4">
        {(["transactions", "purchases", "info"] as const).map((t) => {
          const labels = { transactions: "Cari Hareketler", purchases: "Alış Faturaları", info: "Bilgiler" };
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Hareketler */}
      {tab === "transactions" && (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          {txLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Yükleniyor...</div>
          ) : txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Receipt className="h-10 w-10 opacity-30" />
              <p>Henüz hareket yok</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tür</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Yön</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tutar</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Açıklama</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {txs.map((tx: { id: number; createdAt: string; type: string; direction: string; amount: number; description?: string }) => (
                      <tr key={tx.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString("tr-TR")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground"><TxTypeLabel type={tx.type} /></td>
                        <td className="px-4 py-3"><TxBadge direction={tx.direction} /></td>
                        <td className={`px-4 py-3 text-right font-semibold ${tx.direction === "debit" ? "text-orange-300" : "text-green-300"}`}>
                          {tx.direction === "debit" ? "+" : "−"} {tx.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{tx.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {txTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">{txTotal} hareket</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={txPage >= txTotalPages} onClick={() => setTxPage(p => p + 1)}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Alış Faturaları */}
      {tab === "purchases" && (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          {purchasesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Yükleniyor...</div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FileText className="h-10 w-10 opacity-30" />
              <p>Henüz alış faturası yok</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fatura No</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tutar</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ödeme Durumu</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map((p: { id: number; invoiceDate: string; invoiceNo?: string; totalAmount: number; paymentStatus: string }) => {
                    const statusLabel: Record<string, string> = { unpaid: "Ödenmedi", partial: "Kısmi", paid: "Ödendi" };
                    const statusColor: Record<string, string> = { unpaid: "bg-red-500/10 text-red-300 border-red-500/20", partial: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20", paid: "bg-green-500/10 text-green-300 border-green-500/20" };
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{new Date(p.invoiceDate).toLocaleDateString("tr-TR")}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.invoiceNo ?? `#${p.id}`}</td>
                        <td className="px-4 py-3 text-right font-semibold">{p.totalAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusColor[p.paymentStatus] ?? ""}`}>
                            {statusLabel[p.paymentStatus] ?? p.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bilgiler */}
      {tab === "info" && (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Building, label: "Ünvan", value: s.name },
              { icon: Truck, label: "Kod", value: s.code },
              { icon: Phone, label: "Telefon", value: s.phone },
              { icon: Mail, label: "E-posta", value: s.email },
              { icon: MapPin, label: "Şehir / İlçe", value: [s.city, s.district].filter(Boolean).join(", ") || null },
              { icon: FileText, label: "Vergi Dairesi", value: s.taxOffice },
              { icon: FileText, label: "Vergi No", value: s.taxNumber },
              { icon: FileText, label: "İrtibat Kişisi", value: s.contactPerson },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Icon className="h-3 w-3" />{label}</p>
                <p className="text-sm font-medium">{value ?? <span className="text-muted-foreground/50">—</span>}</p>
              </div>
            ))}
          </div>
          {s.address && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Adres</p>
              <p className="text-sm">{s.address}</p>
            </div>
          )}
          {s.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Notlar</p>
              <p className="text-sm text-muted-foreground">{s.notes}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Kayıt: {new Date(s.createdAt).toLocaleDateString("tr-TR")}</p>
        </div>
      )}

      {/* Modaller */}
      {isAdmin && (
        <SupplierModal open={editOpen} onClose={() => setEditOpen(false)} supplier={s}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["supplier", id] })} />
      )}
      {isStaff && (
        <SupplierPaymentModal open={payOpen} onClose={() => setPayOpen(false)}
          supplierId={s.id} supplierName={s.name} currentBalance={s.currentBalance} />
      )}
    </div>
  );
}
