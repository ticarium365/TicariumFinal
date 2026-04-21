import { pgTable, serial, integer, text, numeric, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Dalga 22 — Iyzico recurring billing.
 *
 * `payments` Tek satır = Bir abonelik dönemi için ödeme denemesi.
 *   - status: pending → succeeded | failed | refunded
 *   - provider: 'iyzico' | 'mock' (mock = sandbox/dev simülasyonu, prod env'de
 *     IYZICO_API_KEY varsa otomatik 'iyzico' yazılır)
 *   - external_id: Iyzico paymentId (success sonrası)
 *   - conversation_id: idempotency anahtarı (bizim ürettiğimiz UUID, Iyzico'ya
 *     conversationId olarak gönderilir, webhook'ta doğrulanır)
 *   - billing_cycle: 'monthly' | 'yearly'
 *   - subscription_id: ödeme başarılı olduğunda oluşturulan/uzatılan
 *     company_subscriptions satırının id'si (FK değil — soft ref).
 */
export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull(),
    planId: integer("plan_id").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("TRY"),
    provider: text("provider").notNull().default("mock"),
    status: text("status").notNull().default("pending"),
    conversationId: text("conversation_id").notNull(),
    externalId: text("external_id"),
    rawRequest: jsonb("raw_request"),
    rawResponse: jsonb("raw_response"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    subscriptionId: integer("subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    convUq: uniqueIndex("payments_conversation_id_uq").on(t.conversationId),
    companyIdx: index("payments_company_idx").on(t.companyId, t.createdAt),
    statusIdx: index("payments_status_idx").on(t.status),
  }),
);

export type Payment = typeof paymentsTable.$inferSelect;
export type NewPayment = typeof paymentsTable.$inferInsert;
