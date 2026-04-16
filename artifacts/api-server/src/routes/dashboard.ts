import { Router, Request, Response } from "express";
import { db, productsTable, salesTable, productViewsTable } from "@workspace/db";
import { and, gte, lte, count, desc, sql, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

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

export default router;
