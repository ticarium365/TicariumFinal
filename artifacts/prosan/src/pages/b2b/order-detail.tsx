import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Hourglass,
  CircleDollarSign,
  MapPin,
  Phone,
  FileText,
  Loader2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface CompanyMini {
  id: number;
  name: string;
  subdomain: string;
  primaryColor: string;
  logoUrl: string | null;
}

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
  shippingAddress: string | null;
  contactPhone: string | null;
  trackingNo: string | null;
  carrier: string | null;
  sellerNote: string | null;
  buyerNote: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  buyerCompany: CompanyMini | null;
  sellerCompany: CompanyMini | null;
}

interface QuoteItem {
  id: number;
  productName: string;
  productCode: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  quotedPrice: number | null;
  isAvailable: boolean;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Beklemede", color: "bg-amber-500/10 text-amber-300 border-amber-500/20", icon: Hourglass },
  confirmed: { label: "Onaylandı", color: "bg-blue-500/10 text-blue-300 border-blue-500/20", icon: CheckCircle2 },
  shipped: { label: "Kargoda", color: "bg-violet-500/10 text-violet-300 border-violet-500/20", icon: Truck },
  delivered: { label: "Teslim Edildi", color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20", icon: PackageCheck },
  completed: { label: "Tamamlandı", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  cancelled: { label: "İptal", color: "bg-rose-500/10 text-rose-300 border-rose-500/20", icon: XCircle },
};

const TIMELINE_ORDER = ["pending", "confirmed", "shipped", "delivered", "completed"];

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export default function OrderDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/b2b/orders/:id");
  const orderId = params?.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ companyId: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shipDialog, setShipDialog] = useState(false);
  const [trackingNo, setTrackingNo] = useState("");
  const [carrier, setCarrier] = useState("");
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function fetchData() {
    setLoading(true);
    try {
      const [orderRes, meRes] = await Promise.all([
        fetch(`${apiBase}/b2b/orders/${orderId}`, {
          credentials: "include",
          cache: "no-store",
        }).then((r) => r.json()),
        fetch(`${apiBase}/auth/me`, { credentials: "include", cache: "no-store" }).then((r) =>
          r.json(),
        ),
      ]);
      if (orderRes.error) throw new Error(orderRes.error);
      setOrder(orderRes.order);
      setItems(orderRes.items);
      const cid = meRes?.user?.companyId ?? meRes?.companyId;
      if (typeof cid !== "number") {
        throw new Error("Oturum bilgisi alınamadı");
      }
      setMe({ companyId: cid });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message ?? "Sipariş yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (orderId) fetchData();
  }, [orderId]);

  async function updateStatus(payload: Record<string, any>) {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/b2b/orders/${orderId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Hata");
      toast({ title: "Güncellendi", description: "Sipariş durumu güncellendi" });
      setShipDialog(false);
      setCancelDialog(false);
      setTrackingNo("");
      setCarrier("");
      setCancelReason("");
      await fetchData();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !order || !me) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSeller = order.sellerCompanyId === me.companyId;
  const isBuyer = order.buyerCompanyId === me.companyId;
  const counterparty = isSeller ? order.buyerCompany : order.sellerCompany;
  const myRoleLabel = isSeller ? "Satıcı" : "Alıcı";
  const meta = STATUS_META[order.status] ?? STATUS_META.pending;
  const Icon = meta.icon;

  const stepIdx = TIMELINE_ORDER.indexOf(order.status);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/b2b/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Siparişlere Dön
          </Button>
        </Link>
        <Link href={`/b2b/quotes/${order.quoteId}`}>
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-1" />
            İlgili Teklif
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            {counterparty?.logoUrl ? (
              <img src={counterparty.logoUrl} alt="" className="h-14 w-14 rounded-lg object-contain border" />
            ) : (
              <div
                className="h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                style={{ backgroundColor: counterparty?.primaryColor ?? "var(--color-neutral-500)" }}
              >
                {counterparty?.name?.charAt(0) ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{order.code}</code>
                <Badge variant="outline" className={`gap-1 ${meta.color}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </Badge>
                <span className="text-xs text-muted-foreground">({myRoleLabel} olarak)</span>
              </div>
              <h1 className="text-xl font-bold mt-1">{counterparty?.name ?? "—"}</h1>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Oluşturuldu: {fmtDate(order.createdAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold flex items-center gap-1">
                <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
                {order.totalAmount.toLocaleString("tr-TR")}
              </p>
              <p className="text-sm text-muted-foreground">{order.currency}</p>
            </div>
          </div>

          {order.status !== "cancelled" && (
            <div className="mt-6 flex items-stretch justify-between gap-0">
              {TIMELINE_ORDER.map((s, i) => {
                const m = STATUS_META[s];
                const SIcon = m.icon;
                const done = i <= stepIdx;
                const nextDone = i + 1 <= stepIdx;
                return (
                  <div key={s} className="flex-1 flex items-start">
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                          done
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-muted border-border text-muted-foreground"
                        }`}
                      >
                        <SIcon className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-[10px] text-center px-1 ${done ? "font-medium" : "text-muted-foreground"}`}
                      >
                        {m.label}
                      </span>
                    </div>
                    {i < TIMELINE_ORDER.length - 1 && (
                      <div className={`flex-1 h-0.5 mt-4 ${nextDone ? "bg-primary" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {order.status === "cancelled" && (
            <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
              <strong>İptal edildi:</strong> {order.cancelReason ?? "Sebep belirtilmedi"}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Sipariş Kalemleri
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {items.map((it) => (
                  <div key={it.id} className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{it.productName}</p>
                      {it.productCode && (
                        <p className="text-xs text-muted-foreground font-mono">{it.productCode}</p>
                      )}
                      {it.description && <p className="text-xs text-muted-foreground mt-1">{it.description}</p>}
                    </div>
                    <div className="text-right text-sm">
                      <p>
                        <span className="font-bold">{it.quantity}</span> {it.unit}
                      </p>
                      {it.quotedPrice != null && (
                        <p className="text-xs text-muted-foreground">
                          ₺{it.quotedPrice.toLocaleString("tr-TR")} / {it.unit}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm font-bold w-24">
                      {it.quotedPrice != null
                        ? `₺${(it.quotedPrice * it.quantity).toLocaleString("tr-TR")}`
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t bg-muted/30 flex justify-between items-center">
                <span className="text-sm font-medium">Toplam</span>
                <span className="text-lg font-bold">
                  {order.totalAmount.toLocaleString("tr-TR")} {order.currency}
                </span>
              </div>
            </CardContent>
          </Card>

          {(order.sellerNote || order.buyerNote) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notlar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.sellerNote && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Satıcı notu</p>
                    <p className="text-sm">{order.sellerNote}</p>
                  </div>
                )}
                {order.buyerNote && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Alıcı notu</p>
                    <p className="text-sm">{order.buyerNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Sevkiyat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.shippingCity && (
                <div>
                  <p className="text-xs text-muted-foreground">Şehir</p>
                  <p className="font-medium">{order.shippingCity}</p>
                </div>
              )}
              {order.shippingAddress && (
                <div>
                  <p className="text-xs text-muted-foreground">Adres</p>
                  <p>{order.shippingAddress}</p>
                </div>
              )}
              {order.contactPhone && (
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Telefon
                  </p>
                  <p>{order.contactPhone}</p>
                </div>
              )}
              {order.trackingNo ? (
                <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3">
                  <p className="text-xs text-violet-300 font-medium flex items-center gap-1">
                    <Truck className="h-3 w-3" /> {order.carrier ?? "Kargo"}
                  </p>
                  <p className="font-mono text-sm font-bold text-violet-200 mt-0.5">{order.trackingNo}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Henüz kargo bilgisi yok</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Zaman Çizelgesi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <Row label="Oluşturuldu" value={fmtDate(order.createdAt)} />
              <Row label="Onaylandı" value={fmtDate(order.confirmedAt)} />
              <Row label="Kargoya verildi" value={fmtDate(order.shippedAt)} />
              <Row label="Teslim edildi" value={fmtDate(order.deliveredAt)} />
              <Row label="Tamamlandı" value={fmtDate(order.completedAt)} />
              {order.cancelledAt && <Row label="İptal" value={fmtDate(order.cancelledAt)} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">İşlemler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isSeller && order.status === "pending" && (
                <>
                  <Button className="w-full" onClick={() => updateStatus({ status: "confirmed" })} disabled={busy}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Siparişi Onayla
                  </Button>
                </>
              )}
              {isSeller && order.status === "confirmed" && (
                <Button className="w-full" onClick={() => setShipDialog(true)} disabled={busy}>
                  <Truck className="h-4 w-4 mr-2" /> Kargoya Ver
                </Button>
              )}
              {isSeller && order.status === "shipped" && (
                <Button className="w-full" onClick={() => updateStatus({ status: "delivered" })} disabled={busy}>
                  <PackageCheck className="h-4 w-4 mr-2" /> Teslim Edildi İşaretle
                </Button>
              )}
              {isBuyer && (order.status === "shipped" || order.status === "delivered") && (
                <Button className="w-full" onClick={() => updateStatus({ status: "completed" })} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Aldım — Tamamla
                </Button>
              )}
              {isSeller && order.status === "delivered" && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => updateStatus({ status: "completed" })}
                  disabled={busy}
                >
                  Siparişi Tamamla
                </Button>
              )}
              {(order.status === "pending" || order.status === "confirmed") && (isSeller || isBuyer) && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setCancelDialog(true)}
                  disabled={busy}
                >
                  <XCircle className="h-4 w-4 mr-2" /> İptal Et
                </Button>
              )}
              {(order.status === "completed" || order.status === "cancelled") && (
                <p className="text-xs text-muted-foreground text-center py-2">Bu sipariş kapanmıştır.</p>
              )}
              {isSeller && (order.status === "delivered" || order.status === "completed") && (
                <Link href="/einvoice">
                  <Button className="w-full mt-2" variant="outline" data-testid="cta-b2b-order-invoice">
                    <FileText className="h-4 w-4 mr-2" /> Fatura Kes
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={shipDialog} onOpenChange={setShipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kargo Bilgisi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Kargo Firması</label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Örn: Aras Kargo, Yurtiçi, MNG..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Takip Numarası</label>
              <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="Kargo takip no" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDialog(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button
              onClick={() =>
                updateStatus({
                  status: "shipped",
                  trackingNo: trackingNo.trim() || undefined,
                  carrier: carrier.trim() || undefined,
                })
              }
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kargoya Ver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Siparişi İptal Et</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">İptal Sebebi</label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="İptal sebebini açıklayın..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              onClick={() => updateStatus({ status: "cancelled", cancelReason: cancelReason.trim() || undefined })}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "İptal Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "font-medium" : "text-muted-foreground/50"}>{value ?? "—"}</span>
    </div>
  );
}
