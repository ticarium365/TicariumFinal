import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const contactRequestsTable = pgTable("contact_requests", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  companyName: text("company_name"),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("new"), // new | contacted | archived
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
});

export type ContactRequest = typeof contactRequestsTable.$inferSelect;
export type NewContactRequest = typeof contactRequestsTable.$inferInsert;
