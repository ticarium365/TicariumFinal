import { db, usageCountersTable, companySubscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { and, eq, sql, inArray, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Dalga 19 — Aylık kontör metering.
 * UPSERT semantiği: ON CONFLICT (company, period, metric) DO UPDATE SET count = count + EXCLUDED.count.
 * Plan limit aşıldığında overageCount + overageAmount snapshot'ı güncellenir (faturalama Dalga 23'te).
 */

export type UsageMetric = "einvoice" | "ocr" | "api_calls" | "sms";

export function currentPeriodUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface PlanLimitsForUsage {
  maxEinvoiceMonthly: number;
  einvoiceOverageRate: string; // numeric
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
    case "sms":       return -1; // henüz kotalı değil
  }
}

function overageRateForMetric(plan: PlanLimitsForUsage, metric: UsageMetric): number {
  if (metric === "einvoice") return Number(plan.einvoiceOverageRate || "0");
  return 0;
}

/**
 * Atomik UPSERT: count += by, overage hesabı RETURNING'den hemen sonra
 * SAME-statement UPDATE ile yapılır → race-safe (architect 2. round fix).
 * Plan limit -1 (sınırsız) veya 0 → overage daima 0; mid-period plan upgrade
 * de stale overage'ı temizler.
 */
export async function incrementUsage(
  companyId: number,
  metric: UsageMetric,
  by: number = 1,
): Promise<{ count: number; overageCount: number; overageAmount: string } | null> {
  if (by <= 0) return null;
  const period = currentPeriodUTC();
  // Plan limit + overage rate'i tek bir SELECT ile çek (yarış öncesi snapshot;
  // amaç count'tan türemiş overage'ın hep aynı limit referansıyla hesaplanması).
  const plan = await getActivePlanLimits(companyId);
  const limit = plan ? planLimitForMetric(plan, metric) : 0;
  const rate = plan ? overageRateForMetric(plan, metric) : 0;
  try {
    // Tek statement: count += by, overage = GREATEST(count - limit, 0) where limit > 0 else 0.
    // Postgres ON CONFLICT DO UPDATE içinde yeni count'u görmek için EXCLUDED + tablo.value kullanırız;
    // overage GREATEST ile clamp + limit<=0 (sınırsız/0) durumunda 0'a sıfırlanır.
    const result: any = await db.execute(sql`
      INSERT INTO usage_counters (company_id, period, metric, count, overage_count, overage_amount, last_increment_at, created_at, updated_at)
      VALUES (
        ${companyId}, ${period}, ${metric}, ${by},
        CASE WHEN ${limit}::int > 0 AND ${by}::int > ${limit}::int THEN ${by}::int - ${limit}::int ELSE 0 END,
        CASE WHEN ${limit}::int > 0 AND ${by}::int > ${limit}::int THEN ((${by}::int - ${limit}::int)::numeric * ${rate}::numeric) ELSE 0 END,
        NOW(), NOW(), NOW()
      )
      ON CONFLICT (company_id, period, metric)
      DO UPDATE SET
        count = usage_counters.count + EXCLUDED.count,
        overage_count = CASE
          WHEN ${limit}::int <= 0 THEN 0
          WHEN (usage_counters.count + EXCLUDED.count) > ${limit}::int
            THEN (usage_counters.count + EXCLUDED.count) - ${limit}::int
          ELSE 0
        END,
        overage_amount = CASE
          WHEN ${limit}::int <= 0 THEN 0
          WHEN (usage_counters.count + EXCLUDED.count) > ${limit}::int
            THEN ((usage_counters.count + EXCLUDED.count) - ${limit}::int)::numeric * ${rate}::numeric
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

/**
 * Sessizce çağır — incrementUsage hata fırlatmaz, ama Promise'ı tutmadan logla.
 * E-fatura / OCR akışlarının kendisi metering hatası yüzünden BLOKE OLMAMALI.
 */
export function incrementUsageSafe(companyId: number, metric: UsageMetric, by: number = 1): void {
  void incrementUsage(companyId, metric, by).catch((err) => {
    logger.warn({ err, companyId, metric }, "usage_increment_safe_failed");
  });
}

export interface UsagePeriodSummary {
  period: string;
  einvoice: { count: number; overage: number };
  ocr: { count: number; overage: number };
  apiCalls: { count: number; overage: number };
  sms: { count: number; overage: number };
}

export async function getUsageForCurrentPeriod(companyId: number): Promise<UsagePeriodSummary> {
  const period = currentPeriodUTC();
  const rows = await db
    .select({
      metric: usageCountersTable.metric,
      count: usageCountersTable.count,
      overageCount: usageCountersTable.overageCount,
    })
    .from(usageCountersTable)
    .where(and(
      eq(usageCountersTable.companyId, companyId),
      eq(usageCountersTable.period, period),
    ));
  const empty = { count: 0, overage: 0 };
  const out: UsagePeriodSummary = {
    period,
    einvoice: { ...empty },
    ocr: { ...empty },
    apiCalls: { ...empty },
    sms: { ...empty },
  };
  for (const r of rows) {
    const summary = { count: r.count, overage: r.overageCount };
    switch (r.metric) {
      case "einvoice":  out.einvoice = summary; break;
      case "ocr":       out.ocr = summary; break;
      case "api_calls": out.apiCalls = summary; break;
      case "sms":       out.sms = summary; break;
    }
  }
  return out;
}
