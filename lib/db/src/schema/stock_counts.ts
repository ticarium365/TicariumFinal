import { pgTable, serial, integer, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { productsTable } from "./products";

// ─────────────────────────────────────────────────────────────────────────────
// STOK SAYIM OTURUMLARI
// ─────────────────────────────────────────────────────────────────────────────
export const stockCountSessionsTable = pgTable("stock_count_sessions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("open"), // open | closed | approved
  notes: text("notes"),
  openedBy: integer("opened_by").references(() => usersTable.id),
  closedBy: integer("closed_by").references(() => usersTable.id),
  approvedBy: integer("approved_by").references(() => usersTable.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  totalProducts: integer("total_products").notNull().default(0),
  totalDiff: integer("total_diff").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("stock_count_sessions_company_idx").on(t.companyId, t.openedAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// SAYIM KALEMLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const stockCountItemsTable = pgTable("stock_count_items", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => stockCountSessionsTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  productCode: text("product_code").notNull(),
  productName: text("product_name").notNull(),
  systemStock: integer("system_stock").notNull(),
  countedQty: integer("counted_qty").notNull().default(0),
  diff: integer("diff").notNull().default(0),
  isAdjusted: boolean("is_adjusted").notNull().default(false),
  notes: text("notes"),
  countedAt: timestamp("counted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("stock_count_items_session_product_idx").on(t.sessionId, t.productId),
  index("stock_count_items_company_session_idx").on(t.companyId, t.sessionId),
]);

export type StockCountSession = typeof stockCountSessionsTable.$inferSelect;
export type StockCountItem = typeof stockCountItemsTable.$inferSelect;
