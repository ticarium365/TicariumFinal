import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

export const inboundWebhooksTable = pgTable("inbound_webhooks", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  accountId: integer("account_id"),
  companyId: integer("company_id"),
  externalEventId: text("external_event_id").notNull(),
  eventType: text("event_type"),
  payload: jsonb("payload").notNull(),
  signature: text("signature"),
  signatureValid: text("signature_valid"),
  status: text("status").notNull().default("received"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("inbound_webhooks_provider_event_uniq").on(t.provider, t.accountId, t.externalEventId),
  statusIdx: index("inbound_webhooks_status_idx").on(t.status, t.receivedAt),
}));

export type InboundWebhook = typeof inboundWebhooksTable.$inferSelect;
