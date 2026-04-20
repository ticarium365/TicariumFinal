import {
  pgTable, serial, integer, text, varchar, timestamp, boolean, index, pgEnum,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

/**
 * Sprint J — Üyelik / Doğrulama (Membership Verification)
 *
 * Kayıt sonrası ya da kullanıcının istemesi halinde gönderilen 6 haneli
 * doğrulama kodlarını saklar. SMS veya e-posta kanalıyla taşınır.
 * Şifre sıfırlama (`password_reset_tokens`) tablosundan ayrıdır:
 *  - bu tablo "kim olduğunu doğrula" amaçlıdır (companies.email/phone_verified_at).
 *  - şifre sıfırlama akışı kendi tablosunda izlenir.
 */
export const verificationChannelEnum = pgEnum("verification_channel", ["sms", "email"]);

export const verificationTokensTable = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  channel: verificationChannelEnum("channel").notNull(),
  /** SMS için 10 haneli normalize telefon, e-posta için lowercased adres. */
  target: varchar("target", { length: 255 }).notNull(),
  /** 6 haneli kodun bcrypt hash'i. */
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed: boolean("consumed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (t) => ({
  targetChannelIdx: index("verification_tokens_target_channel_idx").on(t.target, t.channel),
  userIdx: index("verification_tokens_user_idx").on(t.userId),
  expiresIdx: index("verification_tokens_expires_idx").on(t.expiresAt),
}));

export type VerificationToken = typeof verificationTokensTable.$inferSelect;
