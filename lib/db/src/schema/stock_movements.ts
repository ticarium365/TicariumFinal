import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  productName: text("product_name").notNull(),
  productCode: text("product_code").notNull(),
  type: text("type").notNull(), // 'sale' | 'purchase' | 'correction' | 'return'
  quantity: integer("quantity").notNull(),
  note: text("note"),
  refId: integer("ref_id"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StockMovement = typeof stockMovementsTable.$inferSelect;
