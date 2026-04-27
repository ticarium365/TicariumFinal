import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Send, Building2, Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";
import { initialLetter } from "@/lib/display-initial";

interface CompanyInfo {
  companyName: string;
  companySubdomain: string;
  companyLogo: string | null;
  companyColor: string;
  sector: string | null;
  city: string | null;
  acceptOffers: boolean;
}

interface Item {
  productName: string;
  productCode: string;
  description: string;
  quantity: string;
  unit: string;
}

const EMPTY_ITEM: Item = { productName: "", productCode: "", description: "", quantity: "1", unit: "adet" };

export default function QuoteNewPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const subdomain = params.get("company") ?? "";

  const [seller, setSeller] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [items, setItems] = useState<Item[]>([{ ...EMPTY_ITEM }]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("b2b:quote-prefill");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.subdomain && parsed.subdomain === subdomain) {
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            setItems(
              parsed.items.map((it: any) => ({
                productName: String(it.productName ?? it.name ?? ""),
                productCode: String(it.productCode ?? it.code ?? ""),
                description: String(it.description ?? ""),
                quantity: String(it.quantity ?? it.minOrderQty ?? 1),
                unit: String(it.unit ?? "adet"),
              }))
            );
          }
          if (parsed.subject) setSubject(String(parsed.subject));
        }
        sessionStorage.removeItem("b2b:quote-prefill");
      }
    } catch {}
  }, [subdomain]);

  useEffect(() => {
    if (!subdomain) { navigate("/network"); return; }
    fetch(`${apiBase}/network/companies/${subdomain}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("not found");
        const data = await r.json();
        if (!data.profile.acceptOffers) {
          toast({ title: "Bu firma teklif kabul etmiyor", variant: "destructive" });
          navigate(`/network/${subdomain}`);
          return;
        }
        setSeller(data.profile);
      })
      .catch(() => navigate("/network"))
      .finally(() => setLoading(false));
  }, [subdomain]);

  function updateItem(idx: number, key: keyof Item, val: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  }
  function addItem() { setItems((p) => [...p, { ...EMPTY_ITEM }]); }
  function removeItem(idx: number) { setItems((p) => p.length > 1 ? p.filter((_, i) => i !== idx) : p); }

  async function submit() {
    if (!subject.trim()) { toast({ title: "Konu zorunlu", variant: "destructive" }); return; }
    const validItems = items.filter((it) => it.productName.trim() && Number(it.quantity) > 0);
    if (validItems.length === 0) { toast({ title: "En az bir ürün ekleyin", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/b2b/quotes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toSubdomain: subdomain,
          subject,
          message: message || undefined,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
          deliveryCity: deliveryCity || undefined,
          deliveryAddress: deliveryAddress || undefined,
          expectedDeliveryDate: expectedDate || undefined,
          items: validItems.map((it) => ({
            productName: it.productName,
            productCode: it.productCode || undefined,
            description: it.description || undefined,
            quantity: Number(it.quantity),
            unit: it.unit || "adet",
          })),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "fail");
      }
      const created = await res.json();
      toast({ title: "Teklif gönderildi", description: created.code });
      navigate(`/b2b/quotes/${created.id}`);
    } catch (err: any) {
      toast({ title: "Hata", description: err.message ?? "Gönderilemedi", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto p-6 text-muted-foreground">Yükleniyor...</div>;
  if (!seller) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link href={`/network/${subdomain}`}>
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />Firmaya Dön
        </Button>
      </Link>

      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          {seller.companyLogo ? (
            <img src={seller.companyLogo} alt="" className="h-14 w-14 rounded-xl object-contain border" />
          ) : (
            <div className="h-14 w-14 rounded-xl flex items-center justify-center text-white font-bold text-2xl" style={{ backgroundColor: seller.companyColor }}>
              {initialLetter(seller.companyName)}
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Teklif İsteği — Alıcı</p>
            <h2 className="text-lg font-bold">{seller.companyName}</h2>
            <p className="text-sm text-muted-foreground">{seller.sector} · {seller.city}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teklif Detayları</CardTitle>
          <CardDescription>İhtiyaçlarınızı net şekilde belirtin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Konu *</Label>
            <Input
              placeholder="Örn: 100 adet rulman teklifi"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Açıklama (opsiyonel)</Label>
            <Textarea
              placeholder="İhtiyacınızla ilgili ek bilgiler, kalite, marka tercihi vb."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>İletişim Telefonu</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0xxx xxx xx xx" />
            </div>
            <div className="space-y-1.5">
              <Label>İletişim E-posta</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ornek@firma.com" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Teslimat Şehri</Label>
              <Input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} placeholder="Şehir" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Beklenen Tarih</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Teslimat Adresi</Label>
            <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Tam adres (opsiyonel)" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Ürün Listesi</CardTitle>
            <CardDescription>Teklif istediğiniz ürünleri ekleyin</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" />Ürün Ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-muted-foreground bg-background border rounded px-1.5 py-0.5 mt-2">
                  #{idx + 1}
                </span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <Input
                    className="sm:col-span-5"
                    placeholder="Ürün adı *"
                    value={it.productName}
                    onChange={(e) => updateItem(idx, "productName", e.target.value)}
                  />
                  <Input
                    className="sm:col-span-3"
                    placeholder="Ürün kodu"
                    value={it.productCode}
                    onChange={(e) => updateItem(idx, "productCode", e.target.value)}
                  />
                  <Input
                    className="sm:col-span-2"
                    type="number"
                    placeholder="Miktar"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    min="0"
                    step="0.01"
                  />
                  <Input
                    className="sm:col-span-2"
                    placeholder="Birim"
                    value={it.unit}
                    onChange={(e) => updateItem(idx, "unit", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Ürün açıklaması / spesifikasyon (opsiyonel)"
                value={it.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
                className="text-sm"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href={`/network/${subdomain}`}>
          <Button variant="outline">İptal</Button>
        </Link>
        <Button onClick={submit} disabled={submitting} size="lg">
          <Send className="h-4 w-4 mr-2" />
          {submitting ? "Gönderiliyor..." : "Teklif İsteğini Gönder"}
        </Button>
      </div>
    </div>
  );
}
