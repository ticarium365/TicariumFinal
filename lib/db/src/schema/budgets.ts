import { pgTable, serial, integer, text, timestamp, varchar, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { expenseCategoriesTable } from "./finance";

// Aylık bütçe — kategori bazında planlanan tutar
export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  scope: text("scope").notNull().default("expense"), // expense | revenue
  categoryId: integer("category_id").references(() => expenseCategoriesTable.id, { onDelete: "set null" }),
  label: text("label"), // ör. "Pazarlama" – kategori yoksa serbest etiket
  budgetAmount: numeric("budget_amount", { precision: 14, scale: 2 }).notNull(),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  ixCompanyPeriod: index("budgets_company_period_idx").on(t.companyId, t.period),
  uxScope: uniqueIndex("budgets_company_period_scope_cat_idx").on(t.companyId, t.period, t.scope, t.categoryId),
}));

// Ciro tahmini — basit aylık trend tahmini (saved snapshots)
export const revenueForecastsTable = pgTable("revenue_forecasts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }).notNull(), // hedef YYYY-MM
  basis: text("basis").notNull().default("trend3"), // trend3 | trend6 | trend12 | manual
  forecastAmount: numeric("forecast_amount", { precision: 14, scale: 2 }).notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  meta: text("meta"), // JSON: {avg, weights, sample}
}, (t) => ({
  uxCPB: uniqueIndex("revenue_forecasts_company_period_basis_idx").on(t.companyId, t.period, t.basis),
}));

// Nakit akışı tahmini — alacak/borç vadelerine göre
export const cashflowForecastsTable = pgTable("cashflow_forecasts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
  expectedIn: numeric("expected_in", { precision: 14, scale: 2 }).notNull().default("0"),
  expectedOut: numeric("expected_out", { precision: 14, scale: 2 }).notNull().default("0"),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uxCW: uniqueIndex("cashflow_forecasts_company_week_idx").on(t.companyId, t.weekStart),
}));
