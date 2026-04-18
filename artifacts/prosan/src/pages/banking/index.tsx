import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Banknote, Plus, Upload, Search, Loader2, Link2, Eye, CheckCircle2, X, RefreshCw,
} from "lucide-react";
const API = "/api/banking";

type Account = {
  id: number;
  bankName: string;
  accountName: string;
  iban: string | null;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
};

type Tx = {
  id: number;
  accountId: number;
  txDate: string;
  description: string;
  counterparty: string | null;
  amount: string;
  txType: "debit" | "credit";
  balance: string | null;
  reference: string | null;
  status: "unmatched" | "matched" | "ignored";
  matchedDocId: number | null;
  matchedExpenseId: number | null;
  matchedPurchaseId: number | null;
};

type Suggestions = {
  tx: Tx;
  docs: any[];
  expenses: any[];
  purchases: any[];
};

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);

export default function BankingPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unmatched" | "matched" | "ignored">("all");
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  // Hesap dialog
  const [accountDialog, setAccountDialog] = useState(false);
  const [newAccount, setNewAccount] = useState({ bankName: "", accountName: "", iban: "", openingBalance: "0" });

  // CSV import dialog
  const [csvDialog, setCsvDialog] = useState(false);
  const [csvAccountId, setCsvAccountId] = useState<number | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);

  // Match suggestion dialog
  const [matchTx, setMatchTx] = useState<Tx | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch(`${API}/accounts`, { credentials: "include" });
    if (res.ok) setAccounts(await res.json());
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeAccountId !== "all") params.set("accountId", String(activeAccountId));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "200");
      const res = await fetch(`${API}/transactions?${params.toString()}`, { credentials: "include" });
      if (res.ok) setTransactions(await res.json());
    } finally { setLoading(false); }
  }, [activeAccountId, statusFilter, search]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const createAccount = async () => {
    if (!newAccount.bankName.trim() || !newAccount.accountName.trim()) {
      return toast({ title: "Banka ve hesap adı gerekli", variant: "destructive" });
    }
    const res = await fetch(`${API}/accounts`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newAccount, openingBalance: Number(newAccount.openingBalance) || 0 }),
    });
    if (res.ok) {
      setAccountDialog(false);
      setNewAccount({ bankName: "", accountName: "", iban: "", openingBalance: "0" });
      fetchAccounts();
      toast({ title: "Hesap eklendi" });
    }
  };

  const importCsv = async () => {
    if (!csvAccountId || !csvText.trim()) {
      return toast({ title: "Hesap ve CSV içeriği gerekli", variant: "destructive" });
    }
    setCsvBusy(true);
    try {
      const res = await fetch(`${API}/accounts/${csvAccountId}/import-csv`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, fileName: "ekstre.csv" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import başarısız", description: data?.error || data?.detail, variant: "destructive" });
        return;
      }
      toast({ title: "Import tamamlandı", description: `${data.inserted} satır eklendi (${data.skipped} atlandı)` });
      setCsvDialog(false);
      setCsvText("");
      fetchAccounts();
      fetchTransactions();
    } finally { setCsvBusy(false); }
  };

  const openMatch = async (tx: Tx) => {
    setMatchTx(tx);
    setSuggestions(null);
    const res = await fetch(`${API}/transactions/${tx.id}/match-suggestions`, { credentials: "include" });
    if (res.ok) setSuggestions(await res.json());
  };

  const doMatch = async (payload: any) => {
    if (!matchTx) return;
    setMatchBusy(true);
    try {
      const res = await fetch(`${API}/transactions/${matchTx.id}/match`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Eşleştirme başarısız", description: data?.error, variant: "destructive" });
        return;
      }
      toast({ title: "Eşleştirildi" });
      setMatchTx(null);
      fetchTransactions();
    } finally { setMatchBusy(false); }
  };

  const ignoreTx = async (tx: Tx) => {
    const res = await fetch(`${API}/transactions/${tx.id}/ignore`, { method: "POST", credentials: "include" });
    if (res.ok) {
      toast({ title: "Hareket yok sayıldı" });
      fetchTransactions();
    }
  };

  const totalBalance = accounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);
  const unmatchedCount = transactions.filter(t => t.status === "unmatched").length;

  return (
    <>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Banknote className="h-7 w-7" /> Bankacılık
            </h1>
            <p className="text-muted-foreground">Hesaplar, ekstre import ve ödeme eşleştirme</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAccountDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Hesap Ekle
            </Button>
            <Button onClick={() => { setCsvAccountId(accounts[0]?.id || null); setCsvDialog(true); }}>
              <Upload className="h-4 w-4 mr-2" /> CSV İçe Aktar
            </Button>
          </div>
        </div>

        {/* Account cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-2 border-primary/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Toplam Bakiye</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmtTL(totalBalance)}</div>
              <div className="text-xs text-muted-foreground">{accounts.length} hesap</div></CardContent>
          </Card>
          {accounts.slice(0, 3).map(a => (
            <Card key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveAccountId(a.id)}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex justify-between">
                {a.bankName} <Badge variant="outline" className="text-xs">{a.currency}</Badge>
              </CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{fmtTL(Number(a.currentBalance))}</div>
                <div className="text-xs text-muted-foreground truncate">{a.accountName}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={String(activeAccountId)} onValueChange={(v) => setActiveAccountId(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Hesaplar</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.bankName} — {a.accountName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="unmatched">Eşleşmemiş ({unmatchedCount})</SelectItem>
              <SelectItem value="matched">Eşleşmiş</SelectItem>
              <SelectItem value="ignored">Yok Sayıldı</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Açıklama, IBAN, referans..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="ghost" size="icon" onClick={fetchTransactions}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {/* Transactions table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">Hareket yok. CSV ekstre import edin.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left">Tarih</th>
                      <th className="px-4 py-2 text-left">Açıklama</th>
                      <th className="px-4 py-2 text-right">Tutar</th>
                      <th className="px-4 py-2 text-right">Bakiye</th>
                      <th className="px-4 py-2 text-center">Durum</th>
                      <th className="px-4 py-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 whitespace-nowrap">{new Date(tx.txDate).toLocaleDateString("tr-TR")}</td>
                        <td className="px-4 py-2">
                          <div>{tx.description}</div>
                          {tx.counterparty && <div className="text-xs text-muted-foreground">{tx.counterparty}</div>}
                        </td>
                        <td className={`px-4 py-2 text-right font-medium ${tx.txType === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                          {fmtTL(Number(tx.amount))}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {tx.balance ? fmtTL(Number(tx.balance)) : "—"}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {tx.status === "matched" && <Badge className="bg-emerald-500/15 text-emerald-300">Eşleşti</Badge>}
                          {tx.status === "unmatched" && <Badge variant="outline">Bekliyor</Badge>}
                          {tx.status === "ignored" && <Badge variant="secondary">Yok sayıldı</Badge>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {tx.status === "unmatched" && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => openMatch(tx)}>
                                <Link2 className="h-3 w-3 mr-1" /> Eşleştir
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => ignoreTx(tx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* New Account Dialog */}
        <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Yeni Banka Hesabı</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Banka Adı (örn. Garanti BBVA)" value={newAccount.bankName} onChange={(e) => setNewAccount({ ...newAccount, bankName: e.target.value })} />
              <Input placeholder="Hesap Adı (örn. Şirket Vadesiz)" value={newAccount.accountName} onChange={(e) => setNewAccount({ ...newAccount, accountName: e.target.value })} />
              <Input placeholder="IBAN (opsiyonel)" value={newAccount.iban} onChange={(e) => setNewAccount({ ...newAccount, iban: e.target.value })} />
              <Input type="number" placeholder="Açılış Bakiyesi" value={newAccount.openingBalance} onChange={(e) => setNewAccount({ ...newAccount, openingBalance: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccountDialog(false)}>Vazgeç</Button>
              <Button onClick={createAccount}>Oluştur</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSV Import Dialog */}
        <Dialog open={csvDialog} onOpenChange={setCsvDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>CSV Ekstre İçe Aktar</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={csvAccountId ? String(csvAccountId) : ""} onValueChange={(v) => setCsvAccountId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Hesap seçin" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.bankName} — {a.accountName}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                <strong>Beklenen başlıklar:</strong> Tarih · Açıklama · Tutar (veya Borç/Alacak ayrı sütun) · Bakiye (opsiyonel) · Dekont No
              </div>
              <Textarea
                rows={12}
                placeholder="Tarih;Aciklama;Tutar;Bakiye&#10;01.04.2026;ELEKTRIK FATURASI;-1250,75;48749,25"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCsvDialog(false)}>Vazgeç</Button>
              <Button onClick={importCsv} disabled={csvBusy}>
                {csvBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                İçe Aktar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Match Suggestions Dialog */}
        <Dialog open={!!matchTx} onOpenChange={(o) => !o && setMatchTx(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Hareket Eşleştir — {matchTx && fmtTL(Number(matchTx.amount))}</DialogTitle>
            </DialogHeader>
            {matchTx && (
              <div className="space-y-3">
                <div className="text-sm bg-muted/30 p-3 rounded">
                  <div><strong>{matchTx.description}</strong></div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(matchTx.txDate).toLocaleDateString("tr-TR")} · {matchTx.counterparty || "—"} · ref: {matchTx.reference || "—"}
                  </div>
                </div>

                {!suggestions ? (
                  <div className="text-center py-8"><Loader2 className="inline h-6 w-6 animate-spin" /></div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {suggestions.docs.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold mb-2">📄 Belge Önerileri ({suggestions.docs.length})</div>
                        {suggestions.docs.map(d => (
                          <div key={d.id} className="flex items-center justify-between border rounded p-2 mb-1">
                            <div className="text-sm">
                              <div>{d.title || d.originalName}</div>
                              <div className="text-xs text-muted-foreground">{d.docType} · {d.partyName || "—"} · {fmtTL(Number(d.totalAmount))}</div>
                            </div>
                            <Button size="sm" onClick={() => doMatch({ docId: d.id })} disabled={matchBusy}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Eşle
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {suggestions.purchases.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold mb-2">🧾 Ödenmemiş Alış Faturası Önerileri ({suggestions.purchases.length})</div>
                        {suggestions.purchases.map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between border rounded p-2 mb-1">
                            <div className="text-sm">
                              <div>Fatura #{p.invoiceNo || p.id}</div>
                              <div className="text-xs text-muted-foreground">{new Date(p.invoiceDate).toLocaleDateString("tr-TR")} · {fmtTL(Number(p.totalAmount))}</div>
                            </div>
                            <Button size="sm" onClick={() => doMatch({ purchaseId: p.id })} disabled={matchBusy}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Eşle (Ödendi işaretle)
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {suggestions.expenses.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold mb-2">💸 Gider Önerileri ({suggestions.expenses.length})</div>
                        {suggestions.expenses.map((e: any) => (
                          <div key={e.id} className="flex items-center justify-between border rounded p-2 mb-1">
                            <div className="text-sm">
                              <div>{e.description}</div>
                              <div className="text-xs text-muted-foreground">{new Date(e.expenseDate).toLocaleDateString("tr-TR")} · {fmtTL(Number(e.amount))}</div>
                            </div>
                            <Button size="sm" onClick={() => doMatch({ expenseId: e.id })} disabled={matchBusy}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Eşle
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {suggestions.docs.length + suggestions.purchases.length + suggestions.expenses.length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-4">
                        Otomatik öneri bulunamadı (tutar ±1₺ ve ±5 gün içinde eşleşme yok).
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setMatchTx(null)}>Kapat</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
