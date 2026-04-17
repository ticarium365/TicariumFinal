import {
  pgTable, serial, integer, text, timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK ABONELIĞI
// events: JSON array — ["sale.created", "stock.low", "purchase.created", "*"]
// ─────────────────────────────────────────────────────────────────────────────
export const webhooksTable = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: text("events").notNull().default("[]"), // JSON array
  secret: text("secret"),          // HMAC imzalama için
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhooks_company_idx").on(t.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK TESLİMAT LOGU
// ─────────────────────────────────────────────────────────────────────────────
export const webhookDeliveriesTable = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => webhooksTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  event: text("event").notNull(),
  payload: text("payload").notNull(), // JSON string
  statusCode: integer("status_code"),
  response: text("response"),
  attempt: integer("attempt").notNull().default(1),
  success: boolean("success").notNull().default(false),
  errorMessage: text("error_message"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhook_deliveries_webhook_idx").on(t.webhookId, t.deliveredAt),
  index("webhook_deliveries_company_idx").on(t.companyId, t.deliveredAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// API ANAHTARLARI (3. taraf entegrasyonu için)
// ─────────────────────────────────────────────────────────────────────────────
export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),  // bcrypt hash
  keyPrefix: text("key_prefix").notNull(), // ilk 8 karakter (görüntüleme için)
  scopes: text("scopes").notNull().default("read"), // read | write | admin
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("api_keys_company_idx").on(t.companyId),
  index("api_keys_prefix_idx").on(t.keyPrefix),
]);

export type Webhook = typeof webhooksTable.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;
export type ApiKey = typeof apiKeysTable.$inferSelect;
