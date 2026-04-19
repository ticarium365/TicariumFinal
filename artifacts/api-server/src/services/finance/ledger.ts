// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL FINANCE LEDGER (Sprint 65 hazırlık)
// Gelir/gider/nakit hareketlerinin tek normalize kaynağı.
// 5 farklı veri kaynağına dağılmış olan finansal akışı tek bir API arkasına
// indirgeyerek finance-dashboard, budgets, tahmin motoru ve AI CFO gibi
// üstkatman bileşenlerin aynı yorumla beslenmesini sağlar.
//
// Veri kaynakları:
//   - sales (satış cirosu)
//   - purchases (alış faturaları)
//   - expenses (genel giderler)
//   - cash_movements (kasa hareketleri — opsiyonel)
//   - bank_transactions (banka hareketleri)
//
// Tasarım kuralı: response shape'i bu modülün dışında tanımlanır; route'lar
// kendi backwards-compat shape'lerine map'ler. Burada SADECE normalize sayılar.
// ─────────────────────────────────────────────────────────────────────────────

import {
  db,
  salesTable,
  purchasesTable,
  expensesTable,
  expenseCategoriesTable,
  cashMovementsTable,
  bankTransactionsTable,
} from "@workspace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type LedgerSource =
  | "sales"
  | "purchases"
  | "expenses"
  | "cash_movements"
  | "bank_transactions";

export type LedgerDirection = "income" | "expense";

export interface LedgerEntry {
  source: LedgerSource;
  sourceId: number;
  date: Date;
  direction: LedgerDirection;
  amount: number;
  currency: string;
  categoryId?: number | null;
  description?: string | null;
}

export interface LedgerRange {
  from: Date;
  to: Date;
}

export interface LedgerOptions extends LedgerRange {
  sources?: LedgerSource[]; // default: hepsi
  /** Default: false (iade satışları gelir sayılmaz). Eski davranış için true geçilebilir. */
  includeReturnedSales?: boolean;
}

const ALL_SOURCES: LedgerSource[] = [
  "sales", "purchases", "expenses", "cash_movements", "bank_transactions",
];

// ─── Atomik kaynak sorgular ──────────────────────────────────────────────────
// Her biri sadece kendi tablosunu sorgular; üst katman birleştirir.

async function querySales(companyId: number, r: LedgerRange, includeReturned = false): Promise<LedgerEntry[]> {
  const rows = await db.select({
    id: salesTable.id,
    date: salesTable.createdAt,
    amount: salesTable.totalPrice,
    returned: salesTable.returned,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    gte(salesTable.createdAt, r.from),
    lte(salesTable.createdAt, r.to),
  ));
  const filtered = includeReturned ? rows : rows.filter(x => !x.returned);
  return filtered.map(x => ({
    source: "sales", sourceId: x.id, date: x.date,
    direction: "income", amount: Number(x.amount || 0),
    currency: "TRY", description: null,
  }));
}

async function queryPurchases(companyId: number, r: LedgerRange): Promise<LedgerEntry[]> {
  const rows = await db.select({
    id: purchasesTable.id,
    date: purchasesTable.invoiceDate,
    amount: purchasesTable.totalAmount,
  }).from(purchasesTable).where(and(
    eq(purchasesTable.companyId, companyId),
    gte(purchasesTable.invoiceDate, r.from),
    lte(purchasesTable.invoiceDate, r.to),
  ));
  return rows.map(x => ({
    source: "purchases", sourceId: x.id, date: x.date,
    direction: "expense", amount: Number(x.amount || 0),
    currency: "TRY", description: null,
  }));
}

async function queryExpenses(companyId: number, r: LedgerRange): Promise<LedgerEntry[]> {
  const rows = await db.select({
    id: expensesTable.id,
    date: expensesTable.expenseDate,
    amount: expensesTable.amount,
    categoryId: expensesTable.categoryId,
    description: expensesTable.description,
  }).from(expensesTable).where(and(
    eq(expensesTable.companyId, companyId),
    gte(expensesTable.expenseDate, r.from),
    lte(expensesTable.expenseDate, r.to),
  ));
  return rows.map(x => ({
    source: "expenses", sourceId: x.id, date: x.date,
    direction: "expense", amount: Number(x.amount || 0),
    currency: "TRY", categoryId: x.categoryId, description: x.description,
  }));
}

async function queryCashMovements(companyId: number, r: LedgerRange): Promise<LedgerEntry[]> {
  const rows = await db.select({
    id: cashMovementsTable.id,
    date: cashMovementsTable.createdAt,
    amount: cashMovementsTable.amount,
    direction: cashMovementsTable.direction,
    categoryId: cashMovementsTable.categoryId,
    description: cashMovementsTable.description,
  }).from(cashMovementsTable).where(and(
    eq(cashMovementsTable.companyId, companyId),
    gte(cashMovementsTable.createdAt, r.from),
    lte(cashMovementsTable.createdAt, r.to),
  ));
  return rows.map(x => ({
    source: "cash_movements", sourceId: x.id, date: x.date,
    direction: x.direction === "in" ? "income" : "expense",
    amount: Math.abs(Number(x.amount || 0)),
    currency: "TRY", categoryId: x.categoryId, description: x.description,
  }));
}

async function queryBankTransactions(companyId: number, r: LedgerRange): Promise<LedgerEntry[]> {
  const rows = await db.select({
    id: bankTransactionsTable.id,
    date: bankTransactionsTable.txDate,
    amount: bankTransactionsTable.amount,
    description: bankTransactionsTable.description,
  }).from(bankTransactionsTable).where(and(
    eq(bankTransactionsTable.companyId, companyId),
    gte(bankTransactionsTable.txDate, r.from),
    lte(bankTransactionsTable.txDate, r.to),
  ));
  return rows.map(x => {
    const amt = Number(x.amount || 0);
    return {
      source: "bank_transactions" as const, sourceId: x.id, date: x.date,
      direction: amt >= 0 ? ("income" as const) : ("expense" as const),
      amount: Math.abs(amt), currency: "TRY", description: x.description,
    };
  });
}

// ─── Kamuya açık API ─────────────────────────────────────────────────────────

/** Belirtilen aralıktaki tüm normalize hareket kalemlerini döndürür. */
export async function getLedger(companyId: number, opts: LedgerOptions): Promise<LedgerEntry[]> {
  const wanted = new Set<LedgerSource>(opts.sources ?? ALL_SOURCES);
  const range: LedgerRange = { from: opts.from, to: opts.to };
  const tasks: Promise<LedgerEntry[]>[] = [];
  if (wanted.has("sales")) tasks.push(querySales(companyId, range, opts.includeReturnedSales));
  if (wanted.has("purchases")) tasks.push(queryPurchases(companyId, range));
  if (wanted.has("expenses")) tasks.push(queryExpenses(companyId, range));
  if (wanted.has("cash_movements")) tasks.push(queryCashMovements(companyId, range));
  if (wanted.has("bank_transactions")) tasks.push(queryBankTransactions(companyId, range));
  const all = await Promise.all(tasks);
  return all.flat().sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Aralıktaki kaynak bazlı toplamları (in/out/count) döndürür.
 *  `includeReturnedSales` opsiyonu `getLedger`'a iletilir. */
export async function getSummary(companyId: number, opts: LedgerOptions) {
  const sources = opts.sources ?? ALL_SOURCES;
  const result: Record<LedgerSource, { income: number; expense: number; count: number }> = {
    sales: { income: 0, expense: 0, count: 0 },
    purchases: { income: 0, expense: 0, count: 0 },
    expenses: { income: 0, expense: 0, count: 0 },
    cash_movements: { income: 0, expense: 0, count: 0 },
    bank_transactions: { income: 0, expense: 0, count: 0 },
  };
  const entries = await getLedger(companyId, { ...opts, sources });
  for (const e of entries) {
    result[e.source].count += 1;
    result[e.source][e.direction] += e.amount;
  }
  const totalIn = sources.reduce((s, k) => s + result[k].income, 0);
  const totalOut = sources.reduce((s, k) => s + result[k].expense, 0);
  return { bySource: result, totalIncome: totalIn, totalExpense: totalOut, net: totalIn - totalOut };
}

/** Kategori bazlı gider toplamı (expensesTable üzerinden). */
export async function getExpenseByCategory(companyId: number, r: LedgerRange) {
  const rows = await db.select({
    categoryId: expensesTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  }).from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, expensesTable.categoryId))
    .where(and(
      eq(expensesTable.companyId, companyId),
      gte(expensesTable.expenseDate, r.from),
      lte(expensesTable.expenseDate, r.to),
    ))
    .groupBy(expensesTable.categoryId, expenseCategoriesTable.name);
  return rows.map(r => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    total: Number(r.total || 0),
  }));
}

/** Tek metrik kısa-yol: aralıktaki satış cirosu. */
export async function getRevenueTotal(companyId: number, r: LedgerRange) {
  const [agg] = await db.select({
    v: sql<string>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    eq(salesTable.returned, false),
    gte(salesTable.createdAt, r.from),
    lte(salesTable.createdAt, r.to),
  ));
  return Number(agg?.v || 0);
}

/** Tek metrik kısa-yol: aralıktaki gider toplamı. */
export async function getExpenseTotal(companyId: number, r: LedgerRange) {
  const [agg] = await db.select({
    v: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  }).from(expensesTable).where(and(
    eq(expensesTable.companyId, companyId),
    gte(expensesTable.expenseDate, r.from),
    lte(expensesTable.expenseDate, r.to),
  ));
  return Number(agg?.v || 0);
}
