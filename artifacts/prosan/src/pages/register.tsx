import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { trackProductEvent } from "@/lib/product-analytics";
import { PublicNav } from "@/components/public-nav";
import { BrandLogo } from "@/components/brand-logo";
import {
  Building2, ShoppingCart, Loader2, CheckCircle2, ArrowRight, ArrowLeft,
  Sparkles, ShieldCheck, Mail, Smartphone,
} from "lucide-react";

type Mode = "select" | "business" | "buyer";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("select");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", password: "",
    companyName: "", city: "", district: "",
    verificationMethod: "email" as "email" | "sms",
    kvkkConsent: false,
  });

  const upd = (k: keyof typeof form, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const isBusiness = mode === "business";
  const title = isBusiness ? "İşletme Hesabı Oluştur" : "Satınalmacı Hesabı Oluştur";
  const subtitle = isBusiness
    ? "Deneme süresi ve kapsam hesap politikasına göredir; güncel koşullar için Paketler sayfasına bakın."
    : "Satınalma vitrinine erişim; tedarikçi keşfi paket ve yetkilere bağlıdır.";
  const endpoint = isBusiness ? "/api/auth/register/business" : "/api/auth/register/buyer";
  const successPath = isBusiness ? "/dashboard?welcome=1" : "/satinalma-merkezi?welcome=1";

  const canSubmit = useMemo(() => {
    return form.firstName.trim().length >= 2
      && form.lastName.trim().length >= 2
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      && form.password.length >= 8
      && form.companyName.trim().length >= 2
      && form.kvkkConsent
      && form.phone.replace(/\D/g, "").length >= 10;
  }, [form]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({
          title: "Kayıt başarısız",
          description: data?.error?.message || data?.message || "Bilgilerinizi kontrol edin.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      toast({
        title: "Hesabınız oluşturuldu",
        description: data?.message || "Yönlendiriliyorsunuz…",
      });
      trackProductEvent("signup_completed", { account: isBusiness ? "business" : "buyer" });
      // Doğrulama kodu zaten gönderildi; ana panele yönlendir, banner üstte uyaracak.
      setTimeout(() => window.location.replace(successPath), 600);
    } catch {
      toast({ title: "Bağlantı hatası", description: "Lütfen tekrar deneyin.", variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        background: "linear-gradient(180deg,#F8FAFF 0%, #EEF2FF 60%, #F1FBFB 100%)",
        color: "#0F172A",
      }}
    >
      <PublicNav />
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-3xl">
          <div className="flex justify-center mb-6 lg:hidden">
            <div className="flex items-center gap-3">
              <BrandLogo size={42} />
            </div>
          </div>

          {mode === "select" && (
            <div>
              <div className="text-center mb-8">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider mb-4"
                  style={{
                    background: "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(14,165,164,0.08))",
                    color: "#4F46E5",
                    border: "1px solid rgba(99,102,241,0.20)",
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  Hızlı Kayıt
                </span>
                <h1
                  className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Hangi hesap türünü <span style={{
                    background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}>oluşturmak</span> istersiniz?
                </h1>
                <p className="text-slate-600 mt-2">İhtiyacınıza en uygun seçeneği belirleyin.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <button
                  type="button"
                  onClick={() => setMode("business")}
                  data-testid="card-register-business"
                  className="text-left rounded-2xl p-6 transition-all hover:translate-y-[-2px] group"
                  style={{
                    background: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(99,102,241,0.15)",
                    backdropFilter: "blur(20px)",
                    boxShadow: "0 14px 40px -16px rgba(79,70,229,0.20)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg,#2563eb 0%,#0EA5A4 100%)",
                        boxShadow: "0 8px 24px -8px rgba(79,70,229,0.55)",
                      }}
                    >
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: "#DCFCE7", color: "#166534" }}
                    >
                      21 Gün Ücretsiz
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mb-1.5">İşletme Hesabı</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Stok, satış, e-fatura, raporlama ve daha fazlası. KOBİ'niz için tam sürüm.
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#4F46E5" }}>
                    Devam Et <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("buyer")}
                  data-testid="card-register-buyer"
                  className="text-left rounded-2xl p-6 transition-all hover:translate-y-[-2px] group"
                  style={{
                    background: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(14,165,164,0.18)",
                    backdropFilter: "blur(20px)",
                    boxShadow: "0 14px 40px -16px rgba(14,165,164,0.20)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg,#0EA5A4 0%,#22D3EE 100%)",
                        boxShadow: "0 8px 24px -8px rgba(14,165,164,0.55)",
                      }}
                    >
                      <ShoppingCart className="w-6 h-6 text-white" />
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: "#E0F2FE", color: "#075985" }}
                    >
                      B2B Satınalma
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mb-1.5">Satınalmacı Portalı</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Tedarikçi keşfedin, teklif isteyin, B2B satınalma süreçlerinizi tek panelden yönetin.
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#0EA5A4" }}>
                    Devam Et <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>

              <p className="text-center text-sm text-slate-500 mt-8">
                Hesabınız var mı?{" "}
                <a href="/login" className="font-semibold hover:underline" style={{
                  background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}>
                  Giriş yapın
                </a>
              </p>
            </div>
          )}

          {(mode === "business" || mode === "buyer") && (
            <div
              className="rounded-2xl p-6 md:p-8"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(99,102,241,0.18)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 18px 50px -16px rgba(79,70,229,0.18)",
              }}
            >
              <button
                type="button"
                onClick={() => setMode("select")}
                className="text-sm flex items-center gap-1.5 text-slate-500 hover:text-slate-700 mb-4"
                data-testid="btn-back-select"
              >
                <ArrowLeft className="w-4 h-4" /> Geri dön
              </button>

              <div className="mb-5">
                <h2
                  className="text-2xl md:text-3xl font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {title}
                </h2>
                <p className="text-sm text-slate-600 mt-1.5">{subtitle}</p>
              </div>

              <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Ad</Label>
                  <Input id="firstName" data-testid="input-firstName" value={form.firstName}
                    onChange={(e) => upd("firstName", e.target.value)} required autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Soyad</Label>
                  <Input id="lastName" data-testid="input-lastName" value={form.lastName}
                    onChange={(e) => upd("lastName", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input id="phone" type="tel" placeholder="5XX XXX XX XX" data-testid="input-phone"
                    value={form.phone} onChange={(e) => upd("phone", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-posta</Label>
                  <Input id="email" type="email" data-testid="input-email" value={form.email}
                    onChange={(e) => upd("email", e.target.value)} required />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="password">Şifre <span className="text-xs text-slate-500">(en az 8 karakter)</span></Label>
                  <Input id="password" type="password" data-testid="input-password"
                    value={form.password} onChange={(e) => upd("password", e.target.value)} required minLength={8} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="companyName">{isBusiness ? "Şirket Adı" : "Firma Adı"}</Label>
                  <Input id="companyName" data-testid="input-companyName" value={form.companyName}
                    onChange={(e) => upd("companyName", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">İl</Label>
                  <Input id="city" data-testid="input-city" value={form.city}
                    onChange={(e) => upd("city", e.target.value)} placeholder="Örn. İstanbul" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="district">İlçe</Label>
                  <Input id="district" data-testid="input-district" value={form.district}
                    onChange={(e) => upd("district", e.target.value)} placeholder="Örn. Kadıköy" />
                </div>

                <div className="md:col-span-2 mt-1">
                  <Label className="text-sm">Doğrulama yöntemi</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {([
                      { v: "email", icon: Mail, label: "E-posta ile" },
                      { v: "sms", icon: Smartphone, label: "SMS ile" },
                    ] as const).map(({ v, icon: Icon, label }) => {
                      const active = form.verificationMethod === v;
                      return (
                        <button
                          type="button"
                          key={v}
                          onClick={() => upd("verificationMethod", v)}
                          data-testid={`verify-method-${v}`}
                          className="flex items-center gap-2 justify-center px-3 py-2.5 rounded-lg border text-sm font-medium transition-all"
                          style={{
                            background: active
                              ? "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(14,165,164,0.08))"
                              : "white",
                            borderColor: active ? "#6366F1" : "rgba(99,102,241,0.18)",
                            color: active ? "#4F46E5" : "#475569",
                          }}
                        >
                          <Icon className="w-4 h-4" /> {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="md:col-span-2 flex items-start gap-2 text-xs text-slate-600 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.kvkkConsent}
                    onChange={(e) => upd("kvkkConsent", e.target.checked)}
                    data-testid="checkbox-kvkk"
                    className="mt-0.5"
                  />
                  <span>
                    <a href="/kvkk" target="_blank" className="underline hover:text-blue-700">KVKK Aydınlatma Metni</a>'ni
                    okudum, kişisel verilerimin işlenmesini kabul ediyorum.
                  </span>
                </label>

                <Button
                  type="submit"
                  data-testid="btn-submit-register"
                  disabled={!canSubmit || submitting}
                  className="md:col-span-2 h-11 text-base font-semibold mt-2"
                  style={{
                    background: "linear-gradient(135deg,#2563eb 0%,#5E5CE6 50%,#0EA5A4 100%)",
                    color: "white",
                    border: 0,
                    boxShadow: "0 8px 24px -8px rgba(79,70,229,0.55)",
                  }}
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Hesabınız oluşturuluyor…</>
                  ) : (
                    <><CheckCircle2 className="mr-2 w-4 h-4" /> {isBusiness ? "21 Günlük Ücretsiz Hesabımı Aç" : "Satınalmacı Hesabı Oluştur"}</>
                  )}
                </Button>
              </form>

              {isBusiness && (
                <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  KVKK uyumlu • Kart bilgisi gerekmez • Dilediğiniz zaman iptal edebilirsiniz.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
