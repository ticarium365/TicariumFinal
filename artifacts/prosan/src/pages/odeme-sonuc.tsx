/**
 * Dalga 22 — Ödeme sonuç callback sayfası.
 *
 * Iyzico (veya mock) provider checkout tamamlanınca buraya yönlendirir.
 * Query: ?conversation_id=<uuid>&simulate=success
 *   - simulate=success ve mock provider aktif → __simulate-success endpoint'ini
 *     çağır, başarılı ödemeyi tamamla, dashboard'a yönlendir.
 *   - Üretim Iyzico'da: bu sayfa sadece son durumu gösterir (webhook async tamamlanır).
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function OdemeSonucPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Ödeme doğrulanıyor...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversation_id");
    const simulate = params.get("simulate");

    if (!conversationId) {
      setState("error");
      setMessage("İşlem bilgisi bulunamadı.");
      return;
    }

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
      // Gerçek Iyzico akışı: webhook'tan async dönecek; status'ı oku.
      fetch("/api/billing/payments", { credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          const p = (j.payments || []).find((x: any) => x.conversationId === conversationId);
          if (!p) {
            setState("error");
            setMessage("Ödeme kaydı bulunamadı.");
          } else if (p.status === "succeeded") {
            setState("success");
            setMessage("Ödemeniz başarıyla alındı.");
            setTimeout(() => setLocation("/dashboard"), 2200);
          } else if (p.status === "failed") {
            setState("error");
            setMessage(p.errorMessage || "Ödeme başarısız.");
          } else {
            setState("loading");
            setMessage("Ödemeniz işleniyor, lütfen bekleyin...");
          }
        });
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
          {state !== "loading" && (
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setLocation("/paketler")}>Paketlere Dön</Button>
              {state === "success" && (
                <Button onClick={() => setLocation("/dashboard")} data-testid="button-go-dashboard">
                  Panele Git
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
