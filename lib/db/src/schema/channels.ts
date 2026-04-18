import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";

export const CHANNEL_DEFINITIONS = [
  { key: "trendyol", label: "Trendyol", category: "marketplace", color: "#F27A1A" },
  { key: "hepsiburada", label: "Hepsiburada", category: "marketplace", color: "#FF6000" },
  { key: "n11", label: "N11", category: "marketplace", color: "#FFC100" },
  { key: "amazon_tr", label: "Amazon TR", category: "marketplace", color: "#FF9900" },
  { key: "shopify", label: "Shopify", category: "ecommerce", color: "#95BF47" },
  { key: "own_site", label: "Kendi Sitem", category: "ecommerce", color: "#0EA5E9" },
  { key: "supplier_network", label: "Tedarik Ağı (B2B)", category: "b2b", color: "#8B5CF6" },
  { key: "public_catalog", label: "Public Katalog", category: "b2b", color: "#10B981" },
] as const;

export type ChannelKey = (typeof CHANNEL_DEFINITIONS)[number]["key"];
export const CHANNEL_KEYS = CHANNEL_DEFINITIONS.map((c) => c.key);

export const productChannelListingsTable = pgTable(
  "product_channel_listings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    channelKey: text("channel_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),

    // Override fields per channel
    customTitle: text("custom_title"),
    customDescription: text("custom_description"),
    customSku: text("custom_sku"),
    customCategory: text("custom_category"),
    customImageUrl: text("custom_image_url"),

    // Pricing engine
    priceMode: text("price_mode").notNull().default("fixed"), // fixed | markup_pct | markup_amount | base
    priceValue: real("price_value"),
    minPrice: real("min_price"),
    campaignPrice: real("campaign_price"),
    campaignStartsAt: timestamp("campaign_starts_at", { withTimezone: true }),
    campaignEndsAt: timestamp("campaign_ends_at", { withTimezone: true }),

    // Stock engine
    stockMode: text("stock_mode").notNull().default("full"), // full | buffer | fixed | percent
    stockValue: real("stock_value"),
    minStockShow: integer("min_stock_show"),
    maxStockShow: integer("max_stock_show"),
    stopBelowCritical: boolean("stop_below_critical").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pcl_company_product_channel_idx").on(t.companyId, t.productId, t.channelKey),
    index("pcl_company_channel_enabled_idx").on(t.companyId, t.channelKey, t.isEnabled),
    index("pcl_product_idx").on(t.productId),
  ]
);

export type ProductChannelListing = typeof productChannelListingsTable.$inferSelect;
export type InsertProductChannelListing = typeof productChannelListingsTable.$inferInsert;

export const channelCredentialsTable = pgTable(
  "channel_credentials",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    channelKey: text("channel_key").notNull(),
    mode: text("mode").notNull().default("test"),
    credentials: jsonb("credentials").notNull().default({}),
    isActive: boolean("is_active").notNull().default(false),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ccred_company_channel_idx").on(t.companyId, t.channelKey),
  ]
);

export type ChannelCredential = typeof channelCredentialsTable.$inferSelect;

export const channelSyncLogsTable = pgTable(
  "channel_sync_logs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    channelKey: text("channel_key").notNull(),
    operation: text("operation").notNull(),
    productId: integer("product_id"),
    status: text("status").notNull(),
    mode: text("mode").notNull().default("test"),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("csync_company_channel_idx").on(t.companyId, t.channelKey, t.createdAt),
    index("csync_company_status_idx").on(t.companyId, t.status, t.createdAt),
  ]
);

export type ChannelSyncLog = typeof channelSyncLogsTable.$inferSelect;

export function computeEffectivePrice(opts: {
  basePrice: number;
  mode: string;
  value: number | null;
  minPrice: number | null;
  campaignPrice: number | null;
  campaignStartsAt: Date | null;
  campaignEndsAt: Date | null;
  now?: Date;
}): number {
  const now = opts.now ?? new Date();
  if (
    opts.campaignPrice != null &&
    opts.campaignPrice > 0 &&
    (!opts.campaignStartsAt || opts.campaignStartsAt <= now) &&
    (!opts.campaignEndsAt || opts.campaignEndsAt >= now)
  ) {
    let p = opts.campaignPrice;
    if (opts.minPrice != null) p = Math.max(p, opts.minPrice);
    return Math.round(p * 100) / 100;
  }
  let result = opts.basePrice;
  if (opts.mode === "fixed" && opts.value != null) result = opts.value;
  else if (opts.mode === "markup_pct" && opts.value != null)
    result = opts.basePrice * (1 + opts.value / 100);
  else if (opts.mode === "markup_amount" && opts.value != null) result = opts.basePrice + opts.value;
  if (opts.minPrice != null) result = Math.max(result, opts.minPrice);
  return Math.round(result * 100) / 100;
}

export function computeEffectiveStock(opts: {
  baseStock: number;
  minStock: number;
  mode: string;
  value: number | null;
  minStockShow: number | null;
  maxStockShow: number | null;
  stopBelowCritical: boolean;
}): number {
  if (opts.stopBelowCritical && opts.baseStock <= opts.minStock) return 0;
  let stock = opts.baseStock;
  if (opts.mode === "buffer" && opts.value != null) stock = Math.max(0, opts.baseStock - opts.value);
  else if (opts.mode === "fixed" && opts.value != null) stock = Math.max(0, Math.floor(opts.value));
  else if (opts.mode === "percent" && opts.value != null)
    stock = Math.max(0, Math.floor((opts.baseStock * opts.value) / 100));
  if (opts.minStockShow != null && stock < opts.minStockShow) stock = 0;
  if (opts.maxStockShow != null && stock > opts.maxStockShow) stock = opts.maxStockShow;
  return stock;
}
