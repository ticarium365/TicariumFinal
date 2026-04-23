import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { trackProductEvent } from "@/lib/product-analytics";
import { ArrowLeft, Coins, ShieldCheck, Sparkles } from "lucide-react";

type CreditPack = {
  code: string;
  metric: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  label: string;
  description: string;
};

type TopupSummary = {
  recent: {
    id: number;
    status: string;
    amountTry: number;
    paidAt: string | null;
    createdAt: string | null;
    packCode: string;
    label: string;
    metric: string;
    errorCode: string | null;
  }[];
  stats90d: {
    succeededCount: number;
    totalTry: number;
    avgTry: number;
    isRepeater: boolean;
  };
};

const METRIC_LABEL: Record<string, string> = {
  einvoice: "E-belge",
  ocr: "OCR",
  api_calls: "API",
  sms: "SMS",
};

function groupByMetricSorted(packs: CreditPack[]): Record<string, CreditPack[]> {
  const g: Record<string, CreditPack[]> = {};
  for (const p of packs) {
    if (!g[p.metric]) g[p.metric] = [];
    g[p.metric].push(p);
  }
  for (const k of Object.keys(g)) {
    g[k].sort((a, b) => a.totalPrice - b.totalPrice || a.quantity - b.quantity);
  }
  return g;
}

function packBadge(index: number, len: number): string | null {
  if (len <= 1) return null;
  if (len === 2) return index === 0 ? "Giriş" : "Büyüme";
  if (index === 0) return "Giriş";
  if (index === len - 1) return "Yüksek hacim";
  return "En dengeli";
}

export default function CreditTopupPage() {
  const { toast } = useToast();
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);
  const [identityTaxNumber, setIdentityTaxNumber] = useState("");
  const [identityPhone, setIdentityPhone] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [pendingPackCode, setPendingPackCode] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState<string | null>(null);

  useEffect(() => {
    trackProductEvent("credit_topup_page_view", { path: "/settings/credit-topup" });
  }, []);

  const packsQ = useQuery<{ packs: CreditPack[] }>({
    queryKey: ["/api/billing/credit-packs"],
    queryFn: async () => {
      const r = await fetch("/api/billing/credit-packs", { credentials: "include" });
      if (!r.ok) throw new Error("packs");
      return r.json();
    },
    staleTime: 300_000,
  });

  const summaryQ = useQuery<TopupSummary>({
    queryKey: ["/api/billing/topup-summary"],
    queryFn: async () => {
      const r = await fetch("/api/billing/topup-summary", { credentials: "include" });
      if (!r.ok) throw new Error("summary");
      return r.json();
    },
    staleTime: 120_000,
  });

  const packs = packsQ.data?.packs ?? [];
  const grouped = useMemo(() => groupByMetricSorted(packs), [packs]);
  const stats = summaryQ.data?.stats90d;

  async function startTopup(packCode: string) {
    setPayBusy(packCode);
    try {
      const r = await fetch("/api/billing/topup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packCode }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.paymentPageUrl) {
        trackProductEvent("billing_topup_checkout_started", { pack_code: packCode });
        toast({
          title: "Güvenli ödeme",
          description: `${j.pack?.label ?? packCode} — ${j.amount} ${j.currency}. Birkaç saniye içinde yönlendiriliyorsunuz.`,
        });
        window.location.href = j.paymentPageUrl;
        return;
      }
      if (
        r.status === 400
        && (j?.error?.code === "IDENTITY_REQUIRED" || j?.error?.code === "PHONE_REQUIRED" || j?.error?.code === "PHONE_INVALID")
      ) {
        setPendingPackCode(packCode);
        setIdentityDialogOpen(true);
        trackProductEvent(
          j?.error?.code === "PHONE_REQUIRED" || j?.error?.code === "PHONE_INVALID"
            ? "billing_phone_required_shown"
            : "billing_identity_required_shown",
          { context: "credit_topup", pack_code: packCode, code: j?.error?.code },
        );
        return;
      }
      trackProductEvent("billing_topup_client_error", {
        http_status: r.status,
        code: String(j?.error?.code ?? j?.error?.message ?? "unknown").slice(0, 80),
        pack_code: packCode,
      });
      toast({
        title: "İşlem başlatılamadı",
        description: j?.error?.message ?? j?.message ?? "Lütfen biraz sonra tekrar deneyin.",
        variant: "destructive",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "network";
      trackProductEvent("billing_topup_client_error", { code: "network", detail: msg.slice(0, 120), pack_code: packCode });
      toast({ title: "Bağlantı hatası", description: "Ağ kesildi veya sunucu yanıt vermedi.", variant: "destructive" });
    } finally {
      setPayBusy(null);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-gradient-to-b from-background via-background to-muted/20">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 pb-16">
        <Dialog open={identityDialogOpen} onOpenChange={setIdentityDialogOpen}>
          <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Kontör ödemesi için firma bilgisi</DialogTitle>
              <DialogDescription>
                Ödeme sağlayıcısı (İyzico) VKN/TCKN ve Türkiye GSM numarası ister. Veriler firma ayarlarınıza kaydedilir; kart bilgisi Ticarium365 sunucularına gelmez.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="taxNumber">VKN / TCKN</Label>
              <Input
                id="taxNumber"
                inputMode="numeric"
                placeholder="10 (VKN) veya 11 (TCKN) haneli"
                value={identityTaxNumber}
                onChange={(e) => setIdentityTaxNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="billingPhone">Telefon (GSM)</Label>
              <Input
                id="billingPhone"
                inputMode="tel"
                placeholder="+90 5xx xxx xx xx"
                value={identityPhone}
                onChange={(e) => setIdentityPhone(e.target.value)}
              />
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  setIdentityDialogOpen(false);
                  setPendingPackCode(null);
                }}
                disabled={identitySaving}
              >
                Vazgeç
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={async () => {
                  const v = identityTaxNumber.trim();
                  if (!(v.length === 10 || v.length === 11)) {
                    toast({ title: "Hata", description: "VKN 10 haneli, TCKN 11 haneli olmalı", variant: "destructive" });
                    return;
                  }
                  const phone = identityPhone.trim();
                  if (!phone) {
                    toast({ title: "Hata", description: "Telefon numarası gerekli", variant: "destructive" });
                    return;
                  }
                  try {
                    setIdentitySaving(true);
                    const sr = await fetch("/api/settings", {
                      method: "PUT",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ taxNumber: v, phone }),
                    });
                    const sj = await sr.json().catch(() => ({}));
                    if (!sr.ok) throw new Error(sj?.error?.message || "Ayarlar kaydedilemedi");
                    trackProductEvent("billing_identity_saved", { tax_len: v.length, context: "credit_topup" });
                    trackProductEvent("billing_phone_saved", { context: "credit_topup" });
                    setIdentityDialogOpen(false);
                    const code = pendingPackCode;
                    setPendingPackCode(null);
                    toast({ title: "Kaydedildi", description: "Ödeme oturumu yeniden başlatılıyor." });
                    if (code) await startTopup(code);
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Kaydetme başarısız";
                    toast({ title: "Hata", description: msg, variant: "destructive" });
                  } finally {
                    setIdentitySaving(false);
                  }
                }}
                disabled={identitySaving}
              >
                Kaydet ve devam et
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground" asChild>
            <Link href="/settings/subscription">
              <ArrowLeft className="h-4 w-4" />
              Abonelik
            </Link>
          </Button>
          <PageHeader
            title="Ek kontör"
            description="E-belge, OCR, API ve SMS limitlerinizi tek tıkla artırın. Ödeme banka/3DS ekranında tamamlanır; faturalandırma ödeme adımında netleşir."
          />
        </div>

        <div className="rounded-xl border bg-card/80 backdrop-blur-sm p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                PCI-DSS uyumlu ödeme sayfasına yönlendirilirsiniz. Kart bilgileri tarafımızca saklanmaz.
                Sonuç <Link href="/odeme/sonuc" className="text-primary underline font-medium">/odeme/sonuc</Link> üzerinden doğrulanır.
              </p>
            </div>
          </div>
          {stats && stats.succeededCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border-t pt-3">
              <span className="tabular-nums">
                Son 90 gün: <strong className="text-foreground">{stats.succeededCount}</strong> başarılı işlem
                {stats.totalTry > 0 ? (
                  <> · toplam <strong className="text-foreground">₺{stats.totalTry.toLocaleString("tr-TR")}</strong></>
                ) : null}
                {stats.avgTry > 0 ? (
                  <> · ort. <strong className="text-foreground">₺{stats.avgTry.toLocaleString("tr-TR")}</strong></>
                ) : null}
              </span>
              {stats.isRepeater && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Sparkles className="h-3 w-3" />
                  Tekrar satın alan ekip — ihtiyaç duyduğunuz metrikte paketi seçmeye devam edin
                </Badge>
              )}
            </div>
          )}
        </div>

        {packsQ.isLoading && (
          <p className="text-sm text-muted-foreground">Paketler yükleniyor…</p>
        )}
        {packsQ.isError && (
          <p className="text-sm text-destructive">Kontör paketleri yüklenemedi. Sayfayı yenileyin.</p>
        )}

        <div className="space-y-10">
          {Object.entries(grouped).map(([metric, list]) => (
            <section key={metric}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary shrink-0" />
                {METRIC_LABEL[metric] ?? metric}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((p, idx) => {
                  const tag = packBadge(idx, list.length);
                  const perUnit = p.quantity > 0 ? p.totalPrice / p.quantity : p.totalPrice;
                  return (
                    <Card
                      key={p.code}
                      className={`flex flex-col overflow-hidden border transition-shadow ${
                        tag === "En dengeli" ? "ring-2 ring-primary/30 shadow-md" : "hover:shadow-sm"
                      }`}
                    >
                      <CardHeader className="pb-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base leading-snug">{p.label}</CardTitle>
                          {tag ? (
                            <Badge variant={tag === "En dengeli" ? "default" : "outline"} className="shrink-0 text-[10px]">
                              {tag}
                            </Badge>
                          ) : null}
                        </div>
                        <CardDescription className="text-xs leading-relaxed">{p.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto pt-0 space-y-3">
                        <div>
                          <p className="text-2xl font-bold tracking-tight">₺{p.totalPrice.toLocaleString("tr-TR")}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Yaklaşık ₺{perUnit.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / birim · KDV ve fatura kalemi ödeme adımında belli olur.
                          </p>
                        </div>
                        <Button
                          className="w-full min-h-11 text-base"
                          size="lg"
                          onClick={() => startTopup(p.code)}
                          disabled={payBusy !== null}
                          data-testid={`btn-topup-${p.code}`}
                        >
                          {payBusy === p.code ? "Bağlanıyor…" : "Ödemeye geç"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center sm:text-left px-1">
          Sorun yaşarsanız firma ayarlarındaki telefon ve VKN/TCKN alanlarını doğrulayın. Tekrar denemek için bu sayfaya dönebilirsiniz.
        </p>
      </div>
    </div>
  );
}
