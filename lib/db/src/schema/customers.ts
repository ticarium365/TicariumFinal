import { pgTable, serial, integer, real, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  code: text("code").notNull(),
  type: text("type").notNull().default("individual"), // individual | company
  name: text("name").notNull(),
  taxOffice: text("tax_office"),
  taxNumber: text("tax_number"),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  district: text("district"),
  address: text("address"),
  contactPerson: text("contact_person"),
  creditLimit: real("credit_limit").notNull().default(0),
  openingBalance: real("opening_balance").notNull().default(0),
  currentBalance: real("current_balance").notNull().default(0),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("customers_company_code_idx").on(t.companyId, t.code),
  index("customers_company_name_idx").on(t.companyId, t.name),
  index("customers_company_phone_idx").on(t.companyId, t.phone),
  index("customers_company_balance_idx").on(t.companyId, t.currentBalance),
]);

export const customerTransactionsTable = pgTable("customer_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  type: text("type").notNull(), // sale | payment | adjustment | refund
  direction: text("direction").notNull(), // debit | credit
  amount: real("amount").notNull(),
  referenceType: text("reference_type"), // sale | manual
  referenceId: integer("reference_id"),
  description: text("description"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cust_tx_company_customer_idx").on(t.companyId, t.customerId, t.createdAt),
]);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  currentBalance: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
export type CustomerTransaction = typeof customerTransactionsTable.$inferSelect;
