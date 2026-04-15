import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  productCode: text("product_code").notNull().unique(),
  barcode: text("barcode").unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  category: text("category"),
  description: text("description"),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(5),
  purchasePrice: real("purchase_price").notNull().default(0),
  salePrice: real("sale_price").notNull().default(0),
  profitPercent: real("profit_percent").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
