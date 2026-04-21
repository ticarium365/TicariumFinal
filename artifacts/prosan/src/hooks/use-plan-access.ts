// ─── Dalga 18B: Plan-aware UI gating hook ──────────────────────────────────
// Frontend tarafında "bu özellik bu pakete dahil mi / kontör doldu mu / trial bitti mi?"
// sorularını tek noktadan yanıtlar. /me'den gelen plan bilgisi kullanılır.
//
// Backend'deki requireFeature middleware'inden bağımsız bir UX katmanıdır:
// kilitleri görünür yapar, "Yükselt" CTA'sı sunar. Server tarafı yine korur.
import { useMemo } from "react";
import { useAuth, type PlanInfo, type PlanLimits, type UsageInfo } from "@/components/auth-context";

/** Paket hiyerarşisi — yukarıdaki her paket aşağıdakini kapsar */
const PLAN_RANK: Record<string, number> = {
  pkg_starter: 1,
  pkg_pro: 2,
  pkg_business_v3: 3,
  pkg_enterprise_v3: 4,
  pkg_trial_enterprise: 4, // trial = enterprise düzeyi
  pkg_procurement: 0,
};

/** Hangi paket hangi feature kodlarını içerir (frontend cache'i) */
const PLAN_FEATURES: Record<string, Set<string>> = {
  pkg_starter: new Set([
    "inventory.core","stock.counts","barcode.print","sales.pos","sales.invoices",
    "customers.crm","suppliers","einvoice.basic","profit.dashboard",
  ]),
  pkg_pro: new Set([
    "inventory.core","stock.counts","barcode.print","sales.pos","sales.invoices",
    "customers.crm","suppliers","einvoice.basic","einvoice.pro",
    "finance.expenses","finance.banking","hr.staff","assets.fixed","ocr.receipts",
    "documents","profit.dashboard","profit.holding_cost","marketplace.basic","campaigns",
  ]),
  pkg_business_v3: new Set([
    "inventory.core","stock.counts","barcode.print","sales.pos","sales.invoices",
    "customers.crm","suppliers","einvoice.basic","einvoice.pro",
    "finance.expenses","finance.banking","hr.staff","hr.payroll","assets.fixed",
    "ocr.receipts","documents","profit.dashboard","profit.holding_cost","profit.true_dashboard",
    "marketplace.basic","marketplace.pro","campaigns","loyalty.points","currency.multi",
    "reports.advanced","api.public","production.bom",
  ]),
  pkg_enterprise_v3: new Set([
    "inventory.core","stock.counts","barcode.print","sales.pos","sales.invoices",
    "customers.crm","suppliers","einvoice.basic","einvoice.pro",
    "finance.expenses","finance.banking","hr.staff","hr.payroll","assets.fixed",
    "ocr.receipts","documents","profit.dashboard","profit.holding_cost","profit.true_dashboard",
    "profit.ai_advisor","marketplace.basic","marketplace.pro","campaigns","loyalty.points",
    "currency.multi","reports.advanced","api.public","integrations.accounting",
    "production.bom","accountant.panel","integrations.webhooks",
  ]),
  pkg_trial_enterprise: new Set([
    "inventory.core","stock.counts","barcode.print","sales.pos","sales.invoices",
    "customers.crm","suppliers","einvoice.basic","einvoice.pro",
    "finance.expenses","finance.banking","hr.staff","hr.payroll","assets.fixed",
    "ocr.receipts","documents","profit.dashboard","profit.holding_cost","profit.true_dashboard",
    "profit.ai_advisor","marketplace.basic","marketplace.pro","campaigns","loyalty.points",
    "currency.multi","reports.advanced","api.public","integrations.accounting",
    "production.bom","accountant.panel","integrations.webhooks",
  ]),
  // Backend pkg_procurement features ile birebir senkron (api-server/src/routes/subscriptions.ts)
  pkg_procurement: new Set(["customers.crm", "suppliers", "documents"]),
};

export interface PlanAccess {
  plan: PlanInfo | null;
  /** Plan henüz yüklenmedi (loading state) */
  isLoading: boolean;
  /** Plan deneme süresinde mi */
  isTrial: boolean;
  /** Trial bittiyse true (status='trial' AND now > trialEndsAt) */
  isTrialExpired: boolean;
  /** Trial bitişine kalan gün (negatif = bitti, null = trial değil) */
  trialDaysLeft: number | null;
  /** Bu kod kullanıcının paketine dahil mi */
  hasFeature: (code: string) => boolean;
  /** Mevcut paket en az bu kadar üst seviyede mi (slug karşılaştırma) */
  meetsMinPlan: (minSlug: string) => boolean;
  /** Limit aşıldı mı (-1 = sınırsız → false) */
  isOverLimit: (limit: keyof PlanLimits, currentValue: number) => boolean;
  /** Limit %80 üzerine çıktı mı (uyarı amaçlı) */
  isApproachingLimit: (limit: keyof PlanLimits, currentValue: number) => boolean;
  /** Dalga 19 — bu ay kontör kullanımı (null = henüz yüklenmedi) */
  usage: UsageInfo | null;
  /** Belirli bir kontör için kullanım/limit oranı (0..1+, sınırsızsa 0) */
  usageRatio: (metric: "einvoice" | "ocr" | "apiCalls") => number;
  /** Kontör kotası aşıldı mı (overage > 0 veya ratio >= 1) */
  isOverUsage: (metric: "einvoice" | "ocr" | "apiCalls") => boolean;
}

const USAGE_LIMIT_MAP: Record<"einvoice" | "ocr" | "apiCalls", keyof PlanLimits> = {
  einvoice: "maxEinvoiceMonthly",
  ocr: "maxOcrMonthly",
  apiCalls: "maxApiCallsMonthly",
};

export function usePlanAccess(): PlanAccess {
  const { plan, isLoading, usage } = useAuth();

  return useMemo<PlanAccess>(() => {
    const isTrial = !!plan?.isTrial;
    const trialEnds = plan?.trialEndsAt ? new Date(plan.trialEndsAt).getTime() : null;
    const now = Date.now();
    const trialDaysLeft = trialEnds ? Math.ceil((trialEnds - now) / (24 * 60 * 60 * 1000)) : null;
    const isTrialExpired = isTrial && trialEnds !== null && now > trialEnds;

    const features = plan ? PLAN_FEATURES[plan.slug] ?? new Set<string>() : new Set<string>();
    const myRank = plan ? PLAN_RANK[plan.slug] ?? 0 : 0;

    return {
      plan,
      isLoading,
      isTrial,
      isTrialExpired,
      trialDaysLeft,
      hasFeature: (code: string) => features.has(code),
      meetsMinPlan: (minSlug: string) => myRank >= (PLAN_RANK[minSlug] ?? 0),
      isOverLimit: (limit, currentValue) => {
        const max = plan?.limits?.[limit];
        if (max === undefined || max === null) return false;
        if (max === -1) return false;
        return currentValue >= (max as number);
      },
      isApproachingLimit: (limit, currentValue) => {
        const max = plan?.limits?.[limit];
        if (max === undefined || max === null) return false;
        if (max === -1) return false;
        return currentValue >= 0.8 * (max as number) && currentValue < (max as number);
      },
      usage,
      usageRatio: (metric) => {
        const max = plan?.limits?.[USAGE_LIMIT_MAP[metric]] as number | undefined;
        if (!max || max < 0) return 0;
        const used = usage?.[metric]?.count ?? 0;
        return used / max;
      },
      isOverUsage: (metric) => {
        const overage = usage?.[metric]?.overage ?? 0;
        if (overage > 0) return true;
        const max = plan?.limits?.[USAGE_LIMIT_MAP[metric]] as number | undefined;
        if (!max || max < 0) return false;
        return (usage?.[metric]?.count ?? 0) >= max;
      },
    };
  }, [plan, isLoading, usage]);
}
