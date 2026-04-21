import { pgTable, serial, integer, text, timestamp, uniqueIndex, index, numeric } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

/**
 * Dalga 19 — Aylık kontör sayaçları (e-fatura, OCR, API çağrıları, vs).
 * Her (company, period, metric) tek satır; period = 'YYYY-MM' UTC.
 * UPSERT pattern: ON CONFLICT (company_id, period, metric) DO UPDATE SET count = count + EXCLUDED.count.
 */
export const usageCountersTable = pgTable("usage_counters", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  period: text("period").notNull(), // 'YYYY-MM' (UTC)
  metric: text("metric").notNull(), // 'einvoice' | 'ocr' | 'api_calls' | 'sms' | ...
  count: integer("count").notNull().default(0),
  // Plan limit aşıldıktan sonra biriken adet (overage = count - planLimit, 0 üzeri).
  overageCount: integer("overage_count").notNull().default(0),
  // Aşım birim TL toplamı snapshot'ı (overageCount * einvoiceOverageRate). Faturalama için.
  overageAmount: numeric("overage_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  lastIncrementAt: timestamp("last_increment_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uq: uniqueIndex("usage_counters_company_period_metric_uq").on(t.companyId, t.period, t.metric),
  byCompanyPeriod: index("usage_counters_company_period_idx").on(t.companyId, t.period),
}));

export type UsageCounter = typeof usageCountersTable.$inferSelect;
export type NewUsageCounter = typeof usageCountersTable.$inferInsert;
