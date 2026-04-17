import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  companyName: text("company_name").notNull().default(""),
  iban: text("iban"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  website: text("website"),
  taxNumber: text("tax_number"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#2563eb"),
  currency: text("currency").default("TRY"),
  taxRate: real("tax_rate").default(0),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettingsTable.$inferSelect;
