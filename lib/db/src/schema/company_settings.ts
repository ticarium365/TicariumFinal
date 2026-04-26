import { pgTable, serial, integer, text, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),

  // Künye
  companyName: text("company_name").notNull().default(""),
  iban: text("iban"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  website: text("website"),
  taxNumber: text("tax_number"),
  taxOffice: text("tax_office"),
  legalForm: text("legal_form"),                // ŞAHIS / LTD / A.Ş.
  sector: text("sector"),                       // gıda / tekstil / inşaat / hizmet ...
  yearFounded: integer("year_founded"),
  vatRegime: text("vat_regime").default("gercek"), // gercek | basit

  // Marka & sistem
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#2563eb"),
  currency: text("currency").default("TRY"),
  taxRate: real("tax_rate").default(0),

  // Operasyon
  employeeCountTotal: integer("employee_count_total"),
  employeeCountFulltime: integer("employee_count_fulltime"),
  employeeCountParttime: integer("employee_count_parttime"),
  branchCount: integer("branch_count"),
  workingDaysPerWeek: integer("working_days_per_week").default(6),

  // Mekan / kira
  propertyType: text("property_type"),          // owned | rental
  monthlyRent: real("monthly_rent"),
  rentDeposit: real("rent_deposit"),
  rentEscalationMonth: integer("rent_escalation_month"), // 1-12 yıllık zam ayı

  // Aylık sabit giderler
  monthlyUtilities: real("monthly_utilities"),  // elektrik+su+gaz+internet TOPLAM
  monthlyMealExpense: real("monthly_meal_expense"),
  monthlyMiscExpenses: jsonb("monthly_misc_expenses"),     // [{label,amount}]
  payrollLines: jsonb("payroll_lines"),                    // [{role,count,gross,net,employerCostPerPerson}]
  payrollEmployerCostTotal: real("payroll_employer_cost_total"), // hesaplanmış toplam (override edilebilir)

  // Geçmiş performans (referans)
  monthlyAvgRevenue: real("monthly_avg_revenue"),
  targetGrossMargin: real("target_gross_margin"), // hedef brüt kâr marjı %

  // 2026 SGK / vergi parametreleri (tenant başına override edilebilir)
  // Asgari ücret değeri ve istisnalar değiştiğinde buradan güncellenir.
  sgkConfig: jsonb("sgk_config"),

  // Onboarding
  onboardingCompleted: boolean("onboarding_completed").default(false),

  /** Pazaryeri closed-loop: promote/suppress action types (sıralama); otomatik apply yok */
  autopilotClosedLoop: jsonb("autopilot_closed_loop").$type<Record<string, unknown>>().notNull().default({}),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettingsTable.$inferSelect;

// SGK config tipi
export type SgkConfig = {
  minWageGross: number;          // 2026 brüt asgari ücret
  incomeTaxExemption: number;    // Aylık asgari ücret gelir vergisi istisnası (TL)
  stampDutyExemption: number;    // Aylık asgari ücret damga vergisi istisnası (TL)
  brackets: { upTo: number; rate: number }[]; // YILLIK kümülatif gelir vergisi dilimleri
  sgkEmployeeRate: number;       // 0.14
  unemploymentEmployeeRate: number; // 0.01
  sgkEmployerRate: number;       // 0.155 (5 puan teşvikli)
  unemploymentEmployerRate: number; // 0.02
  shortTermInsuranceRate: number; // 0.0225 ortalama (sektörel değişir)
  stampDutyRate: number;         // 0.00759
};

// Misc expense satırı tipi
export type MiscExpenseLine = { label: string; amount: number };

// Payroll satırı tipi
export type PayrollLine = {
  role: string;
  count: number;
  gross: number;            // kişi başı aylık brüt
  net: number;              // kişi başı aylık net (hesaplanır)
  employerCostPerPerson: number; // brüt + işveren SGK + işsizlik + kısa vade
};
