import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

/** Founder / tahsilat ekibi — hatırlatma kuyruğundan çıkan idempotent aksiyon kayıtları. */
export const collectionReminderActionsTable = pgTable(
  "collection_reminder_actions",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    /** Hafta başı (Pazartesi) YYYY-MM-DD veya raporlama anahtarı. */
    periodKey: text("period_key").notNull(),
    reminderTier: text("reminder_tier").notNull(),
    /** queued | contacted | snoozed | dismissed | resolved */
    status: text("status").notNull().default("queued"),
    notes: text("notes"),
    overdueTrySnapshot: integer("overdue_try_snapshot").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("collection_reminder_actions_idempotency_uq").on(t.idempotencyKey),
    index("cra_company_period_idx").on(t.companyId, t.periodKey),
    index("cra_status_created_idx").on(t.status, t.createdAt),
  ],
);

export type CollectionReminderAction = typeof collectionReminderActionsTable.$inferSelect;
