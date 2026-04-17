import { pgTable, serial, varchar, integer, boolean, date, numeric, text, timestamp, json } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  // percent | fixed | buy_x_get_y
  discountType: varchar("discount_type", { length: 20 }).notNull().default("percent"),
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
  // all | category | product
  scope: varchar("scope", { length: 20 }).notNull().default("all"),
  // JSON array of product IDs (scope=product) or category IDs (scope=category)
  scopeIds: json("scope_ids").$type<number[]>().default([]),
  minQuantity: integer("min_quantity").default(1),
  minAmount: numeric("min_amount", { precision: 12, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  couponCode: varchar("coupon_code", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Campaign = typeof campaignsTable.$inferSelect;
export type NewCampaign = typeof campaignsTable.$inferInsert;
