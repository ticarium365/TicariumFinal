import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { trackProductEvent } from "@/lib/product-analytics";
import { BrandLogo } from "@/components/brand-logo";
import { AuthShell } from "@/components/auth-shell";
import {
  Building2, ShoppingCart, Loader2, CheckCircle2, ArrowRight, ArrowLeft,
  Sparkles, ShieldCheck, Mail, Smartphone, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "select" | "business" | "buyer";

type PlanRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
};

export default function RegisterPage() {
  const [mode, setMode] = useState<Mode>("select");
  const [bizStep, setBizStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    companyName: "",
    city: "",
    district: "",
    verificationMethod: "email" as "email" | "sms",
    kvkkConsent: false,
  });

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);

  const upd = (k: keyof typeof form, v: string | boolean) => setForm((s) => ({ ...s, [k]: v }));

  const isBusiness = mode === "business";
  const title =
    mode === "select"
      ? ""
      : isBusiness
        ? bizStep === 1
          ? "Şirket bilgileri"
          : bizStep === 2
            ? "Kullanıcı bilgileri"
            : "Paket seçimi"
        : "Satınalma hesabı";
  const subtitle = isBusiness
    ? bizStep === 1
      ? "Adım 1 / 3 — İşletmenizi tanıyalım"
      : bizStep === 2
        ? "Adım 2 / 3 — Yönetici hesabınız"
        : "Adım 3 / 3 — Deneme sonrası hedef paketiniz"
    : "Adım kayıt — teklif ve tedarikçi akışına başlayın";

  const endpoint = isBusiness ? "/api/auth/register/business" : "/api/auth/register/buyer";
  const successPath = isBusiness ? "/dashboard?welcome=1" : "/satinalma-merkezi?welcome=1";

  const canStep1 = form.companyName.trim().length >= 2 && form.city.trim().length >= 2;
  const canStep2 = useMemo(() => {
    return (
      form.firstName.trim().length >= 2 &&
      form.lastName.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
      form.password.length >= 8 &&
      form.companyName.trim().length >= 2 &&
      form.kvkkConsent &&
      form.phone.replace(/\D/g, "").length >= 10
    );
  }, [form]);

  useEffect(() => {
    if (!isBusiness || bizStep !== 3) return;
    let cancelled = false;
    setPlansLoading(true);
    fetch("/api/subscriptions/plans")
      .then((r) => r.json())
      .then((data: { plans?: PlanRow[] }) => {
        if (cancelled) return;
        const list = data?.plans ?? [];
        setPlans(list);
        if (list.length && selectedPlanId === null) setSelectedPlanId(list[0]!.id);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBusiness, bizStep]);

  useEffect(() => {
    if (plans.length && selectedPlanId === null) setSelectedPlanId(plans[0]!.id);
  }, [plans, selectedPlanId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusiness && bizStep < 3) return;
    if (!canStep2 || submitting) return;
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
          title: "Kayıt tamamlanamadı",
          description: data?.error?.message || data?.message || "Lütfen alanları kontrol edin.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      const picked = plans.find((p) => p.id === selectedPlanId);
      if (picked) {
        trackProductEvent("signup_plan_interest", { plan_slug: picked.slug, plan_id: picked.id });
      }
      toast({
        title: "Hesabınız oluşturuldu",
        description: data?.message || "Yönlendiriliyorsunuz…",
      });
      trackProductEvent("signup_completed", { account: isBusiness ? "business" : "buyer" });
      setTimeout(() => window.location.replace(successPath), 600);
    } catch {
      toast({
        title: "Bağlantı kurulamadı",
        description: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const shellMax =
    mode === "select" ? "max-w-3xl" : isBusiness && bizStep === 1 ? "max-w-[400px]" : "max-w-lg";

  return (
    <AuthShell maxWidthClassName={shellMax}>
      <div className="mx-auto w-full">
        {mode !== "select" && (
          <div className="flex justify-center mb-6 lg:hidden">
            <BrandLogo size={42} />
          </div>
        )}

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
                2 dakikalık başlangıç
              </span>
              <h1
                className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Önce ne yapmak istediğinizi{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  seçelim
                </span>
              </h1>
              <p className="text-slate-600 mt-2">Yanlış seçerseniz sorun değil; sonradan düzenlenebilir.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <button
                type="button"
                onClick={() => {
                  setMode("business");
                  setBizStep(1);
                }}
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
                    İşletme yönetimi
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-1.5">Satış yapan işletmeyim</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Stok, satış, e-belge ve pazaryeri için işletme hesabı.
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
                <h3 className="text-xl font-bold mb-1.5">Satınalma yapıyorum</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Tedarikçi ve teklif süreçleri için satınalma hesabı.
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#0EA5A4" }}>
                  Devam Et <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>

            <p className="text-center text-sm text-slate-500 mt-8">
              Hesabınız var mı?{" "}
              <a href="/login" className="font-semibold hover:underline" style={{ color: "#4F46E5" }}>
                Giriş yapın
              </a>
            </p>
          </div>
        )}

        {mode === "buyer" && (
          <div
            className="rounded-2xl p-6 md:p-8 mx-auto max-w-[400px]"
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(14,165,164,0.18)",
              boxShadow: "0 18px 50px -16px rgba(14,165,164,0.18)",
            }}
          >
            <button
              type="button"
              onClick={() => setMode("select")}
              className="text-sm flex items-center gap-1.5 text-slate-500 hover:text-slate-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Geri
            </button>
            <p className="text-xs font-medium text-slate-500 mb-1">Kayıt — satınalma</p>
            <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ fontFamily: "var(--font-display)" }}>
              Hesabınızı açalım
            </h2>
            <p className="text-sm text-slate-600 mb-6">{subtitle}</p>

            <form onSubmit={submit} className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Ad</Label>
                <Input
                  id="firstName"
                  data-testid="input-firstName"
                  value={form.firstName}
                  onChange={(e) => upd("firstName", e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Soyad</Label>
                <Input
                  id="lastName"
                  data-testid="input-lastName"
                  value={form.lastName}
                  onChange={(e) => upd("lastName", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="5XX XXX XX XX"
                  data-testid="input-phone"
                  value={form.phone}
                  onChange={(e) => upd("phone", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="input-email"
                  value={form.email}
                  onChange={(e) => upd("email", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Şifre (en az 8 karakter)</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="input-password"
                  value={form.password}
                  onChange={(e) => upd("password", e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Firma Adı</Label>
                <Input
                  id="companyName"
                  data-testid="input-companyName"
                  value={form.companyName}
                  onChange={(e) => upd("companyName", e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">İl</Label>
                  <Input id="city" data-testid="input-city" value={form.city} onChange={(e) => upd("city", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="district">İlçe</Label>
                  <Input
                    id="district"
                    data-testid="input-district"
                    value={form.district}
                    onChange={(e) => upd("district", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Doğrulama</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {(
                    [
                      { v: "email" as const, icon: Mail, label: "E-posta" },
                      { v: "sms" as const, icon: Smartphone, label: "SMS" },
                    ] as const
                  ).map(({ v, icon: Icon, label }) => {
                    const active = form.verificationMethod === v;
                    return (
                      <button
                        type="button"
                        key={v}
                        onClick={() => upd("verificationMethod", v)}
                        data-testid={`verify-method-${v}`}
                        className={cn(
                          "flex items-center gap-2 justify-center px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                        )}
                      >
                        <Icon className="w-4 h-4" /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.kvkkConsent}
                  onChange={(e) => upd("kvkkConsent", e.target.checked)}
                  data-testid="checkbox-kvkk"
                  className="mt-0.5"
                />
                <span>
                  <a href="/kvkk" target="_blank" className="underline">
                    KVKK
                  </a>
                  &apos;yı okudum ve kabul ediyorum.
                </span>
              </label>
              <Button
                type="submit"
                data-testid="btn-submit-register"
                disabled={!canStep2 || submitting}
                className="h-12 text-base font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" /> Hesap açılıyor…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 w-4 h-4" /> Hesabı oluştur
                  </>
                )}
              </Button>
            </form>
          </div>
        )}

        {mode === "business" && (
          <div
            className="rounded-2xl p-6 md:p-8"
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(99,102,241,0.18)",
              boxShadow: "0 18px 50px -16px rgba(79,70,229,0.18)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (bizStep === 1) setMode("select");
                else setBizStep((s) => s - 1);
              }}
              className="text-sm flex items-center gap-1.5 text-slate-500 hover:text-slate-700 mb-4"
              data-testid="btn-back-register"
            >
              <ArrowLeft className="w-4 h-4" /> {bizStep === 1 ? "Hesap türü" : "Önceki adım"}
            </button>

            <div className="flex items-center justify-center gap-1.5 mb-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-full transition-colors",
                      bizStep === n
                        ? "bg-[var(--color-brand-500)] scale-125"
                        : bizStep > n
                          ? "bg-emerald-500"
                          : "bg-muted"
                    )}
                  />
                  {n < 3 && <div className={cn("w-8 h-0.5", bizStep > n ? "bg-emerald-500" : "bg-muted")} />}
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mb-4">
              Adım {bizStep} / 3 — {title}
            </p>
            <h2
              className="text-xl md:text-2xl font-bold tracking-tight mb-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </h2>
            <p className="text-sm text-slate-600 mb-6">{subtitle}</p>

            {bizStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="co">Şirket adı *</Label>
                  <Input
                    id="co"
                    value={form.companyName}
                    onChange={(e) => upd("companyName", e.target.value)}
                    required
                    placeholder="Örn. ABC Ticaret A.Ş."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="city1">İl *</Label>
                    <Input
                      id="city1"
                      value={form.city}
                      onChange={(e) => upd("city", e.target.value)}
                      placeholder="İstanbul"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dist1">İlçe</Label>
                    <Input
                      id="dist1"
                      value={form.district}
                      onChange={(e) => upd("district", e.target.value)}
                      placeholder="Kadıköy"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full h-11"
                  disabled={!canStep1}
                  onClick={() => setBizStep(2)}
                >
                  Devam et <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {bizStep === 2 && (
              <form
                className="grid md:grid-cols-2 gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canStep2) setBizStep(3);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="fn">Ad *</Label>
                  <Input
                    id="fn"
                    data-testid="input-firstName"
                    value={form.firstName}
                    onChange={(e) => upd("firstName", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ln">Soyad *</Label>
                  <Input
                    id="ln"
                    data-testid="input-lastName"
                    value={form.lastName}
                    onChange={(e) => upd("lastName", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ph">Telefon *</Label>
                  <Input
                    id="ph"
                    type="tel"
                    data-testid="input-phone"
                    value={form.phone}
                    onChange={(e) => upd("phone", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="em">E-posta *</Label>
                  <Input
                    id="em"
                    type="email"
                    data-testid="input-email"
                    value={form.email}
                    onChange={(e) => upd("email", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="pw">Şifre * (en az 8 karakter)</Label>
                  <Input
                    id="pw"
                    type="password"
                    data-testid="input-password"
                    value={form.password}
                    onChange={(e) => upd("password", e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm">Doğrulama</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {(
                      [
                        { v: "email" as const, icon: Mail, label: "E-posta ile" },
                        { v: "sms" as const, icon: Smartphone, label: "SMS ile" },
                      ] as const
                    ).map(({ v, icon: Icon, label }) => {
                      const active = form.verificationMethod === v;
                      return (
                        <button
                          type="button"
                          key={v}
                          onClick={() => upd("verificationMethod", v)}
                          data-testid={`verify-method-${v}`}
                          className={cn(
                            "flex items-center gap-2 justify-center px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                            active ? "border-primary bg-primary/10 text-primary" : "border-border"
                          )}
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
                    <a href="/kvkk" target="_blank" className="underline hover:text-blue-700">
                      KVKK Aydınlatma Metni
                    </a>
                    &apos;ni okudum ve kabul ediyorum.
                  </span>
                </label>
                <Button type="submit" className="md:col-span-2 h-11 mt-2" disabled={!canStep2}>
                  Devam et <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            )}

            {bizStep === 3 && (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ücretsiz deneme otomatik atanır; seçtiğiniz paket satış ekibine ilgi sinyali olarak kaydedilir.
                </p>
                {plansLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-[280px] overflow-y-auto pr-1">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlanId(p.id)}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all",
                          selectedPlanId === p.id ? "border-[var(--color-brand-500)] bg-muted/40" : "border-border hover:border-primary/30"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                          <p className="text-xs mt-1 tabular-nums">
                            ₺{Number(p.priceMonthly).toLocaleString("tr-TR")} / ay · ₺{Number(p.priceYearly).toLocaleString("tr-TR")}{" "}
                            / yıl
                          </p>
                        </div>
                        {selectedPlanId === p.id && <Check className="h-5 w-5 text-[var(--color-brand-500)] shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Kart bilgisi bu adımda istenmez.
                </div>
                <Button
                  type="submit"
                  data-testid="btn-submit-register"
                  disabled={
                    !canStep2 ||
                    submitting ||
                    plansLoading ||
                    (plans.length > 0 && selectedPlanId === null)
                  }
                  className="w-full h-12 text-base font-semibold"
                  style={{
                    background: "linear-gradient(135deg,#2563eb 0%,#5E5CE6 50%,#0EA5A4 100%)",
                    color: "white",
                    border: 0,
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 w-4 h-4 animate-spin" /> Hesap açılıyor…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 w-4 h-4" /> Kaydı tamamla
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        {mode !== "select" && (
          <p className="text-center text-sm text-slate-500 mt-8">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="font-semibold text-[color:var(--color-brand-500)] hover:underline">
              Giriş yapın
            </Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
