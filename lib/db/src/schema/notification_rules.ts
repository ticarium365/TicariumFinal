import {
  pgTable, serial, integer, text, boolean, timestamp, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// BİLDİRİM KURALLARI
// type: "low_stock" | "new_sale" | "daily_summary" | "subscription_expiry"
//       "overdue_payment" | "new_purchase" | "stock_count_closed"
// channel: "in_app" | "webhook" (genişletilebilir)
// ─────────────────────────────────────────────────────────────────────────────
export const notificationRulesTable = pgTable("notification_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  channel: text("channel").notNull().default("in_app"),
  threshold: integer("threshold"),       // low_stock için eşik değer
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("notification_rules_company_idx").on(t.companyId, t.type),
]);

// ─────────────────────────────────────────────────────────────────────────────
// KULLANICI BİLDİRİM TERCİHLERİ
// Kullanıcı bazlı açık/kapalı per tip
// ─────────────────────────────────────────────────────────────────────────────
export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  type: text("type").notNull(),          // bildirim tipi
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("notification_prefs_user_idx").on(t.userId, t.companyId),
]);

export type NotificationRule = typeof notificationRulesTable.$inferSelect;
export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
