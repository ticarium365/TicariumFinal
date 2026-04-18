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
