import {
  db, productsTable, salesTable, holdingCostRulesTable,
  expenseAllocationsTable, productProfitSnapshotsTable,
  inventoryTurnoverMetricsTable, companiesTable,
} from "@workspace/db";
import { and, eq, gte, sql, desc } from "drizzle-orm";

export interface EffectiveCostInput {
  purchasePrice: number;
  daysOnShelf: number;
  dailyHoldingCost: number;
  capitalCostAnnualPct: number;
}

export function computeDailyHoldingCost(rules: {
  monthlyRent: number;
  monthlyStaff: number;
  monthlyElectric: number;
  monthlyOther: number;
  totalShelfM2: number;
  productM2: number;
  spoilageRiskPct: number;
  purchasePrice: number;
}): number {
  const monthlyTotal = rules.monthlyRent + rules.monthlyStaff +
    rules.monthlyElectric + rules.monthlyOther;
  const m2Share = rules.totalShelfM2 > 0 ? rules.productM2 / rules.totalShelfM2 : 0;
  const monthlyShare = monthlyTotal * m2Share;
  const dailyShare = monthlyShare / 30;
  // Bozulma riski: yıllık % * alış / 365
  const dailySpoilage = (rules.purchasePrice * rules.spoilageRiskPct / 100) / 365;
  return dailyShare + dailySpoilage;
}

export function computeEffectiveCost(input: EffectiveCostInput): {
  totalHolding: number;
  totalCapital: number;
  effective: number;
} {
  const totalHolding = input.dailyHoldingCost * input.daysOnShelf;
  const dailyCapital = (input.purchasePrice * input.capitalCostAnnualPct / 100) / 365;
  const totalCapital = dailyCapital * input.daysOnShelf;
  return {
    totalHolding,
    totalCapital,
    effective: input.purchasePrice + totalHolding + totalCapital,
  };
}

export function computeBreakEvenDay(
  salePrice: number,
  purchasePrice: number,
  dailyHoldingCost: number,
  dailyCapitalCost: number,
  expenseAllocation: number,
): number | null {
  const grossProfit = salePrice - purchasePrice - expenseAllocation;
  if (grossProfit <= 0) return 0;
  const dailyErosion = dailyHoldingCost + dailyCapitalCost;
  if (dailyErosion <= 0) return null;
  return Math.floor(grossProfit / dailyErosion);
}

export function classifyStatus(args: {
  trueProfit: number;
  trueMarginPct: number;
  daysOnShelf: number;
  turnoverDays: number | null;
}): "ok" | "low_margin" | "losing" | "stagnant" | "star" {
  if (args.trueProfit < 0) return "losing";
  if (args.daysOnShelf > 90 && (args.turnoverDays === null || args.turnoverDays > 90)) return "stagnant";
  if (args.trueMarginPct < 5) return "low_margin";
  if (args.trueMarginPct > 25 && args.turnoverDays !== null && args.turnoverDays < 14) return "star";
  return "ok";
}

/**
 * Bir şirket için tüm aktif ürünlerin gerçek kâr snapshot'ını yenile.
 * Cron tarafından günde 1 çağrılır.
 */
export async function recomputeCompanySnapshots(companyId: number): Promise<{ updated: number }> {
  const [rules] = await db.select().from(holdingCostRulesTable)
    .where(eq(holdingCostRulesTable.companyId, companyId));

  const products = await db.select().from(productsTable)
    .where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive, true)));

  if (products.length === 0) return { updated: 0 };

  // Aylık gider havuzu (revenue tabanlı dağıtım için)
  const allocs = await db.select().from(expenseAllocationsTable)
    .where(and(
      eq(expenseAllocationsTable.companyId, companyId),
      eq(expenseAllocationsTable.isActive, true),
    ));

  // Son 30 gün satış verisi (devir hızı + revenue dağıtım için)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const salesAgg = await db.select({
    productId: salesTable.productId,
    qty: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)::int`,
    revenue: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)::float`,
  }).from(salesTable)
    .where(and(eq(salesTable.companyId, companyId), gte(salesTable.createdAt, since)))
    .groupBy(salesTable.productId);

  const salesByProduct = new Map<number, { qty: number; revenue: number }>();
  let totalRevenue = 0; let totalQty = 0;
  for (const s of salesAgg) {
    if (s.productId == null) continue;
    salesByProduct.set(s.productId, { qty: s.qty, revenue: s.revenue });
    totalRevenue += s.revenue;
    totalQty += s.qty;
  }

  const totalAllocAmount = allocs.reduce((a, x) => a + x.amount, 0);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const inserts: any[] = [];
  for (const p of products) {
    const stockInAt = p.lastStockInAt ?? p.createdAt;
    const daysOnShelf = Math.max(0, Math.floor((today.getTime() - stockInAt.getTime()) / (24 * 60 * 60 * 1000)));

    let dailyHoldingCost = 0;
    if (rules?.isEnabled) {
      const productM2 = p.shelfM2 ?? rules.defaultM2PerProduct;
      dailyHoldingCost = computeDailyHoldingCost({
        monthlyRent: rules.monthlyRent,
        monthlyStaff: rules.monthlyStaff,
        monthlyElectric: rules.monthlyElectric,
        monthlyOther: rules.monthlyOther,
        totalShelfM2: rules.totalShelfM2,
        productM2,
        spoilageRiskPct: rules.spoilageRiskPct,
        purchasePrice: p.purchasePrice,
      });
    }

    const capitalPct = rules?.capitalCostAnnualPct ?? 0;
    const dailyCapitalCost = (p.purchasePrice * capitalPct / 100) / 365;

    const ec = computeEffectiveCost({
      purchasePrice: p.purchasePrice,
      daysOnShelf,
      dailyHoldingCost,
      capitalCostAnnualPct: capitalPct,
    });

    // Gider dağıtımı: her aktif gider kuralı için allocMethod'una göre pay hesapla
    const ps = salesByProduct.get(p.id) ?? { qty: 0, revenue: 0 };
    let expenseAllocation = 0;
    for (const a of allocs) {
      let share = 0;
      const method = a.allocMethod ?? "revenue";
      if (method === "manual") {
        if (a.manualPct != null) share = a.manualPct / 100 / Math.max(products.length, 1);
      } else if (method === "category") {
        if (a.categoryFilter && p.category === a.categoryFilter) {
          const catCount = products.filter(x => x.category === a.categoryFilter).length;
          if (catCount > 0) share = 1 / catCount;
        }
      } else if (method === "m2") {
        const productM2 = p.shelfM2 ?? rules?.defaultM2PerProduct ?? 0;
        const totalM2 = products.reduce((s, x) => s + (x.shelfM2 ?? rules?.defaultM2PerProduct ?? 0), 0);
        if (totalM2 > 0) share = productM2 / totalM2;
      } else if (method === "qty") {
        if (totalQty > 0 && ps.qty > 0) share = ps.qty / totalQty;
      } else { // revenue
        if (totalRevenue > 0 && ps.revenue > 0) share = ps.revenue / totalRevenue;
        else if (totalQty > 0 && ps.qty > 0) share = ps.qty / totalQty;
      }
      const ruleAlloc = a.amount * share;
      // birim başına: satılan adede böl (yoksa stok), yoksa 0
      const denom = ps.qty > 0 ? ps.qty : (p.stock > 0 ? p.stock : 0);
      if (denom > 0) expenseAllocation += ruleAlloc / denom;
    }

    const grossProfit = p.salePrice - p.purchasePrice;
    const trueProfit = p.salePrice - ec.effective - expenseAllocation;
    const trueMarginPct = p.salePrice > 0 ? (trueProfit / p.salePrice) * 100 : 0;
    const turnoverDays = ps.qty > 0 ? (30 * Math.max(p.stock, 1)) / ps.qty : null;
    const breakEvenDay = computeBreakEvenDay(
      p.salePrice, p.purchasePrice, dailyHoldingCost, dailyCapitalCost, expenseAllocation
    );
    const status = classifyStatus({ trueProfit, trueMarginPct, daysOnShelf, turnoverDays });

    inserts.push({
      companyId, productId: p.id, snapshotDate: todayStr,
      purchasePrice: p.purchasePrice, salePrice: p.salePrice, stockQty: p.stock,
      daysOnShelf,
      dailyHoldingCost, dailyCapitalCost,
      totalHoldingCost: ec.totalHolding, totalCapitalCost: ec.totalCapital,
      expenseAllocation,
      effectiveCost: ec.effective,
      grossProfit, trueProfit, trueMarginPct,
      breakEvenDay, turnoverDays, status,
    });
  }

  if (inserts.length > 0) {
    // Idempotent upsert (unique idx: company+product+date)
    const chunks = [];
    for (let i = 0; i < inserts.length; i += 500) chunks.push(inserts.slice(i, i + 500));
    for (const c of chunks) {
      await db.insert(productProfitSnapshotsTable).values(c)
        .onConflictDoUpdate({
          target: [
            productProfitSnapshotsTable.companyId,
            productProfitSnapshotsTable.productId,
            productProfitSnapshotsTable.snapshotDate,
          ],
          set: {
            purchasePrice: sql`excluded.purchase_price`,
            salePrice: sql`excluded.sale_price`,
            stockQty: sql`excluded.stock_qty`,
            daysOnShelf: sql`excluded.days_on_shelf`,
            dailyHoldingCost: sql`excluded.daily_holding_cost`,
            dailyCapitalCost: sql`excluded.daily_capital_cost`,
            totalHoldingCost: sql`excluded.total_holding_cost`,
            totalCapitalCost: sql`excluded.total_capital_cost`,
            expenseAllocation: sql`excluded.expense_allocation`,
            effectiveCost: sql`excluded.effective_cost`,
            grossProfit: sql`excluded.gross_profit`,
            trueProfit: sql`excluded.true_profit`,
            trueMarginPct: sql`excluded.true_margin_pct`,
            breakEvenDay: sql`excluded.break_even_day`,
            turnoverDays: sql`excluded.turnover_days`,
            status: sql`excluded.status`,
          },
        });
    }
  }

  return { updated: inserts.length };
}

/**
 * Tüm aktif şirketler için snapshot yenile.
 */
export async function recomputeAllSnapshots(): Promise<{ companies: number; products: number }> {
  const companies = await db.select({ id: companiesTable.id }).from(companiesTable);
  let totalProducts = 0;
  for (const c of companies) {
    try {
      const r = await recomputeCompanySnapshots(c.id);
      totalProducts += r.updated;
    } catch (e) {
      console.error(`[profit-cron] company ${c.id} failed:`, e);
    }
  }
  return { companies: companies.length, products: totalProducts };
}

let cronStarted = false;
const ONE_DAY = 24 * 60 * 60 * 1000;

export function startProfitCron() {
  if (cronStarted) return;
  cronStarted = true;
  // İlk çalışma: 1 dakika sonra (server warm-up için)
  setTimeout(async () => {
    try {
      const r = await recomputeAllSnapshots();
      console.log(`[profit-cron] initial run: ${r.companies} companies, ${r.products} products`);
    } catch (e) { console.error("[profit-cron] initial failed:", e); }
  }, 60_000);
  // Sonra: her 24 saatte bir
  setInterval(async () => {
    try {
      const r = await recomputeAllSnapshots();
      console.log(`[profit-cron] daily run: ${r.companies} companies, ${r.products} products`);
    } catch (e) { console.error("[profit-cron] daily failed:", e); }
  }, ONE_DAY);
}

/**
 * Bir ürün için CANLI etkin maliyet hesapla (snapshot beklemeden).
 * UI'da ürün listesi/detayında göstermek için.
 */
export async function liveEffectiveCost(companyId: number, productId: number) {
  const [p] = await db.select().from(productsTable)
    .where(and(eq(productsTable.companyId, companyId), eq(productsTable.id, productId)));
  if (!p) return null;
  const [rules] = await db.select().from(holdingCostRulesTable)
    .where(eq(holdingCostRulesTable.companyId, companyId));
  const stockInAt = p.lastStockInAt ?? p.createdAt;
  const daysOnShelf = Math.max(0, Math.floor((Date.now() - stockInAt.getTime()) / ONE_DAY));
  let dailyHoldingCost = 0;
  if (rules?.isEnabled) {
    dailyHoldingCost = computeDailyHoldingCost({
      monthlyRent: rules.monthlyRent, monthlyStaff: rules.monthlyStaff,
      monthlyElectric: rules.monthlyElectric, monthlyOther: rules.monthlyOther,
      totalShelfM2: rules.totalShelfM2,
      productM2: p.shelfM2 ?? rules.defaultM2PerProduct,
      spoilageRiskPct: rules.spoilageRiskPct,
      purchasePrice: p.purchasePrice,
    });
  }
  const capitalPct = rules?.capitalCostAnnualPct ?? 0;
  const ec = computeEffectiveCost({
    purchasePrice: p.purchasePrice, daysOnShelf,
    dailyHoldingCost, capitalCostAnnualPct: capitalPct,
  });
  return {
    productId: p.id,
    purchasePrice: p.purchasePrice,
    daysOnShelf,
    dailyHoldingCost,
    dailyCapitalCost: (p.purchasePrice * capitalPct / 100) / 365,
    effectiveCost: ec.effective,
    extraCostSinceArrival: ec.totalHolding + ec.totalCapital,
    salePrice: p.salePrice,
    effectiveMargin: p.salePrice - ec.effective,
    effectiveMarginPct: p.salePrice > 0 ? ((p.salePrice - ec.effective) / p.salePrice) * 100 : 0,
  };
}
