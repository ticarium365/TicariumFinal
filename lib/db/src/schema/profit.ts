import {
  pgTable, serial, integer, text, timestamp, jsonb, boolean, real, date, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";
import { usersTable } from "./users";
import { expenseCategoriesTable } from "./finance";

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 69 — Gider, Demirbaş ve Net Kâr çekirdeği
// (Mevcut expensesTable ALTER ile genişletilir; bu dosyada yeni tablolar var.)
// ─────────────────────────────────────────────────────────────────────────────

// DEMİRBAŞLAR
export const fixedAssetsTable = pgTable("fixed_assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id),
  name: text("name").notNull(), // "MacBook Pro M4"
  category: text("category"),    // "Bilgisayar", "Araç", "Mobilya"…
  serialNo: text("serial_no"),
  purchaseDate: date("purchase_date").notNull(),
  purchasePrice: real("purchase_price").notNull(),
  currency: text("currency").notNull().default("TRY"),
  vendor: text("vendor"),                // satıcı/tedarikçi
  invoiceUrl: text("invoice_url"),
  photoUrl: text("photo_url"),
  warrantyEnd: date("warranty_end"),
  // Amortisman planı
  depreciationMonths: integer("depreciation_months").notNull().default(36), // 12/24/36 vs.
  salvageValue: real("salvage_value").notNull().default(0),                  // hurda değer
  // Durum
  status: text("status").notNull().default("active"), // active | retired | sold | lost
  retiredAt: date("retired_at"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("fixed_assets_company_idx").on(t.companyId, t.status),
  index("fixed_assets_branch_idx").on(t.branchId),
]);

// AMORTİSMAN — Bir demirbaşın aylık amortisman snapshot'ı
export const assetDepreciationTable = pgTable("asset_depreciation", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => fixedAssetsTable.id, { onDelete: "cascade" }),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1-12
  amount: real("amount").notNull(),           // O ay düşülen amortisman tutarı
  cumulativeDepreciation: real("cumulative_depreciation").notNull(),
  bookValue: real("book_value").notNull(),    // o ay sonu defter değeri
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("asset_depreciation_asset_idx").on(t.assetId, t.periodYear, t.periodMonth),
  index("asset_depreciation_company_period_idx").on(t.companyId, t.periodYear, t.periodMonth),
]);

// PERSONEL MALİYETLERİ — Aylık maaş + sgk + yan haklar
export const employeeCostsTable = pgTable("employee_costs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeName: text("employee_name").notNull(),
  department: text("department"),
  position: text("position"),
  branchId: integer("branch_id").references(() => branchesTable.id),
  // Plan
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  grossSalary: real("gross_salary").notNull().default(0),
  netSalary: real("net_salary").notNull().default(0),
  sgkEmployer: real("sgk_employer").notNull().default(0),
  sgkEmployee: real("sgk_employee").notNull().default(0),
  incomeTax: real("income_tax").notNull().default(0),
  stampTax: real("stamp_tax").notNull().default(0),
  mealAllowance: real("meal_allowance").notNull().default(0),
  transportAllowance: real("transport_allowance").notNull().default(0),
  bonus: real("bonus").notNull().default(0),
  advance: real("advance").notNull().default(0),       // avans
  overtimePay: real("overtime_pay").notNull().default(0),
  // Toplam işveren maliyeti = gross + sgk_employer + meal + transport + bonus
  totalEmployerCost: real("total_employer_cost").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("pending"), // pending | partial | paid
  paidAmount: real("paid_amount").notNull().default(0),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("employee_costs_company_period_idx").on(t.companyId, t.periodYear, t.periodMonth),
  index("employee_costs_employee_idx").on(t.companyId, t.employeeName),
]);

// TEKRAR EDEN GİDERLER (kira, internet, abonelik…)
export const recurringExpensesTable = pgTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => expenseCategoriesTable.id),
  branchId: integer("branch_id").references(() => branchesTable.id),
  name: text("name").notNull(), // "Ofis kirası"
  amount: real("amount").notNull(),
  vatRate: real("vat_rate").default(0),
  paymentMethod: text("payment_method").notNull().default("bank"),
  frequency: text("frequency").notNull().default("monthly"), // monthly | weekly | quarterly | yearly
  dayOfMonth: integer("day_of_month").default(1), // ay içi gün
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  lastGeneratedAt: date("last_generated_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("recurring_expenses_company_idx").on(t.companyId, t.isActive),
]);

// KAR SNAPSHOT — Günlük / aylık karlılık önbelleği
export const profitSnapshotsTable = pgTable("profit_snapshots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id),
  period: text("period").notNull(), // YYYY-MM-DD veya YYYY-MM
  granularity: text("granularity").notNull().default("daily"), // daily | monthly
  revenue: real("revenue").notNull().default(0),
  cogs: real("cogs").notNull().default(0),               // satılan ürün maliyeti
  grossProfit: real("gross_profit").notNull().default(0),
  totalExpenses: real("total_expenses").notNull().default(0),
  payrollCost: real("payroll_cost").notNull().default(0),
  marketingCost: real("marketing_cost").notNull().default(0),
  operationalCost: real("operational_cost").notNull().default(0),
  financialCost: real("financial_cost").notNull().default(0),
  depreciation: real("depreciation").notNull().default(0),
  netProfit: real("net_profit").notNull().default(0),
  marginPct: real("margin_pct").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("profit_snapshots_company_period_idx").on(t.companyId, t.granularity, t.period),
]);

// EXPENSES tablosunu genişleten ek tablo — mevcut tabloyu BOZMADAN ek alanları
// burada tutmak yerine, mevcut `expenses`'a güvenli ALTER ADD COLUMN için
// yeni tablo: ek meta verileri (fiş resmi, OCR, recurring link, branch).
// Drizzle migrate yapısı bizim için ekstra bir mevcut-tablo değişikliği yapmasın.
export const expenseDetailsTable = pgTable("expense_details", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  expenseId: integer("expense_id").notNull().unique(), // expensesTable.id (FK tanımı serbest tutuldu)
  branchId: integer("branch_id").references(() => branchesTable.id),
  recurringId: integer("recurring_id").references(() => recurringExpensesTable.id, { onDelete: "set null" }),
  vatRate: real("vat_rate").default(0),
  vatAmount: real("vat_amount").default(0),
  vendorName: text("vendor_name"),
  vendorVkn: text("vendor_vkn"),
  invoiceNumber: text("invoice_number"),
  receiptUrl: text("receipt_url"),         // fiş/fatura görseli (object storage)
  ocrStatus: text("ocr_status").default("none"), // none | pending | done | failed
  ocrText: text("ocr_text"),
  ocrData: jsonb("ocr_data").$type<Record<string, any>>(),
  tags: text("tags"),                      // virgülle ayrık
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("expense_details_company_idx").on(t.companyId),
  index("expense_details_expense_idx").on(t.expenseId),
  index("expense_details_recurring_idx").on(t.recurringId),
]);

export type FixedAsset = typeof fixedAssetsTable.$inferSelect;
export type AssetDepreciation = typeof assetDepreciationTable.$inferSelect;
export type EmployeeCost = typeof employeeCostsTable.$inferSelect;
export type RecurringExpense = typeof recurringExpensesTable.$inferSelect;
export type ProfitSnapshot = typeof profitSnapshotsTable.$inferSelect;
export type ExpenseDetails = typeof expenseDetailsTable.$inferSelect;
