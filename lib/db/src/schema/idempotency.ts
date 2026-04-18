import { pgTable, text, integer, timestamp, jsonb, primaryKey, index } from "drizzle-orm/pg-core";

export const idempotencyKeysTable = pgTable("idempotency_keys", {
  key: text("key").notNull(),
  companyId: integer("company_id").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code").notNull(),
  responseBody: jsonb("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.key, t.companyId] }),
  expiresIdx: index("idempotency_expires_idx").on(t.expiresAt),
}));

export type IdempotencyKey = typeof idempotencyKeysTable.$inferSelect;
