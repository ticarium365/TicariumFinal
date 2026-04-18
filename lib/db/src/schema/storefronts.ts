import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";

export const STOREFRONT_TYPES = ["embedded", "hosted", "aggregator"] as const;
export type StorefrontType = (typeof STOREFRONT_TYPES)[number];

export const STOREFRONT_PAYMENT_MODES = ["platform", "merchant_pos", "whatsapp_only"] as const;
export type StorefrontPaymentMode = (typeof STOREFRONT_PAYMENT_MODES)[number];

export const STOREFRONT_STATUSES = ["draft", "active", "paused"] as const;

export const storefrontsTable = pgTable(
  "storefronts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    slug: text("slug").notNull(),
    customDomain: text("custom_domain"),
    status: text("status").notNull().default("draft"),
    productSelectionMode: text("product_selection_mode").notNull().default("selected"),
    paymentMode: text("payment_mode").notNull().default("merchant_pos"),
    paymentConfig: jsonb("payment_config").notNull().default({}),
    agreementCommissionPct: real("agreement_commission_pct").notNull().default(0),
    agreementNotes: text("agreement_notes"),
    themeConfig: jsonb("theme_config").notNull().default({}),
    embedConfig: jsonb("embed_config").notNull().default({}),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("storefronts_slug_idx").on(t.slug),
    index("storefronts_company_idx").on(t.companyId),
    index("storefronts_status_idx").on(t.status),
  ]
);

export type Storefront = typeof storefrontsTable.$inferSelect;
export type NewStorefront = typeof storefrontsTable.$inferInsert;

export const storefrontProductsTable = pgTable(
  "storefront_products",
  {
    id: serial("id").primaryKey(),
    storefrontId: integer("storefront_id")
      .notNull()
      .references(() => storefrontsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    customTitle: text("custom_title"),
    customPrice: real("custom_price"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("storefront_products_sf_pr_idx").on(t.storefrontId, t.productId),
    index("storefront_products_storefront_idx").on(t.storefrontId),
  ]
);

export type StorefrontProduct = typeof storefrontProductsTable.$inferSelect;
export type NewStorefrontProduct = typeof storefrontProductsTable.$inferInsert;

// Bizim merkezi e-ticaret (ayrı domain) için aday ürün listesi.
// Birden fazla firmadan aynı isim/barkod uyuşan ürünleri listeleyip en ucuzu kârla satarız.
export const aggregatorListingsTable = pgTable(
  "aggregator_listings",
  {
    id: serial("id").primaryKey(),
    matchKey: text("match_key").notNull(), // normalize(name)+barcode
    sourceCompanyId: integer("source_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    sourceProductId: integer("source_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    sourcePrice: real("source_price").notNull(),
    marginPct: real("margin_pct").notNull().default(15),
    salePrice: real("sale_price").notNull(),
    status: text("status").notNull().default("candidate"), // candidate | active | paused
    chosen: boolean("chosen").notNull().default(false), // o match_key için seçilen tedarikçi
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("aggregator_match_idx").on(t.matchKey, t.salePrice),
    index("aggregator_source_idx").on(t.sourceCompanyId, t.sourceProductId),
    index("aggregator_status_idx").on(t.status, t.chosen),
  ]
);

export type AggregatorListing = typeof aggregatorListingsTable.$inferSelect;

export function normalizeMatchKey(name: string, barcode?: string | null): string {
  const n = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return barcode ? `${barcode}|${n}` : n;
}
