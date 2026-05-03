import { Router, type Request, type Response } from "express";
import {
  db, fixedAssetsTable, employeeCostsTable,
  recurringExpensesTable, expenseDetailsTable,
  expensesTable, expenseCategoriesTable,
} from "@workspace/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import multer from "multer";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { assertWithinUsageLimit, incrementUsageSafe } from "../services/usage.js";
import { aiFeatureDisabledBody, getOpenAIClient } from "../lib/openai-client.js";
import { z } from "zod";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// Zod schemas for validation
const fixedAssetUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  serialNo: z.string().max(100).optional(),
  vendor: z.string().max(200).optional(),
  invoiceUrl: z.string().url().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  warrantyEnd: z.string().optional().nullable(),
  depreciationMonths: z.number().int().positive().optional(),
  salvageValue: z.number().optional(),
  branchId: z.number().optional(),
  notes: z.string().max(1000).optional(),
  status: z.string().optional(),
  purchasePrice: z.number().optional(),
});

const employeeCostUpdateSchema = z.object({
  grossSalary: z.number().optional(),
  sgkEmployer: z.number().optional(),
  mealAllowance: z.number().optional(),
  transportAllowance: z.number().optional(),
  bonus: z.number().optional(),
  paidAmount: z.number().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// FIŞ / FATURA OCR — Image upload → GPT-5.2 vision → yapısal veri
// Frontend bu endpoint'e fiş resmi gönderir, dönen veriyle expense formunu doldurur.
// Endpoint expense oluşturmaz, yalnızca PARSE eder.
// ─────────────────────────────────────────────────────────────────────────────
const RECEIPT_PROMPT = `Sen bir Türk fiş/fatura okuma uzmanısın. Verilen görseldeki fişi/fatu rayı analiz et ve sadece JSON olarak yanıt ver:
{
  "vendorName": string | null,        // satıcı adı / mağaza
  "vendorVkn": string | null,         // VKN/TCKN (varsa)
  "invoiceNumber": string | null,
  "date": "YYYY-MM-DD" | null,
  "amount": number,                   // toplam tutar (KDV dahil)
  "vatRate": number,                  // KDV oranı (0/1/8/10/18/20)
  "vatAmount": number,                // KDV tutarı
  "category": string | null,          // tahmini kategori (yakıt, kırtasiye, market, yemek, kargo, telefon, internet, kira...)
  "description": string,              // kısa açıklama (1 cümle)
  "paymentMethod": "cash" | "bank" | "credit",
  "items": [{"name": string, "quantity": number, "unitPrice": number, "total": number}],
  "confidence": number                // 0-1 arası okumadaki güven
}
KDV dahil/hariç ayırımı yap. Fiş okunamıyorsa amount=0 ve confidence=0 dön. Sadece JSON dön, başka metin verme.`;

router.post("/receipt-ocr", requireWriter, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "Görsel dosyası gerekli (file)" });
  const openai = getOpenAIClient();
  if (!openai) return res.status(503).json(aiFeatureDisabledBody());
  // Dalga 23 — OCR kontör gating: limit aşıldıysa 402 + ek kontör daveti
  try {
    await assertWithinUsageLimit(req.companyId!, "ocr", 1);
  } catch (err: any) {
    if (err?.code === "QUOTA_EXCEEDED") {
      return res.status(402).json({
        error: { code: "QUOTA_EXCEEDED", message: "OCR kontörünüz bitti. Ek kontör satın alarak devam edebilirsiniz.", metric: "ocr", limit: err.limit, current: err.currentCount },
      });
    }
    throw err;
  }
  try {
    const mime = req.file.mimetype || "image/jpeg";
    const b64 = req.file.buffer.toString("base64");
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1500,
      messages: [
        { role: "system", content: RECEIPT_PROMPT },
        { role: "user", content: [
          { type: "text", text: "Aşağıdaki fişi/faturayı analiz et ve JSON dön." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ] as any },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : raw);
    } catch {
      parsed = { error: "JSON parse failed", raw };
    }
    incrementUsageSafe(req.companyId!, "ocr", 1);
    res.json({ ok: true, ocr: parsed });
  } catch (e: any) {
    console.error("[profit/receipt-ocr]", e);
    res.status(500).json({ error: "OCR failed", detail: e?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES — extended (mevcut /finance routes'unu BOZMADAN burada yeni endpoint)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/expenses", async (req, res) => {
  const companyId = req.companyId!;
  const { from, to, categoryId, branchId, limit = "200" } = req.query as any;
  const conds = [eq(expensesTable.companyId, companyId)];
  if (from) conds.push(gte(expensesTable.expenseDate, new Date(String(from))));
  if (to) conds.push(lte(expensesTable.expenseDate, new Date(String(to))));
  if (categoryId) conds.push(eq(expensesTable.categoryId, Number(categoryId)));
  const rows = await db.select({
    e: expensesTable, d: expenseDetailsTable, c: expenseCategoriesTable,
  })
    .from(expensesTable)
    .leftJoin(expenseDetailsTable, eq(expenseDetailsTable.expenseId, expensesTable.id))
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, expensesTable.categoryId))
    .where(and(...conds))
    .orderBy(desc(expensesTable.expenseDate))
    .limit(Number(limit));
  const result = rows.map((r) => ({
    ...r.e,
    category: r.c ? { id: r.c.id, name: r.c.name, icon: r.c.icon, color: r.c.color } : null,
    details: r.d || null,
  })).filter((r) => !branchId || r.details?.branchId === Number(branchId));
  res.json(result);
});

router.post("/expenses", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const {
    categoryId, amount, description, expenseDate, paymentMethod, notes,
    branchId, vatRate, vatAmount, vendorName, vendorVkn, invoiceNumber,
    receiptUrl, recurringId, ocrData, tags,
  } = req.body || {};
  if (amount == null || !description) return res.status(400).json({ error: "amount ve description zorunlu" });

  // Ownership: kategori bu firmaya mı ait?
  let safeCategoryId: number | null = null;
  if (categoryId) {
    const [c] = await db.select({ id: expenseCategoriesTable.id }).from(expenseCategoriesTable).where(and(
      eq(expenseCategoriesTable.id, Number(categoryId)),
      eq(expenseCategoriesTable.companyId, companyId),
    )).limit(1);
    if (!c) return res.status(400).json({ error: "Geçersiz kategori" });
    safeCategoryId = c.id;
  }

  // Atomik insert (transaction)
  const result = await db.transaction(async (tx) => {
    const [exp] = await tx.insert(expensesTable).values({
      companyId, categoryId: safeCategoryId, amount: Number(amount),
      description, expenseDate: new Date(expenseDate || Date.now()),
      paymentMethod: paymentMethod || "cash", notes: notes || null, createdBy: userId,
    }).returning();
    await tx.insert(expenseDetailsTable).values({
      companyId, expenseId: exp.id, branchId: branchId || null,
      recurringId: recurringId || null,
      vatRate: vatRate != null ? Number(vatRate) : null,
      vatAmount: vatAmount != null ? Number(vatAmount) : null,
      vendorName: vendorName || null, vendorVkn: vendorVkn || null,
      invoiceNumber: invoiceNumber || null, receiptUrl: receiptUrl || null,
      ocrStatus: ocrData ? "done" : "none", ocrData: ocrData || null,
      tags: tags || null,
    }).onConflictDoNothing();
    return exp;
  });
  res.status(201).json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIXED ASSETS (Demirbaş)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/fixed-assets", async (req, res) => {
  const rows = await db.select().from(fixedAssetsTable)
    .where(eq(fixedAssetsTable.companyId, req.companyId!))
    .orderBy(desc(fixedAssetsTable.purchaseDate));
  res.json(rows);
});

router.post("/fixed-assets", requireWriter, async (req, res) => {
  const userId = req.session.user!.id;
  const { name, category, serialNo, purchaseDate, purchasePrice, vendor,
    invoiceUrl, photoUrl, warrantyEnd, depreciationMonths, salvageValue,
    branchId, notes } = req.body || {};
  if (!name || !purchaseDate || purchasePrice == null) {
    return res.status(400).json({ error: "name, purchaseDate, purchasePrice zorunlu" });
  }
  const [row] = await db.insert(fixedAssetsTable).values({
    companyId: req.companyId!, name, category: category || null, serialNo: serialNo || null,
    purchaseDate, purchasePrice: Number(purchasePrice), vendor: vendor || null,
    invoiceUrl: invoiceUrl || null, photoUrl: photoUrl || null,
    warrantyEnd: warrantyEnd || null, depreciationMonths: Number(depreciationMonths) || 36,
    salvageValue: Number(salvageValue) || 0, branchId: branchId || null, notes: notes || null,
    createdBy: userId,
  }).returning();
  res.status(201).json(row);
});

router.put("/fixed-assets/:id", requireWriter, async (req, res) => {
  const id = Number(req.params.id);
  const body = fixedAssetUpdateSchema.parse(req.body);
  const patch: any = { updatedAt: new Date() };
  for (const k of ["name", "category", "serialNo", "vendor", "invoiceUrl", "photoUrl",
    "warrantyEnd", "depreciationMonths", "salvageValue", "branchId", "notes", "status"]) {
    if (body[k as keyof typeof body] !== undefined) patch[k] = body[k as keyof typeof body];
  }
  if (body.purchasePrice != null) patch.purchasePrice = Number(body.purchasePrice);
  const [row] = await db.update(fixedAssetsTable).set(patch)
    .where(and(eq(fixedAssetsTable.id, id), eq(fixedAssetsTable.companyId, req.companyId!)))
    .returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

router.delete("/fixed-assets/:id", requireWriter, async (req, res) => {
  await db.delete(fixedAssetsTable).where(and(
    eq(fixedAssetsTable.id, Number(req.params.id)),
    eq(fixedAssetsTable.companyId, req.companyId!),
  ));
  res.json({ ok: true });
});

// Amortisman özeti (lazy compute)
router.get("/fixed-assets/:id/depreciation", async (req, res) => {
  const id = Number(req.params.id);
  const [a] = await db.select().from(fixedAssetsTable).where(and(
    eq(fixedAssetsTable.id, id), eq(fixedAssetsTable.companyId, req.companyId!),
  )).limit(1);
  if (!a) return res.status(404).json({ error: "not_found" });
  const months = a.depreciationMonths || 36;
  const monthly = (a.purchasePrice - (a.salvageValue || 0)) / months;
  const start = new Date(a.purchaseDate);
  const schedule: any[] = [];
  let cumulative = 0;
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    cumulative += monthly;
    schedule.push({
      year: d.getFullYear(), month: d.getMonth() + 1,
      amount: Math.round(monthly * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      bookValue: Math.round((a.purchasePrice - cumulative) * 100) / 100,
    });
  }
  res.json({ asset: a, monthly: Math.round(monthly * 100) / 100, schedule });
});

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
router.get("/recurring-expenses", async (req, res) => {
  const rows = await db.select().from(recurringExpensesTable)
    .where(eq(recurringExpensesTable.companyId, req.companyId!))
    .orderBy(desc(recurringExpensesTable.createdAt));
  res.json(rows);
});

router.post("/recurring-expenses", requireWriter, async (req, res) => {
  const [row] = await db.insert(recurringExpensesTable).values({
    companyId: req.companyId!, ...req.body,
  }).returning();
  res.status(201).json(row);
});

router.delete("/recurring-expenses/:id", requireWriter, async (req, res) => {
  await db.delete(recurringExpensesTable).where(and(
    eq(recurringExpensesTable.id, Number(req.params.id)),
    eq(recurringExpensesTable.companyId, req.companyId!),
  ));
  res.json({ ok: true });
});

// "Bu ay için oluştur" — atomik check+update ile çift üretimi engelle
router.post("/recurring-expenses/run", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const list = await db.select().from(recurringExpensesTable).where(and(
    eq(recurringExpensesTable.companyId, companyId),
    eq(recurringExpensesTable.isActive, true),
  ));
  let created = 0;
  for (const r of list) {
    try {
      await db.transaction(async (tx) => {
        // Atomik claim: lastGeneratedAt < monthStart koşuluyla update; rowcount=0 ise zaten üretilmiş
        const claimed = await tx.update(recurringExpensesTable)
          .set({ lastGeneratedAt: todayStr })
          .where(and(
            eq(recurringExpensesTable.id, r.id),
            eq(recurringExpensesTable.companyId, companyId),
            sql`(${recurringExpensesTable.lastGeneratedAt} IS NULL OR ${recurringExpensesTable.lastGeneratedAt} < ${monthStart})`,
          )).returning({ id: recurringExpensesTable.id });
        if (claimed.length === 0) return; // başka biri aldı / bu ay zaten üretildi

        const [exp] = await tx.insert(expensesTable).values({
          companyId, categoryId: r.categoryId || null, amount: r.amount,
          description: `${r.name} (otomatik)`, expenseDate: today,
          paymentMethod: r.paymentMethod || "bank", createdBy: userId,
        }).returning();
        await tx.insert(expenseDetailsTable).values({
          companyId, expenseId: exp.id, branchId: r.branchId || null,
          recurringId: r.id, vatRate: r.vatRate || 0,
        }).onConflictDoNothing();
        created++;
      });
    } catch (e) {
      console.error("[recurring-expenses/run]", r.id, e);
    }
  }
  res.json({ created, total: list.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE COSTS
// ─────────────────────────────────────────────────────────────────────────────
router.get("/employee-costs", async (req, res) => {
  const { year, month } = req.query as any;
  const conds = [eq(employeeCostsTable.companyId, req.companyId!)];
  if (year) conds.push(eq(employeeCostsTable.periodYear, Number(year)));
  if (month) conds.push(eq(employeeCostsTable.periodMonth, Number(month)));
  const rows = await db.select().from(employeeCostsTable).where(and(...conds))
    .orderBy(desc(employeeCostsTable.periodYear), desc(employeeCostsTable.periodMonth));
  res.json(rows);
});

router.post("/employee-costs", requireWriter, async (req, res) => {
  const b = req.body || {};
  const totalEmployerCost = Number(b.grossSalary || 0) + Number(b.sgkEmployer || 0)
    + Number(b.mealAllowance || 0) + Number(b.transportAllowance || 0) + Number(b.bonus || 0);
  const [row] = await db.insert(employeeCostsTable).values({
    companyId: req.companyId!, ...b, totalEmployerCost,
  }).returning();
  res.status(201).json(row);
});

router.put("/employee-costs/:id", requireWriter, async (req, res) => {
  const id = Number(req.params.id);
  const body = employeeCostUpdateSchema.parse(req.body);
  const patch: any = { ...body, updatedAt: new Date() };
  if (body.paidAmount != null) patch.paidAmount = Number(body.paidAmount);
  if (patch.grossSalary != null || patch.sgkEmployer != null) {
    patch.totalEmployerCost = Number(patch.grossSalary || 0) + Number(patch.sgkEmployer || 0)
      + Number(patch.mealAllowance || 0) + Number(patch.transportAllowance || 0) + Number(patch.bonus || 0);
  }
  const [row] = await db.update(employeeCostsTable).set(patch).where(and(
    eq(employeeCostsTable.id, id), eq(employeeCostsTable.companyId, req.companyId!),
  )).returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

router.delete("/employee-costs/:id", requireWriter, async (req, res) => {
  await db.delete(employeeCostsTable).where(and(
    eq(employeeCostsTable.id, Number(req.params.id)),
    eq(employeeCostsTable.companyId, req.companyId!),
  ));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFIT DASHBOARD — Bugün/aylık brüt-net kar
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  const companyId = req.companyId!;
  const granularity = (req.query.granularity as string) || "today"; // today | month
  const now = new Date();
  const fromQ = typeof req.query.from === "string" ? req.query.from : "";
  const toQ = typeof req.query.to === "string" ? req.query.to : "";
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  let from: Date;
  let to: Date;
  /** Full period payroll + depreciation vs prorated by day count */
  let useFullPeriodBurden = false;

  if (ymd.test(fromQ) && ymd.test(toQ)) {
    from = new Date(`${fromQ}T00:00:00`);
    to = new Date(`${toQ}T23:59:59`);
    const daySpan =
      Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1);
    useFullPeriodBurden = daySpan >= 25;
  } else if (granularity === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    useFullPeriodBurden = true;
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    useFullPeriodBurden = false;
  }

  // Ciro & COGS — sales tablosu satır başına purchase_price + profit içeriyor
  const salesRow = await db.execute<{ revenue: number; cogs: number; gross: number }>(sql`
    SELECT
      COALESCE(SUM(total_price), 0)::float AS revenue,
      COALESCE(SUM(quantity * purchase_price), 0)::float AS cogs,
      COALESCE(SUM(profit), 0)::float AS gross
    FROM sales
    WHERE company_id = ${companyId}
      AND COALESCE(returned, false) = false
      AND created_at BETWEEN ${from} AND ${to}
  `);
  const revenue = Number((salesRow.rows[0] as any)?.revenue || 0);
  const cogs = Number((salesRow.rows[0] as any)?.cogs || 0);

  // Giderler kategori bazlı
  const expRows = await db.execute<{ category: string; total: number }>(sql`
    SELECT COALESCE(c.name, 'Diğer') AS category, COALESCE(SUM(e.amount), 0)::float AS total
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.company_id = ${companyId} AND e.expense_date BETWEEN ${from} AND ${to}
    GROUP BY c.name
    ORDER BY total DESC
  `);
  const expensesByCategory = expRows.rows as any[];
  const totalExpenses = expensesByCategory.reduce((s, r) => s + Number(r.total || 0), 0);

  // Personel maliyeti — aralığın bitiş ayına göre
  const ref = to;
  const payrollRow = await db.execute<{ payroll: number }>(sql`
    SELECT COALESCE(SUM(total_employer_cost), 0)::float AS payroll
    FROM employee_costs
    WHERE company_id = ${companyId}
      AND period_year = ${ref.getFullYear()} AND period_month = ${ref.getMonth() + 1}
  `);
  const payrollFull = Number((payrollRow.rows[0] as any)?.payroll || 0);

  // Amortisman — aktif demirbaşların aylık toplamı
  const depRow = await db.execute<{ dep: number }>(sql`
    SELECT COALESCE(SUM((purchase_price - COALESCE(salvage_value,0)) / NULLIF(depreciation_months, 0)), 0)::float AS dep
    FROM fixed_assets
    WHERE company_id = ${companyId} AND status = 'active'
  `);
  const depreciation = Number((depRow.rows[0] as any)?.dep || 0);

  const dayCount =
    Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1);
  let payrollApplied: number;
  let depApplied: number;
  if (useFullPeriodBurden) {
    payrollApplied = payrollFull;
    depApplied = depreciation;
  } else {
    const f = Math.min(dayCount, 30) / 30;
    payrollApplied = payrollFull * f;
    depApplied = (depreciation / 30) * Math.min(dayCount, 30);
  }

  const grossProfit = Number((salesRow.rows[0] as any)?.gross || (revenue - cogs));
  const netProfit = grossProfit - totalExpenses - payrollApplied - depApplied;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  res.json({
    granularity, from, to,
    revenue, cogs, grossProfit,
    expensesByCategory,
    totalExpenses,
    payroll: payrollApplied,
    depreciation: depApplied,
    netProfit: Math.round(netProfit * 100) / 100,
    marginPct: Math.round(marginPct * 100) / 100,
  });
});

router.get("/insights", async (req, res) => {
  const companyId = req.companyId!;
  const now = new Date();
  const thisMonth = await db.execute(sql`
    SELECT COALESCE(c.name,'Diğer') AS category, COALESCE(SUM(e.amount),0)::float AS total
    FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.company_id = ${companyId}
      AND e.expense_date >= date_trunc('month', NOW())
    GROUP BY c.name
  `);
  const lastMonth = await db.execute(sql`
    SELECT COALESCE(c.name,'Diğer') AS category, COALESCE(SUM(e.amount),0)::float AS total
    FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.company_id = ${companyId}
      AND e.expense_date >= date_trunc('month', NOW() - INTERVAL '1 month')
      AND e.expense_date < date_trunc('month', NOW())
    GROUP BY c.name
  `);
  const tm = new Map((thisMonth.rows as any[]).map((r) => [r.category, Number(r.total)]));
  const lm = new Map((lastMonth.rows as any[]).map((r) => [r.category, Number(r.total)]));
  const insights: { category: string; thisMonth: number; lastMonth: number; deltaPct: number; severity: string }[] = [];
  const cats = new Set([...tm.keys(), ...lm.keys()]);
  for (const c of cats) {
    const a = tm.get(c) || 0;
    const b = lm.get(c) || 0;
    if (b === 0 && a === 0) continue;
    const deltaPct = b === 0 ? 100 : ((a - b) / b) * 100;
    insights.push({
      category: c as string, thisMonth: a, lastMonth: b,
      deltaPct: Math.round(deltaPct),
      severity: deltaPct > 30 ? "warn" : deltaPct < -30 ? "info" : "ok",
    });
  }
  insights.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  res.json(insights);
});

export default router;
