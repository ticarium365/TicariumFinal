import { pgTable, serial, integer, real, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { productsTable } from "./products";

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİLER
// ─────────────────────────────────────────────────────────────────────────────
export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  taxOffice: text("tax_office"),
  taxNumber: text("tax_number"),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  district: text("district"),
  address: text("address"),
  contactPerson: text("contact_person"),
  openingBalance: real("opening_balance").notNull().default(0),
  currentBalance: real("current_balance").notNull().default(0),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("suppliers_company_code_idx").on(t.companyId, t.code),
  index("suppliers_company_name_idx").on(t.companyId, t.name),
  index("suppliers_company_phone_idx").on(t.companyId, t.phone),
  index("suppliers_company_balance_idx").on(t.companyId, t.currentBalance),
]);

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ FATURALARI
// ─────────────────────────────────────────────────────────────────────────────
export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  invoiceNo: text("invoice_no"),
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
  subtotalAmount: real("subtotal_amount").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  discountAmount: real("discount_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull(),
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | partial | paid
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("purchases_company_supplier_idx").on(t.companyId, t.supplierId, t.invoiceDate),
]);

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ FATURA KALEMLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  purchaseId: integer("purchase_id").notNull().references(() => purchasesTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  lineTotal: real("line_total").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("purchase_items_company_product_idx").on(t.companyId, t.productId),
  index("purchase_items_purchase_idx").on(t.purchaseId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ CARİ HAREKETLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const supplierTransactionsTable = pgTable("supplier_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  type: text("type").notNull(), // purchase | payment | adjustment | refund
  direction: text("direction").notNull(), // debit | credit
  amount: real("amount").notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  description: text("description"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("supp_tx_company_supplier_idx").on(t.companyId, t.supplierId, t.createdAt),
]);

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({
  id: true, currentBalance: true, createdAt: true, updatedAt: true,
});
export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type Purchase = typeof purchasesTable.$inferSelect;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
export type SupplierTransaction = typeof supplierTransactionsTable.$inferSelect;
