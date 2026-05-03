import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Send, MessageSquare, CheckCircle2, XCircle, Building2, Calendar,
  MapPin, Phone, Mail, Hourglass, FileText, AlertCircle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface Item {
  id: number;
  productName: string;
  productCode: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  quotedPrice: number | null;
  quotedNote: string | null;
  isAvailable: boolean;
}

interface Message {
  id: number;
  fromCompanyId: number;
  body: string;
  createdAt: string;
}

interface Quote {
  id: number;
  code: string;
  fromCompanyId: number;
  toCompanyId: number;
  subject: string;
  message: string | null;
  status: string;
  contactPhone: string | null;
  contactEmail: string | null;
  deliveryCity: string | null;
  deliveryAddress: string | null;
  expectedDeliveryDate: string | null;
  validUntil: string | null;
  sellerNote: string | null;
  quotedTotalAmount: number | null;
  quotedCurrency: string | null;
  rejectReason: string | null;
  respondedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  fromCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
  toCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
}

interface QuoteDetail {
  quote: Quote;
  items: Item[];
  messages: Message[];
  role: "buyer" | "seller";
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Yanıt Bekliyor", color: "bg-amber-500/10 text-amber-300 border-amber-500/20", icon: Hourglass },
  quoted: { label: "Yanıtlandı", color: "bg-blue-500/10 text-blue-300 border-blue-500/20", icon: FileText },
  accepted: { label: "Kabul Edildi", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Reddedildi", color: "bg-rose-500/10 text-rose-300 border-rose-500/20", icon: XCircle },
  cancelled: { label: "İptal Edildi", color: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

interface Props { id: string }

export default function QuoteDetailPage({ id }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [data, setData] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [responseItems, setResponseItems] = useState<Record<number, { price: string; available: boolean; note: string }>>({});
  const [sellerNote, setSellerNote] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [submitting, setSubmitting] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  async function fetchData() {
    try {
      const r = await fetch(`${apiBase}/b2b/quotes/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("not found");
      const d: QuoteDetail = await r.json();
      setData(d);
      const init: typeof responseItems = {};
      for (const it of d.items) {
        init[it.id] = {
          price: it.quotedPrice?.toString() ?? "",
          available: it.isAvailable,
          note: it.quotedNote ?? "",
        };
      }
      setResponseItems(init);
      setSellerNote(d.quote.sellerNote ?? "");
      setCurrency(d.quote.quotedCurrency ?? "TRY");
      if (d.quote.validUntil) setValidUntil(d.quote.validUntil.slice(0, 10));
    } catch {
      navigate("/b2b/quotes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [id]);

  async function submitResponse() {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/b2b/quotes/${id}/respond`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validUntil: validUntil || undefined,
          sellerNote: sellerNote || undefined,
          currency,
          items: data.items.map((it) => ({
            id: it.id,
            quotedPrice: responseItems[it.id]?.price ? Number(responseItems[it.id].price) : null,
            isAvailable: responseItems[it.id]?.available ?? true,
            quotedNote: responseItems[it.id]?.note || undefined,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Yanıt gönderildi" });
      fetchData();
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(decision: "accepted" | "rejected") {
    if (decision === "rejected" && !showRejectInput) { setShowRejectInput(true); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/b2b/quotes/${id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: rejectReason || undefined }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({} as any));
      const oid = Number(data?.orderId);
      if (decision === "accepted" && Number.isInteger(oid) && oid > 0) {
        toast({
          title: "Teklif kabul edildi",
          description: data?.orderCode ? `Sipariş oluşturuldu: ${data.orderCode}` : "Sipariş oluşturuldu.",
        });
        navigate(`/b2b/orders/${oid}`);
        return;
      }
      toast({ title: decision === "accepted" ? "Teklif kabul edildi" : "Teklif reddedildi" });
      fetchData();
      setShowRejectInput(false);
      setRejectReason("");
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!confirm("Teklif isteğini iptal etmek istediğinize emin misiniz?")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/b2b/quotes/${id}/cancel`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      toast({ title: "İptal edildi" });
      fetchData();
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim()) return;
    try {
      const res = await fetch(`${apiBase}/b2b/quotes/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newMessage }),
      });
      if (!res.ok) throw new Error();
      setNewMessage("");
      fetchData();
    } catch {
      toast({ title: "Mesaj gönderilemedi", variant: "destructive" });
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto p-6 text-muted-foreground">Yükleniyor...</div>;
  if (!data) return null;

  const { quote, items, messages, role } = data;
  const counterparty = role === "buyer" ? quote.toCompany : quote.fromCompany;
  const meta = STATUS_META[quote.status] ?? STATUS_META.pending;
  const StatusIcon = meta.icon;

  const computedTotal = items.reduce((sum, it) => {
    const r = responseItems[it.id];
    if (!r?.available || !r?.price) return sum;
    return sum + Number(r.price) * it.quantity;
  }, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <Link href="/b2b/quotes">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />Tüm Teklifler
        </Button>
      </Link>

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {counterparty?.logoUrl ? (
              <img src={counterparty.logoUrl} alt="" className="h-14 w-14 rounded-xl object-contain border shrink-0" />
            ) : (
              <div className="h-14 w-14 rounded-xl flex items-center justify-center text-[color:var(--color-nav-text-active)] font-bold text-2xl shrink-0" style={{ backgroundColor: counterparty?.primaryColor ?? "var(--color-neutral-500)" }}>
                {counterparty?.name?.charAt(0) ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{quote.code}</code>
                <Badge variant="outline" className={`gap-1 ${meta.color}`}>
                  <StatusIcon className="h-3 w-3" />{meta.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {role === "buyer" ? "→ Gönderildi" : "← Alındı"}
                </span>
              </div>
              <h1 className="text-xl font-bold mt-1">{quote.subject}</h1>
              <Link href={`/network/${counterparty?.subdomain}`}>
                <p className="text-sm text-primary hover:underline cursor-pointer mt-0.5">
                  {role === "buyer" ? "Satıcı: " : "Alıcı: "}{counterparty?.name}
                </p>
              </Link>
            </div>
            {role === "buyer" && ["pending", "quoted"].includes(quote.status) && (
              <Button variant="outline" size="sm" onClick={cancel} disabled={submitting}>
                <X className="h-4 w-4 mr-1" />İptal Et
              </Button>
            )}
          </div>

          {quote.message && (
            <div className="mt-4 p-3 bg-muted/40 rounded-lg text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Açıklama</p>
              <p>{quote.message}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {quote.contactPhone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{quote.contactPhone}</div>}
            {quote.contactEmail && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{quote.contactEmail}</div>}
            {quote.deliveryCity && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{quote.deliveryCity}</div>}
            {quote.expectedDeliveryDate && <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{new Date(quote.expectedDeliveryDate).toLocaleDateString("tr-TR")}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ürünler ({items.length})</CardTitle>
          {quote.status === "quoted" && quote.quotedTotalAmount != null && (
            <CardDescription>
              Toplam: <strong className="text-foreground text-base">{quote.quotedTotalAmount.toLocaleString("tr-TR")} {quote.quotedCurrency}</strong>
              {quote.validUntil && <> — Geçerlilik: {new Date(quote.validUntil).toLocaleDateString("tr-TR")}</>}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, idx) => {
            const showResponseInput = role === "seller" && quote.status === "pending";
            const r = responseItems[it.id] ?? { price: "", available: true, note: "" };
            return (
              <div key={it.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                      <strong>{it.productName}</strong>
                      {it.productCode && <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{it.productCode}</code>}
                    </div>
                    {it.description && <p className="text-xs text-muted-foreground mt-1">{it.description}</p>}
                    <p className="text-sm mt-1">
                      <span className="text-muted-foreground">Miktar:</span> <strong>{it.quantity} {it.unit}</strong>
                    </p>
                  </div>
                  {quote.status === "quoted" && it.quotedPrice != null && it.isAvailable && (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Birim Fiyat</p>
                      <p className="font-bold">{it.quotedPrice.toLocaleString("tr-TR")} {quote.quotedCurrency}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Toplam: {(it.quotedPrice * it.quantity).toLocaleString("tr-TR")}
                      </p>
                    </div>
                  )}
                  {quote.status === "quoted" && !it.isAvailable && (
                    <Badge variant="outline" className="border-rose-500/20 text-rose-300">Stokta Yok</Badge>
                  )}
                </div>
                {it.quotedNote && quote.status === "quoted" && (
                  <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2">{it.quotedNote}</p>
                )}
                {showResponseInput && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t">
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <Switch
                        checked={r.available}
                        onCheckedChange={(v) => setResponseItems((p) => ({ ...p, [it.id]: { ...r, available: v } }))}
                      />
                      <span className="text-xs">{r.available ? "Var" : "Yok"}</span>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Birim fiyat"
                      className="sm:col-span-3"
                      value={r.price}
                      disabled={!r.available}
                      onChange={(e) => setResponseItems((p) => ({ ...p, [it.id]: { ...r, price: e.target.value } }))}
                    />
                    <Input
                      placeholder="Not (opsiyonel)"
                      className="sm:col-span-7"
                      value={r.note}
                      onChange={(e) => setResponseItems((p) => ({ ...p, [it.id]: { ...r, note: e.target.value } }))}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {quote.sellerNote && quote.status === "quoted" && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
              <p className="text-xs font-medium text-blue-200 mb-1">Satıcı Notu</p>
              <p className="text-blue-300">{quote.sellerNote}</p>
            </div>
          )}
          {quote.rejectReason && quote.status === "rejected" && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm">
              <p className="text-xs font-medium text-rose-200 mb-1">Red Nedeni</p>
              <p className="text-rose-300">{quote.rejectReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {role === "seller" && quote.status === "pending" && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" />Teklifi Yanıtla
            </CardTitle>
            <CardDescription>
              Hesaplanan toplam: <strong className="text-foreground">{computedTotal.toLocaleString("tr-TR")} {currency}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Para Birimi</Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Geçerlilik Tarihi</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Satıcı Notu</Label>
              <Textarea
                placeholder="Ödeme koşulları, kargo, indirim vb."
                value={sellerNote}
                onChange={(e) => setSellerNote(e.target.value)}
                rows={2}
              />
            </div>
            <Button onClick={submitResponse} disabled={submitting} className="w-full">
              <Send className="h-4 w-4 mr-2" />{submitting ? "Gönderiliyor..." : "Yanıtı Gönder"}
            </Button>
          </CardContent>
        </Card>
      )}

      {role === "buyer" && quote.status === "quoted" && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Karar Verin</CardTitle>
            <CardDescription>Teklifi kabul edip siparişe dönüştürün veya reddedin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {showRejectInput && (
              <div className="space-y-1.5">
                <Label>Red Nedeni (opsiyonel)</Label>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => decide("accepted")} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />Kabul Et
              </Button>
              <Button onClick={() => decide("rejected")} disabled={submitting} variant="outline" className="flex-1 border-rose-500/30 text-rose-300 hover:bg-rose-500/150/10">
                <XCircle className="h-4 w-4 mr-2" />{showRejectInput ? "Reddi Onayla" : "Reddet"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />Mesajlar ({messages.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Henüz mesaj yok</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {messages.map((m) => {
                const isMine = (role === "buyer" && m.fromCompanyId === quote.fromCompanyId) ||
                              (role === "seller" && m.fromCompanyId === quote.toCompanyId);
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[10px] mt-1 opacity-70`}>
                        {new Date(m.createdAt).toLocaleString("tr-TR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              placeholder="Mesaj yazın..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
