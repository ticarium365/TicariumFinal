import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const productViewsTable = pgTable("product_views", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertProductViewSchema = createInsertSchema(productViewsTable).omit({
  id: true,
  viewedAt: true,
});

export type InsertProductView = z.infer<typeof insertProductViewSchema>;
export type ProductView = typeof productViewsTable.$inferSelect;
