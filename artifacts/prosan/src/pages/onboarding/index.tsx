import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { trackProductEvent } from "@/lib/product-analytics";
import {
  Building2,
  Package,
  CheckCircle2,
  Loader2,
  Sparkles,
  Factory,
  Store,
  MapPin,
  Hash,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Sector = "industrial" | "retail" | "other";

const STEPS = 3;

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const { user, checkAuth } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [sector, setSector] = useState<Sector | null>(null);

  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cn = (user as { companyName?: string })?.companyName;
    if (cn) setCompanyName((prev) => prev || cn);
  }, [user]);

  const canStep1 =
    companyName.trim().length >= 2 && city.trim().length >= 1 && sector !== null;

  const wantsProduct = productName.trim().length > 0;
  const canStep2Submit =
    !wantsProduct ||
    (productName.trim().length >= 1 &&
      price.trim() !== "" &&
      !Number.isNaN(parseFloat(price)) &&
      stock.trim() !== "" &&
      !Number.isNaN(parseInt(stock, 10)));

  const saveStep1 = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: companyName.trim(),
          taxNumber: taxNumber.trim() || undefined,
          city: city.trim(),
        }),
      });
      if (!res.ok) {
        trackProductEvent("onboarding_step_error", { step: "1", code: String(res.status) });
        toast({
          title: "Kaydedilemedi",
          description: "Firma bilgileri kaydedilemedi. Tekrar deneyin.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch {
      trackProductEvent("onboarding_step_error", { step: "1", code: "network" });
      toast({ title: "Bağlantı hatası", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveProductIfNeeded = async (): Promise<boolean> => {
    if (!wantsProduct) return true;
    setSaving(true);
    try {
      const sale = parseFloat(price.replace(",", "."));
      const st = parseInt(stock, 10);
      const code = sku.trim() || `URN-${Date.now()}`;
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productCode: code,
          name: productName.trim(),
          stock: st,
          minStock: 0,
          purchasePrice: sale,
          salePrice: sale,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          title: "Ürün eklenemedi",
          description: j?.message || j?.error?.message || "Alanları kontrol edin.",
          variant: "destructive",
        });
        return false;
      }
      trackProductEvent("onboarding_first_product", { ok: true });
      return true;
    } catch {
      toast({ title: "Ürün eklenemedi", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completeOnboarding = async () => {
    setSaving(true);
    try {
      const completeRes = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sector: sector ?? "other" }),
      });
      if (!completeRes.ok) throw new Error("complete failed");

      const userRes = await fetch("/api/settings/onboarding-complete", {
        method: "POST",
        credentials: "include",
      });
      if (!userRes.ok) throw new Error("user complete failed");

      await checkAuth();
      trackProductEvent("onboarding_completed", { sector: sector ?? "other" });
      localStorage.setItem("show_welcome_tour", "1");
      navigate("/dashboard");
    } catch {
      toast({ title: "Hata", description: "Tamamlanamadı, tekrar deneyin.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const goNextFrom1 = async () => {
    const ok = await saveStep1();
    if (!ok) return;
    trackProductEvent("onboarding_step_done", { step: "1" });
    setStep(2);
  };

  const goNextFrom2 = async () => {
    if (!canStep2Submit) return;
    const ok = await saveProductIfNeeded();
    if (!ok) return;
    trackProductEvent("onboarding_step_done", { step: "2" });
    setStep(3);
  };

  const skipStep2 = () => {
    trackProductEvent("onboarding_step_skipped", { step: "2" });
    setStep(3);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-background to-blue-50/40 flex flex-col">
      <header className="shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm px-4 py-4">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-3">
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all",
                    step === n
                      ? "bg-[var(--color-brand-500)] ring-4 ring-[var(--color-brand-500)]/20 scale-110"
                      : step > n
                        ? "bg-emerald-500"
                        : "bg-muted"
                  )}
                  aria-current={step === n ? "step" : undefined}
                />
                {n < STEPS && (
                  <div className={cn("w-10 sm:w-14 h-0.5 rounded-full", step > n ? "bg-emerald-500" : "bg-muted")} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Kurulum — Adım {step} / {STEPS}
          </p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Illustration / icon panel */}
          <div className="hidden md:flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-border/60 bg-card/50 min-h-[280px]">
            {step === 1 && (
              <>
                <div className="w-20 h-20 rounded-2xl bg-[color-mix(in_srgb,var(--color-brand-500)_15%,transparent)] flex items-center justify-center mb-4">
                  <Building2 className="h-10 w-10 text-[var(--color-brand-500)]" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Firmanızı tanıyalım</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                  Vergi numarası ve şehir raporlar ile entegrasyonlar için kullanılır.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <div className="w-20 h-20 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent-teal)_18%,transparent)] flex items-center justify-center mb-4">
                  <Package className="h-10 w-10 text-teal-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">İlk ürününüz</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                  İsterseniz bu adımı atlayıp daha sonra stoktan ekleyebilirsiniz.
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <div className="w-20 h-20 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Hazırsınız</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                  Ana panelden satış, stok ve raporlara geçebilirsiniz.
                </p>
              </>
            )}
          </div>

          {/* Mobile illustration */}
          <div className="md:hidden flex justify-center mb-2">
            {step === 1 && <Building2 className="h-12 w-12 text-[var(--color-brand-500)]" />}
            {step === 2 && <Package className="h-12 w-12 text-teal-600" />}
            {step === 3 && <CheckCircle2 className="h-12 w-12 text-emerald-600" />}
          </div>

          {/* Form column */}
          <div className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Firma bilgileri
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">Şirket adı, sektör ve konum</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onb-co">Firma adı *</Label>
                  <Input
                    id="onb-co"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Örn. ABC Ticaret A.Ş."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sektör *</Label>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => setSector("industrial")}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        sector === "industrial" ? "border-[var(--color-brand-500)] bg-muted/40" : "border-border"
                      )}
                    >
                      <Factory className="h-5 w-5 shrink-0 text-[var(--color-brand-500)]" />
                      <span className="text-sm font-medium">Endüstriyel / B2B</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSector("retail")}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        sector === "retail" ? "border-[var(--color-brand-500)] bg-muted/40" : "border-border"
                      )}
                    >
                      <Store className="h-5 w-5 shrink-0 text-[var(--color-brand-500)]" />
                      <span className="text-sm font-medium">Perakende</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSector("other")}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        sector === "other" ? "border-[var(--color-brand-500)] bg-muted/40" : "border-border"
                      )}
                    >
                      <Sparkles className="h-5 w-5 shrink-0 text-[var(--color-brand-500)]" />
                      <span className="text-sm font-medium">Diğer</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="onb-city">İl *</Label>
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="onb-city"
                        className="pl-9"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="İstanbul"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onb-tax">Vergi no</Label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="onb-tax"
                        className="pl-9"
                        value={taxNumber}
                        onChange={(e) => setTaxNumber(e.target.value)}
                        placeholder="İsteğe bağlı"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full h-11 gap-2"
                  disabled={!canStep1 || saving}
                  onClick={() => void goNextFrom1()}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Devam et
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    İlk ürünü ekleyin
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">İsteğe bağlı — stok ve fiyatı sonra da girebilirsiniz</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onb-pn">Ürün adı</Label>
                  <Input
                    id="onb-pn"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Örn. Civata M8 x 25"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="onb-sku">SKU / kod</Label>
                    <Input id="onb-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Otomatik" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onb-st">Stok</Label>
                    <Input
                      id="onb-st"
                      inputMode="numeric"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onb-pr">Satış fiyatı (₺)</Label>
                  <Input
                    id="onb-pr"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0,00"
                  />
                </div>

                {wantsProduct && !canStep2Submit && (
                  <p className="text-sm text-destructive">Ürün adı girildiğinde fiyat ve stok da zorunludur.</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center pt-2">
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={skipStep2}>
                    Şimdilik atla
                  </Button>
                  <Button
                    type="button"
                    className="gap-2 sm:min-w-[140px]"
                    disabled={saving || !canStep2Submit}
                    onClick={() => void goNextFrom2()}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Devam et
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 text-center md:text-left">
                <div className="inline-flex md:hidden justify-center w-full">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="h-9 w-9 text-emerald-600" />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Tamamlandı
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    <strong className="text-foreground">{companyName || "İşletmeniz"}</strong> için panel hazır.
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto h-12 px-8 gap-2 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-nav-text-active)]"
                  disabled={saving}
                  onClick={() => void completeOnboarding()}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Ana Panele Git
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
