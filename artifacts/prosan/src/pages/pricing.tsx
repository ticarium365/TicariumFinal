import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check, Sparkles, ArrowRight, ShieldCheck, HelpCircle, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { FEATURE_LABELS as SHARED_FEATURE_LABELS } from "@/lib/feature-labels";
import { trackProductEvent } from "@/lib/product-analytics";

type Plan = {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
  storageMb: number;
  features: string;
  sortOrder: number;
};

const FEATURE_LABELS = SHARED_FEATURE_LABELS;

// Dalga 25 — Yetki temizliği: eski `pkg_trade` slug'ı katalogdan kalktı.
// HIGHLIGHTED orta-üst paket olarak `pkg_business_v3` (mevcut katalogda 3.).
const HIGHLIGHTED = "pkg_business_v3";

export default function PricingPage() {
  const { toast } = useToast();
  const planFocusOnce = useRef(new Set<string>());
  const comebackTracked = useRef(false);
  const [yearly, setYearly] = useState(false);
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);
  const [identityTaxNumber, setIdentityTaxNumber] = useState("");
  const [identityPhone, setIdentityPhone] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const { data, isLoading, isError, refetch } = useQuery<{ plans: Plan[] }>({
    queryKey: ["/api/subscriptions/plans"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/plans");
      if (!r.ok) throw new Error("Plans fetch failed");
      return r.json();
    },
    staleTime: 120_000,
  });
  const { data: featData } = useQuery<{ planSlug: string; status: string; trialEndsAt?: string }>({
    queryKey: ["/api/subscriptions/features"],
    queryFn: async () => (await fetch("/api/subscriptions/features", { credentials: "include" })).json(),
    staleTime: 60_000,
  });

  const plans = data?.plans || [];

  useEffect(() => {
    if (plans.length > 0) {
      trackProductEvent("pricing_view", { plan_count: plans.length });
    }
  }, [plans.length]);

  useEffect(() => {
    if (comebackTracked.current) return;
    const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const fromQuery = qs.get("comeback") === "grace";
    const fromSession = featData?.status === "grace_period";
    if (fromQuery || fromSession) {
      comebackTracked.current = true;
      trackProductEvent("post_cancel_comeback_view", { fromQuery, fromSession: Boolean(fromSession) });
    }
  }, [featData?.status]);

  function notePlanFocus(slug: string) {
    if (planFocusOnce.current.has(slug)) return;
    planFocusOnce.current.add(slug);
    trackProductEvent("pricing_plan_focus", { plan_slug: slug });
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="text-center mb-10 space-y-3">
          <Skeleton className="h-10 w-64 mx-auto" />
          <Skeleton className="h-5 max-w-xl mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-28 mt-2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-9 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-destructive mb-3">Paketler yüklenemedi.</p>
        <Button variant="outline" onClick={() => refetch()}>Tekrar Dene</Button>
      </div>
    );
  }
  if (!plans.length) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">
        Şu anda gösterilebilecek paket bulunmuyor. Lütfen yöneticinize başvurun.
      </div>
    );
  }

  async function subscribe(plan: Plan) {
    // Dalga 22 — Iyzico (mock-first) ödeme akışı: checkout oturumu aç →
    // paymentPageUrl'e yönlendir. Mock'ta callback aynı alanda /odeme/sonuc'a düşer.
    const r = await fetch("/api/billing/checkout", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, billingCycle: yearly ? "yearly" : "monthly" }),
    });
    const j = await r.json();
    if (r.ok && j.paymentPageUrl) {
      trackProductEvent("billing_checkout_started", {
        plan_slug: plan.slug,
        cycle: yearly ? "yearly" : "monthly",
      });
      toast({ title: "Ödeme sayfasına yönlendiriliyorsunuz", description: `${plan.name} — ${j.amount} ${j.currency}` });
      window.location.href = j.paymentPageUrl;
    } else {
      if (r.status === 400 && (j?.error?.code === "IDENTITY_REQUIRED" || j?.error?.code === "PHONE_REQUIRED" || j?.error?.code === "PHONE_INVALID")) {
        setPendingPlan(plan);
        setIdentityDialogOpen(true);
        trackProductEvent(
          j?.error?.code === "PHONE_REQUIRED" || j?.error?.code === "PHONE_INVALID"
            ? "billing_phone_required_shown"
            : "billing_identity_required_shown",
          { plan_slug: plan.slug, cycle: yearly ? "yearly" : "monthly", code: j?.error?.code },
        );
        return;
      }
      toast({ title: "Hata", description: j?.error?.message ?? j?.message ?? "İşlem başarısız", variant: "destructive" });
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <Dialog open={identityDialogOpen} onOpenChange={setIdentityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödeme için kimlik bilgisi gerekli</DialogTitle>
            <DialogDescription>
              İyzico ödeme sayfası için işletme vergi numarası (VKN) veya T.C. kimlik numarası (TCKN) gerekir.
              Bu bilgi yalnızca ödeme başlatmak için kullanılır ve firma profilinizde saklanır.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="taxNumber">VKN / TCKN</Label>
            <Input
              id="taxNumber"
              inputMode="numeric"
              placeholder="10 (VKN) veya 11 (TCKN) haneli"
              value={identityTaxNumber}
              onChange={(e) => setIdentityTaxNumber(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
            />
            <p className="text-xs text-muted-foreground">
              İpucu: Şahıs şirketlerinde genellikle 11 haneli TCKN, şirketlerde 10 haneli VKN kullanılır.
            </p>
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
            <p className="text-xs text-muted-foreground">
              Banka/ödeme doğrulaması için gerekir. Kart bilgileri sistemimize gelmez.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIdentityDialogOpen(false);
                setPendingPlan(null);
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
                  trackProductEvent("billing_identity_saved", { tax_len: v.length });
                  trackProductEvent("billing_phone_saved", {});
                  setIdentityDialogOpen(false);
                  const retryPlan = pendingPlan;
                  setPendingPlan(null);
                  toast({ title: "Kaydedildi", description: "Firma bilgileri güncellendi. Ödeme sayfasına yönlendiriliyorsunuz." });
                  if (retryPlan) await subscribe(retryPlan);
                } catch (e: any) {
                  toast({ title: "Hata", description: e?.message || "Kaydetme başarısız", variant: "destructive" });
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

      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-3">Ticarium365 Paketleri</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          İşletmenizin büyüklüğüne göre {plans.length} net paket. İlk 30 gün deneme — koşullar hesabınız politikasına göre (kart zorunlu olmayabilir).
        </p>

        {featData && (
          <div className="mt-4 inline-flex items-center gap-2">
            {featData.status === "trial" && featData.trialEndsAt && (
              <Badge variant="outline" className="text-base px-3 py-1">
                <Sparkles className="w-4 h-4 mr-1" />
                Deneme süreniz: {new Date(featData.trialEndsAt).toLocaleDateString("tr-TR")} tarihine kadar
              </Badge>
            )}
            {featData.status === "active" && (
              <Badge variant="default" className="text-base px-3 py-1">
                Aktif Plan: {plans.find((p) => p.slug === featData.planSlug)?.name ?? featData.planSlug}
              </Badge>
            )}
            {featData.status === "expired" && (
              <Badge variant="destructive" className="text-base px-3 py-1">
                Aboneliğiniz dolmuş — lütfen plan seçin
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={!yearly ? "font-semibold" : "text-muted-foreground"}>Aylık</span>
          <Switch
            checked={yearly}
            onCheckedChange={(v) => {
              setYearly(v);
              trackProductEvent("pricing_cycle_toggle", { cycle: v ? "yearly" : "monthly" });
            }}
          />
          <span className={yearly ? "font-semibold" : "text-muted-foreground"}>
            Yıllık <Badge variant="secondary" className="ml-1">2 ay bedava</Badge>
          </span>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            Ödeme sayfası güvenli bağlantı ile açılır
          </span>
          <span className="inline-flex items-center gap-1.5 max-w-xs text-left sm:text-center">
            <CreditCard className="h-4 w-4 text-slate-500 shrink-0" />
            Kart bilgisi ödeme sağlayıcısında işlenir; sistemde kart saklamıyoruz
          </span>
          <Link
            href="/paketler"
            className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
            onClick={() => trackProductEvent("pricing_help_nav", { target: "wizard" })}
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            Hangi paket bana uygun? (kısa sorular)
          </Link>
          <Link
            href="/karsilastir"
            className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
            onClick={() => trackProductEvent("pricing_compare_nav", { source: "hero" })}
          >
            Paketleri yan yana karşılaştır
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const features: string[] = (() => { try { return JSON.parse(plan.features); } catch { return []; } })();
          const price = yearly ? Number(plan.priceYearly) : Number(plan.priceMonthly);
          const isHighlighted = plan.slug === HIGHLIGHTED;
          const isCurrent = featData?.planSlug === plan.slug;

          return (
            <Card
              key={plan.id}
              className={`flex flex-col ${isHighlighted ? "border-primary border-2 shadow-lg relative" : ""}`}
              onPointerEnter={() => notePlanFocus(plan.slug)}
            >
              {isHighlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Önerilen</Badge>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription className="text-xs h-10">{plan.description}</CardDescription>
                <div className="pt-2">
                  <div className="text-3xl font-bold">
                    ₺{price.toLocaleString("tr-TR")}
                    <span className="text-sm font-normal text-muted-foreground">/{yearly ? "yıl" : "ay"}</span>
                  </div>
                  {yearly && (
                    <div className="text-xs text-green-600 mt-1">
                      Aylık ₺{Math.round(price / 12).toLocaleString("tr-TR")}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                  <div>👤 {plan.maxUsers === -1 ? "Sınırsız" : plan.maxUsers} kullanıcı</div>
                  <div>🏢 {plan.maxBranches === -1 ? "Sınırsız" : plan.maxBranches} şube</div>
                  <div>📦 {plan.maxProducts === -1 ? "Sınırsız" : plan.maxProducts.toLocaleString("tr-TR")} ürün</div>
                  <div>💾 {plan.storageMb >= 1000 ? `${plan.storageMb / 1000} GB` : `${plan.storageMb} MB`} depolama</div>
                </div>
                <ul className="space-y-1.5 text-sm flex-1 mb-4">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span className="text-xs">{FEATURE_LABELS[f] ?? f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isHighlighted ? "default" : "outline"}
                  disabled={isCurrent}
                  onClick={() => subscribe(plan)}
                  data-testid={`subscribe-${plan.slug}`}
                >
                  {isCurrent ? "Mevcut planınız" : (
                    <>{isHighlighted ? "Bu planla devam et" : "Seç ve ödemeye geç"} <ArrowRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-12 text-center bg-muted/50 rounded-lg p-6">
        <h3 className="font-semibold mb-2">Hangi paket size uygun emin değil misiniz?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Özellikleri yan yana görmek ve rakiplerle konumumuzu incelemek için karşılaştırma sayfamıza göz atın.
        </p>
        <Link href="/karsilastir" onClick={() => trackProductEvent("pricing_compare_nav", { source: "footer_cta" })}>
          <Button variant="outline">Rakip Karşılaştırma</Button>
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
        <div>
          <h4 className="font-semibold text-foreground mb-1">Geçiş kolaylığı</h4>
          Paraşüt / Bizim Hesap / Logo / Mikro'dan veriyi tek tıkla içe aktarın.
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Yıllık ödemede %20 indirim</h4>
          Yıllık ödemede 2 ay bedava — yatırımınız hemen kendini amorti eder.
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">İptal ücreti yok</h4>
          Her zaman planınızı değiştirebilir veya iptal edebilirsiniz. Veriniz size ait.
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
        Fiyatlar KDV dahil değildir; yasal fatura ve sözleşme metni ödeme adımında veya hesap yöneticinizden sunulur.
      </p>
    </div>
  );
}
