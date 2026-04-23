import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import { Check, Minus, ArrowRight, Sparkles, Wand2, Users, Receipt, Store, Building2 } from "lucide-react";
import { FEATURE_LABELS } from "@/lib/feature-labels";

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
  maxEinvoiceMonthly: number;
  einvoiceOverageRate: string;
  maxOcrMonthly: number;
  maxApiCallsMonthly: number;
  maxCustomers: number;
  maxMarketplaceChannels: number;
  features: string;
  isPublic: boolean;
  sortOrder: number;
};

type PlansResponse = { plans: Plan[] };

const fmtLimit = (n: number): string => (n === -1 ? "Sınırsız" : n === 0 ? "—" : n.toLocaleString("tr-TR"));
const fmtStorage = (mb: number): string => (mb >= 1000 ? `${(mb / 1000).toFixed(0)} GB` : `${mb} MB`);
const parseFeatures = (raw: string | string[]): string[] => {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

/* ---------- AI Öneri ---------- */
type WizardAnswers = {
  users: number;
  einvoicePerMonth: number;
  marketplace: "yes" | "no" | "";
  multiCompany: "yes" | "no" | "";
};

function recommendPlanSlug(a: WizardAnswers): string {
  if (a.multiCompany === "yes") return "pkg_enterprise_v3";
  if (a.users >= 15 || a.einvoicePerMonth >= 1000) return "pkg_enterprise_v3";
  if (a.users >= 6 || a.einvoicePerMonth >= 400 || a.marketplace === "yes") {
    if (a.users >= 10 || a.einvoicePerMonth >= 1500) return "pkg_business_v3";
    return "pkg_pro";
  }
  if (a.users <= 2 && a.einvoicePerMonth <= 80) return "pkg_starter";
  return "pkg_pro";
}

function AdvisorWizard({ plans, onPick }: { plans: Plan[]; onPick: (slug: string) => void }) {
  const [a, setA] = useState<WizardAnswers>({ users: 3, einvoicePerMonth: 100, marketplace: "", multiCompany: "" });
  const [recommended, setRecommended] = useState<string | null>(null);

  const recPlan = useMemo(
    () => (recommended ? plans.find((p) => p.slug === recommended) : null),
    [recommended, plans],
  );
  const canSubmit = a.users > 0 && a.einvoicePerMonth >= 0 && a.marketplace && a.multiCompany;

  function submit() {
    const want = recommendPlanSlug(a);
    // Defensive fallback: önerilen slug satılan plan listesinde yoksa pkg_pro,
    // o da yoksa ilk plan — kullanıcıya her zaman concrete bir öneri gösterilir.
    const exists = plans.find((p) => p.slug === want);
    const slug = exists?.slug ?? plans.find((p) => p.slug === "pkg_pro")?.slug ?? plans[0]?.slug ?? want;
    setRecommended(slug);
    onPick(slug);
  }

  return (
    <Card className="border-2 border-primary/30 shadow-md" data-testid="advisor-wizard">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Wand2 className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-lg" style={{ fontFamily: "var(--font-display)" }}>
              Sana Uygun Paketi Bulalım
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">4 kısa soru — saniyeler içinde öneri</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <Label className="text-sm flex items-center gap-1.5 mb-2"><Users className="h-3.5 w-3.5" /> Kaç kullanıcı sistemi kullanacak?</Label>
            <Input
              type="number" min={1} max={500}
              value={a.users}
              onChange={(e) => setA({ ...a, users: Math.max(1, Number(e.target.value) || 1) })}
              data-testid="wizard-users"
            />
          </div>
          <div>
            <Label className="text-sm flex items-center gap-1.5 mb-2"><Receipt className="h-3.5 w-3.5" /> Aylık tahmini e-belge sayısı?</Label>
            <Input
              type="number" min={0} max={100000}
              value={a.einvoicePerMonth}
              onChange={(e) => setA({ ...a, einvoicePerMonth: Math.max(0, Number(e.target.value) || 0) })}
              data-testid="wizard-einvoice"
            />
          </div>
          <div>
            <Label className="text-sm flex items-center gap-1.5 mb-2"><Store className="h-3.5 w-3.5" /> Pazaryerlerinde (Trendyol/HB/N11) satış yapıyor musun?</Label>
            <RadioGroup
              value={a.marketplace}
              onValueChange={(v) => setA({ ...a, marketplace: v as WizardAnswers["marketplace"] })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5"><RadioGroupItem value="yes" id="mp-yes" data-testid="wizard-marketplace-yes" /><Label htmlFor="mp-yes" className="text-sm cursor-pointer">Evet</Label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="no" id="mp-no" /><Label htmlFor="mp-no" className="text-sm cursor-pointer">Hayır</Label></div>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-sm flex items-center gap-1.5 mb-2"><Building2 className="h-3.5 w-3.5" /> Birden fazla firma/şirket yönetiyor musun?</Label>
            <RadioGroup
              value={a.multiCompany}
              onValueChange={(v) => setA({ ...a, multiCompany: v as WizardAnswers["multiCompany"] })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5"><RadioGroupItem value="yes" id="mc-yes" data-testid="wizard-multi-yes" /><Label htmlFor="mc-yes" className="text-sm cursor-pointer">Evet</Label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="no" id="mc-no" /><Label htmlFor="mc-no" className="text-sm cursor-pointer">Hayır</Label></div>
            </RadioGroup>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={!canSubmit} className="gap-2" data-testid="btn-wizard-submit">
            <Sparkles className="h-4 w-4" /> Önerimi Göster
          </Button>
          {recPlan && (
            <div className="text-sm" data-testid="wizard-result">
              Senin için en uygun paket: <span className="font-semibold text-primary">{recPlan.name}</span>{" "}
              <span className="text-muted-foreground">— aşağıda işaretlendi</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Karşılaştırma tablosu (real data) ---------- */
type FeatureRow = {
  group: string;
  label: string;
  values: (boolean | string)[];
};

function buildFeatureMatrix(plans: Plan[]): FeatureRow[] {
  // Tüm planlardaki feature kodlarını topla, önce ortak olanlar üstte
  const allFeatures = new Set<string>();
  plans.forEach((p) => parseFeatures(p.features).forEach((f) => allFeatures.add(f)));
  const featureCodes = Array.from(allFeatures);

  const groupOf = (code: string): string => {
    if (code.startsWith("inventory") || code.startsWith("stock") || code.startsWith("barcode")) return "Stok & Ürün";
    if (code.startsWith("sales") || code.startsWith("customers") || code.startsWith("suppliers")) return "Satış & Cari";
    if (code.startsWith("einvoice") || code.startsWith("finance") || code.startsWith("hr") || code.startsWith("assets") || code.startsWith("documents") || code.startsWith("ocr")) return "Finans & Resmi";
    if (code.startsWith("profit") || code.startsWith("marketplace") || code.startsWith("campaigns") || code.startsWith("b2b") || code.startsWith("pricing")) return "Büyüme & Pazaryeri";
    if (code.startsWith("multi") || code.startsWith("api") || code.startsWith("webhooks") || code.startsWith("support")) return "Kurumsal";
    return "Diğer";
  };

  const featureRows: FeatureRow[] = featureCodes
    .map((code) => ({
      group: groupOf(code),
      label: FEATURE_LABELS[code] ?? code,
      values: plans.map((p) => parseFeatures(p.features).includes(code)) as (boolean | string)[],
      _code: code,
    }))
    .sort((a, b) => {
      const order = ["Stok & Ürün", "Satış & Cari", "Finans & Resmi", "Büyüme & Pazaryeri", "Kurumsal", "Diğer"];
      const dg = order.indexOf(a.group) - order.indexOf(b.group);
      return dg !== 0 ? dg : a.label.localeCompare(b.label, "tr");
    });

  const limitRows: FeatureRow[] = [
    { group: "Limitler", label: "Kullanıcı sayısı", values: plans.map((p) => fmtLimit(p.maxUsers)) },
    { group: "Limitler", label: "Şube sayısı", values: plans.map((p) => fmtLimit(p.maxBranches)) },
    { group: "Limitler", label: "Ürün sayısı", values: plans.map((p) => fmtLimit(p.maxProducts)) },
    { group: "Limitler", label: "Aylık e-belge", values: plans.map((p) => fmtLimit(p.maxEinvoiceMonthly)) },
    { group: "Limitler", label: "Aylık fiş OCR", values: plans.map((p) => fmtLimit(p.maxOcrMonthly)) },
    { group: "Limitler", label: "Aylık API çağrısı", values: plans.map((p) => fmtLimit(p.maxApiCallsMonthly)) },
    { group: "Limitler", label: "Pazaryeri kanalı", values: plans.map((p) => fmtLimit(p.maxMarketplaceChannels)) },
    { group: "Limitler", label: "Müşteri kaydı", values: plans.map((p) => fmtLimit(p.maxCustomers)) },
    { group: "Limitler", label: "Depolama", values: plans.map((p) => fmtStorage(p.storageMb)) },
    { group: "Limitler", label: "Aşan e-belge ücreti", values: plans.map((p) => `₺${Number(p.einvoiceOverageRate).toFixed(2)}/adet`) },
  ];

  return [...featureRows, ...limitRows];
}

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <div className="flex justify-center"><Check className="h-4 w-4 text-emerald-600" /></div>;
  if (value === false) return <div className="flex justify-center text-muted-foreground/40"><Minus className="h-4 w-4" /></div>;
  return <div className="text-center text-sm font-medium">{value}</div>;
}

function ComparisonSection({ plans, recommendedSlug }: { plans: Plan[]; recommendedSlug: string | null }) {
  const matrix = useMemo(() => buildFeatureMatrix(plans), [plans]);
  let lastGroup = "";
  return (
    <section className="container mx-auto px-4 pb-20" data-testid="paket-karsilastirma">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Paket Karşılaştırma
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Tüm özellikler ve limitler yan yana. Her üst paket, alttakinin tümünü kapsar.
          </p>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold w-[34%]">Özellik / Limit</th>
                  {plans.map((p) => {
                    const isRec = recommendedSlug === p.slug;
                    return (
                      <th
                        key={p.slug}
                        className={`text-center px-3 py-3 font-semibold ${isRec ? "text-primary bg-primary/5" : ""}`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{p.name}</span>
                          {isRec && <span className="text-[10px] font-medium uppercase tracking-wide">Senin için önerilen</span>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, idx) => {
                  const showGroup = row.group !== lastGroup;
                  lastGroup = row.group;
                  return (
                    <Fragment key={idx}>
                      {showGroup && (
                        <tr className="bg-muted/30">
                          <td colSpan={1 + plans.length} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {row.group}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-border/50 hover:bg-muted/20 transition">
                        <td className="px-4 py-3 text-foreground">{row.label}</td>
                        {row.values.map((v, i) => {
                          const isRec = recommendedSlug === plans[i]?.slug;
                          return (
                            <td key={i} className={`px-3 py-3 ${isRec ? "bg-primary/5" : ""}`}>
                              <Cell value={v} />
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /><span>Pakete dahil</span></div>
          <div className="flex items-center gap-1.5"><Minus className="h-3.5 w-3.5" /><span>Pakete dahil değil</span></div>
          <div>Sayısal değerler aylık limittir; "Sınırsız" tek elden büyüme planı.</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Plan kartı ---------- */
function PlanCard({ plan, yearly, recommended, popular }: { plan: Plan; yearly: boolean; recommended: boolean; popular: boolean }) {
  const features = useMemo(() => parseFeatures(plan.features), [plan.features]);
  const monthly = Number(plan.priceMonthly);
  const yearlyP = Number(plan.priceYearly);
  const display = yearly ? yearlyP : monthly;
  const monthlyEquiv = yearly ? Math.round(yearlyP / 12) : monthly;

  const ringClass = recommended
    ? "border-primary border-2 shadow-xl ring-2 ring-primary/30"
    : popular
      ? "border-primary/60 border-2 shadow-lg"
      : "border-border hover:border-primary/40 transition";

  const topHighlights = features.slice(0, 6);

  return (
    <Card className={`flex flex-col relative ${ringClass}`} data-testid={`pkg-${plan.slug}`}>
      {recommended && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 bg-primary">
          <Sparkles className="h-3 w-3" /> Sana önerilen
        </Badge>
      )}
      {!recommended && popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">En çok tercih edilen</Badge>
      )}
      <CardHeader className="pb-3">
        <CardTitle className="text-xl" style={{ fontFamily: "var(--font-display)" }}>{plan.name}</CardTitle>
        <p className="text-sm text-muted-foreground min-h-[40px]">{plan.description}</p>
        <div className="pt-2">
          <div className="text-3xl font-extrabold">
            ₺{display.toLocaleString("tr-TR")}
            <span className="text-sm font-normal text-muted-foreground">/{yearly ? "yıl" : "ay"}</span>
          </div>
          {yearly ? (
            <div className="text-xs text-emerald-600 mt-1">Aylık ≈ ₺{monthlyEquiv.toLocaleString("tr-TR")} · 2 ay hediye</div>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">Yıllık ödemede 2 ay hediye</div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="text-xs text-muted-foreground mb-3 grid grid-cols-2 gap-y-1 gap-x-2">
          <div>👤 {fmtLimit(plan.maxUsers)} kullanıcı</div>
          <div>🏢 {fmtLimit(plan.maxBranches)} şube</div>
          <div>📦 {fmtLimit(plan.maxProducts)} ürün</div>
          <div>🧾 {fmtLimit(plan.maxEinvoiceMonthly)} e-belge/ay</div>
          <div>🛒 {fmtLimit(plan.maxMarketplaceChannels)} pazaryeri</div>
          <div>💾 {fmtStorage(plan.storageMb)}</div>
        </div>
        <ul className="space-y-2 text-sm flex-1">
          {topHighlights.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{FEATURE_LABELS[f] ?? f}</span>
            </li>
          ))}
          {features.length > topHighlights.length && (
            <li className="text-xs text-muted-foreground">+{features.length - topHighlights.length} özellik daha</li>
          )}
        </ul>
        <Link href="/iletisim">
          <Button className="w-full mt-5" variant={recommended || popular ? "default" : "outline"} data-testid={`btn-pkg-${plan.slug}`}>
            Detay iste <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/* ---------- Sayfa ---------- */
export default function PaketlerPage() {
  const [yearly, setYearly] = useState(false);
  const [recommendedSlug, setRecommendedSlug] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<PlansResponse>({
    queryKey: ["/api/subscriptions/plans"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/plans");
      if (!r.ok) throw new Error("Plans fetch failed");
      return r.json();
    },
  });

  const plans = useMemo(
    () => (data?.plans || []).filter((p) => p.isPublic !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

  // En çok tercih edilen — sortOrder ortasında olan veya pkg_pro
  const popularSlug = useMemo(() => {
    if (plans.find((p) => p.slug === "pkg_pro")) return "pkg_pro";
    return plans[Math.floor(plans.length / 2)]?.slug ?? null;
  }, [plans]);

  return (
    <div className="min-h-screen bg-background" data-testid="page-paketler">
      <PublicNav />
      <section className="t365-page-hero container mx-auto px-4 py-16 md:py-20 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5" style={{ fontFamily: "var(--font-display)" }}>
          <span className="t365-brand-gradient">Sana uygun bir paket var.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Net paket seçenekleri: küçük işletmeden çok şubeli yapıya. İhtiyaç büyüdükçe yükseltin; verileriniz ve ekibiniz aynı ortamda kalır.
        </p>

        <div className="flex items-center justify-center gap-3 mt-8">
          <span className={!yearly ? "font-semibold" : "text-muted-foreground"}>Aylık</span>
          <Switch checked={yearly} onCheckedChange={setYearly} data-testid="toggle-yearly" />
          <span className={yearly ? "font-semibold" : "text-muted-foreground"}>
            Yıllık <Badge variant="secondary" className="ml-1">2 ay hediye</Badge>
          </span>
        </div>
      </section>

      {/* AI Öneri */}
      {plans.length > 0 && (
        <section className="container mx-auto px-4 pb-12 max-w-4xl">
          <AdvisorWizard plans={plans} onPick={setRecommendedSlug} />
        </section>
      )}

      <section className="container mx-auto px-4 pb-16">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground" data-testid="paketler-loading">Paketler yükleniyor…</div>
        )}
        {isError && (
          <div className="text-center py-12">
            <p className="text-destructive mb-3">Paketler yüklenemedi.</p>
            <Button variant="outline" onClick={() => refetch()}>Tekrar Dene</Button>
          </div>
        )}
        {!isLoading && !isError && plans.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">Şu anda gösterilebilecek paket bulunmuyor.</div>
        )}
        {plans.length > 0 && (
          <>
            <div className={`grid grid-cols-1 md:grid-cols-2 ${plans.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-5 max-w-7xl mx-auto`}>
              {plans.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  yearly={yearly}
                  recommended={recommendedSlug === p.slug}
                  popular={p.slug === popularSlug}
                />
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
              Deneme süresi ve ödeme koşulları hesap politikasına göre değişebilir; kart zorunluluğu ve veri saklama süresi için
              satış veya destek ekibinden güncel metni isteyin.
            </p>
          </>
        )}
      </section>

      {plans.length > 0 && <ComparisonSection plans={plans} recommendedSlug={recommendedSlug} />}

      <PublicFooter />
    </div>
  );
}
