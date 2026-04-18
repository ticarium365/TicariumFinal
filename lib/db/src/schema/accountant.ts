import { pgTable, serial, integer, text, timestamp, boolean, varchar, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const accountantInvitesTable = pgTable("accountant_invites", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name"),
  token: varchar("token", { length: 64 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | revoked | expired
  invitedBy: integer("invited_by").references(() => usersTable.id),
  acceptedUserId: integer("accepted_user_id").references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uxToken: uniqueIndex("accountant_invites_token_idx").on(t.token),
  ixCompany: index("accountant_invites_company_idx").on(t.companyId),
}));

export const accountantAccessTable = pgTable("accountant_access", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  scope: text("scope").notNull().default("read"), // read | read_write
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => ({
  uxCU: uniqueIndex("accountant_access_company_user_idx").on(t.companyId, t.userId),
}));

// Dönem kapanışı — kapatılmış aya yeni kayıt eklenemez
export const periodClosesTable = pgTable("period_closes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  status: text("status").notNull().default("closed"), // closed | reopened
  closedBy: integer("closed_by").references(() => usersTable.id),
  closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
  reopenedBy: integer("reopened_by").references(() => usersTable.id),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  note: text("note"),
}, (t) => ({
  uxCP: uniqueIndex("period_closes_company_period_idx").on(t.companyId, t.period),
}));
