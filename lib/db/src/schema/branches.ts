import {
  pgTable, serial, integer, text, real, timestamp, boolean, index, unique,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBELER
// ─────────────────────────────────────────────────────────────────────────────
export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  isMain: boolean("is_main").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("branches_company_idx").on(t.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBE STOK SEVİYELERİ
// ─────────────────────────────────────────────────────────────────────────────
export const branchStockTable = pgTable("branch_stock", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: real("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("branch_stock_unique").on(t.branchId, t.productId),
  index("branch_stock_branch_idx").on(t.branchId),
  index("branch_stock_product_idx").on(t.productId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBELER ARASI TRANSFER
// ─────────────────────────────────────────────────────────────────────────────
export const branchTransfersTable = pgTable("branch_transfers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  fromBranchId: integer("from_branch_id").notNull().references(() => branchesTable.id),
  toBranchId: integer("to_branch_id").notNull().references(() => branchesTable.id),
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  completedBy: integer("completed_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("branch_transfers_company_idx").on(t.companyId, t.createdAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFER KALEMLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const branchTransferItemsTable = pgTable("branch_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => branchTransfersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: real("quantity").notNull(),
  notes: text("notes"),
}, (t) => [
  index("transfer_items_transfer_idx").on(t.transferId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBE — KULLANICI İLİŞKİSİ (hangi kullanıcı hangi şubelere erişebilir)
// ─────────────────────────────────────────────────────────────────────────────
export const branchUsersTable = pgTable("branch_users", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("branch_users_unique").on(t.branchId, t.userId),
  index("branch_users_branch_idx").on(t.branchId),
  index("branch_users_user_idx").on(t.userId),
]);

export type Branch = typeof branchesTable.$inferSelect;
export type BranchStock = typeof branchStockTable.$inferSelect;
export type BranchTransfer = typeof branchTransfersTable.$inferSelect;
export type BranchTransferItem = typeof branchTransferItemsTable.$inferSelect;
