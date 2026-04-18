// Bütçe & Tahmin — Logo Tiger / Mikro Jump benzeri planlama
import { Router } from "express";
import {
  db,
  budgetsTable,
  revenueForecastsTable,
  cashflowForecastsTable,
  expenseCategoriesTable,
  expensesTable,
  salesTable,
  customersTable,
  purchasesTable,
  suppliersTable,
} from "@workspace/db";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

function periodToRange(period: string): [Date, Date] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return [new Date(y, mo, 1, 0, 0, 0), new Date(y, mo + 1, 0, 23, 59, 59)];
}
function shiftPeriod(period: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)!;
  let y = Number(m[1]);
  let mo = Number(m[2]) + delta;
  while (mo <= 0) { mo += 12; y -= 1; }
  while (mo > 12) { mo -= 12; y += 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

// ─── BÜTÇELER ───
router.get("/", async (req, res) => {
  const period = req.query.period ? String(req.query.period) : null;
  const where = period
    ? and(eq(budgetsTable.companyId, req.companyId!), eq(budgetsTable.period, period))
    : eq(budgetsTable.companyId, req.companyId!);
  const rows = await db.select({
    id: budgetsTable.id,
    period: budgetsTable.period,
    scope: budgetsTable.scope,
    categoryId: budgetsTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    label: budgetsTable.label,
    budgetAmount: budgetsTable.budgetAmount,
    note: budgetsTable.note,
    createdAt: budgetsTable.createdAt,
  }).from(budgetsTable)
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, budgetsTable.categoryId))
    .where(where).orderBy(desc(budgetsTable.period), budgetsTable.scope);
  res.json(rows);
});

router.post("/", requireWriter, async (req, res) => {
  const { period, scope, categoryId, label, budgetAmount, note } = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(String(period || ""))) {
    return res.status(400).json({ error: "period YYYY-MM olmalı" });
  }
  if (!budgetAmount || isNaN(Number(budgetAmount))) {
    return res.status(400).json({ error: "budgetAmount sayı olmalı" });
  }
  // Eğer categoryId verildiyse kategorinin bu firmaya ait olduğunu doğrula
  if (categoryId) {
    const [cat] = await db.select().from(expenseCategoriesTable).where(and(
      eq(expenseCategoriesTable.id, Number(categoryId)),
      eq(expenseCategoriesTable.companyId, req.companyId!),
    )).limit(1);
    if (!cat) return res.status(403).json({ error: "categoryId bu firmaya ait değil" });
  }
  try {
    const [row] = await db.insert(budgetsTable).values({
      companyId: req.companyId!,
      period,
      scope: scope || "expense",
      categoryId: categoryId ? Number(categoryId) : null,
      label: label || null,
      budgetAmount: String(budgetAmount),
      note: note || null,
      createdBy: req.session.user!.id,
    }).onConflictDoUpdate({
      target: [budgetsTable.companyId, budgetsTable.period, budgetsTable.scope, budgetsTable.categoryId],
      set: { budgetAmount: String(budgetAmount), label: label || null, note: note || null, updatedAt: new Date() },
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "fail" });
  }
});

router.delete("/:id", requireWriter, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(budgetsTable).where(and(
    eq(budgetsTable.id, id), eq(budgetsTable.companyId, req.companyId!),
  ));
  res.json({ ok: true });
});

// ─── KARŞILAŞTIRMA — Plan vs Gerçekleşen ───
router.get("/comparison", async (req, res) => {
  const companyId = req.companyId!;
  const period = String(req.query.period || "");
  const range = periodToRange(period);
  if (!range) return res.status(400).json({ error: "period YYYY-MM" });
  const [from, to] = range;

  // Plan
  const planned = await db.select({
    id: budgetsTable.id,
    scope: budgetsTable.scope,
    categoryId: budgetsTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    label: budgetsTable.label,
    budgetAmount: budgetsTable.budgetAmount,
  }).from(budgetsTable)
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, budgetsTable.categoryId))
    .where(and(eq(budgetsTable.companyId, companyId), eq(budgetsTable.period, period)));

  // Gerçekleşen — gider kategorileri
  const actualExpense = await db.select({
    categoryId: expensesTable.categoryId,
    total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  }).from(expensesTable).where(and(
    eq(expensesTable.companyId, companyId),
    gte(expensesTable.expenseDate, from),
    lte(expensesTable.expenseDate, to),
  )).groupBy(expensesTable.categoryId);

  const actualMap = new Map<number | null, number>();
  for (const r of actualExpense) actualMap.set(r.categoryId, Number(r.total || 0));

  // Gerçekleşen — toplam ciro (revenue scope için)
  const [revAgg] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    eq(salesTable.returned, false),
    gte(salesTable.createdAt, from),
    lte(salesTable.createdAt, to),
  ));
  const totalRevenue = Number(revAgg?.revenue || 0);

  const lines = planned.map((p) => {
    const budget = Number(p.budgetAmount || 0);
    let actual = 0;
    if (p.scope === "revenue") actual = totalRevenue;
    else actual = actualMap.get(p.categoryId) || 0;
    const variance = actual - budget;
    const variancePct = budget > 0 ? (variance / budget) * 100 : 0;
    return {
      id: p.id, scope: p.scope, categoryId: p.categoryId,
      label: p.categoryName || p.label || (p.scope === "revenue" ? "Ciro" : "Diğer"),
      budget: r2(budget), actual: r2(actual),
      variance: r2(variance), variancePct: r2(variancePct),
      status: budget === 0 ? "no-plan" : variance > 0 ? (p.scope === "revenue" ? "over" : "over") : "under",
    };
  });

  // Bütçesiz ama harcama yapılan kategoriler — uyarı için
  const plannedCatIds = new Set(planned.filter((p) => p.scope === "expense").map((p) => p.categoryId));
  const orphanCats = actualExpense.filter((a) => !plannedCatIds.has(a.categoryId)).map((a) => ({
    categoryId: a.categoryId, actual: r2(Number(a.total || 0)),
  }));

  res.json({
    period,
    lines,
    orphanCats,
    totals: {
      budget: r2(lines.reduce((s, l) => s + (l.scope === "expense" ? l.budget : 0), 0)),
      actual: r2(lines.reduce((s, l) => s + (l.scope === "expense" ? l.actual : 0), 0)),
      revenueBudget: r2(lines.filter((l) => l.scope === "revenue").reduce((s, l) => s + l.budget, 0)),
      revenueActual: r2(totalRevenue),
    },
  });
});

// ─── CIRO TAHMİNİ — son N ay ortalama trend ───
router.get("/forecast/revenue", async (req, res) => {
  const companyId = req.companyId!;
  const basis = String(req.query.basis || "trend3"); // trend3 | trend6 | trend12
  const months = basis === "trend12" ? 12 : basis === "trend6" ? 6 : 3;
  const targetPeriod = String(req.query.period || nextPeriod(currentPeriod()));

  const buckets: { period: string; revenue: number }[] = [];
  for (let i = months; i >= 1; i--) {
    const p = shiftPeriod(targetPeriod, -i);
    const [from, to] = periodToRange(p)!;
    const [agg] = await db.select({
      v: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
    }).from(salesTable).where(and(
      eq(salesTable.companyId, companyId),
      eq(salesTable.returned, false),
      gte(salesTable.createdAt, from),
      lte(salesTable.createdAt, to),
    ));
    buckets.push({ period: p, revenue: Number(agg?.v || 0) });
  }
  // Ağırlıklı ortalama (yakın aylar daha ağır)
  let weighted = 0, weightSum = 0;
  buckets.forEach((b, i) => {
    const w = i + 1;
    weighted += b.revenue * w;
    weightSum += w;
  });
  const forecast = weightSum > 0 ? weighted / weightSum : 0;

  res.json({
    targetPeriod, basis, sampleMonths: months,
    history: buckets.map((b) => ({ ...b, revenue: r2(b.revenue) })),
    forecast: r2(forecast),
    avg: r2(buckets.reduce((s, b) => s + b.revenue, 0) / Math.max(1, buckets.length)),
  });
});

router.post("/forecast/revenue/save", requireWriter, async (req, res) => {
  const { period, basis, forecastAmount, meta } = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(String(period || ""))) return res.status(400).json({ error: "period YYYY-MM" });
  const [row] = await db.insert(revenueForecastsTable).values({
    companyId: req.companyId!,
    period, basis: basis || "trend3",
    forecastAmount: String(forecastAmount || 0),
    meta: meta ? JSON.stringify(meta) : null,
  }).onConflictDoUpdate({
    target: [revenueForecastsTable.companyId, revenueForecastsTable.period, revenueForecastsTable.basis],
    set: { forecastAmount: String(forecastAmount || 0), computedAt: new Date(), meta: meta ? JSON.stringify(meta) : null },
  }).returning();
  res.json(row);
});

// ─── NAKİT AKIŞI TAHMİNİ — sonraki 8 hafta ───
router.get("/forecast/cashflow", async (req, res) => {
  const companyId = req.companyId!;
  const weeks = Math.min(16, Math.max(2, Number(req.query.weeks ?? 8)));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // bu haftanın başı (Pazar)

  // Açık alacaklar (müşteriler bakiyesi pozitifse alacak)
  const [arAgg] = await db.select({
    open: sql<number>`COALESCE(SUM(GREATEST(${customersTable.currentBalance}, 0)), 0)`,
  }).from(customersTable).where(eq(customersTable.companyId, companyId));
  const ar = Number(arAgg?.open || 0);

  // Açık borçlar (tedarikçi bakiyesi pozitifse borç)
  const [apAgg] = await db.select({
    open: sql<number>`COALESCE(SUM(GREATEST(${suppliersTable.currentBalance}, 0)), 0)`,
  }).from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
  const ap = Number(apAgg?.open || 0);

  // Geçmiş 90 gün ortalaması — haftalık trend için
  const since = new Date(); since.setDate(since.getDate() - 90);
  const [sales90] = await db.select({
    s: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    eq(salesTable.returned, false),
    gte(salesTable.createdAt, since),
  ));
  const [exp90] = await db.select({
    e: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  }).from(expensesTable).where(and(
    eq(expensesTable.companyId, companyId),
    gte(expensesTable.expenseDate, since),
  ));
  const weeklySales = Number(sales90?.s || 0) / 13; // ~13 hafta
  const weeklyExp = Number(exp90?.e || 0) / 13;

  const buckets: any[] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(start); ws.setDate(ws.getDate() + w * 7);
    // İlk hafta açık alacak/borçların büyük kısmı toplanır varsayımı
    const weight = w === 0 ? 0.4 : w === 1 ? 0.25 : w === 2 ? 0.15 : (0.2 / Math.max(1, weeks - 3));
    const expectedIn = r2(weeklySales + ar * weight);
    const expectedOut = r2(weeklyExp + ap * weight);
    buckets.push({
      weekStart: ws.toISOString().slice(0, 10),
      expectedIn,
      expectedOut,
      net: r2(expectedIn - expectedOut),
    });
  }

  res.json({
    openAR: r2(ar),
    openAP: r2(ap),
    weeklyAvgIn: r2(weeklySales),
    weeklyAvgOut: r2(weeklyExp),
    weeks: buckets,
  });
});

function r2(n: number) { return Math.round(Number(n) * 100) / 100; }
function currentPeriod(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextPeriod(p: string) { return shiftPeriod(p, 1); }

export default router;
