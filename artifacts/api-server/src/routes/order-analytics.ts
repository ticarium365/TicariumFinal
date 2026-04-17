import { Router, type Request, type Response } from "express";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// ─── GET /orders/analytics ────────────────────────────────────────────────────
router.get("/orders/analytics", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const { period = "month" } = req.query as { period?: string };
  const today = new Date().toISOString().slice(0, 10);
  let startDate: string;
  if (period === "week") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().slice(0, 10);
  } else if (period === "year") {
    startDate = today.slice(0, 4) + "-01-01";
  } else {
    startDate = today.slice(0, 7) + "-01";
  }
  try {
    const [totals] = await db.select({
      totalOrders: sql<number>`count(*)::int`,
      pendingOrders: sql<number>`count(*) filter (where status = 'pending')::int`,
      confirmedOrders: sql<number>`count(*) filter (where status = 'confirmed')::int`,
      deliveredOrders: sql<number>`count(*) filter (where status = 'delivered')::int`,
      cancelledOrders: sql<number>`count(*) filter (where status = 'cancelled')::int`,
    }).from(ordersTable)
      .where(and(eq(ordersTable.companyId, cid), gte(ordersTable.createdAt, new Date(startDate))));

    const bySource = await db.select({
      source: ordersTable.source,
      count: sql<number>`count(*)::int`,
    }).from(ordersTable)
      .where(and(eq(ordersTable.companyId, cid), gte(ordersTable.createdAt, new Date(startDate))))
      .groupBy(ordersTable.source);

    const topProducts = await db.select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      totalQty: sql<number>`sum(quantity)::int`,
      orderCount: sql<number>`count(distinct order_id)::int`,
    }).from(orderItemsTable)
      .innerJoin(ordersTable, and(
        eq(orderItemsTable.orderId, ordersTable.id),
        eq(ordersTable.companyId, cid),
        gte(ordersTable.createdAt, new Date(startDate)),
      ))
      .groupBy(orderItemsTable.productId, orderItemsTable.productName)
      .orderBy(desc(sql`sum(quantity)`))
      .limit(10);

    res.json({ period, startDate, totals, bySource, topProducts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── GET /catalog-analytics ───────────────────────────────────────────────────
router.get("/catalog-analytics", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  try {
    const [orderStats] = await db.select({
      totalOrders: sql<number>`count(*)::int`,
      catalogOrders: sql<number>`count(*) filter (where source = 'catalog')::int`,
      manualOrders: sql<number>`count(*) filter (where source = 'manual')::int`,
    }).from(ordersTable).where(eq(ordersTable.companyId, cid));

    res.json({ orderStats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

export default router;
