import { pgTable, serial, integer, real, text, timestamp, boolean } from "drizzle-orm/pg-core";
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
  returned: boolean("returned").default(false).notNull(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnNote: text("return_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
