import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, Coins } from "lucide-react";

type CreditPack = {
  code: string;
  metric: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  label: string;
  description: string;
};

const METRIC_LABEL: Record<string, string> = {
  einvoice: "E-belge",
  ocr: "OCR",
  api_calls: "API",
  sms: "SMS",
};

function groupByMetric(packs: CreditPack[]): Record<string, CreditPack[]> {
  const g: Record<string, CreditPack[]> = {};
  for (const p of packs) {
    if (!g[p.metric]) g[p.metric] = [];
    g[p.metric].push(p);
  }
  return g;
}

export default function CreditTopupPage() {
  const { toast } = useToast();
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);
  const [identityTaxNumber, setIdentityTaxNumber] = useState("");
  const [identityPhone, setIdentityPhone] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [pendingPackCode, setPendingPackCode] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState<string | null>(null);

  const packsQ = useQuery<{ packs: CreditPack[] }>({
    queryKey: ["/api/billing/credit-packs"],
    queryFn: async () => {
      const r = await fetch("/api/billing/credit-packs", { credentials: "include" });
      if (!r.ok) throw new Error("packs");
      return r.json();
    },
    staleTime: 300_000,
  });

  const packs = packsQ.data?.packs ?? [];
  const grouped = groupByMetric(packs);

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
        toast({ title: "Ödeme sayfasına yönlendiriliyorsunuz", description: `${j.pack?.label ?? packCode} — ${j.amount} ${j.currency}` });
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
      toast({
        title: "Hata",
        description: j?.error?.message ?? j?.message ?? "İşlem başarısız",
        variant: "destructive",
      });
    } finally {
      setPayBusy(null);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <Dialog open={identityDialogOpen} onOpenChange={setIdentityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kontör ödemesi için firma bilgisi</DialogTitle>
            <DialogDescription>
              İyzico ödeme sayfası için VKN/TCKN ve Türkiye GSM numarası gerekir. Bilgiler firma ayarlarınıza kaydedilir.
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIdentityDialogOpen(false);
                setPendingPackCode(null);
              }}
              disabled={identitySaving}
            >
              Vazgeç
            </Button>
            <Button
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
          description="E-belge, OCR, API ve SMS limitlerinizi paketler halinde artırın. Ödeme güvenli ödeme sayfasında tamamlanır."
        />
      </div>

      {packsQ.isLoading && (
        <p className="text-sm text-muted-foreground">Paketler yükleniyor…</p>
      )}
      {packsQ.isError && (
        <p className="text-sm text-destructive">Kontör paketleri yüklenemedi.</p>
      )}

      <div className="space-y-8">
        {Object.entries(grouped).map(([metric, list]) => (
          <section key={metric}>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              {METRIC_LABEL[metric] ?? metric}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((p) => (
                <Card key={p.code} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{p.label}</CardTitle>
                    <CardDescription className="text-xs">{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <p className="text-2xl font-bold mb-1">₺{p.totalPrice.toLocaleString("tr-TR")}</p>
                    <p className="text-[11px] text-muted-foreground mb-3">Tutar paket fiyatıdır; resmi fatura kalemi ödeme adımında netleşir.</p>
                    <Button
                      className="w-full"
                      onClick={() => startTopup(p.code)}
                      disabled={payBusy !== null}
                      data-testid={`btn-topup-${p.code}`}
                    >
                      {payBusy === p.code ? "Başlatılıyor…" : "Satın al"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Sorun yaşarsanız firma profilinizdeki telefon ve VKN/TCKN alanlarını kontrol edin. Ödeme sonucu{" "}
        <Link href="/odeme/sonuc" className="text-primary underline">/odeme/sonuc</Link> sayfasında görüntülenir.
      </p>
    </div>
  );
}
