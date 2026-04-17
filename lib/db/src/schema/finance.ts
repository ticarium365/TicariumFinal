import { pgTable, serial, integer, real, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// GİDER KATEGORİLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const expenseCategoriesTable = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  icon: text("icon"),   // emoji veya icon adı
  color: text("color"), // tailwind renk kodu
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("expense_cat_company_idx").on(t.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// GİDERLER
// ─────────────────────────────────────────────────────────────────────────────
export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  categoryId: integer("category_id").references(() => expenseCategoriesTable.id),
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"), // cash | bank | credit
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("expenses_company_date_idx").on(t.companyId, t.expenseDate),
  index("expenses_company_category_idx").on(t.companyId, t.categoryId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// KASA TANIMLARI
// ─────────────────────────────────────────────────────────────────────────────
export const cashRegistersTable = pgTable("cash_registers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  openingBalance: real("opening_balance").notNull().default(0),
  currentBalance: real("current_balance").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cash_registers_company_idx").on(t.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// KASA HAREKETLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const cashMovementsTable = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  registerId: integer("register_id").references(() => cashRegistersTable.id),
  type: text("type").notNull(), // income | expense | sale | return | transfer
  direction: text("direction").notNull(), // in | out
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => expenseCategoriesTable.id),
  refType: text("ref_type"), // sale | expense | manual | transfer
  refId: integer("ref_id"),
  balanceBefore: real("balance_before"),
  balanceAfter: real("balance_after"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cash_movements_company_date_idx").on(t.companyId, t.createdAt),
  index("cash_movements_register_idx").on(t.registerId, t.createdAt),
]);

export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;
export type CashRegister = typeof cashRegistersTable.$inferSelect;
export type CashMovement = typeof cashMovementsTable.$inferSelect;
