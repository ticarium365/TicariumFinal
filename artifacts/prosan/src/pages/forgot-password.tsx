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

const NAVY = "hsl(222 47% 15%)";
const NAVY_2 = "hsl(222 47% 22%)";
const EMERALD = "hsl(152 76% 45%)";
const SOFT_BLUE = "hsl(221 83% 53%)";

type Step = "phone" | "code" | "newPassword" | "done";

function BrandLogo({ onDark = false }: { onDark?: boolean }) {
  return (
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg border backdrop-blur-md"
      style={{
        background: onDark ? "rgba(255,255,255,0.10)" : NAVY,
        color: "#fff",
        fontFamily: "var(--font-display)",
        borderColor: onDark ? "rgba(255,255,255,0.20)" : "transparent",
      }}
    >
      <span className="font-bold text-2xl leading-none">
        T<span style={{ color: EMERALD }}>3</span>
        <span className="text-[0.55em] align-top ml-0.5 opacity-90">65</span>
      </span>
    </div>
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
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-[11px] font-medium ${
                  done || active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-1.25rem] transition-colors ${
                  done ? "bg-emerald-500" : "bg-muted"
                }`}
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

  // Telefon görsel formatı: 5xx xxx xx xx
  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  };
  const phoneDigits = phone.replace(/\D/g, "");

  // ADIM 1: telefon → SMS gönder
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

  // ADIM 2: SMS kodu doğrula
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

  // ADIM 3: Yeni şifre belirle
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

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <PublicNav />

      <div className="flex-1 w-full flex">
        {/* Sol panel — marka */}
        <div
          className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_2} 100%)` }}
        >
          <div
            className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full blur-3xl pointer-events-none"
            style={{ background: `${EMERALD}26` }}
          />
          <div
            className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full blur-3xl pointer-events-none"
            style={{ background: `${SOFT_BLUE}26` }}
          />

          <div className="relative z-10 flex items-center gap-3">
            <BrandLogo onDark />
            <div className="leading-tight">
              <div
                className="font-bold text-2xl tracking-tight text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Ticarium<span style={{ color: EMERALD }}>365</span>
              </div>
              <div className="text-[13px] mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
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
              <span style={{ color: EMERALD }}>3 adımda</span> sıfırlayın.
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
                    style={{ background: `${EMERALD}33`, color: EMERALD }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-white/85 text-sm leading-relaxed pt-0.5">{t}</p>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-2 p-4 rounded-lg bg-white/5 border border-white/10">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" style={{ color: EMERALD }} />
              <p className="text-xs leading-relaxed text-white/75">
                Güvenliğiniz için doğrulama kodu yalnızca 10 dakika geçerlidir ve tek seferlik
                kullanılır. Kodu kimseyle paylaşmayın.
              </p>
            </div>
          </div>

          <p className="relative z-10 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
            © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır
          </p>
        </div>

        {/* Sağ panel — form */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-8">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex justify-center mb-6">
              <BrandLogo />
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-xl shadow-blue-500/5 p-7 md:p-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Giriş ekranına dön
              </Link>

              <div className="mb-6">
                <h2
                  className="text-2xl font-bold tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Şifremi Unuttum
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Telefon numaranızla hesabınıza yeniden erişin.
                </p>
              </div>

              {step !== "done" && <StepIndicator step={step} />}

              {/* ADIM 1: telefon */}
              {step === "phone" && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Kayıtlı telefon numaranız</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                        +90
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="5xx xxx xx xx"
                        className="pl-[3.75rem] h-11"
                        value={formatPhone(phone)}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={submitting}
                        autoFocus
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Başında sıfır olmadan 10 haneli numaranızı yazın.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 mt-2 text-base font-semibold"
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

              {/* ADIM 2: kod */}
              {step === "code" && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
                    <strong className="text-foreground">+90 {formatPhone(phone)}</strong> numarasına gönderilen
                    6 haneli kodu girin. <br />
                    SMS birkaç saniye içinde ulaşır; gelmediyse spam klasörünüzü kontrol edin.
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="code">Doğrulama kodu</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="000000"
                        className="pl-9 h-12 text-2xl tracking-[0.5em] text-center font-mono font-semibold"
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
                    className="w-full h-11 mt-2 text-base font-semibold"
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
                    className="block mx-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Telefon numarasını değiştir
                  </button>
                </form>
              )}

              {/* ADIM 3: yeni şifre */}
              {step === "newPassword" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword">Yeni şifreniz</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        name="new-password"
                        type={showPwd ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="En az 8 karakter"
                        className="pl-9 pr-10 h-11"
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        aria-label={showPwd ? "Şifreyi gizle" : "Şifreyi göster"}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword2">Yeni şifrenizi tekrar girin</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="newPassword2"
                        name="new-password-confirm"
                        type={showPwd ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Aynı şifreyi tekrar yazın"
                        className="pl-9 h-11"
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        disabled={submitting}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 mt-2 text-base font-semibold"
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

              {/* ADIM 4: tamamlandı */}
              {step === "done" && (
                <div className="text-center py-4">
                  <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground">Şifreniz güncellendi</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Yeni şifrenizle giriş yapabilirsiniz. Güvenliğiniz için bu cihaz dışındaki
                    diğer oturumlarınızı kapatmanızı öneririz.
                  </p>
                  <Button
                    onClick={() => setLocation("/login")}
                    className="w-full h-11 mt-5 text-base font-semibold"
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
