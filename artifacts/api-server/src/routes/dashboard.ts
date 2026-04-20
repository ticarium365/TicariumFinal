import { Router, Request, Response } from "express";
import { db, productsTable, salesTable, productViewsTable } from "@workspace/db";
import { and, gte, lte, count, desc, sql, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalProductsResult,
      stockByCountResult,
      todaySalesResult,
      criticalCountResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(productsTable).where(eq(productsTable.companyId, cid)),
      db.select({ stock: productsTable.stock, count: count() })
        .from(productsTable)
        .where(and(eq(productsTable.companyId, cid), sql`${productsTable.stock} <= 3`))
        .groupBy(productsTable.stock),
      db.select().from(salesTable).where(
        and(
          eq(salesTable.companyId, cid),
          gte(salesTable.createdAt, today),
          lte(salesTable.createdAt, tomorrow)
        )
      ),
      db.select({ count: count() }).from(productsTable)
        .where(and(eq(productsTable.companyId, cid), sql`${productsTable.stock} <= ${productsTable.minStock}`)),
    ]);

    const stockMap: Record<number, number> = {};
    for (const r of stockByCountResult) {
      stockMap[r.stock] = r.count;
    }

    const todayGrossRevenue = todaySalesResult.reduce((s, item) => s + item.totalPrice, 0);
    const todayNetRevenue = todaySalesResult.reduce((s, item) => s + item.purchasePrice * item.quantity, 0);
    const todayProfit = todayGrossRevenue - todayNetRevenue;
    const todayProfitPercent = todayNetRevenue > 0 ? (todayProfit / todayNetRevenue) * 100 : 0;

    let todayWholesaleRevenue = 0, todayWholesaleCount = 0;
    let todayRetailRevenue = 0, todayRetailCount = 0;
    for (const s of todaySalesResult) {
      if (s.saleType === "wholesale") { todayWholesaleRevenue += s.totalPrice; todayWholesaleCount += 1; }
      else { todayRetailRevenue += s.totalPrice; todayRetailCount += 1; }
    }

    res.json({
      totalProducts: totalProductsResult[0]?.count ?? 0,
      outOfStock: stockMap[0] ?? 0,
      stock1: stockMap[1] ?? 0,
      stock2: stockMap[2] ?? 0,
      stock3: stockMap[3] ?? 0,
      todaySalesCount: todaySalesResult.length,
      todayGrossRevenue,
      todayNetRevenue,
      todayProfit,
      todayProfitPercent,
      todayWholesaleRevenue,
      todayWholesaleCount,
      todayRetailRevenue,
      todayRetailCount,
      criticalStockCount: criticalCountResult[0]?.count ?? 0,
    });
  } catch (err) {
    req.log?.error({ err }, "Dashboard stats error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/top-products", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topSellingRaw = await db
      .select({
        productId: salesTable.productId,
        total: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)`,
      })
      .from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, thirtyDaysAgo)))
      .groupBy(salesTable.productId)
      .orderBy(desc(sql`SUM(${salesTable.quantity})`))
      .limit(10);

    const topViewedRaw = await db
      .select({
        productId: productViewsTable.productId,
        cnt: count(),
      })
      .from(productViewsTable)
      .where(and(eq(productViewsTable.companyId, cid), gte(productViewsTable.viewedAt, thirtyDaysAgo)))
      .groupBy(productViewsTable.productId)
      .orderBy(desc(count()))
      .limit(10);

    const topSellingIds = topSellingRaw.map((r) => r.productId);
    const topViewedIds = topViewedRaw.map((r) => r.productId);
    const allIds = [...new Set([...topSellingIds, ...topViewedIds])];

    if (allIds.length === 0) {
      res.json({ topSelling: [], topViewed: [] });
      return;
    }

    const products = await db
      .select()
      .from(productsTable)
      .where(sql`${productsTable.id} = ANY(${sql.raw(`ARRAY[${allIds.join(",")}]::integer[]`)})`);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const saleMap = new Map(topSellingRaw.map((r) => [r.productId, Number(r.total)]));
    const viewMap = new Map(topViewedRaw.map((r) => [r.productId, r.cnt]));

    const topSelling = topSellingIds
      .map((id) => {
        const p = productMap.get(id);
        if (!p) return null;
        return { ...p, sales30Days: saleMap.get(id) ?? 0, views30Days: viewMap.get(id) ?? 0 };
      })
      .filter(Boolean);

    const topViewed = topViewedIds
      .map((id) => {
        const p = productMap.get(id);
        if (!p) return null;
        return { ...p, views30Days: viewMap.get(id) ?? 0, sales30Days: saleMap.get(id) ?? 0 };
      })
      .filter(Boolean);

    res.json({ topSelling, topViewed });
  } catch (err) {
    req.log?.error({ err }, "Top products error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/depleted — stoğu sıfırlanan ilk 10 ürün
// ---------------------------------------------------------------------------
router.get("/depleted", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        productCode: productsTable.productCode,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
        salePrice: productsTable.salePrice,
      })
      .from(productsTable)
      .where(and(
        eq(productsTable.companyId, cid),
        eq(productsTable.isActive, true),
        eq(productsTable.stock, 0),
      ))
      .orderBy(desc(productsTable.id))
      .limit(10);
    res.json(products);
  } catch (err) {
    req.log?.error({ err }, "Depleted products error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/depleting — tükenmeye yakın ilk 10 ürün (0 < stock <= minStock)
// ---------------------------------------------------------------------------
router.get("/depleting", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        productCode: productsTable.productCode,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
        salePrice: productsTable.salePrice,
      })
      .from(productsTable)
      .where(and(
        eq(productsTable.companyId, cid),
        eq(productsTable.isActive, true),
        sql`${productsTable.stock} > 0`,
        sql`${productsTable.stock} <= ${productsTable.minStock}`,
      ))
      .orderBy(productsTable.stock)
      .limit(10);
    res.json(products);
  } catch (err) {
    req.log?.error({ err }, "Depleting products error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/cost-warnings — kâr marjı düşük / negatif ilk 10 ürün
// salePrice <= purchasePrice * 1.05 (yani kâr marjı %5 altında veya zarar)
// ---------------------------------------------------------------------------
router.get("/cost-warnings", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        productCode: productsTable.productCode,
        stock: productsTable.stock,
        purchasePrice: productsTable.purchasePrice,
        salePrice: productsTable.salePrice,
      })
      .from(productsTable)
      .where(and(
        eq(productsTable.companyId, cid),
        eq(productsTable.isActive, true),
        sql`${productsTable.purchasePrice} > 0`,
        sql`${productsTable.salePrice} <= ${productsTable.purchasePrice} * 1.05`,
      ))
      .orderBy(sql`(${productsTable.salePrice} - ${productsTable.purchasePrice})`)
      .limit(10);

    const result = products.map((p) => {
      const margin = p.salePrice - p.purchasePrice;
      const marginPct = p.purchasePrice > 0 ? (margin / p.purchasePrice) * 100 : 0;
      return { ...p, margin, marginPct };
    });

    res.json(result);
  } catch (err) {
    req.log?.error({ err }, "Cost warnings error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/critical-stock", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db
      .select()
      .from(productsTable)
      .where(and(
        eq(productsTable.companyId, cid),
        sql`${productsTable.stock} <= ${productsTable.minStock}`
      ))
      .orderBy(productsTable.stock)
      .limit(50);

    const result = products.map((p) => ({
      ...p,
      views30Days: 0,
      sales30Days: 0,
    }));

    res.json(result);
  } catch (err) {
    req.log?.error({ err }, "Critical stock error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/morning-brief
// Dünkü özet + bugünün ilk saati + kritik stok + top ürünler + hava notları
// ---------------------------------------------------------------------------
router.get("/morning-brief", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [yesterdaySales, weekSales, criticalProducts] = await Promise.all([
      db.select()
        .from(salesTable)
        .where(and(
          eq(salesTable.companyId, cid),
          gte(salesTable.createdAt, yesterdayStart),
          lte(salesTable.createdAt, yesterdayEnd),
        )),
      db.select()
        .from(salesTable)
        .where(and(
          eq(salesTable.companyId, cid),
          gte(salesTable.createdAt, weekStart),
        )),
      db.select({
        id: productsTable.id,
        name: productsTable.name,
        productCode: productsTable.productCode,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
      })
        .from(productsTable)
        .where(and(
          eq(productsTable.companyId, cid),
          eq(productsTable.isActive, true),
          sql`${productsTable.stock} <= ${productsTable.minStock}`,
        ))
        .orderBy(productsTable.stock)
        .limit(10),
    ]);

    const yesterdayRevenue = yesterdaySales.reduce((s, x) => s + x.totalPrice, 0);
    const yesterdayProfit = yesterdaySales.reduce((s, x) => s + x.profit, 0);

    const weekRevenue = weekSales.reduce((s, x) => s + x.totalPrice, 0);
    const weekProfit = weekSales.reduce((s, x) => s + x.profit, 0);

    // Dün ile bir önceki haftanın aynı günü kıyasla
    const prevDayStart = new Date(yesterdayStart);
    prevDayStart.setDate(prevDayStart.getDate() - 7);
    const prevDayEnd = new Date(prevDayStart);
    prevDayEnd.setDate(prevDayEnd.getDate() + 1);

    const prevDaySales = await db.select()
      .from(salesTable)
      .where(and(
        eq(salesTable.companyId, cid),
        gte(salesTable.createdAt, prevDayStart),
        lte(salesTable.createdAt, prevDayEnd),
      ));

    const prevDayRevenue = prevDaySales.reduce((s, x) => s + x.totalPrice, 0);
    const revenueTrend = prevDayRevenue > 0
      ? ((yesterdayRevenue - prevDayRevenue) / prevDayRevenue) * 100
      : null;

    const zeroStock = criticalProducts.filter((p) => p.stock === 0).length;
    const lowStock = criticalProducts.filter((p) => p.stock > 0).length;

    const hour = now.getHours();
    const greeting = hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

    res.json({
      greeting,
      date: now.toISOString().split("T")[0],
      yesterday: {
        salesCount: yesterdaySales.length,
        revenue: yesterdayRevenue,
        profit: yesterdayProfit,
        revenueTrend,
      },
      week: {
        salesCount: weekSales.length,
        revenue: weekRevenue,
        profit: weekProfit,
      },
      stock: {
        zeroStock,
        lowStock,
        criticalProducts: criticalProducts.slice(0, 5),
      },
    });
  } catch (err) {
    req.log?.error({ err }, "Morning brief error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

export default router;
