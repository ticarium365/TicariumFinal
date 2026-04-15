import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("PROSAN ENDÜSTRİ"),
  iban: text("iban"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettingsTable.$inferSelect;
