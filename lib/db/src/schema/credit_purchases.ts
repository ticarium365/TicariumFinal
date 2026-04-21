import { pgTable, serial, integer, text, numeric, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Dalga 23 — Ek kontör (top-up) satın alma geçmişi.
 * Bir top-up = belli bir metric için belli bir adet kredi.
 * Webhook 'succeeded' geldiğinde usage_counters.purchased_credits += quantity.
 */
export const creditPurchasesTable = pgTable(
  "credit_purchases",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull(),
    paymentId: integer("payment_id").notNull(),     // payments.id soft ref
    metric: text("metric").notNull(),                // 'einvoice'|'ocr'|'api_calls'|'sms'
    packCode: text("pack_code").notNull(),           // 'einvoice_500' vb.
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    period: text("period").notNull(),                // hangi 'YYYY-MM' periyoduna işlenecek (UTC)
    status: text("status").notNull().default("pending"), // pending | applied
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("credit_purchases_company_idx").on(t.companyId, t.createdAt),
    paymentIdx: index("credit_purchases_payment_idx").on(t.paymentId),
  }),
);

export type CreditPurchase = typeof creditPurchasesTable.$inferSelect;
export type NewCreditPurchase = typeof creditPurchasesTable.$inferInsert;
