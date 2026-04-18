import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const kvkkConsentsTable = pgTable("kvkk_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  companyId: integer("company_id"),
  email: text("email"),
  consentType: text("consent_type").notNull(),
  version: text("version").notNull().default("v1"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  givenAt: timestamp("given_at", { withTimezone: true }).defaultNow().notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("kvkk_consents_user_idx").on(t.userId, t.consentType),
  companyIdx: index("kvkk_consents_company_idx").on(t.companyId),
}));

export const dataExportRequestsTable = pgTable("data_export_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  fileUrl: text("file_url"),
  errorMessage: text("error_message"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => ({
  companyIdx: index("data_export_company_idx").on(t.companyId),
}));

export const dataErasureRequestsTable = pgTable("data_erasure_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  userId: integer("user_id").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("scheduled"),
  scheduledHardDeleteAt: timestamp("scheduled_hard_delete_at", { withTimezone: true }).notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: integer("cancelled_by"),
  hardDeletedAt: timestamp("hard_deleted_at", { withTimezone: true }),
}, (t) => ({
  companyIdx: index("data_erasure_company_idx").on(t.companyId),
  statusIdx: index("data_erasure_status_idx").on(t.status, t.scheduledHardDeleteAt),
}));

export type KvkkConsent = typeof kvkkConsentsTable.$inferSelect;
export type DataExportRequest = typeof dataExportRequestsTable.$inferSelect;
export type DataErasureRequest = typeof dataErasureRequestsTable.$inferSelect;
