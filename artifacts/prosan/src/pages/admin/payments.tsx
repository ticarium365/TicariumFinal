import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, Building2 } from "lucide-react";

interface Transfer {
  id: number;
  companyId: number;
  companyName: string;
  amount: string;
  senderName: string;
  referenceNote: string | null;
  status: "pending" | "confirmed" | "rejected";
  adminNote: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: Transfer["status"] }) {
  if (status === "confirmed") return <Badge className="bg-green-100 text-green-700 border-green-200">Onaylandı</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-red-200">Reddedildi</Badge>;
  return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Bekliyor</Badge>;
}

export default function AdminPaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [action, setAction] = useState<"confirm" | "reject" | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [activateMonths, setActivateMonths] = useState(1);

  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({
    queryKey: ["admin-transfers"],
    queryFn: async () => {
      const res = await fetch("/api/payment/admin/transfers", { credentials: "include" });
      if (!res.ok) throw new Error("Yüklenemedi");
      return res.json();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, adminNote, activateMonths }: { id: number; action: string; adminNote: string; activateMonths: number }) => {
      const res = await fetch(`/api/payment/admin/transfers/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote, activateMonths }),
      });
      if (!res.ok) throw new Error("İşlem başarısız");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-transfers"] });
      toast({ title: action === "confirm" ? "Ödeme onaylandı, hesap aktifleştirildi" : "Ödeme reddedildi" });
      setSelected(null);
      setAction(null);
      setAdminNote("");
    },
    onError: () => {
      toast({ title: "Hata", description: "İşlem gerçekleştirilemedi.", variant: "destructive" });
    },
  });

  const pending = transfers.filter(t => t.status === "pending");
  const others = transfers.filter(t => t.status !== "pending");

  const openAction = (t: Transfer, a: "confirm" | "reject") => {
    setSelected(t);
    setAction(a);
    setAdminNote("");
    setActivateMonths(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ödeme Bildirimleri</h1>
        <p className="text-muted-foreground text-sm mt-1">Müşterilerin gönderdiği havale bildirimleri</p>
      </div>

      {/* Bekleyen */}
      {pending.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              Bekleyen Bildirimler ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{t.companyName}</span>
                    <Badge variant="outline" className="text-xs">{t.senderName}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">
                    <span className="font-bold text-slate-800">{Number(t.amount).toLocaleString("tr-TR")} ₺</span>
                    {t.referenceNote && <span className="ml-2 text-slate-400">• {t.referenceNote}</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(t.createdAt).toLocaleString("tr-TR")}</p>
                </div>
                <div className="flex gap-2 ml-3">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openAction(t, "confirm")}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Onayla
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => openAction(t, "reject")}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reddet
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Geçmiş */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Geçmiş Bildirimler</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Yükleniyor...</p>
          ) : others.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Henüz geçmiş bildirim yok</p>
          ) : (
            <div className="space-y-2">
              {others.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.companyName}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.senderName} • {Number(t.amount).toLocaleString("tr-TR")} ₺ • {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                    {t.adminNote && <p className="text-xs text-slate-400 mt-0.5 italic">"{t.adminNote}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Onay/Red Dialog */}
      <Dialog open={!!selected && !!action} onOpenChange={() => { setSelected(null); setAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "confirm" ? "Ödemeyi Onayla" : "Ödemeyi Reddet"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-slate-500">Firma:</span> <strong>{selected.companyName}</strong></p>
                <p><span className="text-slate-500">Tutar:</span> <strong>{Number(selected.amount).toLocaleString("tr-TR")} ₺</strong></p>
                <p><span className="text-slate-500">Gönderen:</span> {selected.senderName}</p>
                {selected.referenceNote && <p><span className="text-slate-500">Referans:</span> {selected.referenceNote}</p>}
              </div>
              {action === "confirm" && (
                <div className="space-y-1.5">
                  <Label>Kaç aylık aktif edilsin?</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={activateMonths}
                    onChange={(e) => setActivateMonths(Number(e.target.value))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Admin Notu (opsiyonel)</Label>
                <Textarea
                  placeholder="Müşteriye iletilecek not..."
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelected(null); setAction(null); }}>İptal</Button>
            <Button
              className={action === "confirm" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => selected && actionMutation.mutate({ id: selected.id, action: action!, adminNote, activateMonths })}
              disabled={actionMutation.isPending}
            >
              {action === "confirm" ? "Onayla ve Aktifleştir" : "Reddet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
