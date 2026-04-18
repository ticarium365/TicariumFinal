import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  bankAccountsTable,
  bankStatementsTable,
  bankTransactionsTable,
  financeDocumentsTable,
  expensesTable,
  purchasesTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte, lte, ilike, or, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import crypto from "node:crypto";

const router: IRouter = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// HESAPLAR
// ─────────────────────────────────────────────────────────────────────────────
router.get("/accounts", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const rows = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.companyId, companyId))
    .orderBy(desc(bankAccountsTable.createdAt));
  res.json(rows);
});

router.post("/accounts", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { bankName, accountName, iban, currency, openingBalance } = req.body ?? {};
  if (!bankName?.trim() || !accountName?.trim()) {
    return res.status(400).json({ error: "bankName and accountName required" });
  }
  const opening = String(openingBalance ?? 0);
  const [created] = await db.insert(bankAccountsTable).values({
    companyId,
    bankName: bankName.trim(),
    accountName: accountName.trim(),
    iban: iban || null,
    currency: currency || "TRY",
    openingBalance: opening,
    currentBalance: opening,
  }).returning();
  res.status(201).json(created);
});

router.put("/accounts/:id", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const { bankName, accountName, iban, currency, isActive } = req.body ?? {};
  const [updated] = await db.update(bankAccountsTable).set({
    ...(bankName !== undefined ? { bankName } : {}),
    ...(accountName !== undefined ? { accountName } : {}),
    ...(iban !== undefined ? { iban } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(isActive !== undefined ? { isActive: !!isActive } : {}),
  })
    .where(and(eq(bankAccountsTable.id, id), eq(bankAccountsTable.companyId, companyId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json(updated);
});

router.delete("/accounts/:id", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const r = await db.delete(bankAccountsTable)
    .where(and(eq(bankAccountsTable.id, id), eq(bankAccountsTable.companyId, companyId)))
    .returning();
  if (!r.length) return res.status(404).json({ error: "Account not found" });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV PARSER (Türk bankaları yaygın formatları için esnek)
// Beklenen başlıklar (case-insensitive, alternatifler):
//  date | tarih | islem tarihi
//  description | aciklama | açıklama | islem
//  amount | tutar  (negatif=borç)  -- veya borç/alacak ayrı sütunlar: borc, alacak
//  balance | bakiye  (opsiyonel)
//  reference | dekont no | islem no  (opsiyonel)
// ─────────────────────────────────────────────────────────────────────────────
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  // Ayraç tahmini: ; veya ,
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const splitLine = (l: string): string[] => {
    const out: string[] = []; let cur = ""; let inQ = false;
    for (const ch of l) {
      if (ch === '"') inQ = !inQ;
      else if (ch === sep && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function parseTrNumber(s: string): number {
  if (!s) return 0;
  // "1.234,56" → 1234.56  ; "1,234.56" → 1234.56 ; "-1.234,56" → -1234.56
  const cleaned = s.replace(/\s/g, "").replace(/[^\d.,\-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  return isNaN(n) ? 0 : n;
}

function parseTrDate(s: string): Date | null {
  if (!s) return null;
  // "01.04.2026" / "01/04/2026" / "2026-04-01"
  const m1 = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

router.post("/accounts/:id/import-csv", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const accountId = Number(req.params.id);
    const { csv, fileName } = req.body ?? {};
    if (!csv || typeof csv !== "string") {
      return res.status(400).json({ error: "csv (string) gerekli" });
    }
    const [acc] = await db.select().from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.id, accountId), eq(bankAccountsTable.companyId, companyId)))
      .limit(1);
    if (!acc) return res.status(404).json({ error: "Hesap bulunamadı" });

    const { rows } = parseCsv(csv);
    if (!rows.length) return res.status(400).json({ error: "CSV satır içermiyor" });

    const [stmt] = await db.insert(bankStatementsTable).values({
      companyId,
      accountId,
      fileName: fileName || "import.csv",
      format: "csv",
      rowCount: 0,
      importedBy: req.session.user?.id ?? null,
    }).returning();

    let inserted = 0;
    let skipped = 0;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const row of rows) {
      const dateStr = pick(row, "tarih", "islem tarihi", "işlem tarihi", "date");
      const desc = pick(row, "aciklama", "açıklama", "description", "islem", "işlem");
      const ref = pick(row, "dekont no", "referans", "reference", "islem no", "işlem no");
      const cp = pick(row, "karşı taraf", "karsi taraf", "counterparty", "alıcı", "alici");
      const balanceStr = pick(row, "bakiye", "balance");
      const amountStr = pick(row, "tutar", "amount");
      const debitStr = pick(row, "borç", "borc", "debit");
      const creditStr = pick(row, "alacak", "credit");

      const txDate = parseTrDate(dateStr);
      if (!txDate || !desc) { skipped++; continue; }

      let amount = 0;
      if (amountStr) amount = parseTrNumber(amountStr);
      else {
        const d = parseTrNumber(debitStr);
        const c = parseTrNumber(creditStr);
        amount = c - d;
      }
      if (amount === 0) { skipped++; continue; }

      const txType = amount >= 0 ? "credit" : "debit";
      const balance = balanceStr ? String(parseTrNumber(balanceStr)) : null;

      const hashInput = `${accountId}|${txDate.toISOString()}|${amount}|${desc}|${ref}`;
      const rowHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 32);

      try {
        await db.insert(bankTransactionsTable).values({
          companyId,
          accountId,
          statementId: stmt.id,
          txDate,
          description: desc,
          counterparty: cp || null,
          amount: String(amount),
          txType,
          balance,
          reference: ref || null,
          status: "unmatched",
          rowHash,
          raw: row,
        });
        inserted++;
        if (!minDate || txDate < minDate) minDate = txDate;
        if (!maxDate || txDate > maxDate) maxDate = txDate;
      } catch (e: any) {
        // unique violation (aynı satır zaten var)
        skipped++;
      }
    }

    await db.update(bankStatementsTable).set({
      rowCount: inserted,
      periodStart: minDate,
      periodEnd: maxDate,
    }).where(eq(bankStatementsTable.id, stmt.id));

    // Bakiyeyi yenile
    const [bal] = await db.select({
      sum: sql<string>`COALESCE(SUM(${bankTransactionsTable.amount}), 0)`,
    }).from(bankTransactionsTable).where(eq(bankTransactionsTable.accountId, accountId));
    const newBal = Number(acc.openingBalance) + Number(bal.sum || 0);
    await db.update(bankAccountsTable).set({ currentBalance: String(newBal) })
      .where(eq(bankAccountsTable.id, accountId));

    res.json({ ok: true, statementId: stmt.id, inserted, skipped, totalRows: rows.length });
  } catch (e: any) {
    console.error("[banking/import-csv]", e);
    res.status(500).json({ error: "CSV import başarısız", detail: e?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HAREKETLER
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { accountId, status, search, dateFrom, dateTo, limit = "100" } = req.query;
  const conds = [eq(bankTransactionsTable.companyId, companyId)];
  if (accountId) conds.push(eq(bankTransactionsTable.accountId, Number(accountId)));
  if (status) conds.push(eq(bankTransactionsTable.status, String(status)));
  if (search) {
    const s = `%${String(search)}%`;
    conds.push(or(
      ilike(bankTransactionsTable.description, s),
      ilike(bankTransactionsTable.counterparty, s),
      ilike(bankTransactionsTable.reference, s),
    )!);
  }
  if (dateFrom) conds.push(gte(bankTransactionsTable.txDate, new Date(String(dateFrom))));
  if (dateTo) conds.push(lte(bankTransactionsTable.txDate, new Date(String(dateTo))));

  const rows = await db.select().from(bankTransactionsTable)
    .where(and(...conds))
    .orderBy(desc(bankTransactionsTable.txDate))
    .limit(Math.min(Number(limit), 500));
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 60 — ÖDEME EŞLEŞTİRME (banka hareketi ↔ belge/gider/alış faturası)
// ═══════════════════════════════════════════════════════════════════════════

// Otomatik öneri: tutar + tarih (±5 gün) + party/açıklama benzerliği
router.get("/transactions/:id/match-suggestions", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);
    const [tx] = await db.select().from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.id, id), eq(bankTransactionsTable.companyId, companyId)))
      .limit(1);
    if (!tx) return res.status(404).json({ error: "Tx bulunamadı" });

    const absAmount = Math.abs(Number(tx.amount));
    const dateLow = new Date(tx.txDate); dateLow.setDate(dateLow.getDate() - 5);
    const dateHigh = new Date(tx.txDate); dateHigh.setDate(dateHigh.getDate() + 5);

    // 1) Belge eşleşmeleri (totalAmount yakın + tarih bandı)
    const docs = await db.select().from(financeDocumentsTable).where(and(
      eq(financeDocumentsTable.companyId, companyId),
      isNull(financeDocumentsTable.convertedToType),  // henüz dönüştürülmemiş
      sql`ABS(CAST(${financeDocumentsTable.totalAmount} AS NUMERIC) - ${absAmount}) < 1.0`,
    )).limit(10);

    // 2) Gider eşleşmeleri (debit'ler için)
    const expenses = tx.txType === "debit"
      ? await db.select().from(expensesTable).where(and(
          eq(expensesTable.companyId, companyId),
          gte(expensesTable.expenseDate, dateLow),
          lte(expensesTable.expenseDate, dateHigh),
          sql`ABS(${expensesTable.amount} - ${absAmount}) < 1.0`,
        )).limit(10)
      : [];

    // 3) Alış faturası eşleşmeleri (debit'ler için, ödenmemişler)
    const purchases = tx.txType === "debit"
      ? await db.select().from(purchasesTable).where(and(
          eq(purchasesTable.companyId, companyId),
          sql`${purchasesTable.paymentStatus} <> 'paid'`,
          sql`ABS(${purchasesTable.totalAmount} - ${absAmount}) < 1.0`,
        )).limit(10)
      : [];

    res.json({ tx, docs, expenses, purchases });
  } catch (e: any) {
    console.error("[banking/suggestions]", e);
    res.status(500).json({ error: "öneri başarısız", detail: e?.message });
  }
});

// Manuel/onaylı eşleştirme
router.post("/transactions/:id/match", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);
    const { docId, expenseId, purchaseId } = req.body ?? {};

    const [tx] = await db.select().from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.id, id), eq(bankTransactionsTable.companyId, companyId)))
      .limit(1);
    if (!tx) return res.status(404).json({ error: "Tx bulunamadı" });

    // En az birinin verilmesini bekle
    if (!docId && !expenseId && !purchaseId) {
      return res.status(400).json({ error: "docId | expenseId | purchaseId gerekli" });
    }

    // Tenant kontrolleri
    if (docId) {
      const [d] = await db.select({ id: financeDocumentsTable.id })
        .from(financeDocumentsTable)
        .where(and(eq(financeDocumentsTable.id, Number(docId)), eq(financeDocumentsTable.companyId, companyId)))
        .limit(1);
      if (!d) return res.status(400).json({ error: "Geçersiz docId" });
    }
    if (expenseId) {
      const [e] = await db.select({ id: expensesTable.id })
        .from(expensesTable)
        .where(and(eq(expensesTable.id, Number(expenseId)), eq(expensesTable.companyId, companyId)))
        .limit(1);
      if (!e) return res.status(400).json({ error: "Geçersiz expenseId" });
    }
    if (purchaseId) {
      const [p] = await db.select({ id: purchasesTable.id })
        .from(purchasesTable)
        .where(and(eq(purchasesTable.id, Number(purchaseId)), eq(purchasesTable.companyId, companyId)))
        .limit(1);
      if (!p) return res.status(400).json({ error: "Geçersiz purchaseId" });
      // Ödendi olarak işaretle
      await db.update(purchasesTable).set({ paymentStatus: "paid" })
        .where(and(eq(purchasesTable.id, Number(purchaseId)), eq(purchasesTable.companyId, companyId)));
    }

    const [updated] = await db.update(bankTransactionsTable).set({
      status: "matched",
      matchedDocId: docId ? Number(docId) : null,
      matchedExpenseId: expenseId ? Number(expenseId) : null,
      matchedPurchaseId: purchaseId ? Number(purchaseId) : null,
      matchedAt: new Date(),
      matchedBy: req.session.user?.id ?? null,
    }).where(and(eq(bankTransactionsTable.id, id), eq(bankTransactionsTable.companyId, companyId)))
      .returning();

    res.json({ ok: true, transaction: updated });
  } catch (e: any) {
    console.error("[banking/match]", e);
    res.status(500).json({ error: "match failed", detail: e?.message });
  }
});

router.post("/transactions/:id/ignore", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const [updated] = await db.update(bankTransactionsTable)
    .set({ status: "ignored" })
    .where(and(eq(bankTransactionsTable.id, id), eq(bankTransactionsTable.companyId, companyId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "tx not found" });
  res.json({ ok: true });
});

export default router;
