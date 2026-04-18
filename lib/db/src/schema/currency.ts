import { pgTable, serial, integer, text, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Şirket-bazlı para birimi kuru. base = TRY varsayılan.
// rate: 1 birim {currency} = kaç TRY (örn USD: 32.50)
export const currencyRatesTable = pgTable("currency_rates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  currency: text("currency").notNull(), // USD | EUR | GBP | ...
  rate: real("rate").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).defaultNow().notNull(),
  source: text("source").default("manual"), // manual | tcmb | api
  createdBy: integer("created_by").references(() => usersTable.id),
});

// Şirket başına en son aktif kuru hızlı bulmak için index
export const currencyRatesUniqueLatest = (currencyRatesTable);

// Sprint 80 — TCMB EVDS resmi kur snapshot (global, tüm tenant ortak)
import { decimal, date } from "drizzle-orm/pg-core";
export const tcmbRatesTable = pgTable("tcmb_rates", {
  id: serial("id").primaryKey(),
  rateDate: date("rate_date").notNull(),
  currency: text("currency").notNull(),
  buyRate: decimal("buy_rate", { precision: 18, scale: 6 }).notNull(),
  sellRate: decimal("sell_rate", { precision: 18, scale: 6 }).notNull(),
  source: text("source").notNull().default("tcmb"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("tcmb_rates_date_currency_uniq").on(t.rateDate, t.currency, t.source),
}));

export type TcmbRate = typeof tcmbRatesTable.$inferSelect;
