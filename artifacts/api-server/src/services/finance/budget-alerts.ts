// ─────────────────────────────────────────────────────────────────────────────
// Sprint 65 — Bütçe Sapma Uyarı Motoru
// Bir bütçe dönemi (period: YYYY-MM) için plan vs gerçekleşen karşılaştırması
// yapar; sapma > eşik olan satırlar için yapılandırılmış alert döner.
//
// Eşik:
//   - "warning"  ≥ %20 sapma
//   - "critical" ≥ %50 sapma
//
// Türler:
//   - "expense_over_budget" : Gider planı aşıldı
//   - "revenue_under_budget": Ciro planı altında kalındı
//   - "orphan_expense"      : Bütçesi olmayan kategoriye harcama yapıldı
// ─────────────────────────────────────────────────────────────────────────────

import {
  db, budgetsTable, expenseCategoriesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  getRevenueTotal, getExpenseByCategory,
} from "./ledger.js";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertType = "expense_over_budget" | "revenue_under_budget" | "orphan_expense";

export interface BudgetAlert {
  type: AlertType;
  severity: AlertSeverity;
  period: string;
  categoryId: number | null;
  label: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
  message: string;
}

interface ComputeAlertsOpts {
  period: string;            // YYYY-MM
  warningPct?: number;       // default 20
  criticalPct?: number;      // default 50
}

function r2(n: number): number { return Math.round(Number(n || 0) * 100) / 100; }

function periodToRange(period: string): [Date, Date] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return [new Date(y, mo, 1, 0, 0, 0), new Date(y, mo + 1, 0, 23, 59, 59)];
}

function severityOf(absPct: number, warn: number, crit: number): AlertSeverity {
  if (absPct >= crit) return "critical";
  if (absPct >= warn) return "warning";
  return "info";
}

export async function computeBudgetAlerts(
  companyId: number,
  opts: ComputeAlertsOpts,
): Promise<BudgetAlert[]> {
  const range = periodToRange(opts.period);
  if (!range) return [];
  const [from, to] = range;
  const warn = opts.warningPct ?? 20;
  const crit = opts.criticalPct ?? 50;

  // Plan satırları
  const planned = await db.select({
    id: budgetsTable.id,
    scope: budgetsTable.scope,
    categoryId: budgetsTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    label: budgetsTable.label,
    budgetAmount: budgetsTable.budgetAmount,
  }).from(budgetsTable)
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, budgetsTable.categoryId))
    .where(and(eq(budgetsTable.companyId, companyId), eq(budgetsTable.period, opts.period)));

  // Gerçekleşen — kategori bazında gider + toplam ciro
  const actualExpense = await getExpenseByCategory(companyId, { from, to });
  const actualMap = new Map<number | null, number>();
  for (const r of actualExpense) actualMap.set(r.categoryId ?? null, Number(r.total || 0));
  const totalRevenue = await getRevenueTotal(companyId, { from, to });

  const alerts: BudgetAlert[] = [];

  for (const p of planned) {
    const budget = Number(p.budgetAmount || 0);
    if (budget <= 0) continue;

    if (p.scope === "expense") {
      const actual = actualMap.get(p.categoryId ?? null) || 0;
      const variance = actual - budget;
      const variancePct = (variance / budget) * 100;
      // Sadece "aşıldı" tarafına alarm — altında kalmak gider için iyi haberdir
      if (variancePct >= warn) {
        alerts.push({
          type: "expense_over_budget",
          severity: severityOf(variancePct, warn, crit),
          period: opts.period,
          categoryId: p.categoryId,
          label: p.categoryName || p.label || `Kategori #${p.categoryId ?? "?"}`,
          budget: r2(budget), actual: r2(actual),
          variance: r2(variance), variancePct: r2(variancePct),
          message: `${p.categoryName || p.label || "Gider"} bütçesi %${r2(variancePct)} aşıldı (${r2(actual)} / ${r2(budget)} TL).`,
        });
      }
    } else if (p.scope === "revenue") {
      const actual = totalRevenue;
      const variance = actual - budget;
      const variancePct = (variance / budget) * 100;
      // Ciro için "altında kalmak" kötü — negatif sapma alarm üretir
      if (variancePct <= -warn) {
        const absPct = Math.abs(variancePct);
        alerts.push({
          type: "revenue_under_budget",
          severity: severityOf(absPct, warn, crit),
          period: opts.period,
          categoryId: null,
          label: p.label || "Ciro hedefi",
          budget: r2(budget), actual: r2(actual),
          variance: r2(variance), variancePct: r2(variancePct),
          message: `Ciro hedefi %${r2(absPct)} altında (${r2(actual)} / ${r2(budget)} TL).`,
        });
      }
    }
  }

  // Bütçesiz ama harcama yapılan kategoriler — bilgilendirme alarmı
  const plannedExpenseCatIds = new Set(
    planned.filter((p) => p.scope === "expense").map((p) => p.categoryId ?? null),
  );
  // expense kategori sözlüğü
  const cats = await db.select({
    id: expenseCategoriesTable.id, name: expenseCategoriesTable.name,
  }).from(expenseCategoriesTable).where(eq(expenseCategoriesTable.companyId, companyId));
  const catNames = new Map<number, string>();
  cats.forEach((c) => catNames.set(c.id, c.name));

  for (const a of actualExpense) {
    const key = a.categoryId ?? null;
    if (plannedExpenseCatIds.has(key)) continue;
    const total = Number(a.total || 0);
    if (total <= 0) continue;
    const label = key == null ? "(Kategorisiz)" : (catNames.get(key) || `Kategori #${key}`);
    alerts.push({
      type: "orphan_expense",
      severity: total > 10000 ? "warning" : "info",
      period: opts.period,
      categoryId: key,
      label,
      budget: 0,
      actual: r2(total),
      variance: r2(total),
      variancePct: 100,
      message: `${label} kategorisinde ${r2(total)} TL harcama var fakat bütçe planlanmamış.`,
    });
  }

  // Önce kritik, sonra warning, sonra info; tutar büyükten küçüğe
  const sevRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.actual - a.actual);

  return alerts;
}
