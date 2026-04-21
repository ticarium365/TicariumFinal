import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { FEATURE_LABELS as SHARED_FEATURE_LABELS } from "@/lib/feature-labels";

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

const HIGHLIGHTED = "pkg_trade";

export default function PricingPage() {
  const { toast } = useToast();
  const [yearly, setYearly] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<{ plans: Plan[] }>({
    queryKey: ["/api/subscriptions/plans"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/plans");
      if (!r.ok) throw new Error("Plans fetch failed");
      return r.json();
    },
  });
  const { data: featData } = useQuery<{ planSlug: string; status: string; trialEndsAt?: string }>({
    queryKey: ["/api/subscriptions/features"],
    queryFn: async () => (await fetch("/api/subscriptions/features", { credentials: "include" })).json(),
  });

  const plans = data?.plans || [];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">
        Paketler yükleniyor…
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
      toast({ title: "Ödeme sayfasına yönlendiriliyorsunuz", description: `${plan.name} — ${j.amount} ${j.currency}` });
      window.location.href = j.paymentPageUrl;
    } else {
      toast({ title: "Hata", description: j?.error?.message ?? j?.message ?? "İşlem başarısız", variant: "destructive" });
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-3">Ticarium365 Paketleri</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          İşletmenizin ihtiyacına göre 5 paket. İlk 30 gün ücretsiz deneme — kredi kartı gerekmez.
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
          <Switch checked={yearly} onCheckedChange={setYearly} />
          <span className={yearly ? "font-semibold" : "text-muted-foreground"}>
            Yıllık <Badge variant="secondary" className="ml-1">2 ay bedava</Badge>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {plans.map((plan) => {
          const features: string[] = (() => { try { return JSON.parse(plan.features); } catch { return []; } })();
          const price = yearly ? Number(plan.priceYearly) : Number(plan.priceMonthly);
          const isHighlighted = plan.slug === HIGHLIGHTED;
          const isCurrent = featData?.planSlug === plan.slug;

          return (
            <Card key={plan.id} className={`flex flex-col ${isHighlighted ? "border-primary border-2 shadow-lg relative" : ""}`}>
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
                  {isCurrent ? "Mevcut Planınız" : (
                    <>Bu Pakete Geç <ArrowRight className="w-4 h-4 ml-1" /></>
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
          Karşılaştırma tablomuzda 9 farkımızı ve rakiplere göre konumumuzu inceleyin.
        </p>
        <Link href="/karsilastir">
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
    </div>
  );
}
