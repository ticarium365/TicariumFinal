import { pgTable, serial, text, boolean, timestamp, integer, pgEnum, uniqueIndex, index, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["admin", "staff", "viewer", "super_admin"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: varchar("phone", { length: 20 }),
  role: userRoleEnum("role").notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  kvkkConsentAt: timestamp("kvkk_consent_at", { withTimezone: true }),
  kvkkConsentVersion: text("kvkk_consent_version"),
  marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
  setupChecklistDismissedAt: timestamp("setup_checklist_dismissed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  usernameCompanyIdx: uniqueIndex("users_username_company_idx").on(table.username, table.companyId),
  phoneIdx: index("users_phone_idx").on(table.phone),
}));

// Şifre sıfırlama / SMS doğrulama kayıtları
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Tenant isolation — sıfırlama kayıtları daima companyId ile filtrelenir
  companyId: integer("company_id").notNull(),
  // 6 haneli SMS doğrulama kodu (bcrypt hash'lenir)
  codeHash: text("code_hash").notNull(),
  // Telefon numarası snapshot (hesap silinmeden önce de takip edebilelim)
  phone: varchar("phone", { length: 20 }).notNull(),
  // Kod doğrulandıktan sonra üretilen kısa süreli reset token (sha256)
  resetTokenHash: text("reset_token_hash"),
  attempts: integer("attempts").notNull().default(0),
  consumed: boolean("consumed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (t) => ({
  userIdx: index("password_reset_user_idx").on(t.userId),
  phoneIdx: index("password_reset_phone_idx").on(t.phone),
  expiresIdx: index("password_reset_expires_idx").on(t.expiresAt),
}));

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
