import {
  pgTable, serial, integer, text, timestamp, jsonb, boolean, real, date, index, uniqueIndex,
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

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 72 — GERÇEK KÂRLILIK & RAF MALİYETİ MOTORU
// ─────────────────────────────────────────────────────────────────────────────

// Şirket bazında raf maliyeti yapılandırması (tek satır per company)
export const holdingCostRulesTable = pgTable("holding_cost_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }).unique(),
  monthlyRent: real("monthly_rent").notNull().default(0),               // depo + mağaza kira (toplam)
  monthlyStaff: real("monthly_staff").notNull().default(0),             // operasyon personel maliyeti (aylık)
  monthlyElectric: real("monthly_electric").notNull().default(0),       // elektrik (aylık)
  monthlyOther: real("monthly_other").notNull().default(0),             // ek operasyon giderleri (aylık)
  totalShelfM2: real("total_shelf_m2").notNull().default(100),          // toplam raf alanı m²
  defaultM2PerProduct: real("default_m2_per_product").notNull().default(0.05), // ürün başına ortalama m²
  capitalCostAnnualPct: real("capital_cost_annual_pct").notNull().default(30), // yıllık % (ör. mevduat faizi)
  spoilageRiskPct: real("spoilage_risk_pct").notNull().default(0),      // yıllık fire/bozulma %
  allocMethod: text("alloc_method").notNull().default("revenue"),       // revenue|qty|category|m2|manual
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Aylık dağıtılacak ek giderler (örn. reklam, temizlik, abonelikler)
export const expenseAllocationsTable = pgTable("expense_allocations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: real("amount").notNull(),                                     // aylık tutar
  allocMethod: text("alloc_method").notNull().default("revenue"),       // revenue|qty|category|m2|manual
  categoryFilter: text("category_filter"),                              // sadece bu kategoriye dağıt (opsiyonel)
  manualPct: real("manual_pct"),                                        // manuel yüzde (opsiyonel)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("expense_alloc_company_idx").on(t.companyId, t.isActive),
]);

// Ürün başına gerçek kâr snapshot (cron ile günlük yenilenir)
export const productProfitSnapshotsTable = pgTable("product_profit_snapshots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  // Anlık değerler
  purchasePrice: real("purchase_price").notNull().default(0),
  salePrice: real("sale_price").notNull().default(0),
  stockQty: integer("stock_qty").notNull().default(0),
  // Zaman
  daysOnShelf: integer("days_on_shelf").notNull().default(0),           // son stok girişinden bu yana gün
  // Maliyet bileşenleri
  dailyHoldingCost: real("daily_holding_cost").notNull().default(0),    // bir adet için günlük raf maliyeti (₺)
  dailyCapitalCost: real("daily_capital_cost").notNull().default(0),    // bir adet için günlük sermaye maliyeti (₺)
  totalHoldingCost: real("total_holding_cost").notNull().default(0),    // şu ana kadar birikmiş raf maliyeti (₺/adet)
  totalCapitalCost: real("total_capital_cost").notNull().default(0),    // şu ana kadar birikmiş sermaye maliyeti (₺/adet)
  expenseAllocation: real("expense_allocation").notNull().default(0),   // dağıtılmış aylık gider payı (₺/adet)
  // Türev metrikler
  effectiveCost: real("effective_cost").notNull().default(0),           // Gerçek anlık maliyet (₺/adet)
  grossProfit: real("gross_profit").notNull().default(0),               // satış - alış
  trueProfit: real("true_profit").notNull().default(0),                 // satış - effective cost - allocation
  trueMarginPct: real("true_margin_pct").notNull().default(0),          // gerçek kâr / satış * 100
  breakEvenDay: integer("break_even_day"),                              // kaç gün sonra zarara döner (null = hiç)
  // Devir
  turnoverDays: real("turnover_days"),                                  // kaç günde bir satılıyor
  status: text("status").notNull().default("ok"),                       // ok|low_margin|losing|stagnant|star
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ppsnap_company_date_idx").on(t.companyId, t.snapshotDate),
  index("ppsnap_product_date_idx").on(t.productId, t.snapshotDate),
  index("ppsnap_status_idx").on(t.companyId, t.status),
  uniqueIndex("ppsnap_company_product_date_uq").on(t.companyId, t.productId, t.snapshotDate),
]);

// Ürün bazlı stok devir hızı metrikleri (aylık)
export const inventoryTurnoverMetricsTable = pgTable("inventory_turnover_metrics", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  soldQty: integer("sold_qty").notNull().default(0),
  soldCost: real("sold_cost").notNull().default(0),
  avgStock: real("avg_stock").notNull().default(0),
  turnoverRate: real("turnover_rate").notNull().default(0),             // kaç kez döndü
  daysToSell: real("days_to_sell").notNull().default(0),                // ortalama satış süresi
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("turnover_company_period_idx").on(t.companyId, t.periodYear, t.periodMonth),
  index("turnover_product_idx").on(t.productId, t.periodYear, t.periodMonth),
]);

export type HoldingCostRules = typeof holdingCostRulesTable.$inferSelect;
export type ExpenseAllocation = typeof expenseAllocationsTable.$inferSelect;
export type ProductProfitSnapshot = typeof productProfitSnapshotsTable.$inferSelect;
export type InventoryTurnoverMetric = typeof inventoryTurnoverMetricsTable.$inferSelect;
