// ─────────────────────────────────────────────────────────────────────────────
// Sprint 65 — Tahmin Motoru (Forecast Engine)
// Canonical finance ledger üzerine kurulu; tüm tahminler tek doğruluk kaynağı
// olan ledger'dan beslenir.
//
// Üç ana fonksiyon:
//   - forecastRevenue        : Gelecek dönem ciro tahmini (weighted avg + trend slope)
//   - forecastExpenseByCategory : Kategori bazında 6 ay gider öngörüsü
//   - forecastCashflow       : 8 hafta nakit akışı projeksiyonu (AR/AP + trend)
//
// Tüm fonksiyonlar deterministik & test edilebilir (DB IO ledger.ts'e delege).
// ─────────────────────────────────────────────────────────────────────────────

import { db, customersTable, suppliersTable, expenseCategoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  getRevenueTotal, getExpenseTotal, getExpenseByCategory,
} from "./ledger.js";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function r2(n: number): number { return Math.round(Number(n || 0) * 100) / 100; }

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

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Basit lineer regresyon — y = a + b·x; b (slope) ay başına eğilim. */
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ─── 1) Ciro Tahmini ─────────────────────────────────────────────────────────

export type RevenueBasis = "trend3" | "trend6" | "trend12";

export interface RevenueForecastResult {
  targetPeriod: string;
  basis: RevenueBasis;
  sampleMonths: number;
  history: { period: string; revenue: number }[];
  /** Yakın aylar daha ağır — ana tahmin değeri. */
  forecast: number;
  /** Düz aritmetik ortalama (referans). */
  avg: number;
  /** Aylık trend eğimi (+ büyüme / − daralma). */
  trendSlope: number;
  /** Trend dahil edilmiş tahmin (forecast + slope·1). */
  forecastWithTrend: number;
}

export async function forecastRevenue(
  companyId: number,
  opts: { basis?: RevenueBasis; period?: string } = {},
): Promise<RevenueForecastResult> {
  const basis: RevenueBasis = opts.basis || "trend3";
  const months = basis === "trend12" ? 12 : basis === "trend6" ? 6 : 3;
  const targetPeriod = opts.period || shiftPeriod(currentPeriod(), 1);

  const buckets: { period: string; revenue: number }[] = [];
  for (let i = months; i >= 1; i--) {
    const p = shiftPeriod(targetPeriod, -i);
    const range = periodToRange(p)!;
    const rev = await getRevenueTotal(companyId, { from: range[0], to: range[1] });
    buckets.push({ period: p, revenue: rev });
  }

  // Ağırlıklı ortalama (w = 1..months, en yakın ay en ağır)
  let weighted = 0, weightSum = 0;
  buckets.forEach((b, i) => {
    const w = i + 1;
    weighted += b.revenue * w;
    weightSum += w;
  });
  const forecast = weightSum > 0 ? weighted / weightSum : 0;
  const avg = buckets.reduce((s, b) => s + b.revenue, 0) / Math.max(1, buckets.length);
  const slope = linearSlope(buckets.map((b) => b.revenue));

  return {
    targetPeriod, basis, sampleMonths: months,
    history: buckets.map((b) => ({ ...b, revenue: r2(b.revenue) })),
    forecast: r2(forecast),
    avg: r2(avg),
    trendSlope: r2(slope),
    forecastWithTrend: r2(forecast + slope),
  };
}

// ─── 2) Kategori Bazında Gider Tahmini (YENİ) ────────────────────────────────

export interface CategoryExpenseForecast {
  categoryId: number | null;
  categoryName: string;
  history: { period: string; total: number }[];
  forecast: number;        // Ağırlıklı ortalama
  trendSlope: number;      // Aylık eğim
  forecastWithTrend: number;
}

export interface ExpenseForecastResult {
  targetPeriod: string;
  sampleMonths: number;
  categories: CategoryExpenseForecast[];
  /** Kategorisiz (categoryId NULL) toplam, ayrı kayıt olarak categories içinde gelir. */
  totalForecast: number;
}

export async function forecastExpenseByCategory(
  companyId: number,
  opts: { months?: number; period?: string } = {},
): Promise<ExpenseForecastResult> {
  const months = Math.min(12, Math.max(2, opts.months ?? 6));
  const targetPeriod = opts.period || shiftPeriod(currentPeriod(), 1);

  // Kategori isim sözlüğü — tek seferlik
  const cats = await db.select({
    id: expenseCategoriesTable.id, name: expenseCategoriesTable.name,
  }).from(expenseCategoriesTable).where(eq(expenseCategoriesTable.companyId, companyId));
  const catName = new Map<number, string>();
  cats.forEach((c) => catName.set(c.id, c.name));

  // Kategori bazında zaman serisi: months × kategori → period:total
  // Her ay için getExpenseByCategory çağırıyoruz (5 kaynak yerine ledger normalize).
  type Series = Map<number | null, number[]>; // categoryId → [ay sırasıyla totals]
  const series: Series = new Map();
  const periods: string[] = [];

  for (let i = months; i >= 1; i--) {
    const p = shiftPeriod(targetPeriod, -i);
    periods.push(p);
    const range = periodToRange(p)!;
    const buckets = await getExpenseByCategory(companyId, { from: range[0], to: range[1] });
    const seen = new Set<number | null>();
    for (const b of buckets) {
      const key = b.categoryId ?? null;
      seen.add(key);
      const arr = series.get(key) || [];
      arr.push(Number(b.total || 0));
      series.set(key, arr);
    }
    // Bu ayda görülmemiş kategorilere 0 koy ki dizi uzunlukları eşit kalsın
    for (const [key, arr] of series.entries()) {
      if (!seen.has(key)) arr.push(0);
    }
  }

  // Sonuçları hesapla
  const out: CategoryExpenseForecast[] = [];
  for (const [catId, history] of series.entries()) {
    // Geriye dönük doldurma: dizi `months` uzunluğunda olmalı
    while (history.length < months) history.unshift(0);

    let weighted = 0, weightSum = 0;
    history.forEach((v, i) => {
      const w = i + 1;
      weighted += v * w;
      weightSum += w;
    });
    const forecast = weightSum > 0 ? weighted / weightSum : 0;
    const slope = linearSlope(history);

    out.push({
      categoryId: catId,
      categoryName: catId == null ? "(Kategorisiz)" : (catName.get(catId) || `#${catId}`),
      history: periods.map((p, i) => ({ period: p, total: r2(history[i] || 0) })),
      forecast: r2(forecast),
      trendSlope: r2(slope),
      forecastWithTrend: r2(Math.max(0, forecast + slope)),
    });
  }

  out.sort((a, b) => b.forecast - a.forecast);

  return {
    targetPeriod, sampleMonths: months,
    categories: out,
    totalForecast: r2(out.reduce((s, c) => s + c.forecast, 0)),
  };
}

// ─── 3) Nakit Akışı Tahmini (8 hafta) ────────────────────────────────────────

export interface CashflowWeek {
  weekStart: string;       // YYYY-MM-DD
  expectedIn: number;
  expectedOut: number;
  net: number;
}

export interface CashflowForecastResult {
  openAR: number;
  openAP: number;
  weeklyAvgIn: number;
  weeklyAvgOut: number;
  weeks: CashflowWeek[];
}

export async function forecastCashflow(
  companyId: number,
  opts: { weeks?: number } = {},
): Promise<CashflowForecastResult> {
  const weeks = Math.min(16, Math.max(2, opts.weeks ?? 8));

  // Bu haftanın başı (Pazar 00:00)
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  // Açık alacaklar (müşteri bakiyesi pozitif → bize borçlu)
  const [arAgg] = await db.select({
    open: sql<number>`COALESCE(SUM(GREATEST(${customersTable.currentBalance}, 0)), 0)`,
  }).from(customersTable).where(eq(customersTable.companyId, companyId));
  const ar = Number(arAgg?.open || 0);

  // Açık borçlar (tedarikçi bakiyesi pozitif → onlara borçluyuz)
  const [apAgg] = await db.select({
    open: sql<number>`COALESCE(SUM(GREATEST(${suppliersTable.currentBalance}, 0)), 0)`,
  }).from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
  const ap = Number(apAgg?.open || 0);

  // Geçmiş 90 gün haftalık ortalama (ledger üzerinden)
  const since = new Date(); since.setDate(since.getDate() - 90);
  const now = new Date();
  const sales90 = await getRevenueTotal(companyId, { from: since, to: now });
  const exp90 = await getExpenseTotal(companyId, { from: since, to: now });
  const weeklySales = sales90 / 13;
  const weeklyExp = exp90 / 13;

  // Açık AR/AP'nin haftalara dağılım ağırlığı: ilk 3 hafta yoğun, kalan kısım eşit
  const buckets: CashflowWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(start); ws.setDate(ws.getDate() + w * 7);
    const weight =
      w === 0 ? 0.40 :
      w === 1 ? 0.25 :
      w === 2 ? 0.15 :
      (0.20 / Math.max(1, weeks - 3));
    const expectedIn = r2(weeklySales + ar * weight);
    const expectedOut = r2(weeklyExp + ap * weight);
    buckets.push({
      weekStart: ws.toISOString().slice(0, 10),
      expectedIn, expectedOut,
      net: r2(expectedIn - expectedOut),
    });
  }

  return {
    openAR: r2(ar),
    openAP: r2(ap),
    weeklyAvgIn: r2(weeklySales),
    weeklyAvgOut: r2(weeklyExp),
    weeks: buckets,
  };
}
