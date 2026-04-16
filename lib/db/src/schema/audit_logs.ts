import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  userId: integer("user_id"),
  username: text("username"),
  action: text("action").notNull(),   // örn: LOGIN, LOGOUT, PRODUCT_UPDATE, SALE_RETURN, PAYMENT_CONFIRM
  entity: text("entity"),             // örn: product, sale, user, payment, company
  entityId: integer("entity_id"),
  details: text("details"),           // JSON — önceki/sonraki değer veya bağlam
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
