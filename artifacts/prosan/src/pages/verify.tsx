import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-context";
import { Loader2, CheckCircle2, Mail, Smartphone, RefreshCw } from "lucide-react";

export default function VerifyPage() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => () => { if (cooldownTimer.current) window.clearInterval(cooldownTimer.current); }, []);

  const startCooldown = (sec: number) => {
    setResendCooldown(sec);
    cooldownTimer.current = window.setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { if (cooldownTimer.current) window.clearInterval(cooldownTimer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Gönderilemedi", description: data?.error?.message || "Lütfen tekrar deneyin", variant: "destructive" });
      } else {
        toast({ title: "Kod gönderildi", description: `${data?.channel === "sms" ? "Telefonunuza" : "E-postanıza"} 6 haneli kod gönderildi.` });
        startCooldown(60);
      }
    } finally { setBusy(false); }
  };

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ code }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Doğrulama hatası", description: data?.error?.message || "Kod hatalı", variant: "destructive" });
      } else {
        setDone(true);
        toast({ title: "Hesabınız doğrulandı", description: "Yönlendiriliyorsunuz…" });
        // accountType'a göre yönlendir — Sprint I HomeRedirect davranışıyla uyumlu.
        const dest = user?.accountType === "purchasing" ? "/satinalma-merkezi" : "/dashboard";
        setTimeout(() => window.location.replace(dest), 1200);
      }
    } finally { setBusy(false); }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Doğrulama için giriş yapmış olmanız gerekiyor.
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(180deg,#F8FAFF 0%, #EEF2FF 60%, #F1FBFB 100%)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(99,102,241,0.18)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 18px 50px -16px rgba(79,70,229,0.18)",
        }}
      >
        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-3 text-emerald-500" />
            <h2 className="text-xl font-bold mb-1">Doğrulandı</h2>
            <p className="text-sm text-slate-600">Hesabınız başarıyla onaylandı.</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#2563eb 0%,#0EA5A4 100%)" }}
              >
                <Mail className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Hesabınızı doğrulayın</h1>
              <p className="text-sm text-slate-600 mt-1.5">
                Size gönderilen 6 haneli kodu girin. Henüz almadıysanız "Yeniden gönder" düğmesini kullanın.
              </p>
            </div>

            <form onSubmit={check} className="space-y-4">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="• • • • • •"
                className="text-center text-2xl font-bold tracking-[0.5em] h-14"
                data-testid="input-verify-code"
                maxLength={6}
                autoFocus
              />
              <Button
                type="submit"
                disabled={busy || code.length !== 6}
                data-testid="btn-verify-check"
                className="w-full h-11 font-semibold"
                style={{
                  background: "linear-gradient(135deg,#2563eb 0%,#0EA5A4 100%)",
                  color: "white", border: 0,
                }}
              >
                {busy ? <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Doğrulanıyor…</> : "Doğrula"}
              </Button>
            </form>

            <div className="mt-5 pt-5 text-center" style={{ borderTop: "1px solid rgba(99,102,241,0.10)" }}>
              <button
                type="button"
                onClick={send}
                disabled={busy || resendCooldown > 0}
                data-testid="btn-verify-resend"
                className="text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:underline"
                style={{ color: "#4F46E5" }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {resendCooldown > 0 ? `Yeniden gönder (${resendCooldown}s)` : "Yeniden gönder"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
