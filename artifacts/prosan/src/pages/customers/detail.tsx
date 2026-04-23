import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Phone, Mail, MapPin, Building2, Receipt,
  TrendingUp, TrendingDown, Minus, Banknote, History,
  Info, Pencil, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PaymentModal } from "./payment-modal";
import { CustomerModal } from "./customer-modal";

async function apiFetch(method: string, path: string) {
  const res = await fetch(`/api${path}`, { method, credentials: "include" });
  if (!res.ok) throw new Error("Veri alınamadı");
  return res.json();
}

function BalanceCard({ balance, creditLimit }: { balance: number; creditLimit: number }) {
  const isDebt = balance > 0;
  const isCredit = balance < 0;
  return (
    <div className={`rounded-xl p-4 border ${
      isDebt ? "bg-red-500/10 border-red-500/20" : isCredit ? "bg-green-500/10 border-green-500/20" : "bg-muted/30 border-border"
    }`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">
        {isDebt ? "Borç Bakiyesi" : isCredit ? "Alacak Bakiyesi" : "Bakiye"}
      </p>
      <p className={`text-2xl font-bold ${isDebt ? "text-red-300" : isCredit ? "text-green-300" : "text-muted-foreground"}`}>
        {isDebt ? "" : isCredit ? "-" : ""}
        {Math.abs(balance).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
      </p>
      {creditLimit > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Kredi limiti: {creditLimit.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
          {isDebt && balance > creditLimit && (
            <span className="ml-1 text-red-400 font-semibold">(Limit aşıldı!)</span>
          )}
        </p>
      )}
    </div>
  );
}

interface Customer {
  id: number;
  code: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  contactPerson: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  creditLimit: number;
  openingBalance: number;
  currentBalance: number;
  notes: string | null;
  isActive: boolean;
}

export default function CustomerDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"transactions" | "sales" | "info">("transactions");
  const [txPage, setTxPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: custData, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiFetch("GET", `/customers/${id}`),
    staleTime: 30_000,
  });

  const { data: txData } = useQuery({
    queryKey: ["customer-txs", id, txPage],
    queryFn: () => apiFetch("GET", `/customers/${id}/transactions?page=${txPage}&limit=20`),
    enabled: tab === "transactions",
    staleTime: 30_000,
  });

  const { data: salesData } = useQuery({
    queryKey: ["customer-sales", id, salesPage],
    queryFn: () => apiFetch("GET", `/customers/${id}/sales?page=${salesPage}&limit=20`),
    enabled: tab === "sales",
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-64 text-muted-foreground">
      Yükleniyor...
    </div>
  );

  const customer: Customer = custData?.customer;
  if (!customer) return (
    <div className="p-6 text-center text-muted-foreground">Müşteri bulunamadı</div>
  );

  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const canPay = isAdmin || isStaff;
  const transactions = txData?.transactions ?? [];
  const sales = salesData?.sales ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Geri butonu */}
      <div className="mb-4">
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Müşteriler
          </Button>
        </Link>
      </div>

      {/* Üst kart */}
      <div className="bg-card border rounded-xl p-5 mb-5 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 md:items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{customer.name}</h1>
              <Badge variant={customer.isActive ? "default" : "secondary"} className="text-xs">
                {customer.isActive ? "Aktif" : "Pasif"}
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                {customer.code}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-foreground">
                  <Phone className="h-3.5 w-3.5" />{customer.phone}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" />{customer.email}
                </a>
              )}
              {(customer.city || customer.district) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[customer.district, customer.city].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
            {customer.notes && (
              <p className="mt-2 text-sm text-muted-foreground italic">{customer.notes}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {canPay && customer.isActive && customer.currentBalance > 0 && (
              <Button onClick={() => setPaymentOpen(true)} className="bg-green-600 hover:bg-green-700 gap-2">
                <Banknote className="h-4 w-4" />
                Tahsilat Al
              </Button>
            )}
            {isAdmin && customer.isActive && (
              <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-2">
                <Pencil className="h-4 w-4" />
                Düzenle
              </Button>
            )}
          </div>
        </div>

        {/* Bakiye kartı */}
        <div className="mt-4">
          <BalanceCard balance={customer.currentBalance} creditLimit={customer.creditLimit} />
        </div>
      </div>

      {/* Tablar */}
      <div className="flex gap-1 mb-4 border-b">
        {(["transactions", "sales", "info"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "transactions" ? <span className="flex items-center gap-1.5"><History className="h-4 w-4" />Hareketler</span>
             : t === "sales" ? <span className="flex items-center gap-1.5"><Receipt className="h-4 w-4" />Satışlar</span>
             : <span className="flex items-center gap-1.5"><Info className="h-4 w-4" />Bilgiler</span>}
          </button>
        ))}
      </div>

      {/* Hareketler */}
      {tab === "transactions" && (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Henüz cari hareket yok</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Açıklama</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Borç</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Alacak</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx: {
                  id: number;
                  direction: string;
                  amount: number;
                  description: string | null;
                  createdAt: string;
                  type: string;
                }) => (
                  <tr key={tx.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleDateString("tr-TR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm">{tx.description || tx.type}</td>
                    <td className="px-4 py-3 text-right">
                      {tx.direction === "debit" ? (
                        <span className="text-red-400 font-semibold">
                          {tx.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tx.direction === "credit" ? (
                        <span className="text-green-400 font-semibold">
                          {tx.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {txData?.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Sayfa {txPage} / {txData.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={txPage >= txData.totalPages} onClick={() => setTxPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Satışlar */}
      {tab === "sales" && (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          {sales.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Henüz satış kaydı yok</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ürün</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Adet</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tutar</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ödeme</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">İade</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sales.map((s: {
                  id: number;
                  createdAt: string;
                  productName: string;
                  quantity: number;
                  totalPrice: number;
                  paymentMethod: string | null;
                  returned: boolean;
                }) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-4 py-3">{s.productName}</td>
                    <td className="px-4 py-3 text-center">{s.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {s.totalPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs">
                        {s.paymentMethod === "cash" ? "Nakit"
                          : s.paymentMethod === "card" ? "Kart"
                          : s.paymentMethod === "credit" ? "Cari"
                          : s.paymentMethod || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.returned
                        ? <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                        : <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Bilgiler */}
      {tab === "info" && (
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {[
              { label: "Müşteri Kodu", value: customer.code },
              { label: "Tür", value: customer.type === "company" ? "Kurumsal" : "Bireysel" },
              { label: "İletişim Kişisi", value: customer.contactPerson },
              { label: "Şehir / İlçe", value: [customer.city, customer.district].filter(Boolean).join(" / ") },
              { label: "Tam Adres", value: customer.address },
              { label: "Vergi Dairesi", value: customer.taxOffice },
              { label: "Vergi No", value: customer.taxNumber },
              { label: "Açılış Bakiyesi", value: customer.openingBalance > 0 ? `${customer.openingBalance.toLocaleString("tr-TR")} ₺` : "0 ₺" },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-foreground">{value || <span className="text-muted-foreground/40">—</span>}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modaller */}
      {canPay && (
        <PaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          customerId={customer.id}
          customerName={customer.name}
          currentBalance={customer.currentBalance}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["customer", id] });
            qc.invalidateQueries({ queryKey: ["customer-txs", id] });
            qc.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
      {isAdmin && (
        <CustomerModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          customer={customer}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["customer", id] })}
        />
      )}
    </div>
  );
}
