import { pgTable, bigserial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const domainEventsTable = pgTable("domain_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: integer("company_id").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => ({
  pendingIdx: index("domain_events_pending_idx").on(t.status, t.nextRetryAt),
  companyIdx: index("domain_events_company_idx").on(t.companyId, t.createdAt),
  aggregateIdx: index("domain_events_aggregate_idx").on(t.aggregateType, t.aggregateId),
}));

export type DomainEvent = typeof domainEventsTable.$inferSelect;
