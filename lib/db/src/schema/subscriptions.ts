import {
  pgTable, serial, integer, text, timestamp, boolean, index, numeric,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// ABONELIK PLANLARI (platform-level, super_admin yönetir)
// ─────────────────────────────────────────────────────────────────────────────
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                      // Starter | Pro | Enterprise
  slug: text("slug").notNull().unique(),              // starter | pro | enterprise
  description: text("description"),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceYearly: numeric("price_yearly", { precision: 10, scale: 2 }).notNull().default("0"),
  // Kısıtlamalar (-1 = sınırsız)
  maxUsers: integer("max_users").notNull().default(5),
  maxProducts: integer("max_products").notNull().default(1000),
  maxBranches: integer("max_branches").notNull().default(1),
  maxMonthlySales: integer("max_monthly_sales").notNull().default(500),
  storageMb: integer("storage_mb").notNull().default(500),          // MB
  // Özellikler (JSON array)
  features: text("features").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// ŞİRKET ABONELİKLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const companySubscriptionsTable = pgTable("company_subscriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  planId: integer("plan_id").notNull().references(() => subscriptionPlansTable.id),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly | yearly
  status: text("status").notNull().default("active"),  // active | cancelled | suspended | grace_period
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(true),
  notes: text("notes"),
  managedBy: integer("managed_by").references(() => usersTable.id), // super_admin
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("company_subscriptions_company_idx").on(t.companyId),
  index("company_subscriptions_status_idx").on(t.status, t.expiresAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// ABONELİK FATURALARI
// ─────────────────────────────────────────────────────────────────────────────
export const subscriptionInvoicesTable = pgTable("subscription_invoices", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => companySubscriptionsTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  invoiceNo: text("invoice_no").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("TRY"),
  status: text("status").notNull().default("pending"),  // pending | paid | failed | refunded
  dueDate: timestamp("due_date", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  description: text("description"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("subscription_invoices_company_idx").on(t.companyId, t.createdAt),
  index("subscription_invoices_sub_idx").on(t.subscriptionId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// KULLANIM İZLEME (günlük snapshot)
// ─────────────────────────────────────────────────────────────────────────────
export const subscriptionUsageTable = pgTable("subscription_usage", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  userCount: integer("user_count").notNull().default(0),
  productCount: integer("product_count").notNull().default(0),
  branchCount: integer("branch_count").notNull().default(0),
  monthlySalesCount: integer("monthly_sales_count").notNull().default(0),
}, (t) => [
  index("subscription_usage_company_idx").on(t.companyId, t.recordedAt),
]);

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type CompanySubscription = typeof companySubscriptionsTable.$inferSelect;
export type SubscriptionInvoice = typeof subscriptionInvoicesTable.$inferSelect;
