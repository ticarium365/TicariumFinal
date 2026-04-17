import { Router, Request, Response } from "express";
import { db, salesTable, productsTable } from "@workspace/db";
import { and, gte, lte, desc, eq, count as dbCount } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// GET /api/reports/sales
router.get("/sales", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Başlangıç ve bitiş tarihi gerekli", details: null } });
      return;
    }

    const start = new Date(String(startDate));
    const end = new Date(String(endDate));
    end.setHours(23, 59, 59, 999);

    const sales = await db
      .select()
      .from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
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

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, count: data.count, revenue: data.revenue, profit: data.profit }))
      .sort((a, b) => a.date.localeCompare(b.date));

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
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// GET /api/reports/stock
router.get("/stock", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db.select().from(productsTable).where(eq(productsTable.companyId, cid));
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

    const stockByCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({ category, ...data }));

    res.json({
      totalProducts: products.length,
      totalStockValue,
      outOfStock: outOfStock.map((p) => ({ ...p, views30Days: 0, sales30Days: 0 })),
      criticalStock: criticalStock.map((p) => ({ ...p, views30Days: 0, sales30Days: 0 })),
      stockByCategory,
    });
  } catch (err) {
    req.log?.error({ err }, "Stock report error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/daily-summary?date=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get("/daily-summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { date } = req.query;

    // Super admin bu endpoint'te tenant bazlı veri görmez
    if (req.session.user?.role === "super_admin") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Super admin bu raporu göremez", details: null } });
      return;
    }

    const targetDate = date ? String(date) : new Date().toISOString().split("T")[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(targetDate!)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz tarih formatı. YYYY-MM-DD kullanın.", details: null } });
      return;
    }

    const start = new Date(`${targetDate}T00:00:00.000Z`);
    const end = new Date(`${targetDate}T23:59:59.999Z`);

    const sales = await db
      .select()
      .from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
      .orderBy(desc(salesTable.createdAt));

    const activeSales = sales.filter((s) => !s.returned);
    const returnedSales = sales.filter((s) => s.returned);

    const totalRevenue = activeSales.reduce((s, x) => s + x.totalPrice, 0);
    const totalProfit = activeSales.reduce((s, x) => s + x.profit, 0);
    const totalReturnedAmount = returnedSales.reduce((s, x) => s + x.totalPrice, 0);
    const netRevenue = totalRevenue - totalReturnedAmount;

    // Ödeme yöntemi kırılımı
    const paymentBreakdown = { cash: 0, card: 0, transfer: 0, other: 0 };
    for (const s of activeSales) {
      const m = (s.paymentMethod || "other") as keyof typeof paymentBreakdown;
      if (m in paymentBreakdown) paymentBreakdown[m] += s.totalPrice;
      else paymentBreakdown.other += s.totalPrice;
    }

    // En çok satan 5 ürün (adet)
    const productMap = new Map<number, { productName: string; productCode: string; quantity: number; revenue: number }>();
    for (const s of activeSales) {
      const existing = productMap.get(s.productId) ?? { productName: s.productName, productCode: s.productCode, quantity: 0, revenue: 0 };
      existing.quantity += s.quantity;
      existing.revenue += s.totalPrice;
      productMap.set(s.productId, existing);
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Kritik stok sayısı
    const [{ count: lowStockCount }] = await db
      .select({ count: dbCount() })
      .from(productsTable)
      .where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true), lte(productsTable.stock, productsTable.minStock)));

    res.json({
      date: targetDate,
      createdAtRange: { start: start.toISOString(), end: end.toISOString() },
      totalSalesCount: activeSales.length,
      totalRevenue,
      totalProfit,
      netRevenue,
      totalReturnedCount: returnedSales.length,
      totalReturnedAmount,
      paymentBreakdown,
      topProducts,
      lowStockCount,
    });
  } catch (err) {
    req.log?.error({ err }, "Daily summary error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

export default router;
