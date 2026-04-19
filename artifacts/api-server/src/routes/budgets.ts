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
// Sprint 65 — canonical finance ledger + forecast engine + budget alerts
import {
  getRevenueTotal, getExpenseByCategory,
} from "../services/finance/ledger.js";
import {
  forecastRevenue, forecastExpenseByCategory, forecastCashflow,
} from "../services/finance/forecast.js";
import { computeBudgetAlerts } from "../services/finance/budget-alerts.js";
import { dispatchBudgetAlerts } from "../services/notifications/dispatch.js";

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

  // Gerçekleşen — gider kategorileri (canonical ledger)
  const actualExpense = (await getExpenseByCategory(companyId, { from, to }))
    .map(r => ({ categoryId: r.categoryId, total: r.total }));

  const actualMap = new Map<number | null, number>();
  for (const r of actualExpense) actualMap.set(r.categoryId, Number(r.total || 0));

  // Gerçekleşen — toplam ciro (canonical ledger)
  const totalRevenue = await getRevenueTotal(companyId, { from, to });

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
  const orphanCats = actualExpense
    .filter((a) => !plannedCatIds.has(a.categoryId ?? null))
    .map((a) => ({ categoryId: a.categoryId, actual: r2(Number(a.total || 0)) }));

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

// ─── CIRO TAHMİNİ — son N ay ortalama trend (forecast engine) ───
router.get("/forecast/revenue", async (req, res) => {
  const companyId = req.companyId!;
  const basisRaw = String(req.query.basis || "trend3");
  const basis = (basisRaw === "trend12" ? "trend12" : basisRaw === "trend6" ? "trend6" : "trend3") as "trend3" | "trend6" | "trend12";
  const period = req.query.period ? String(req.query.period) : undefined;
  if (period !== undefined && !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period YYYY-MM olmalı" });
  }
  const result = await forecastRevenue(companyId, { basis, period });
  res.json(result);
});

// ─── KATEGORİ BAZINDA GİDER TAHMİNİ — yeni ───
router.get("/forecast/expenses", async (req, res) => {
  const companyId = req.companyId!;
  const months = req.query.months ? Math.min(12, Math.max(2, Number(req.query.months))) : 6;
  const period = req.query.period ? String(req.query.period) : undefined;
  if (period !== undefined && !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period YYYY-MM olmalı" });
  }
  const result = await forecastExpenseByCategory(companyId, { months, period });
  res.json(result);
});

// ─── BÜTÇE SAPMA UYARILARI — yeni ───
router.get("/alerts", async (req, res) => {
  const companyId = req.companyId!;
  const period = String(req.query.period || currentPeriod());
  if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: "period YYYY-MM" });
  const warningPct = req.query.warningPct ? Number(req.query.warningPct) : 20;
  const criticalPct = req.query.criticalPct ? Number(req.query.criticalPct) : 50;
  if (!Number.isFinite(warningPct) || warningPct <= 0) {
    return res.status(400).json({ error: "warningPct > 0 olmalı" });
  }
  if (!Number.isFinite(criticalPct) || criticalPct < warningPct) {
    return res.status(400).json({ error: "criticalPct >= warningPct olmalı" });
  }
  const alerts = await computeBudgetAlerts(companyId, { period, warningPct, criticalPct });
  res.json({
    period,
    counts: {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
    },
    alerts,
  });
});

// ─── Sprint B — Bütçe alarmlarını in-app bildirime dağıt ───
router.post("/alerts/dispatch", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const period = String(req.body?.period || req.query?.period || currentPeriod());
  if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: "period YYYY-MM" });
  const warningPct = req.body?.warningPct ? Number(req.body.warningPct) : 20;
  const criticalPct = req.body?.criticalPct ? Number(req.body.criticalPct) : 50;
  if (!Number.isFinite(warningPct) || warningPct <= 0) return res.status(400).json({ error: "warningPct > 0 olmalı" });
  if (!Number.isFinite(criticalPct) || criticalPct < warningPct) return res.status(400).json({ error: "criticalPct >= warningPct olmalı" });
  const alerts = await computeBudgetAlerts(companyId, { period, warningPct, criticalPct });
  const result = await dispatchBudgetAlerts(companyId, alerts);
  res.json({ period, ...result });
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

// ─── NAKİT AKIŞI TAHMİNİ — sonraki 8 hafta (forecast engine) ───
router.get("/forecast/cashflow", async (req, res) => {
  const companyId = req.companyId!;
  const weeks = req.query.weeks ? Number(req.query.weeks) : 8;
  const result = await forecastCashflow(companyId, { weeks });
  res.json(result);
});

function r2(n: number) { return Math.round(Number(n) * 100) / 100; }
function currentPeriod(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextPeriod(p: string) { return shiftPeriod(p, 1); }

export default router;
