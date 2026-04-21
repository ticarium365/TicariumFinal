import { db, usageCountersTable, companySubscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { and, eq, sql, inArray, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Dalga 19 — Aylık kontör metering.
 * Dalga 23 — purchasedCredits desteği + assertWithinUsageLimit gating + addPurchasedCredits.
 *
 * Effective limit = planLimit + purchasedCredits.
 *   - count <= effectiveLimit → overage = 0
 *   - count > effectiveLimit  → overage = count - effectiveLimit (overageRate ile çarpılır)
 *   - planLimit -1 (sınırsız) → overage hep 0
 *   - planLimit 0 → effective limit = purchasedCredits (yalnız satın alınmış kontör)
 */

export type UsageMetric = "einvoice" | "ocr" | "api_calls" | "sms";

export class QuotaExceededError extends Error {
  code = "QUOTA_EXCEEDED";
  constructor(public metric: UsageMetric, public limit: number, public currentCount: number) {
    super(`Kontör aşıldı: ${metric} (${currentCount}/${limit})`);
  }
}

export function currentPeriodUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface PlanLimitsForUsage {
  maxEinvoiceMonthly: number;
  einvoiceOverageRate: string;
  maxOcrMonthly: number;
  maxApiCallsMonthly: number;
}

async function getActivePlanLimits(companyId: number): Promise<PlanLimitsForUsage | null> {
  const [row] = await db
    .select({
      maxEinvoiceMonthly: subscriptionPlansTable.maxEinvoiceMonthly,
      einvoiceOverageRate: subscriptionPlansTable.einvoiceOverageRate,
      maxOcrMonthly: subscriptionPlansTable.maxOcrMonthly,
      maxApiCallsMonthly: subscriptionPlansTable.maxApiCallsMonthly,
    })
    .from(companySubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(and(
      eq(companySubscriptionsTable.companyId, companyId),
      inArray(companySubscriptionsTable.status, ["active", "trial", "grace_period"]),
    ))
    .orderBy(desc(companySubscriptionsTable.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    maxEinvoiceMonthly: row.maxEinvoiceMonthly ?? 0,
    einvoiceOverageRate: row.einvoiceOverageRate ?? "0",
    maxOcrMonthly: row.maxOcrMonthly ?? 0,
    maxApiCallsMonthly: row.maxApiCallsMonthly ?? 0,
  };
}

function planLimitForMetric(plan: PlanLimitsForUsage, metric: UsageMetric): number {
  switch (metric) {
    case "einvoice":  return plan.maxEinvoiceMonthly;
    case "ocr":       return plan.maxOcrMonthly;
    case "api_calls": return plan.maxApiCallsMonthly;
    case "sms":       return -1;
  }
}

function overageRateForMetric(plan: PlanLimitsForUsage, metric: UsageMetric): number {
  if (metric === "einvoice") return Number(plan.einvoiceOverageRate || "0");
  return 0;
}

/**
 * Dalga 23 — Gating helper. Çağıran route, `assertWithinUsageLimit` döndürdükten
 * sonra ana işi yapar; bitince `incrementUsageSafe` ile sayar.
 *
 * Davranış:
 *   - planLimit === -1 (sınırsız) → her zaman OK
 *   - planLimit === 0 ve purchasedCredits === 0 → 402 (kontör satın al)
 *   - count + by > planLimit + purchasedCredits → 402
 *   - else OK
 *
 * @throws QuotaExceededError (route 402 + JSON döndürür)
 */
export async function assertWithinUsageLimit(
  companyId: number,
  metric: UsageMetric,
  by: number = 1,
): Promise<void> {
  const plan = await getActivePlanLimits(companyId);
  const planLimit = plan ? planLimitForMetric(plan, metric) : 0;
  if (planLimit < 0) return; // sınırsız

  const period = currentPeriodUTC();
  const [row] = await db.select({
    count: usageCountersTable.count,
    purchased: usageCountersTable.purchasedCredits,
  }).from(usageCountersTable)
    .where(and(
      eq(usageCountersTable.companyId, companyId),
      eq(usageCountersTable.period, period),
      eq(usageCountersTable.metric, metric),
    )).limit(1);

  const count = row?.count ?? 0;
  const purchased = row?.purchased ?? 0;
  const effective = planLimit + purchased;
  if (count + by > effective) {
    throw new QuotaExceededError(metric, effective, count);
  }
}

/**
 * Atomik UPSERT: count += by, overage hesabı same-statement (race-safe).
 * Dalga 23: effective limit = planLimit + usage_counters.purchased_credits (mevcut row).
 * Insert path: yeni row → purchased_credits = 0 default; effective = planLimit.
 * Update path: önce mevcut purchased okunur (CASE içinde usage_counters.purchased_credits).
 */
export async function incrementUsage(
  companyId: number,
  metric: UsageMetric,
  by: number = 1,
): Promise<{ count: number; overageCount: number; overageAmount: string } | null> {
  if (by <= 0) return null;
  const period = currentPeriodUTC();
  const plan = await getActivePlanLimits(companyId);
  const limit = plan ? planLimitForMetric(plan, metric) : 0;
  const rate = plan ? overageRateForMetric(plan, metric) : 0;
  try {
    // limit < 0 (sınırsız) → overage hep 0; effective = limit + purchased_credits.
    const result: any = await db.execute(sql`
      INSERT INTO usage_counters (company_id, period, metric, count, overage_count, overage_amount, purchased_credits, last_increment_at, created_at, updated_at)
      VALUES (
        ${companyId}, ${period}, ${metric}, ${by},
        CASE WHEN ${limit}::int >= 0 AND ${by}::int > ${limit}::int THEN ${by}::int - ${limit}::int ELSE 0 END,
        CASE WHEN ${limit}::int >= 0 AND ${by}::int > ${limit}::int THEN ((${by}::int - ${limit}::int)::numeric * ${rate}::numeric) ELSE 0 END,
        0, NOW(), NOW(), NOW()
      )
      ON CONFLICT (company_id, period, metric)
      DO UPDATE SET
        count = usage_counters.count + EXCLUDED.count,
        overage_count = CASE
          WHEN ${limit}::int < 0 THEN 0
          WHEN (usage_counters.count + EXCLUDED.count) > (${limit}::int + usage_counters.purchased_credits)
            THEN (usage_counters.count + EXCLUDED.count) - (${limit}::int + usage_counters.purchased_credits)
          ELSE 0
        END,
        overage_amount = CASE
          WHEN ${limit}::int < 0 THEN 0
          WHEN (usage_counters.count + EXCLUDED.count) > (${limit}::int + usage_counters.purchased_credits)
            THEN ((usage_counters.count + EXCLUDED.count) - (${limit}::int + usage_counters.purchased_credits))::numeric * ${rate}::numeric
          ELSE 0
        END,
        last_increment_at = NOW(),
        updated_at = NOW()
      RETURNING count, overage_count, overage_amount
    `);
    const row = (result as any)?.rows?.[0] ?? (Array.isArray(result) ? result[0] : null);
    const newCount = Number(row?.count ?? 0);
    const overageCount = Number(row?.overage_count ?? 0);
    const overageAmount = String(row?.overage_amount ?? "0");
    return { count: newCount, overageCount, overageAmount };
  } catch (err) {
    logger.warn({ err, companyId, metric, by }, "usage_increment_failed");
    return null;
  }
}

export function incrementUsageSafe(companyId: number, metric: UsageMetric, by: number = 1): void {
  void incrementUsage(companyId, metric, by).catch((err) => {
    logger.warn({ err, companyId, metric }, "usage_increment_safe_failed");
  });
}

/**
 * Dalga 23 — Kontör paketi başarıyla satın alındığında çağrılır.
 * Atomik UPSERT: purchased_credits += quantity (current period satırına yazılır;
 * yoksa açar). Overage stale değer için yeniden hesap yapılır (effective büyüdüğü için
 * count <= newEffective olabilir).
 */
export async function addPurchasedCredits(
  companyId: number,
  metric: UsageMetric,
  quantity: number,
  period?: string,
): Promise<void> {
  if (quantity <= 0) return;
  // Dalga 23 — Period explicit: top-up satın alındığı period'a yazılır.
  // currentPeriodUTC() fallback geriye dönük uyumluluk için.
  const targetPeriod = period && /^\d{4}-\d{2}$/.test(period) ? period : currentPeriodUTC();
  const plan = await getActivePlanLimits(companyId);
  const limit = plan ? planLimitForMetric(plan, metric) : 0;
  const rate = plan ? overageRateForMetric(plan, metric) : 0;
  await db.execute(sql`
    INSERT INTO usage_counters (company_id, period, metric, count, overage_count, overage_amount, purchased_credits, last_increment_at, created_at, updated_at)
    VALUES (${companyId}, ${targetPeriod}, ${metric}, 0, 0, 0, ${quantity}, NOW(), NOW(), NOW())
    ON CONFLICT (company_id, period, metric)
    DO UPDATE SET
      purchased_credits = usage_counters.purchased_credits + EXCLUDED.purchased_credits,
      overage_count = CASE
        WHEN ${limit}::int < 0 THEN 0
        WHEN usage_counters.count > (${limit}::int + usage_counters.purchased_credits + EXCLUDED.purchased_credits)
          THEN usage_counters.count - (${limit}::int + usage_counters.purchased_credits + EXCLUDED.purchased_credits)
        ELSE 0
      END,
      overage_amount = CASE
        WHEN ${limit}::int < 0 THEN 0
        WHEN usage_counters.count > (${limit}::int + usage_counters.purchased_credits + EXCLUDED.purchased_credits)
          THEN (usage_counters.count - (${limit}::int + usage_counters.purchased_credits + EXCLUDED.purchased_credits))::numeric * ${rate}::numeric
        ELSE 0
      END,
      updated_at = NOW()
  `);
}

export interface UsagePeriodSummary {
  period: string;
  einvoice: { count: number; overage: number; purchased: number };
  ocr: { count: number; overage: number; purchased: number };
  apiCalls: { count: number; overage: number; purchased: number };
  sms: { count: number; overage: number; purchased: number };
}

export async function getUsageForCurrentPeriod(companyId: number): Promise<UsagePeriodSummary> {
  const period = currentPeriodUTC();
  const rows = await db
    .select({
      metric: usageCountersTable.metric,
      count: usageCountersTable.count,
      overageCount: usageCountersTable.overageCount,
      purchased: usageCountersTable.purchasedCredits,
    })
    .from(usageCountersTable)
    .where(and(
      eq(usageCountersTable.companyId, companyId),
      eq(usageCountersTable.period, period),
    ));
  const empty = { count: 0, overage: 0, purchased: 0 };
  const out: UsagePeriodSummary = {
    period,
    einvoice: { ...empty },
    ocr: { ...empty },
    apiCalls: { ...empty },
    sms: { ...empty },
  };
  for (const r of rows) {
    const summary = { count: r.count, overage: r.overageCount, purchased: r.purchased };
    switch (r.metric) {
      case "einvoice":  out.einvoice = summary; break;
      case "ocr":       out.ocr = summary; break;
      case "api_calls": out.apiCalls = summary; break;
      case "sms":       out.sms = summary; break;
    }
  }
  return out;
}
