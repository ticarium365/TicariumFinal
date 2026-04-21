import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Users, Package, GitBranch, ShoppingBag,
  CheckCircle, XCircle, AlertCircle, RefreshCw, TrendingUp,
  Star, Zap, Crown, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { labelFeature } from "@/lib/feature-labels";

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────
interface Plan {
  id: number; name: string; slug: string; description?: string;
  priceMonthly: string; priceYearly: string;
  maxUsers: number; maxProducts: number; maxBranches: number; maxMonthlySales: number; storageMb: number;
  features: string;
}
interface Subscription {
  id: number; planId: number; billingCycle: string; status: string;
  startedAt: string; expiresAt?: string | null; cancelledAt?: string | null;
  gracePeriodEndsAt?: string | null;
}
interface Usage { users: number; products: number; branches: number; monthlySales: number; }
interface Invoice { id: number; invoiceNo: string; amount: string; currency: string; status: string; description?: string; createdAt: string; paidAt?: string; }

function fmt(d: string) { return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }); }
function lmt(n: number) { return n === -1 ? "Sınırsız" : n.toLocaleString("tr-TR"); }

function usageBar(current: number, max: number) {
  if (max === -1) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

function planIcon(slug: string) {
  if (slug === "free") return <Zap className="h-5 w-5 text-muted-foreground" />;
  if (slug === "starter") return <Star className="h-5 w-5 text-blue-500" />;
  if (slug === "pro") return <TrendingUp className="h-5 w-5 text-teal-500" />;
  return <Crown className="h-5 w-5 text-blue-600" />;
}

function planColor(slug: string) {
  if (slug === "free") return "bg-slate-50 border-slate-200";
  if (slug === "starter") return "bg-blue-50 border-blue-200";
  if (slug === "pro") return "bg-teal-50 border-teal-200 ring-2 ring-teal-200";
  return "bg-gradient-to-br from-blue-50 to-teal-50 border-blue-200";
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"overview" | "plans" | "invoices">("overview");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // ─── Sorgular ─────────────────────────────────────────────────────────────
  const currentQ = useQuery<{ subscription: Subscription | null; plan: Plan | null; usage: Usage; companyPlanType: string; trialEndsAt: string | null }>({
    queryKey: ["subscription-current"],
    queryFn: async () => { const r = await fetch("/api/subscriptions/current", { credentials: "include" }); return r.json(); },
  });
  const plansQ = useQuery<{ plans: Plan[] }>({
    queryKey: ["subscription-plans"],
    queryFn: async () => { const r = await fetch("/api/subscriptions/plans", { credentials: "include" }); return r.json(); },
    enabled: tab === "plans",
  });
  const invoicesQ = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["subscription-invoices"],
    queryFn: async () => { const r = await fetch("/api/subscriptions/invoices", { credentials: "include" }); return r.json(); },
    enabled: tab === "invoices",
  });

  // ─── Mutasyonlar ──────────────────────────────────────────────────────────
  const subscribe = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/subscriptions/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["subscription-current"] });
      qc.invalidateQueries({ queryKey: ["subscription-invoices"] });
      toast({ title: `${d.plan.name} planına geçildi!` });
      setTab("overview");
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/subscriptions/cancel", { method: "POST", credentials: "include" });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["subscription-current"] });
      toast({ title: "Abonelik iptal edildi", description: d.message });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const reactivate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/subscriptions/reactivate", { method: "POST", credentials: "include" });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subscription-current"] }); toast({ title: "Abonelik yenilendi" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const payInvoice = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/subscriptions/invoices/${id}/pay`, { method: "POST", credentials: "include" });
      const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subscription-invoices"] }); toast({ title: "Fatura ödendi" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const { data: current, isLoading } = currentQ;
  const subscription = current?.subscription;
  const activePlan = current?.plan;
  const usage = current?.usage;
  const plans = plansQ.data?.plans ?? [];
  const invoices = invoicesQ.data?.invoices ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Abonelik & Plan</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Plan yönetimi ve fatura geçmişi</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => qc.invalidateQueries({ queryKey: ["subscription-current"] })}>
          <RefreshCw className="h-3.5 w-3.5" />Yenile
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {[{ id: "overview" as const, label: "Genel Bakış" }, { id: "plans" as const, label: "Planlar" }, { id: "invoices" as const, label: "Faturalar" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── GENEL BAKIŞ ────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div> : (
            <>
              {/* Plan kartı */}
              <div className={`border-2 rounded-xl p-5 ${activePlan ? planColor(activePlan.slug) : "bg-muted/30 border-border"}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {activePlan && planIcon(activePlan.slug)}
                    <div>
                      <p className="font-bold text-lg">{activePlan?.name ?? "Deneme"}</p>
                      <p className="text-sm text-muted-foreground">{activePlan?.description ?? "21 gün ücretsiz deneme"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {subscription?.status === "active" && <span className="text-xs px-2 py-0.5 bg-green-500/15 text-green-300 rounded-full font-semibold">Aktif</span>}
                    {subscription?.status === "grace_period" && <span className="text-xs px-2 py-0.5 bg-amber-500/15 text-amber-300 rounded-full font-semibold">İptal Edildi</span>}
                    {!subscription && current?.companyPlanType === "trial" && <span className="text-xs px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded-full font-semibold">Deneme</span>}
                  </div>
                </div>

                {subscription && (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {subscription.expiresAt && <span>Bitiş: {fmt(subscription.expiresAt)}</span>}
                    {subscription.billingCycle && <span>· {subscription.billingCycle === "monthly" ? "Aylık" : "Yıllık"} faturalandırma</span>}
                    {subscription.gracePeriodEndsAt && <span className="text-amber-400">· Grace period: {fmt(subscription.gracePeriodEndsAt)}</span>}
                  </div>
                )}
                {current?.trialEndsAt && !subscription && (
                  <p className="mt-2 text-xs text-amber-400">Deneme bitiş: {fmt(current.trialEndsAt)}</p>
                )}

                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => setTab("plans")}>
                    <TrendingUp className="h-3.5 w-3.5" />{activePlan ? "Planı Değiştir" : "Plan Seç"}
                  </Button>
                  {subscription?.status === "active" && (
                    <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                      {cancel.isPending ? "İptal ediliyor..." : "Aboneliği İptal Et"}
                    </Button>
                  )}
                  {subscription?.status === "grace_period" && (
                    <Button size="sm" variant="outline" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
                      {reactivate.isPending ? "Yenileniyor..." : "Aboneliği Yenile"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Kullanım istatistikleri */}
              {usage && activePlan && (
                <div className="bg-card border rounded-xl p-4">
                  <p className="font-semibold text-sm mb-3">Kullanım Durumu</p>
                  <div className="space-y-3">
                    {[
                      { label: "Kullanıcılar", current: usage.users, max: activePlan.maxUsers, icon: Users, color: "bg-blue-500" },
                      { label: "Ürünler", current: usage.products, max: activePlan.maxProducts, icon: Package, color: "bg-emerald-500" },
                      { label: "Şubeler", current: usage.branches, max: activePlan.maxBranches, icon: GitBranch, color: "bg-purple-500" },
                      { label: "Bu Ay Satış", current: usage.monthlySales, max: activePlan.maxMonthlySales, icon: ShoppingBag, color: "bg-amber-500" },
                    ].map(item => {
                      const pct = usageBar(item.current, item.max);
                      const isWarning = item.max !== -1 && pct > 80;
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                              {item.label}
                            </div>
                            <span className={`text-xs font-semibold ${isWarning ? "text-amber-400" : "text-muted-foreground"}`}>
                              {item.current.toLocaleString("tr-TR")} / {lmt(item.max)}
                            </span>
                          </div>
                          {item.max !== -1 && (
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${isWarning ? "bg-amber-500" : item.color}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          {item.max === -1 && (
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 rounded-full w-full opacity-30" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── PLANLAR ────────────────────────────────────────── */}
      {tab === "plans" && (
        <div className="space-y-4">
          {/* Fatura döngüsü */}
          <div className="flex justify-center gap-2 p-1 bg-muted rounded-xl w-fit mx-auto">
            <button onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${billingCycle === "monthly" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
              Aylık
            </button>
            <button onClick={() => setBillingCycle("yearly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${billingCycle === "yearly" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
              Yıllık <span className="text-xs text-green-400 font-bold">-17%</span>
            </button>
          </div>

          {plansQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map(plan => {
                const isActive = activePlan?.id === plan.id;
                const price = billingCycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
                let features: string[] = [];
                try { features = JSON.parse(plan.features); } catch { features = []; }

                return (
                  <div key={plan.id} className={`border-2 rounded-xl p-4 ${planColor(plan.slug)} ${isActive ? "opacity-80" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {planIcon(plan.slug)}
                      <p className="font-bold">{plan.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{plan.description}</p>
                    <div className="mb-4">
                      <span className="text-2xl font-bold">₺{Number(price).toLocaleString("tr-TR")}</span>
                      <span className="text-xs text-muted-foreground">/{billingCycle === "monthly" ? "ay" : "yıl"}</span>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground mb-4">
                      <div className="flex justify-between"><span>Kullanıcı</span><span className="font-semibold text-foreground">{lmt(plan.maxUsers)}</span></div>
                      <div className="flex justify-between"><span>Ürün</span><span className="font-semibold text-foreground">{lmt(plan.maxProducts)}</span></div>
                      <div className="flex justify-between"><span>Şube</span><span className="font-semibold text-foreground">{lmt(plan.maxBranches)}</span></div>
                      <div className="flex justify-between"><span>Aylık Satış</span><span className="font-semibold text-foreground">{lmt(plan.maxMonthlySales)}</span></div>
                    </div>

                    <ul className="space-y-1 mb-4">
                      {features.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                          <span>{labelFeature(f)}</span>
                        </li>
                      ))}
                    </ul>

                    {isActive ? (
                      <Button disabled className="w-full" size="sm">Mevcut Plan</Button>
                    ) : (
                      <Button className="w-full" size="sm"
                        onClick={() => subscribe.mutate({ planId: plan.id, billingCycle })}
                        disabled={subscribe.isPending}>
                        {subscribe.isPending ? "Geçiliyor..." : "Bu Planı Seç"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── FATURALAR ──────────────────────────────────────── */}
      {tab === "invoices" && (
        <div className="space-y-4">
          {invoicesQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
            : invoices.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed rounded-xl">
                <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Henüz fatura yok</p>
              </div>
            ) : (
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Fatura No</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Açıklama</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Tutar</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Durum</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase">Tarih</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-muted/10">
                        <td className="px-4 py-2.5 font-mono text-xs">{inv.invoiceNo}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{inv.description ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">₺{Number(inv.amount).toLocaleString("tr-TR")}</td>
                        <td className="px-4 py-2.5">
                          {inv.status === "paid"
                            ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Ödendi</span>
                            : inv.status === "failed"
                              ? <span className="text-xs text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" />Başarısız</span>
                              : <span className="text-xs text-amber-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Bekliyor</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmt(inv.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          {inv.status === "pending" && (
                            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => payInvoice.mutate(inv.id)} disabled={payInvoice.isPending}>
                              Öde
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
