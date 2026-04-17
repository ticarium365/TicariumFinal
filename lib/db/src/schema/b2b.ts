import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const b2bQuoteRequestsTable = pgTable(
  "b2b_quote_requests",
  {
    id: serial("id").primaryKey(),
    fromCompanyId: integer("from_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    toCompanyId: integer("to_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    subject: text("subject").notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    deliveryCity: text("delivery_city"),
    deliveryAddress: text("delivery_address"),
    expectedDeliveryDate: timestamp("expected_delivery_date", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    sellerNote: text("seller_note"),
    quotedTotalAmount: real("quoted_total_amount"),
    quotedCurrency: text("quoted_currency").default("TRY"),
    rejectReason: text("reject_reason"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: integer("responded_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("b2b_qr_from_idx").on(t.fromCompanyId, t.status),
    index("b2b_qr_to_idx").on(t.toCompanyId, t.status),
    index("b2b_qr_code_idx").on(t.code),
  ]
);

export const b2bQuoteItemsTable = pgTable(
  "b2b_quote_items",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => b2bQuoteRequestsTable.id, { onDelete: "cascade" }),
    productName: text("product_name").notNull(),
    productCode: text("product_code"),
    description: text("description"),
    quantity: real("quantity").notNull(),
    unit: text("unit").notNull().default("adet"),
    quotedPrice: real("quoted_price"),
    quotedNote: text("quoted_note"),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("b2b_qi_request_idx").on(t.requestId)]
);

export const b2bMessagesTable = pgTable(
  "b2b_messages",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => b2bQuoteRequestsTable.id, { onDelete: "cascade" }),
    fromCompanyId: integer("from_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("b2b_msg_request_idx").on(t.requestId, t.createdAt)]
);

export const b2bOrdersTable = pgTable(
  "b2b_orders",
  {
    id: serial("id").primaryKey(),
    quoteId: integer("quote_id")
      .notNull()
      .references(() => b2bQuoteRequestsTable.id, { onDelete: "cascade" }),
    buyerCompanyId: integer("buyer_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    sellerCompanyId: integer("seller_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status").notNull().default("pending"),
    totalAmount: real("total_amount").notNull(),
    currency: text("currency").notNull().default("TRY"),
    shippingCity: text("shipping_city"),
    shippingAddress: text("shipping_address"),
    contactPhone: text("contact_phone"),
    trackingNo: text("tracking_no"),
    carrier: text("carrier"),
    sellerNote: text("seller_note"),
    buyerNote: text("buyer_note"),
    cancelReason: text("cancel_reason"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("b2b_ord_buyer_idx").on(t.buyerCompanyId, t.status),
    index("b2b_ord_seller_idx").on(t.sellerCompanyId, t.status),
    index("b2b_ord_code_idx").on(t.code),
    index("b2b_ord_quote_idx").on(t.quoteId),
  ]
);

export type B2bOrder = typeof b2bOrdersTable.$inferSelect;

export const b2bCatalogItemsTable = pgTable(
  "b2b_catalog_items",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    sourceProductId: integer("source_product_id"),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    category: text("category"),
    unit: text("unit").notNull().default("adet"),
    listPrice: real("list_price"),
    currency: text("currency").notNull().default("TRY"),
    minOrderQty: real("min_order_qty").notNull().default(1),
    leadDays: integer("lead_days"),
    imageUrl: text("image_url"),
    isPublished: boolean("is_published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("b2b_cat_company_idx").on(t.companyId, t.isPublished),
    index("b2b_cat_category_idx").on(t.category),
  ]
);

export type B2bCatalogItem = typeof b2bCatalogItemsTable.$inferSelect;

export const insertB2bQuoteRequestSchema = createInsertSchema(b2bQuoteRequestsTable).omit({
  id: true,
  fromCompanyId: true,
  code: true,
  status: true,
  quotedTotalAmount: true,
  quotedCurrency: true,
  rejectReason: true,
  respondedAt: true,
  respondedBy: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  sellerNote: true,
});

export const insertB2bQuoteItemSchema = createInsertSchema(b2bQuoteItemsTable).omit({
  id: true,
  requestId: true,
  quotedPrice: true,
  quotedNote: true,
  isAvailable: true,
  createdAt: true,
});

export type B2bQuoteRequest = typeof b2bQuoteRequestsTable.$inferSelect;
export type B2bQuoteItem = typeof b2bQuoteItemsTable.$inferSelect;
export type B2bMessage = typeof b2bMessagesTable.$inferSelect;
