import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  financeDocumentsTable,
  bankAccountsTable,
  bankTransactionsTable,
  expensesTable,
  expenseCategoriesTable,
  purchasesTable,
  salesTable,
  suppliersTable,
  customersTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import * as XLSX from "xlsx";
// Sprint 65 — canonical finance ledger
import { getSummary as ledgerSummary, getExpenseByCategory } from "../services/finance/ledger.js";
import { aiFeatureDisabledBody, getOpenAIClient } from "../lib/openai-client.js";

const router: IRouter = Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 61 — FİNANS DASHBOARD (Cashflow + Borç/Alacak yaşlandırma + KPI'lar)
// ═══════════════════════════════════════════════════════════════════════════
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);

    // Banka toplam bakiye
    const accounts = await db.select().from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.companyId, companyId), eq(bankAccountsTable.isActive, true)));
    const totalBankBalance = accounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);

    // Sprint 65 — sales+purchases+expenses tek ledger çağrısıyla beslenir.
    // includeReturnedSales=true → /summary geçmiş davranışıyla bire bir uyumlu (iadeler ciroya dahil).
    const monthLedger = await ledgerSummary(companyId, {
      from: monthStart, to: monthEnd,
      sources: ["sales", "purchases", "expenses"],
      includeReturnedSales: true,
    });
    const monthSales = { sum: String(monthLedger.bySource.sales.income), count: monthLedger.bySource.sales.count };
    const monthPurchases = { sum: String(monthLedger.bySource.purchases.expense), count: monthLedger.bySource.purchases.count };
    const monthExpenses = { sum: String(monthLedger.bySource.expenses.expense), count: monthLedger.bySource.expenses.count };

    // Bekleyen belgeler (yeni + onay bekliyor)
    const [pendingDocs] = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(financeDocumentsTable).where(and(
        eq(financeDocumentsTable.companyId, companyId),
        sql`${financeDocumentsTable.status} IN ('yeni','onay_bekliyor')`,
      ));

    // Eşleşmemiş banka hareketleri
    const [unmatchedTx] = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(bankTransactionsTable).where(and(
        eq(bankTransactionsTable.companyId, companyId),
        eq(bankTransactionsTable.status, "unmatched"),
      ));

    // Borç (ödenmemiş alış faturaları)
    const [unpaidPurchases] = await db.select({
      sum: sql<string>`COALESCE(SUM(total_amount), 0)`,
      c: sql<number>`COUNT(*)::int`,
    }).from(purchasesTable).where(and(
      eq(purchasesTable.companyId, companyId),
      sql`${purchasesTable.paymentStatus} <> 'paid'`,
    ));

    // Tedarikçi & müşteri toplam bakiye (currentBalance)
    const [supSum] = await db.select({
      sum: sql<string>`COALESCE(SUM(current_balance), 0)`,
    }).from(suppliersTable).where(eq(suppliersTable.companyId, companyId));

    const [custSum] = await db.select({
      sum: sql<string>`COALESCE(SUM(current_balance), 0)`,
    }).from(customersTable).where(eq(customersTable.companyId, companyId));

    // Son 30 gün cashflow (banka hareketlerinden)
    const cashflowRows = await db.execute(sql`
      SELECT DATE(tx_date) AS d,
             SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END)::text AS inflow,
             SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END)::text AS outflow
        FROM bank_transactions
       WHERE company_id = ${companyId}
         AND tx_date >= ${last30}
       GROUP BY DATE(tx_date)
       ORDER BY d ASC
    `);

    res.json({
      kpis: {
        totalBankBalance,
        monthSales: Number(monthSales.sum), monthSalesCount: monthSales.count,
        monthPurchases: Number(monthPurchases.sum), monthPurchasesCount: monthPurchases.count,
        monthExpenses: Number(monthExpenses.sum), monthExpensesCount: monthExpenses.count,
        netMonthCash: Number(monthSales.sum) - Number(monthPurchases.sum) - Number(monthExpenses.sum),
        pendingDocs: pendingDocs.c,
        unmatchedTx: unmatchedTx.c,
        unpaidPurchases: Number(unpaidPurchases.sum), unpaidPurchasesCount: unpaidPurchases.c,
        suppliersBalance: Number(supSum.sum),
        customersBalance: Number(custSum.sum),
      },
      accounts: accounts.map(a => ({
        id: a.id, bankName: a.bankName, accountName: a.accountName,
        balance: Number(a.currentBalance), currency: a.currency,
      })),
      cashflow30d: cashflowRows.rows.map((r: any) => ({
        date: r.d, inflow: Number(r.inflow || 0), outflow: Number(r.outflow || 0),
        net: Number(r.inflow || 0) - Number(r.outflow || 0),
      })),
    });
  } catch (e: any) {
    console.error("[finance/summary]", e);
    res.status(500).json({ error: "summary failed", detail: e?.message });
  }
});

// Borç / Alacak yaşlandırması (0-30, 31-60, 61-90, 90+)
router.get("/aging", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const purchases = await db.select({
      id: purchasesTable.id,
      supplierId: purchasesTable.supplierId,
      invoiceDate: purchasesTable.invoiceDate,
      totalAmount: purchasesTable.totalAmount,
      paymentStatus: purchasesTable.paymentStatus,
    }).from(purchasesTable).where(and(
      eq(purchasesTable.companyId, companyId),
      sql`${purchasesTable.paymentStatus} <> 'paid'`,
    ));

    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const now = Date.now();
    for (const p of purchases) {
      const days = Math.floor((now - new Date(p.invoiceDate).getTime()) / 86400000);
      const amt = Number(p.totalAmount);
      if (days <= 30) buckets["0-30"] += amt;
      else if (days <= 60) buckets["31-60"] += amt;
      else if (days <= 90) buckets["61-90"] += amt;
      else buckets["90+"] += amt;
    }
    res.json({ purchasesAging: buckets, totalUnpaid: Object.values(buckets).reduce((a,b)=>a+b,0) });
  } catch (e: any) {
    console.error("[finance/aging]", e);
    res.status(500).json({ error: "aging failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 63 — MALİ MÜŞAVİR KÖPRÜSÜ (XLSX export — LUCA/Mikro/Logo uyumlu)
// ═══════════════════════════════════════════════════════════════════════════
router.get("/accountant-export", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const { from, to } = req.query;
    const dateFrom = from ? new Date(String(from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = to ? new Date(String(to)) : new Date();

    // 1) Alış faturaları
    const purchases = await db.select({
      id: purchasesTable.id, invoiceNo: purchasesTable.invoiceNo,
      invoiceDate: purchasesTable.invoiceDate, supplierId: purchasesTable.supplierId,
      subtotal: purchasesTable.subtotalAmount, tax: purchasesTable.taxAmount,
      total: purchasesTable.totalAmount, paymentStatus: purchasesTable.paymentStatus,
      supplierName: suppliersTable.name, supplierTaxNo: suppliersTable.taxNumber,
    }).from(purchasesTable)
      .leftJoin(suppliersTable, eq(suppliersTable.id, purchasesTable.supplierId))
      .where(and(
        eq(purchasesTable.companyId, companyId),
        gte(purchasesTable.invoiceDate, dateFrom),
        lte(purchasesTable.invoiceDate, dateTo),
      ));

    // 2) Satışlar
    const sales = await db.select({
      id: salesTable.id, total: salesTable.totalPrice, createdAt: salesTable.createdAt,
      paymentMethod: salesTable.paymentMethod,
    }).from(salesTable).where(and(
      eq(salesTable.companyId, companyId),
      gte(salesTable.createdAt, dateFrom),
      lte(salesTable.createdAt, dateTo),
    ));

    // 3) Giderler
    const expenses = await db.select({
      id: expensesTable.id, amount: expensesTable.amount,
      description: expensesTable.description, expenseDate: expensesTable.expenseDate,
      paymentMethod: expensesTable.paymentMethod, categoryName: expenseCategoriesTable.name,
    }).from(expensesTable)
      .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, expensesTable.categoryId))
      .where(and(
        eq(expensesTable.companyId, companyId),
        gte(expensesTable.expenseDate, dateFrom),
        lte(expensesTable.expenseDate, dateTo),
      ));

    // 4) Banka hareketleri
    const bankTx = await db.select().from(bankTransactionsTable).where(and(
      eq(bankTransactionsTable.companyId, companyId),
      gte(bankTransactionsTable.txDate, dateFrom),
      lte(bankTransactionsTable.txDate, dateTo),
    ));

    const wb = XLSX.utils.book_new();
    const safeSheet = (rows: any[], headers: string[]) =>
      rows.length > 0 ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, safeSheet(purchases, ["id","invoiceNo","invoiceDate","supplierId","subtotal","tax","total","paymentStatus","supplierName","supplierTaxNo"]), "Alis_Faturalari");
    XLSX.utils.book_append_sheet(wb, safeSheet(sales, ["id","total","createdAt","paymentMethod"]), "Satislar");
    XLSX.utils.book_append_sheet(wb, safeSheet(expenses, ["id","amount","description","expenseDate","paymentMethod","categoryName"]), "Giderler");
    XLSX.utils.book_append_sheet(wb, safeSheet(bankTx, ["id","accountId","txDate","description","amount","txType","balance"]), "Banka_Hareketleri");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="mali_musavir_${dateFrom.toISOString().slice(0,10)}_${dateTo.toISOString().slice(0,10)}.xlsx"`);
    res.send(buf);
  } catch (e: any) {
    console.error("[finance/accountant-export]", e);
    res.status(500).json({ error: "export failed", detail: e?.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 64 — AI CFO (GPT-5.2 ile finansal yorum + anomali tespiti)
// ═══════════════════════════════════════════════════════════════════════════
router.post("/ai-cfo/analyze", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const openai = getOpenAIClient();
    if (!openai) return res.status(503).json(aiFeatureDisabledBody());
    const { question } = req.body ?? {};

    // KPI'ları topla (summary'i içerden çağırmak yerine inline minimal sorgu)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last90 = new Date(); last90.setDate(last90.getDate() - 90);

    const [monthSales] = await db.select({ sum: sql<string>`COALESCE(SUM(total_price), 0)` })
      .from(salesTable).where(and(eq(salesTable.companyId, companyId), gte(salesTable.createdAt, monthStart)));
    const [monthPurchases] = await db.select({ sum: sql<string>`COALESCE(SUM(total_amount), 0)` })
      .from(purchasesTable).where(and(eq(purchasesTable.companyId, companyId), gte(purchasesTable.invoiceDate, monthStart)));
    const [monthExpenses] = await db.select({ sum: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(expensesTable).where(and(eq(expensesTable.companyId, companyId), gte(expensesTable.expenseDate, monthStart)));
    const [unpaidPurchases] = await db.select({ sum: sql<string>`COALESCE(SUM(total_amount), 0)` })
      .from(purchasesTable).where(and(eq(purchasesTable.companyId, companyId), sql`${purchasesTable.paymentStatus} <> 'paid'`));
    const accounts = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.companyId, companyId));
    const totalBank = accounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);

    // Top 5 gider kategorisi (90 gün)
    const topExp = await db.execute(sql`
      SELECT COALESCE(c.name, 'Kategorisiz') AS category,
             SUM(e.amount)::text AS total
        FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.company_id = ${companyId} AND e.expense_date >= ${last90}
       GROUP BY 1 ORDER BY 2 DESC LIMIT 5
    `);

    const ctx = {
      ay_satis: Number(monthSales.sum),
      ay_alis: Number(monthPurchases.sum),
      ay_gider: Number(monthExpenses.sum),
      net_nakit_akisi: Number(monthSales.sum) - Number(monthPurchases.sum) - Number(monthExpenses.sum),
      odenmemis_alis: Number(unpaidPurchases.sum),
      banka_toplam: totalBank,
      en_yuksek_5_gider_kategorisi_90gun: topExp.rows.map((r: any) => ({ kategori: r.category, toplam: Number(r.total) })),
    };

    const userQ = question || "Bu ayın finansal performansını değerlendirip 3 somut tavsiye ver.";

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `Sen şirket için sanal CFO'sun. Verilen Türkçe finansal verilere bakıp KISA, NET, EYLEMSEL Türkçe analiz ver.
Format:
## Özet
(2 cümle)
## Anomali / Risk
(varsa madde madde)
## Tavsiyeler
(numaralı 3-5 madde)
Sayıları ₺ formatında yaz.`,
        },
        { role: "user", content: `Veriler (JSON):\n${JSON.stringify(ctx, null, 2)}\n\nSoru: ${userQ}` },
      ],
    });

    const answer = completion.choices[0]?.message?.content || "(boş yanıt)";
    res.json({ ok: true, context: ctx, answer });
  } catch (e: any) {
    console.error("[finance/ai-cfo]", e);
    res.status(500).json({ error: "AI CFO failed", detail: e?.message });
  }
});

export default router;
