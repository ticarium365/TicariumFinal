import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Palette, ImageUp, CheckCircle2, ChevronRight,
  Loader2, X, ArrowLeft, Sparkles, Factory, Store, Database,
} from "lucide-react";

const STEPS = [
  { id: 1, title: "Firma",   icon: Building2, desc: "Bilgiler" },
  { id: 2, title: "Logo",    icon: ImageUp,   desc: "Markanız" },
  { id: 3, title: "Tema",    icon: Palette,   desc: "Renginiz" },
  { id: 4, title: "Sektör",  icon: Factory,   desc: "İş kolu" },
  { id: 5, title: "Demo",    icon: Database,  desc: "Veri seti" },
  { id: 6, title: "Hazır",   icon: Sparkles,  desc: "Tamamla" },
];

const PRESET_COLORS = [
  "#2563eb", "#7c3aed", "#059669", "#dc2626",
  "#d97706", "#0891b2", "#be185d", "#374151",
];

type Sector = "industrial" | "retail" | "other";
type DemoChoice = "industrial" | "retail" | "skip" | null;

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const { user, checkAuth } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [companyName, setCompanyName] = useState((user as any)?.companyName || "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [sector, setSector] = useState<Sector | null>(null);
  const [demoChoice, setDemoChoice] = useState<DemoChoice>(null);
  const [demoSummary, setDemoSummary] = useState<{
    products: number; customers: number; suppliers: number; sales: number; purchases: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Architect bulgu #4: sektör değişirse demo seçimi sıfırla,
  // önceki sektöre ait demo seti yanlışlıkla yüklenmesin.
  useEffect(() => {
    setDemoChoice(null);
    setDemoSummary(null);
  }, [sector]);

  const canNext =
    step === 1 ? companyName.trim().length > 0
    : step === 4 ? sector !== null
    : step === 5 ? demoChoice !== null
    : true;

  const handleLogoFile = (f: File) => {
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Dosya çok büyük", description: "Logo en fazla 2 MB olabilir.", variant: "destructive" });
      return;
    }
    setLogoFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const saveStep1 = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyName, phone, email, address }),
      });
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    if (!logoFile) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("logo", logoFile);
      await fetch("/api/settings/logo", { method: "POST", credentials: "include", body: fd });
    } finally {
      setSaving(false);
    }
  };

  const saveStep3 = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ primaryColor }),
      });
    } finally {
      setSaving(false);
    }
  };

  /** Adım 5 — kullanıcı bir demo seti seçtiyse onu seed et. */
  const seedDemoIfRequested = async (): Promise<boolean> => {
    if (demoChoice === null || demoChoice === "skip") return true;
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sector: demoChoice }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // 409 = zaten seed edilmiş (idempotent kabul edilir, akış devam etsin)
        if (res.status === 409) return true;
        toast({
          title: "Demo veriler yüklenemedi",
          description: j?.message ?? "Lütfen tekrar deneyin.",
          variant: "destructive",
        });
        return false;
      }
      const j = await res.json();
      setDemoSummary(j.summary ?? null);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const completeOnboarding = async () => {
    setSaving(true);
    try {
      // (1) Firma seviyesi onboarding flag (sektör + audit log).
      // Architect re-review bulgusu: bu çağrı sessizce swallow edilemez —
      // başarısızsa kullanıcı seviyesinde flag'i de set etmeyiz, akış tutarsız kalmasın.
      // Demo seed yolundan gelinmişse companies tablosunda flag zaten set edildi (idempotent — tekrar set zararsız).
      const completeRes = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sector: sector ?? "other" }),
      });
      if (!completeRes.ok) {
        throw new Error("complete failed");
      }
      // (2) Kullanıcı seviyesi mevcut flag (auth-context buna bakıyor)
      const userRes = await fetch("/api/settings/onboarding-complete", {
        method: "POST",
        credentials: "include",
      });
      if (!userRes.ok) {
        throw new Error("user complete failed");
      }
      await checkAuth();
      localStorage.setItem("show_welcome_tour", "1");
      navigate("/dashboard");
    } catch {
      toast({ title: "Hata", description: "Tamamlanamadı, tekrar deneyin.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 1) await saveStep1();
    if (step === 2 && logoFile) await saveStep2();
    if (step === 3) await saveStep3();
    if (step === 5) {
      const ok = await seedDemoIfRequested();
      if (!ok) return; // hata varsa adımda kal
    }
    if (step < 6) setStep((s) => s + 1);
    else await completeOnboarding();
  };

  const skip = () => {
    if (step === 4) setSector("other");
    if (step === 5) setDemoChoice("skip");
    if (step < 6) setStep((s) => s + 1);
    else completeOnboarding();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Logo / başlık */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-white mb-3 shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Ticarium365'e Hoş Geldiniz</h1>
          <p className="text-muted-foreground text-sm mt-1">Hızlı kurulumu tamamlayalım</p>
        </div>

        {/* Adım göstergesi */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                step > s.id ? "bg-green-500 text-white" : step === s.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}>
                {step > s.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.id}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 transition-colors ${step > s.id ? "bg-green-500" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="shadow-xl border-0">
          <CardContent className="p-7">
            {/* Adım 1 — Firma Bilgileri */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Firma Bilgileri</h2>
                    <p className="text-sm text-muted-foreground">Temel bilgileri girin</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="companyName">Firma Adı *</Label>
                    <Input
                      id="companyName"
                      placeholder="Örn: ABC Ticaret A.Ş."
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="phone">Telefon</Label>
                      <Input id="phone" placeholder="05xx xxx xx xx" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="email">E-posta</Label>
                      <Input id="email" type="email" placeholder="info@firma.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address">Adres</Label>
                    <Input id="address" placeholder="Firma adresi" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" />
                  </div>
                </div>
              </div>
            )}

            {/* Adım 2 — Logo */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ImageUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Logo Yükle</h2>
                    <p className="text-sm text-muted-foreground">İsteğe bağlı — daha sonra ekleyebilirsiniz</p>
                  </div>
                </div>

                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    logoPreview ? "border-green-400 bg-green-500/10" : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }}
                  />
                  {logoPreview ? (
                    <div className="relative inline-block">
                      <img src={logoPreview} alt="logo önizleme" className="max-h-28 max-w-full mx-auto rounded-lg object-contain" />
                      <button
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5"
                        onClick={(e) => { e.stopPropagation(); setLogoPreview(null); setLogoFile(null); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <ImageUp className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium">Logo yüklemek için tıkla veya sürükle</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, SVG — maks. 2 MB</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Adım 3 — Tema Rengi */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Palette className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Tema Rengi</h2>
                    <p className="text-sm text-muted-foreground">Markanızın rengini seçin</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setPrimaryColor(c)}
                      className={`h-12 rounded-xl transition-all ${primaryColor === c ? "ring-2 ring-offset-2 ring-current scale-105" : "hover:scale-105"}`}
                      style={{ backgroundColor: c, color: c }}
                      title={c}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3 mt-3">
                  <Label className="shrink-0">Özel renk:</Label>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-14 rounded cursor-pointer border border-border"
                    />
                    <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono" placeholder="#2563eb" />
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border mt-2" style={{ borderColor: primaryColor + "40", backgroundColor: primaryColor + "10" }}>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: primaryColor }} />
                  <span className="text-sm font-medium">Örnek menü öğesi</span>
                  <div className="ml-auto px-3 py-1 rounded text-xs text-white font-medium" style={{ backgroundColor: primaryColor }}>Buton</div>
                </div>
              </div>
            )}

            {/* Adım 4 — Sektör */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Factory className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">İş Kolunuz</h2>
                    <p className="text-sm text-muted-foreground">Raporları ve demo verileri buna göre hazırlarız</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setSector("industrial")}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      sector === "industrial" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Factory className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Endüstriyel / B2B</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Vida-cıvata, yedek parça, makine, KDV'li B2B faturalama</p>
                    </div>
                    {sector === "industrial" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSector("retail")}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      sector === "retail" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Store className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Perakende / Bakkal-Market</p>
                      <p className="text-sm text-muted-foreground mt-0.5">FMCG, gıda-içecek, barkod ile POS satışı</p>
                    </div>
                    {sector === "retail" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSector("other")}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      sector === "other" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Sparkles className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Diğer / Karma</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Yukarıdakilere uymuyorsa</p>
                    </div>
                    {sector === "other" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                  </button>
                </div>
              </div>
            )}

            {/* Adım 5 — Demo Veri */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Demo Veri Seti</h2>
                    <p className="text-sm text-muted-foreground">Sistemi denemek için örnek kayıtlarla başlayın</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {sector !== "retail" && (
                    <button
                      type="button"
                      onClick={() => setDemoChoice("industrial")}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                        demoChoice === "industrial" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Factory className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold">Endüstriyel demo seti</p>
                        <p className="text-sm text-muted-foreground mt-0.5">12 ürün, 5 müşteri, 3 tedarikçi, 7 satış, 2 alış faturası</p>
                      </div>
                      {demoChoice === "industrial" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                    </button>
                  )}

                  {sector !== "industrial" && (
                    <button
                      type="button"
                      onClick={() => setDemoChoice("retail")}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                        demoChoice === "retail" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Store className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold">Perakende demo seti</p>
                        <p className="text-sm text-muted-foreground mt-0.5">15 ürün, 6 müşteri, 3 tedarikçi, 9 POS satışı, 2 alış faturası</p>
                      </div>
                      {demoChoice === "retail" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDemoChoice("skip")}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      demoChoice === "skip" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <X className="h-6 w-6 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Boş başla</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Verileri kendim gireceğim</p>
                    </div>
                    {demoChoice === "skip" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                  </button>
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  ℹ️ Demo veriler bir kez yüklenir; istediğiniz zaman kayıtları silebilirsiniz.
                </p>
              </div>
            )}

            {/* Adım 6 — Tamamlandı */}
            {step === 6 && (
              <div className="text-center space-y-4 py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/15 text-green-600">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <div>
                  <h2 className="font-bold text-xl">Kurulum Tamamlandı!</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    <strong>{companyName}</strong> hesabınız hazır.
                  </p>
                </div>

                {demoSummary && (
                  <div className="rounded-lg border bg-green-500/5 border-green-500/30 p-4 text-left">
                    <p className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
                      <Database className="h-4 w-4" /> Demo veriler yüklendi:
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><span className="font-bold">{demoSummary.products}</span> ürün</div>
                      <div><span className="font-bold">{demoSummary.customers}</span> müşteri</div>
                      <div><span className="font-bold">{demoSummary.suppliers}</span> tedarikçi</div>
                      <div><span className="font-bold">{demoSummary.sales}</span> satış</div>
                      <div><span className="font-bold">{demoSummary.purchases}</span> alış</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-left mt-4">
                  {[
                    { icon: "📦", label: "Ürün Ekle", desc: "Stok girişi yapın" },
                    { icon: "🛒", label: "Satış Yap", desc: "Kasa ve satış ekranı" },
                    { icon: "📊", label: "Raporlar", desc: "Günlük kapanış özeti" },
                    { icon: "📷", label: "Barkod", desc: "Kamera ile tarama" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer butonları */}
            <div className="flex items-center justify-between mt-7 pt-5 border-t">
              <div className="flex items-center gap-2">
                {step > 1 && step < 6 && (
                  <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={saving}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Geri
                  </Button>
                )}
                {step < 6 && step !== 1 && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip} disabled={saving}>
                    Atla
                  </Button>
                )}
              </div>

              <Button
                onClick={next}
                disabled={!canNext || saving}
                className="gap-2 min-w-32"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === 6 ? (
                  <><Sparkles className="h-4 w-4" /> Başla</>
                ) : step === 5 && demoChoice && demoChoice !== "skip" ? (
                  <>Yükle ve İlerle <ChevronRight className="h-4 w-4" /></>
                ) : (
                  <>İleri <ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {step < 6 && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Adım {step} / 5 — daha sonra ayarlardan güncelleyebilirsiniz
          </p>
        )}
      </div>
    </div>
  );
}
