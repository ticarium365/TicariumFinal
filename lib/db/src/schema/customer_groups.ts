import { pgTable, serial, integer, text, real, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const customerGroupsTable = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  discountPct: real("discount_pct").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customerGroupMembersTable = pgTable("customer_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => customerGroupsTable.id, { onDelete: "cascade" }).notNull(),
  customerId: integer("customer_id").notNull(),
  companyId: integer("company_id").references(() => companiesTable.id).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: unique("cgm_group_customer_uniq").on(t.groupId, t.customerId),
}));
