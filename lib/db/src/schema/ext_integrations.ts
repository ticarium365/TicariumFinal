import {
  pgTable, serial, integer, text, timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 14 — MUHASEBE ENTEGRASYONu
// Desteklenen: parasut | logo | mikro | luca | netsis
// ─────────────────────────────────────────────────────────────────────────────
export const accountingIntegrationsTable = pgTable("accounting_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  provider: text("provider").notNull(),          // parasut | logo | mikro | luca | netsis
  displayName: text("display_name"),             // kullanıcı tanımlı isim
  credentials: text("credentials").notNull().default("{}"),  // JSON — API keys (masked on read)
  syncOptions: text("sync_options").notNull().default("{}"), // JSON — hangi veriler senkronize edilsin
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),  // success | failed | pending
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("accounting_integrations_company_idx").on(t.companyId),
]);

export const accountingSyncLogsTable = pgTable("accounting_sync_logs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => accountingIntegrationsTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  syncType: text("sync_type").notNull(),    // sales | expenses | products | customers
  status: text("status").notNull(),          // success | failed | partial
  recordCount: integer("record_count").notNull().default(0),
  errorMessage: text("error_message"),
  detail: text("detail"),                   // JSON — ek bilgi
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("accounting_sync_logs_integration_idx").on(t.integrationId, t.startedAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 15 — E-TİCARET ENTEGRASYONu
// Desteklenen: trendyol | hepsiburada | n11 | shopify | woocommerce | pazarama
// ─────────────────────────────────────────────────────────────────────────────
export const ecommerceIntegrationsTable = pgTable("ecommerce_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  platform: text("platform").notNull(),       // trendyol | hepsiburada | n11 | shopify | woocommerce | pazarama
  storeName: text("store_name").notNull(),    // Mağaza adı / store URL
  credentials: text("credentials").notNull().default("{}"),   // JSON
  syncOptions: text("sync_options").notNull().default("{}"),  // JSON
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ecommerce_integrations_company_idx").on(t.companyId),
]);

export const ecommerceSyncLogsTable = pgTable("ecommerce_sync_logs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => ecommerceIntegrationsTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  syncType: text("sync_type").notNull(),  // product_push | order_pull | inventory_update | category_sync
  status: text("status").notNull(),
  recordCount: integer("record_count").notNull().default(0),
  errorMessage: text("error_message"),
  detail: text("detail"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("ecommerce_sync_logs_integration_idx").on(t.integrationId, t.startedAt),
]);

export type AccountingIntegration = typeof accountingIntegrationsTable.$inferSelect;
export type EcommerceIntegration = typeof ecommerceIntegrationsTable.$inferSelect;
