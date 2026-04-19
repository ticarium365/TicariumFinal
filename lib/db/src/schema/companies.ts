import { pgTable, serial, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planTypeEnum = pgEnum("plan_type", ["trial", "active", "suspended"]);

/**
 * Sektör enum'u — onboarding wizard'da kullanıcının seçtiği iş kolu.
 * Demo veri seçimini, varsayılan vergi/KDV ayarlarını ve ileride sektöre
 * özel rapor şablonlarını yönlendirmek için kullanılır.
 *  - industrial: B2B endüstriyel (PROSAN tarzı: vida, makine parçaları)
 *  - retail   : Perakende/Bakkal-Market (FMCG, POS odaklı)
 *  - other    : Sınıflandırılmamış / karma
 */
export const companySectorEnum = pgEnum("company_sector", [
  "industrial",
  "retail",
  "other",
]);

/**
 * Sprint D — Buyer Portal Foundation: hesap tipi enum'u.
 *  - seller     : satıcı firma (varsayılan; Ticarium365 ana panelini kullanır)
 *  - buyer      : sadece alıcı firma (sipariş/RFQ gönderir, satıcı paneline erişmez)
 *  - both       : hem satıcı hem alıcı (her iki panele de girebilir)
 *  - purchasing : Sprint I — sade Satınalma Hesabı; sadece B2B vitrin + 4 ayar item'ı görür.
 */
export const accountTypeEnum = pgEnum("account_type", ["seller", "buyer", "both", "purchasing"]);

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#2563eb"),
  isActive: boolean("is_active").notNull().default(true),
  planType: planTypeEnum("plan_type").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** Sprint D: hesap tipi — buyer portal vs satıcı paneli yetkilendirmesi için. */
  accountType: accountTypeEnum("account_type").notNull().default("seller"),
  // T017 Phase B-2: Onboarding wizard alanları
  sector: companySectorEnum("sector"),
  /** Onboarding wizard tamamlandığında doldurulur (kullanıcı "Bitti" derse veya skip etse de set edilir). */
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  /** Demo verisi yüklendiğinde doldurulur — idempotency için kontrol edilir, ikinci kez seed edilmez. */
  demoSeededAt: timestamp("demo_seeded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
