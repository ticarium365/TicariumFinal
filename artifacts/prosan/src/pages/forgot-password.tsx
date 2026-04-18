import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PublicNav } from "@/components/public-nav";
import {
  Loader2, Phone, KeyRound, Lock, ArrowLeft, ArrowRight,
  CheckCircle2, Eye, EyeOff, ShieldCheck,
} from "lucide-react";

type Step = "phone" | "code" | "newPassword" | "done";

function BrandIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <defs>
        <linearGradient id="t365grad-fp" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#t365grad-fp)" />
      <path d="M11 14 H37 V20 H27 V36 H21 V20 H11 Z" fill="white" />
      <rect x="28" y="30" width="15" height="9" rx="2.5" fill="white" />
      <text
        x="35.5"
        y="36.7"
        textAnchor="middle"
        fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
        fontWeight={800}
        fontSize={6.4}
        fill="#1D4ED8"
        letterSpacing="0.2"
      >
        365
      </text>
    </svg>
  );
}

function BrandWordmark({ light = false }: { light?: boolean }) {
  return (
    <span
      className="font-bold text-2xl tracking-tight leading-none"
      style={{
        fontFamily: "var(--font-display)",
        color: light ? "#FFFFFF" : "#0F172A",
      }}
    >
      Ticarium
      <span style={{ color: light ? "#BFDBFE" : "#2563EB" }}>365</span>
    </span>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "phone", label: "Telefon" },
    { key: "code", label: "Doğrulama" },
    { key: "newPassword", label: "Yeni şifre" },
  ];
  const currentIdx = step === "done" ? 2 : steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx || step === "done";
        const bg = done ? "#2563EB" : active ? "#2563EB" : "#E2E8F0";
        const fg = done || active ? "#FFFFFF" : "#64748B";
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                style={{
                  background: bg,
                  color: fg,
                  boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.15)" : "none",
                }}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className="text-[11px] font-medium"
                style={{ color: done || active ? "#0F172A" : "#94A3B8" }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-2 mt-[-1.25rem] transition-colors"
                style={{ background: done ? "#2563EB" : "#E2E8F0" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ForgotPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  };
  const phoneDigits = phone.replace(/\D/g, "");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneDigits.length !== 10) {
      toast({
        title: "Telefon eksik",
        description: "Başında sıfır olmadan 10 haneli telefon numarası girin.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "İstek gönderilemedi");
      toast({
        title: "Kod gönderildi",
        description: data.message || "Doğrulama kodunuz SMS olarak gönderildi.",
      });
      setStep("code");
    } catch (err: any) {
      toast({
        title: "İstek başarısız",
        description: err?.message || "Lütfen tekrar deneyin.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast({ title: "Geçersiz kod", description: "6 haneli sayısal kodu girin.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "Kod doğrulanamadı");
      setResetToken(data.resetToken);
      setStep("newPassword");
    } catch (err: any) {
      toast({
        title: "Doğrulama başarısız",
        description: err?.message || "Kodu kontrol edip tekrar deneyin.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({
        title: "Şifre çok kısa",
        description: "Yeni şifre en az 8 karakter olmalıdır.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== newPassword2) {
      toast({
        title: "Şifreler eşleşmiyor",
        description: "İki şifre alanı aynı olmalıdır.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, resetToken, newPassword }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "Şifre güncellenemedi");
      setStep("done");
    } catch (err: any) {
      toast({
        title: "Şifre değiştirilemedi",
        description: err?.message || "Lütfen tekrar deneyin.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: "#FFFFFF",
    borderColor: "#CBD5E1",
    color: "#0F172A",
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "#F8FAFC", color: "#0F172A" }}
    >
      <PublicNav />

      <div className="flex-1 w-full flex">
        {/* Sol panel — açık mavi gradyan */}
        <div
          className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(140deg, #1E3A8A 0%, #1D4ED8 45%, #2563EB 100%)",
          }}
        >
          <div
            className="absolute -top-40 -right-32 w-[28rem] h-[28rem] rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(147,197,253,0.35)" }}
          />
          <div
            className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(96,165,250,0.30)" }}
          />

          <div className="relative z-10 flex items-center gap-3">
            <BrandIcon size={52} />
            <div className="leading-tight">
              <BrandWordmark light />
              <div className="text-[13px] mt-1 text-blue-100/85">
                Hesabınızı güvenle geri alın
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-6">
            <h2
              className="text-3xl font-semibold text-white leading-snug"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Şifrenizi unuttuysanız <br />
              <span className="text-white/95 underline decoration-blue-300/60 decoration-4 underline-offset-4">
                3 adımda
              </span>{" "}
              sıfırlayın.
            </h2>
            <ul className="space-y-3">
              {[
                "Telefon numaranızı girin",
                "SMS ile gelen 6 haneli kodu doğrulayın",
                "Yeni şifrenizi belirleyin ve giriş yapın",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{ background: "rgba(255,255,255,0.20)", color: "#FFFFFF" }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed pt-0.5">{t}</p>
                </li>
              ))}
            </ul>

            <div
              className="flex items-start gap-2 p-4 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-white" />
              <p className="text-xs leading-relaxed text-white/85">
                Güvenliğiniz için doğrulama kodu yalnızca 10 dakika geçerlidir ve tek seferlik
                kullanılır. Kodu kimseyle paylaşmayın.
              </p>
            </div>
          </div>

          <p className="relative z-10 text-xs text-blue-200/70">
            © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır
          </p>
        </div>

        {/* Sağ panel — beyaz */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-8">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex justify-center mb-6">
              <div className="flex items-center gap-3">
                <BrandIcon size={44} />
                <BrandWordmark />
              </div>
            </div>

            <div
              className="rounded-2xl p-7 md:p-8"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -8px rgba(37,99,235,0.12)",
              }}
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium mb-4"
                style={{ color: "#64748B" }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Giriş ekranına dön
              </Link>

              <div className="mb-6">
                <h2
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: "#0F172A", fontFamily: "var(--font-display)" }}
                >
                  Şifremi Unuttum
                </h2>
                <p className="text-sm mt-1" style={{ color: "#64748B" }}>
                  Telefon numaranızla hesabınıza yeniden erişin.
                </p>
              </div>

              {step !== "done" && <StepIndicator step={step} />}

              {/* ADIM 1 */}
              {step === "phone" && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" style={{ color: "#334155" }}>
                      Kayıtlı telefon numaranız
                    </Label>
                    <div className="relative">
                      <Phone
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: "#94A3B8" }}
                      />
                      <span
                        className="absolute left-9 top-1/2 -translate-y-1/2 text-sm select-none"
                        style={{ color: "#64748B" }}
                      >
                        +90
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="5xx xxx xx xx"
                        className="pl-[3.75rem] h-11"
                        style={inputStyle}
                        value={formatPhone(phone)}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={submitting}
                        autoFocus
                        required
                      />
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>
                      Başında sıfır olmadan 10 haneli numaranızı yazın.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 mt-2 text-base font-semibold border-0"
                    style={{ background: "#2563EB", color: "#FFFFFF" }}
                    disabled={submitting || phoneDigits.length !== 10}
                    data-testid="btn-send-code"
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Kod gönderiliyor…</>
                    ) : (
                      <>Doğrulama Kodu Gönder<ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                  </Button>
                </form>
              )}

              {/* ADIM 2 */}
              {step === "code" && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div
                    className="rounded-lg p-3 text-xs"
                    style={{
                      background: "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      color: "#475569",
                    }}
                  >
                    <strong style={{ color: "#0F172A" }}>+90 {formatPhone(phone)}</strong>{" "}
                    numarasına gönderilen 6 haneli kodu girin.<br />
                    SMS birkaç saniye içinde ulaşır; gelmediyse kısa süre bekleyip tekrar
                    deneyebilirsiniz.
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="code" style={{ color: "#334155" }}>
                      Doğrulama kodu
                    </Label>
                    <div className="relative">
                      <KeyRound
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: "#94A3B8" }}
                      />
                      <Input
                        id="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="000000"
                        className="pl-9 h-12 text-2xl tracking-[0.5em] text-center font-mono font-semibold"
                        style={inputStyle}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        disabled={submitting}
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 mt-2 text-base font-semibold border-0"
                    style={{ background: "#2563EB", color: "#FFFFFF" }}
                    disabled={submitting || code.length !== 6}
                    data-testid="btn-verify-code"
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Doğrulanıyor…</>
                    ) : (
                      <>Kodu Doğrula<ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => setStep("phone")}
                    className="block mx-auto text-xs hover:underline"
                    style={{ color: "#64748B" }}
                  >
                    Telefon numarasını değiştir
                  </button>
                </form>
              )}

              {/* ADIM 3 */}
              {step === "newPassword" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword" style={{ color: "#334155" }}>
                      Yeni şifreniz
                    </Label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: "#94A3B8" }}
                      />
                      <Input
                        id="newPassword"
                        name="new-password"
                        type={showPwd ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="En az 8 karakter"
                        className="pl-9 pr-10 h-11"
                        style={inputStyle}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={submitting}
                        autoFocus
                        required
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPwd((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md"
                        style={{ color: "#64748B" }}
                        aria-label={showPwd ? "Şifreyi gizle" : "Şifreyi göster"}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword2" style={{ color: "#334155" }}>
                      Yeni şifrenizi tekrar girin
                    </Label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: "#94A3B8" }}
                      />
                      <Input
                        id="newPassword2"
                        name="new-password-confirm"
                        type={showPwd ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Aynı şifreyi tekrar yazın"
                        className="pl-9 h-11"
                        style={inputStyle}
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        disabled={submitting}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 mt-2 text-base font-semibold border-0"
                    style={{ background: "#2563EB", color: "#FFFFFF" }}
                    disabled={submitting || newPassword.length < 8 || newPassword !== newPassword2}
                    data-testid="btn-reset-password"
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Güncelleniyor…</>
                    ) : (
                      "Şifremi Güncelle"
                    )}
                  </Button>
                </form>
              )}

              {/* ADIM 4 — tamamlandı */}
              {step === "done" && (
                <div className="text-center py-4">
                  <div
                    className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4"
                    style={{ background: "#DBEAFE" }}
                  >
                    <CheckCircle2 className="h-8 w-8" style={{ color: "#2563EB" }} />
                  </div>
                  <h3
                    className="font-semibold text-lg"
                    style={{ color: "#0F172A" }}
                  >
                    Şifreniz güncellendi
                  </h3>
                  <p
                    className="text-sm mt-1.5 leading-relaxed"
                    style={{ color: "#64748B" }}
                  >
                    Yeni şifrenizle giriş yapabilirsiniz. Güvenliğiniz için bu cihaz dışındaki
                    diğer oturumlarınızı kapatmanızı öneririz.
                  </p>
                  <Button
                    onClick={() => setLocation("/login")}
                    className="w-full h-11 mt-5 text-base font-semibold border-0"
                    style={{ background: "#2563EB", color: "#FFFFFF" }}
                    data-testid="btn-go-login"
                  >
                    Giriş Ekranına Dön
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
