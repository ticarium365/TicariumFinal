import {
  pgTable, serial, integer, text, timestamp, boolean, decimal, jsonb, index, unique,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { financeDocumentsTable } from "./finance_documents";
import { expensesTable } from "./finance";
import { purchasesTable } from "./suppliers";

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 59 — BANKACILIK (CSV/PDF Ekstre Import + Sprint 60 Eşleştirme)
// ─────────────────────────────────────────────────────────────────────────────

export const BANK_TX_TYPES = ["debit", "credit"] as const;
export type BankTxType = typeof BANK_TX_TYPES[number];

export const BANK_TX_STATUSES = ["unmatched", "matched", "ignored"] as const;
export type BankTxStatus = typeof BANK_TX_STATUSES[number];

// Banka hesabı (kullanıcı tanımlar)
export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  bankName: text("bank_name").notNull(),    // "Garanti BBVA"
  accountName: text("account_name").notNull(),  // "Şirket Vadesiz"
  iban: text("iban"),
  currency: text("currency").notNull().default("TRY"),
  openingBalance: decimal("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  currentBalance: decimal("current_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("bank_accounts_company_idx").on(t.companyId),
]);

// Yüklenen ekstre dosyası (audit)
export const bankStatementsTable = pgTable("bank_statements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  accountId: integer("account_id").notNull().references(() => bankAccountsTable.id),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path"),    // null olabilir (CSV inline parse)
  format: text("format").notNull(),   // "csv" | "pdf" | "ofx" | "manual"
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  rowCount: integer("row_count").notNull().default(0),
  importedBy: integer("imported_by").references(() => usersTable.id),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

// Banka hareketi (her satır)
export const bankTransactionsTable = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  accountId: integer("account_id").notNull().references(() => bankAccountsTable.id),
  statementId: integer("statement_id").references(() => bankStatementsTable.id),

  txDate: timestamp("tx_date", { withTimezone: true }).notNull(),
  valueDate: timestamp("value_date", { withTimezone: true }),
  description: text("description").notNull(),
  counterparty: text("counterparty"),     // karşı IBAN ya da ünvan
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),  // pozitif=alacak, negatif=borç
  txType: text("tx_type").notNull(),      // BANK_TX_TYPES
  balance: decimal("balance", { precision: 14, scale: 2 }),  // satır sonu bakiye (varsa)
  reference: text("reference"),           // banka tarafı referans no

  status: text("status").notNull().default("unmatched"),  // BANK_TX_STATUSES

  // Sprint 60 — eşleştirme
  matchedDocId: integer("matched_doc_id").references(() => financeDocumentsTable.id),
  matchedExpenseId: integer("matched_expense_id").references(() => expensesTable.id),
  matchedPurchaseId: integer("matched_purchase_id").references(() => purchasesTable.id),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  matchedBy: integer("matched_by").references(() => usersTable.id),

  // Tekilleştirme: aynı satırı 2 kez import etmeyi engelle (hash)
  rowHash: text("row_hash"),

  raw: jsonb("raw").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("bank_tx_company_date_idx").on(t.companyId, t.txDate),
  index("bank_tx_account_date_idx").on(t.accountId, t.txDate),
  index("bank_tx_status_idx").on(t.companyId, t.status),
  unique("bank_tx_account_hash_unique").on(t.accountId, t.rowHash),
]);

export type BankAccount = typeof bankAccountsTable.$inferSelect;
export type BankStatement = typeof bankStatementsTable.$inferSelect;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
