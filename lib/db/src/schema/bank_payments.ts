import { pgTable, serial, integer, text, timestamp, pgEnum, numeric } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "confirmed", "rejected"]);

export const bankPaymentsTable = pgTable("bank_payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  senderName: text("sender_name").notNull(),
  referenceNote: text("reference_note"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  confirmedById: integer("confirmed_by_id").references(() => usersTable.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BankPayment = typeof bankPaymentsTable.$inferSelect;
