/**
 * Dalga 22 — Ödeme sonuç callback sayfası.
 *
 * Iyzico (veya mock) provider checkout tamamlanınca buraya yönlendirir.
 * Query: ?conversation_id=<uuid>&simulate=success
 *   - simulate=success ve mock provider aktif → __simulate-success endpoint'ini
 *     çağır, başarılı ödemeyi tamamla, dashboard'a yönlendir.
 *   - Üretim Iyzico'da: bu sayfa sadece son durumu gösterir (webhook async tamamlanır).
 */
import { useEffect, useState, useRef } from "react";
import { trackProductEvent } from "@/lib/product-analytics";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, RefreshCcw, LifeBuoy } from "lucide-react";

export default function OdemeSonucPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Ödeme doğrulanıyor...");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const outcomeTracked = useRef(false);

  useEffect(() => {
    if (state !== "success" && state !== "error") return;
    if (outcomeTracked.current) return;
    outcomeTracked.current = true;
    if (state === "success") trackProductEvent("billing_return_success", {});
    else trackProductEvent("billing_return_error", {});
  }, [state]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversation_id");
    const simulate = params.get("simulate");
    const returnStatus = params.get("return_status");
    const returnCode = params.get("return_code");

    if (returnStatus && returnStatus !== "200") {
      if (conversationId) setConversationId(conversationId);
      setState("error");
      const code = returnCode || "UNKNOWN";
      const hints: Record<string, string> = {
        MISSING_TOKEN: "Ödeme doğrulama bilgisi eksik. Lütfen paket seçiminden yeniden deneyin.",
        RETRIEVE_FAILED: "Banka/iyzico yanıtı okunamadı. Birkaç dakika sonra tekrar deneyin.",
        INVALID_SIGNATURE: "Ödeme doğrulaması başarısız. Destek ekibine iletin.",
        PAYMENT_NOT_FOUND: "Ödeme kaydı bulunamadı. Oturumunuz doğru şirkette mi kontrol edin.",
        PROVIDER_INIT_FAILED: "Ödeme başlatılamadı. Ayarlarınızı kontrol edip tekrar deneyin.",
      };
      setMessage(hints[code] || `Ödeme tamamlanamadı (${code}).`);
      trackProductEvent("billing_return_redirect_error", { return_status: returnStatus, return_code: code });
      return;
    }

    if (!conversationId) {
      setState("error");
      setMessage("İşlem bilgisi bulunamadı.");
      return;
    }
    setConversationId(conversationId);

    if (simulate === "success") {
      // Mock akış: simulate-success endpoint'ini çağır
      fetch("/api/billing/__simulate-success", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (ok) {
            setState("success");
            setMessage("Ödemeniz başarıyla alındı. Aboneliğiniz aktive edildi.");
            setTimeout(() => setLocation("/dashboard"), 2200);
          } else {
            setState("error");
            setMessage(j?.error?.message ?? "Ödeme doğrulanamadı.");
          }
        })
        .catch((err) => {
          setState("error");
          setMessage(err?.message ?? "Ağ hatası");
        });
    } else if (simulate === "fail") {
      setState("error");
      setMessage("Ödeme reddedildi. Lütfen tekrar deneyin veya farklı bir kart kullanın.");
    } else {
      // Gerçek Iyzico akışı: ödeme /return ile işlense bile UI'da güvenli polling yap.
      let cancelled = false;
      const startedAt = Date.now();
      trackProductEvent("billing_result_poll_started", { conversation_id: conversationId });

      const poll = async (attempt: number) => {
        if (cancelled) return;
        try {
          const r = await fetch("/api/billing/payments", { credentials: "include" });
          const j = await r.json();
          const p = (j.payments || []).find((x: any) => x.conversationId === conversationId);
          if (!p) {
            setLastStatus("not_found");
            // ödeme kaydı geç düşebilir; timeout'a kadar bekle
          } else {
            setLastStatus(p.status || null);
            if (p.status === "succeeded") {
              setState("success");
              setMessage("Ödemeniz başarıyla alındı. Aboneliğiniz aktive edildi.");
              setTimeout(() => setLocation("/dashboard"), 2200);
              return;
            }
            if (p.status === "failed") {
              setState("error");
              setMessage(p.errorMessage || "Ödeme başarısız.");
              return;
            }
            setState("loading");
            setMessage("Ödemeniz işleniyor. Bu işlem bazı bankalarda birkaç saniye sürebilir...");
          }
        } catch (err: any) {
          setLastStatus("network_error");
          setState("loading");
          setMessage(err?.message ? `Bağlantı sorunu: ${err.message}` : "Bağlantı sorunu yaşandı, tekrar deniyoruz...");
        }

        if (Date.now() - startedAt > 35_000) {
          setState("error");
          setMessage("Ödeme sonucunu henüz doğrulayamadık. Banka/iyzico tarafında işlem devam ediyor olabilir. Biraz sonra tekrar deneyin.");
          trackProductEvent("billing_result_timeout", { conversation_id: conversationId });
          return;
        }

        const nextDelay = attempt < 4 ? 2000 : 5000;
        window.setTimeout(() => poll(attempt + 1), nextDelay);
      };

      poll(0);
      return () => { cancelled = true; };
    }
  }, [setLocation]);

  return (
    <div className="container mx-auto px-4 py-20 max-w-md">
      <Card>
        <CardContent className="pt-10 pb-8 text-center">
          {state === "loading" && <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-primary" />}
          {state === "success" && <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />}
          {state === "error" && <XCircle className="w-16 h-16 mx-auto mb-4 text-destructive" />}
          <h1 className="text-2xl font-bold mb-2">
            {state === "loading" && "İşleniyor"}
            {state === "success" && "Ödeme Başarılı"}
            {state === "error" && "İşlem Tamamlanamadı"}
          </h1>
          <p className="text-muted-foreground mb-6" data-testid="text-payment-message">{message}</p>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Güvenli ödeme altyapısı — kart bilgileri Ticarium365 sunucularına gelmez.</span>
          </div>

          {state === "loading" && (
            <div className="mt-6 flex flex-col gap-2 items-center">
              <div className="text-xs text-muted-foreground">
                {conversationId ? `İşlem kodu: ${conversationId}` : null}
                {lastStatus ? ` • Durum: ${lastStatus}` : null}
              </div>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Durumu yenile
              </Button>
            </div>
          )}

          {state !== "loading" && (
            <div className="flex flex-col gap-3 items-center">
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setLocation("/paketler")}>Paketlere Dön</Button>
                {state === "success" && (
                  <Button onClick={() => setLocation("/dashboard")} data-testid="button-go-dashboard">
                    Panele Git
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <LifeBuoy className="h-4 w-4" />
                <span>Devam eden bir sorun varsa: Paketi tekrar deneyin veya farklı kartla yeniden deneyin.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
