import { pgTable, serial, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const catalogSettingsTable = pgTable("catalog_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id).notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  title: text("title"),
  description: text("description"),
  themeColor: text("theme_color").default("#3B82F6"),
  showPrices: boolean("show_prices").notNull().default(true),
  allowOrders: boolean("allow_orders").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id).notNull(),
  orderNo: text("order_no").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("pending"),
  totalAmount: text("total_amount").notNull().default("0"),
  notes: text("notes"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  barcode: text("barcode"),
  quantity: integer("quantity").notNull(),
  unitPrice: text("unit_price").notNull(),
  totalPrice: text("total_price").notNull(),
});
