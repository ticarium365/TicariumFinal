import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

/** Ürün / gelir hunisi — sorgulanabilir kalıcı olaylar (upgrade denemesi, fiyatlandırma görüntüleme vb.). */
export const productFunnelEventsTable = pgTable("product_funnel_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  eventKey: text("event_key").notNull(),
  /** JSON string; boyut sınırlı (PII kaçınımı). */
  props: text("props").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("product_funnel_events_company_created_idx").on(t.companyId, t.createdAt),
  index("product_funnel_events_key_created_idx").on(t.eventKey, t.createdAt),
  index("product_funnel_events_company_key_created_idx").on(t.companyId, t.eventKey, t.createdAt),
]);

export type ProductFunnelEvent = typeof productFunnelEventsTable.$inferSelect;
