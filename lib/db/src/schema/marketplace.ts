import {
  pgTable, serial, integer, text, timestamp, jsonb, boolean, real, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { usersTable } from "./users";

// Marketplace + e-ticaret kanal türleri
export const MARKETPLACE_PROVIDERS = [
  "mock",
  "trendyol",
  "hepsiburada",
  "n11",
  "amazon_tr",
  "ciceksepeti",
  "pttavm",
  "shopify",
  "woocommerce",
  "ideasoft",
  "ticimax",
] as const;
export type MarketplaceProviderKey = (typeof MARKETPLACE_PROVIDERS)[number];

// ────────────────────────────────────────────────────────────
// Bir firmanın bağladığı her bir mağaza/store
// (aynı providerdan birden çok mağaza olabilir)
// ────────────────────────────────────────────────────────────
export const channelAccountsTable = pgTable("channel_accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // MarketplaceProviderKey
  name: text("name").notNull(), // Kullanıcının verdiği takma ad: "Trendyol Ana Mağaza"
  isActive: boolean("is_active").notNull().default(true),
  sandbox: boolean("sandbox").notNull().default(true),
  // Provider-spesifik kimlik bilgileri (apiKey, secretKey, sellerId, supplierId, storeUrl, accessToken, …)
  credentials: jsonb("credentials").$type<Record<string, any>>().notNull().default({}),
  // Provider'a özgü genel ayarlar (vat dahil mi, kdv oranı default'u, vs.)
  settings: jsonb("settings").$type<Record<string, any>>().notNull().default({}),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastHealthOk: boolean("last_health_ok"),
  lastHealthMessage: text("last_health_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("channel_accounts_company_idx").on(t.companyId, t.provider),
]);

// ────────────────────────────────────────────────────────────
// Ürün ↔ Kanal eşleşmesi (bir ürün birden fazla mağazaya gidebilir,
// her birinde farklı SKU/barcode/fiyat olabilir)
// ────────────────────────────────────────────────────────────
export const productChannelMappingsTable = pgTable("product_channel_mappings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => channelAccountsTable.id, { onDelete: "cascade" }),
  // Karşı taraf kimlikleri
  externalProductId: text("external_product_id"), // Trendyol productCode, HB sku id…
  externalListingId: text("external_listing_id"), // listingId / contentId
  channelSku: text("channel_sku"),
  channelBarcode: text("channel_barcode"),
  // Override değerler (bu kanal için özel)
  priceOverride: real("price_override"),
  stockOverride: integer("stock_override"),
  // Yayın
  isPublished: boolean("is_published").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // Senkron durumu
  syncStatus: text("sync_status").notNull().default("pending"), // pending | syncing | synced | error
  syncError: text("sync_error"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  raw: jsonb("raw").$type<any>(), // karşıdan dönen tam ürün json'ı
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("product_channel_mappings_unique").on(t.accountId, t.productId),
  index("product_channel_mappings_company_idx").on(t.companyId),
  index("product_channel_mappings_external_idx").on(t.accountId, t.externalProductId),
]);

// ────────────────────────────────────────────────────────────
// Fiyatlandırma kuralları (margin, markup, fixed, currency, vs.)
// — Hangi koşulda hangi düzeltme uygulanacak (account/category/product bazlı)
// ────────────────────────────────────────────────────────────
export const pricingRulesTable = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(100), // küçük olan önce uygulanır
  // Scope
  accountId: integer("account_id").references(() => channelAccountsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
  categoryName: text("category_name"),
  brandName: text("brand_name"),
  // Action
  type: text("type").notNull().default("markup_pct"),
  // markup_pct | margin_pct | fixed_amount | currency_convert | round
  value: real("value").notNull().default(0),
  roundTo: real("round_to"), // 0.99, 0.95, 1.0 vs.
  minPrice: real("min_price"),
  maxPrice: real("max_price"),
  formula: text("formula"), // ileride DSL: "cost * 1.2 + 5"
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("pricing_rules_company_priority_idx").on(t.companyId, t.priority),
]);

// ────────────────────────────────────────────────────────────
// Stok kuralları — kanal başına emniyet stoku, bölme oranları
// ────────────────────────────────────────────────────────────
export const stockRulesTable = pgTable("stock_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  accountId: integer("account_id").references(() => channelAccountsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
  categoryName: text("category_name"),
  // Aksiyonlar
  safetyStock: integer("safety_stock").notNull().default(0), // kanaldan SAKLA
  maxStock: integer("max_stock"), // kanala en fazla bunu gönder
  allocationType: text("allocation_type").notNull().default("subtract_safety"),
  // subtract_safety | percentage | fixed_value
  allocationValue: real("allocation_value"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("stock_rules_company_priority_idx").on(t.companyId, t.priority),
]);

// ────────────────────────────────────────────────────────────
// Sync log — her senkron / sipariş / event için audit trail
// ────────────────────────────────────────────────────────────
export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").references(() => channelAccountsTable.id, { onDelete: "set null" }),
  jobId: integer("job_id"), // syncJobsTable.id (nullable, foreign-key constraint olmadan)
  operation: text("operation").notNull(),
  // push_product | push_stock | push_price | pull_orders | pull_products | health_check
  level: text("level").notNull().default("info"), // info | warn | error
  status: text("status").notNull().default("success"), // success | failed | partial
  durationMs: integer("duration_ms"),
  itemsProcessed: integer("items_processed").notNull().default(0),
  itemsFailed: integer("items_failed").notNull().default(0),
  message: text("message"),
  payload: jsonb("payload").$type<any>(),
  errorPayload: jsonb("error_payload").$type<any>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sync_logs_company_idx").on(t.companyId, t.createdAt),
  index("sync_logs_account_idx").on(t.accountId, t.createdAt),
]);

// ────────────────────────────────────────────────────────────
// Sync job kuyruğu — async worker tarafından işlenecek görevler
// ────────────────────────────────────────────────────────────
export const syncJobsTable = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => channelAccountsTable.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),
  // push_product | push_stock | push_price | pull_orders | pull_products | bulk_publish
  payload: jsonb("payload").$type<any>().notNull().default({}),
  priority: integer("priority").notNull().default(100),
  status: text("status").notNull().default("queued"),
  // queued | running | completed | failed | cancelled | retrying
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: text("last_error"),
  result: jsonb("result").$type<any>(),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sync_jobs_status_priority_idx").on(t.status, t.priority, t.scheduledAt),
  index("sync_jobs_company_idx").on(t.companyId, t.createdAt),
]);

// ────────────────────────────────────────────────────────────
// Marketplace orders — pull_orders ile çekilen siparişler
// (Sprint 51-55 live-mode hazırlık: idempotent ingest)
// ────────────────────────────────────────────────────────────
export const marketplaceOrdersTable = pgTable("marketplace_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => channelAccountsTable.id, { onDelete: "cascade" }),
  channelKey: text("channel_key").notNull(),       // trendyol|hepsiburada|n11|...
  externalOrderId: text("external_order_id").notNull(), // sağlayıcıdaki sipariş kimliği
  externalOrderNumber: text("external_order_number"),   // gösterim numarası (TY-1234)
  status: text("status").notNull().default("new"),
  // new | accepted | shipped | delivered | cancelled | returned | invoiced
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  shippingAddress: jsonb("shipping_address").$type<any>(),
  totalAmount: real("total_amount").notNull().default(0),
  currency: text("currency").notNull().default("TRY"),
  itemsJson: jsonb("items_json").$type<any[]>().notNull().default([]),
  rawPayload: jsonb("raw_payload").$type<any>(),    // sağlayıcı orijinal gövdesi (audit)
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  // Sale entegrasyonu — pulled order opsiyonel olarak satışa dönüştürülür
  convertedSaleId: integer("converted_sale_id"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  pulledAt: timestamp("pulled_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // İdempotent ingest: aynı sağlayıcının aynı siparişi 2 kere insert edilmez
  uniqueIndex("mp_orders_unique_external").on(t.companyId, t.accountId, t.externalOrderId),
  index("mp_orders_company_status_idx").on(t.companyId, t.status, t.pulledAt),
  index("mp_orders_account_idx").on(t.accountId, t.pulledAt),
]);

export type MarketplaceOrder = typeof marketplaceOrdersTable.$inferSelect;
export type InsertMarketplaceOrder = typeof marketplaceOrdersTable.$inferInsert;
