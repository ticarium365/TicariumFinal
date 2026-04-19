import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";

export const expoPushTokensTable = pgTable("expo_push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  companyId: integer("company_id").notNull(),
  token: text("token").notNull(),
  deviceInfo: jsonb("device_info"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("expo_push_tokens_token_uniq").on(t.token),
  userIdx: index("expo_push_tokens_user_idx").on(t.userId),
}));

export const smsMessagesTable = pgTable("sms_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  toPhone: text("to_phone").notNull(),
  body: text("body").notNull(),
  provider: text("provider").notNull().default("netgsm"),
  status: text("status").notNull().default("queued"),
  externalId: text("external_id"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  companyIdx: index("sms_messages_company_idx").on(t.companyId, t.createdAt),
}));

// Tenant başına SMS provider yapılandırması.
// Tek satır per company. credentials şifreli (secret-crypto) tutulur.
export const smsSettingsTable = pgTable("sms_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  provider: text("provider").notNull().default("netgsm"), // netgsm | iletimerkezi | vatansms | mock
  sandbox: boolean("sandbox").notNull().default(false),
  senderHeader: text("sender_header"),
  credentials: jsonb("credentials").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastHealthOk: boolean("last_health_ok"),
  lastHealthMessage: text("last_health_message"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  companyUnique: uniqueIndex("sms_settings_company_unique").on(t.companyId),
}));

export type ExpoPushToken = typeof expoPushTokensTable.$inferSelect;
export type SmsMessage = typeof smsMessagesTable.$inferSelect;
export type SmsSettings = typeof smsSettingsTable.$inferSelect;
