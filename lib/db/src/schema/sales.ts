import { pgTable, serial, integer, real, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  productName: text("product_name").notNull(),
  productCode: text("product_code").notNull(),
  barcode: text("barcode"),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  totalPrice: real("total_price").notNull(),
  purchasePrice: real("purchase_price").notNull(),
  profit: real("profit").notNull(),
  userId: integer("user_id").references(() => usersTable.id),
  soldBy: text("sold_by"),
  paymentMethod: text("payment_method"), // 'cash' | 'card' | 'transfer' | 'other' | 'credit'
  customerId: integer("customer_id"),    // nullable FK to customers
  // Sprint 73.4 — Kanal atfı (boş = pos satışı)
  channelKey: text("channel_key"),       // 'pos' | 'trendyol' | 'hepsiburada' | 'storefront' | etc.
  channelOrderId: text("channel_order_id"), // marketplace order id
  commissionAmount: real("commission_amount").default(0).notNull(),
  shippingCost: real("shipping_cost").default(0).notNull(),
  returned: boolean("returned").default(false).notNull(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnNote: text("return_note"),
  // Sprint M+ — Toptan / Perakende sınıflandırması
  // 'wholesale' | 'retail'
  saleType: text("sale_type").default("retail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sales_company_created_idx").on(t.companyId, t.createdAt),
  index("sales_company_channel_idx").on(t.companyId, t.channelKey),
  index("sales_company_saletype_idx").on(t.companyId, t.saleType),
]);

export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
