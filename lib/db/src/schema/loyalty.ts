import { pgTable, serial, integer, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { customersTable } from "./customers";
import { usersTable } from "./users";

// Şirket bazında sadakat ayarları (per-company singleton row)
export const loyaltySettingsTable = pgTable("loyalty_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id).unique(),
  // Kazanç oranı: 100 TL satış başına kaç puan? (örn 1 → her 100 TL'de 1 puan)
  pointsPerHundredTL: real("points_per_hundred_tl").notNull().default(1),
  // Harcama: 1 puan kaç TL indirim sağlar? (örn 1 → 100 puan = 100 TL)
  tlPerPoint: real("tl_per_point").notNull().default(1),
  // Minimum harcanabilir puan
  minRedeemPoints: integer("min_redeem_points").notNull().default(50),
  isActive: integer("is_active").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Müşteri puan hareketleri (earn/redeem/adjust)
export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  type: text("type").notNull(), // earn | redeem | adjust | expire
  points: integer("points").notNull(), // pozitif (earn) veya negatif (redeem)
  amount: real("amount"), // hangi satıştan kazanıldı/harcandı (TL)
  saleId: integer("sale_id"),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  custIdx: index("loyalty_tx_customer_idx").on(t.companyId, t.customerId),
  dateIdx: index("loyalty_tx_date_idx").on(t.companyId, t.createdAt),
}));
