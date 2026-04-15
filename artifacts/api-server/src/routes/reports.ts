import { Router, Request, Response } from "express";
import { db, salesTable, productsTable } from "@workspace/db";
import { and, gte, lte, desc, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/sales", requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: "Bad Request", message: "Başlangıç ve bitiş tarihi gerekli" });
      return;
    }

    const start = new Date(String(startDate));
    const end = new Date(String(endDate));
    end.setHours(23, 59, 59, 999);

    const sales = await db
      .select()
      .from(salesTable)
      .where(and(gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
      .orderBy(desc(salesTable.createdAt));

    const totalQuantity = sales.reduce((s, item) => s + item.quantity, 0);
    const grossRevenue = sales.reduce((s, item) => s + item.totalPrice, 0);
    const netRevenue = sales.reduce((s, item) => s + item.purchasePrice * item.quantity, 0);
    const totalProfit = grossRevenue - netRevenue;
    const profitPercent = netRevenue > 0 ? (totalProfit / netRevenue) * 100 : 0;

    const dailyMap = new Map<string, { count: number; revenue: number; profit: number }>();
    for (const sale of sales) {
      const dateKey = sale.createdAt.toISOString().split("T")[0]!;
      const existing = dailyMap.get(dateKey) ?? { count: 0, revenue: 0, profit: 0 };
      existing.count += 1;
      existing.revenue += sale.totalPrice;
      existing.profit += sale.profit;
      dailyMap.set(dateKey, existing);
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      count: data.count,
      revenue: data.revenue,
      profit: data.profit,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const productMap = new Map<number, { productName: string; productCode: string; quantity: number; revenue: number; profit: number }>();
    for (const sale of sales) {
      const existing = productMap.get(sale.productId) ?? {
        productName: sale.productName,
        productCode: sale.productCode,
        quantity: 0,
        revenue: 0,
        profit: 0,
      };
      existing.quantity += sale.quantity;
      existing.revenue += sale.totalPrice;
      existing.profit += sale.profit;
      productMap.set(sale.productId, existing);
    }

    const productBreakdown = Array.from(productMap.entries())
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      startDate: String(startDate),
      endDate: String(endDate),
      totalSales: sales.length,
      totalQuantity,
      grossRevenue,
      netRevenue,
      totalProfit,
      profitPercent,
      dailyBreakdown,
      productBreakdown,
    });
  } catch (err) {
    req.log?.error({ err }, "Sales report error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/stock", requireAuth, async (req: Request, res: Response) => {
  try {
    const products = await db.select().from(productsTable);
    const totalStockValue = products.reduce((s, p) => s + p.stock * p.purchasePrice, 0);

    const outOfStock = products.filter((p) => p.stock === 0);
    const criticalStock = products.filter((p) => p.stock > 0 && p.stock <= p.minStock);

    const categoryMap = new Map<string, { productCount: number; totalStock: number; stockValue: number }>();
    for (const p of products) {
      const cat = p.category ?? "Kategorisiz";
      const existing = categoryMap.get(cat) ?? { productCount: 0, totalStock: 0, stockValue: 0 };
      existing.productCount += 1;
      existing.totalStock += p.stock;
      existing.stockValue += p.stock * p.purchasePrice;
      categoryMap.set(cat, existing);
    }

    const stockByCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      ...data,
    }));

    res.json({
      totalProducts: products.length,
      totalStockValue,
      outOfStock: outOfStock.map((p) => ({ ...p, views30Days: 0, sales30Days: 0 })),
      criticalStock: criticalStock.map((p) => ({ ...p, views30Days: 0, sales30Days: 0 })),
      stockByCategory,
    });
  } catch (err) {
    req.log?.error({ err }, "Stock report error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
