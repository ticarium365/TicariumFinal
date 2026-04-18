import { pgTable, serial, varchar, integer, numeric, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const adChannelsTable = pgTable("ad_channels", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  platform: varchar("platform", { length: 40 }).notNull().default("custom"),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("ad_channels_company_code_uniq").on(t.companyId, t.code),
}));

export const adSpendsTable = pgTable("ad_spends", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => adChannelsTable.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }).notNull(),
  budgetAmount: numeric("budget_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  spendAmount: numeric("spend_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  orders: integer("orders").notNull().default(0),
  attributedRevenue: numeric("attributed_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("ad_spends_channel_period_uniq").on(t.channelId, t.period),
  byCompany: index("ad_spends_company_period_idx").on(t.companyId, t.period),
}));

export type AdChannel = typeof adChannelsTable.$inferSelect;
export type NewAdChannel = typeof adChannelsTable.$inferInsert;
export type AdSpend = typeof adSpendsTable.$inferSelect;
export type NewAdSpend = typeof adSpendsTable.$inferInsert;
