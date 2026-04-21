// ─── Dalga 18B: Plan-aware UI gate ──────────────────────────────────────────
// Çocuk içeriği yalnızca kullanıcının paketi izin veriyorsa render eder.
// Aksi halde upgrade CTA'sı veya custom fallback gösterir.
import { ReactNode } from "react";
import { Lock, ArrowUpRight, Crown } from "lucide-react";
import { Link } from "wouter";
import { usePlanAccess } from "@/hooks/use-plan-access";
import { Button } from "@/components/ui/button";

interface PlanGateProps {
  /** Bu feature kodu paket içinde değilse içerik kilitlenir */
  feature?: string;
  /** Bu paketten daha düşük paketler kilitlenir (slug: pkg_pro vb.) */
  minPlan?: string;
  /** Kilitliyken gösterilecek özel içerik (opsiyonel) */
  fallback?: ReactNode;
  /** Default fallback'te gösterilecek başlık */
  title?: string;
  /** Default fallback'te açıklama metni */
  description?: string;
  children: ReactNode;
}

const PLAN_NAMES: Record<string, string> = {
  pkg_starter: "Başlangıç",
  pkg_pro: "Pro",
  pkg_business_v3: "Business",
  pkg_enterprise_v3: "Kurumsal",
};

export function PlanGate({
  feature,
  minPlan,
  fallback,
  title,
  description,
  children,
}: PlanGateProps) {
  const { hasFeature, meetsMinPlan, plan, isLoading } = usePlanAccess();

  if (isLoading) {
    return null;
  }

  const featureOk = !feature || hasFeature(feature);
  const planOk = !minPlan || meetsMinPlan(minPlan);

  if (featureOk && planOk) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const requiredPlanName = minPlan ? PLAN_NAMES[minPlan] ?? "üst paket" : "üst paket";
  const currentPlanName = plan ? PLAN_NAMES[plan.slug] ?? plan.name : "paketinizde";

  return (
    <div className="border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-6 text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40">
        <Lock className="h-5 w-5 text-amber-700 dark:text-amber-300" />
      </div>
      <div>
        <h3 className="text-base font-semibold flex items-center justify-center gap-1.5 text-amber-900 dark:text-amber-100">
          <Crown className="h-4 w-4" />
          {title ?? `Bu özellik ${requiredPlanName} paketine özel`}
        </h3>
        <p className="text-sm text-amber-800/80 dark:text-amber-200/80 mt-1 max-w-md mx-auto">
          {description ?? `Şu an ${currentPlanName} paketindesiniz. Yükselterek tüm özelliklerin kilidini açın.`}
        </p>
      </div>
      <Button asChild size="sm" variant="default">
        <Link href="/paketler" className="inline-flex items-center gap-1.5">
          Paketleri İncele <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
