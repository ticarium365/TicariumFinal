import { Router, Request, Response } from "express";
import {
  db, salesTable, productsTable, customersTable, customerTransactionsTable,
  suppliersTable, supplierTransactionsTable, purchasesTable, purchaseItemsTable,
} from "@workspace/db";
import { and, gte, lte, desc, eq, count as dbCount, sql, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI: Tarih aralığı parse
// ─────────────────────────────────────────────────────────────────────────────
function parseDateRange(startDate: unknown, endDate: unknown) {
  if (!startDate || !endDate) return null;
  const start = new Date(String(startDate));
  const end = new Date(String(endDate));
  end.setHours(23, 59, 59, 999);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

// ─────────────────────────────────────────────────────────────────────────────
// SATIŞ RAPORU (dönemsel)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sales", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Başlangıç ve bitiş tarihi gerekli"));

    const sales = await db.select().from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, range.start), lte(salesTable.createdAt, range.end)))
      .orderBy(desc(salesTable.createdAt));

    const totalQuantity = sales.reduce((s, i) => s + i.quantity, 0);
    const grossRevenue = sales.reduce((s, i) => s + i.totalPrice, 0);
    const costTotal = sales.reduce((s, i) => s + i.purchasePrice * i.quantity, 0);
    const totalProfit = sales.reduce((s, i) => s + i.profit, 0);
    const profitPercent = grossRevenue > 0 ? (totalProfit / grossRevenue) * 100 : 0;

    // Günlük kırılım
    const dailyMap = new Map<string, { count: number; revenue: number; profit: number }>();
    for (const sale of sales) {
      const key = sale.createdAt.toISOString().split("T")[0]!;
      const d = dailyMap.get(key) ?? { count: 0, revenue: 0, profit: 0 };
      d.count += 1; d.revenue += sale.totalPrice; d.profit += sale.profit;
      dailyMap.set(key, d);
    }
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date));

    // Ürün kırılımı
    const productMap = new Map<number, { productName: string; productCode: string; category: string | null; quantity: number; revenue: number; profit: number; profitPercent: number }>();
    for (const sale of sales) {
      const e = productMap.get(sale.productId) ?? { productName: sale.productName, productCode: sale.productCode, category: null, quantity: 0, revenue: 0, profit: 0, profitPercent: 0 };
      e.quantity += sale.quantity; e.revenue += sale.totalPrice; e.profit += sale.profit;
      productMap.set(sale.productId, e);
    }
    // Kâr yüzdesini son hesapla
    for (const [, v] of productMap) {
      v.profitPercent = v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0;
    }
    const productBreakdown = Array.from(productMap.entries())
      .map(([productId, d]) => ({ productId, ...d })).sort((a, b) => b.revenue - a.revenue);

    // Ödeme yöntemi kırılımı
    const paymentMap: Record<string, number> = {};
    for (const s of sales.filter(s => !s.returned)) {
      const m = s.paymentMethod ?? "other";
      paymentMap[m] = (paymentMap[m] ?? 0) + s.totalPrice;
    }

    // Toptan / Perakende kırılımı
    const saleTypeBreakdown = { retail: { count: 0, quantity: 0, revenue: 0, profit: 0 }, wholesale: { count: 0, quantity: 0, revenue: 0, profit: 0 } };
    for (const s of sales.filter(s => !s.returned)) {
      const k = (s.saleType === "wholesale" ? "wholesale" : "retail") as "retail" | "wholesale";
      saleTypeBreakdown[k].count += 1;
      saleTypeBreakdown[k].quantity += s.quantity;
      saleTypeBreakdown[k].revenue += s.totalPrice;
      saleTypeBreakdown[k].profit += s.profit;
    }

    res.json({
      startDate: String(req.query.startDate),
      endDate: String(req.query.endDate),
      totalSales: sales.length,
      totalQuantity,
      grossRevenue,
      netRevenue: grossRevenue,
      totalProfit,
      profitPercent,
      costTotal,
      dailyBreakdown,
      productBreakdown,
      paymentBreakdown: paymentMap,
      saleTypeBreakdown,
    });
  } catch (err) {
    req.log?.error({ err }, "Sales report error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STOK RAPORU
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stock", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db.select().from(productsTable).where(eq(productsTable.companyId, cid));
    const activeProducts = products.filter(p => p.isActive);
    const totalStockValue = activeProducts.reduce((s, p) => s + p.stock * p.purchasePrice, 0);
    const totalSaleValue = activeProducts.reduce((s, p) => s + p.stock * p.salePrice, 0);
    const outOfStock = activeProducts.filter(p => p.stock === 0);
    const criticalStock = activeProducts.filter(p => p.stock > 0 && p.stock <= p.minStock);

    const categoryMap = new Map<string, { productCount: number; totalStock: number; stockValue: number; saleValue: number }>();
    for (const p of activeProducts) {
      const cat = p.category ?? "Kategorisiz";
      const e = categoryMap.get(cat) ?? { productCount: 0, totalStock: 0, stockValue: 0, saleValue: 0 };
      e.productCount += 1; e.totalStock += p.stock;
      e.stockValue += p.stock * p.purchasePrice; e.saleValue += p.stock * p.salePrice;
      categoryMap.set(cat, e);
    }
    const stockByCategory = Array.from(categoryMap.entries())
      .map(([category, d]) => ({ category, ...d })).sort((a, b) => b.stockValue - a.stockValue);

    res.json({
      totalProducts: activeProducts.length,
      totalStockValue,
      totalSaleValue,
      potentialProfit: totalSaleValue - totalStockValue,
      outOfStock: outOfStock.map(p => ({ ...p, views30Days: 0, sales30Days: 0 })),
      criticalStock: criticalStock.map(p => ({ ...p, views30Days: 0, sales30Days: 0 })),
      stockByCategory,
    });
  } catch (err) {
    req.log?.error({ err }, "Stock report error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// KÂR ANALİZİ (dönemsel, ürün + kategori bazlı)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/profit", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Başlangıç ve bitiş tarihi gerekli"));

    const sales = await db.select().from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, range.start), lte(salesTable.createdAt, range.end)));

    const activeSales = sales.filter(s => !s.returned);

    // Ürün bazlı kâr
    const productMap = new Map<number, { productName: string; productCode: string; quantity: number; revenue: number; cost: number; profit: number }>();
    for (const s of activeSales) {
      const e = productMap.get(s.productId) ?? { productName: s.productName, productCode: s.productCode, quantity: 0, revenue: 0, cost: 0, profit: 0 };
      e.quantity += s.quantity;
      e.revenue += s.totalPrice;
      e.cost += s.purchasePrice * s.quantity;
      e.profit += s.profit;
      productMap.set(s.productId, e);
    }
    const productProfits = Array.from(productMap.values())
      .map(p => ({ ...p, profitPercent: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);

    // Kategori bazlı kâr (ürünlerden join ile)
    const productRows = await db.select({ id: productsTable.id, category: productsTable.category }).from(productsTable).where(eq(productsTable.companyId, cid));
    const catLookup = Object.fromEntries(productRows.map(p => [p.id, p.category ?? "Kategorisiz"]));
    const categoryMap = new Map<string, { revenue: number; cost: number; profit: number; quantity: number }>();
    for (const s of activeSales) {
      const cat = catLookup[s.productId] ?? "Kategorisiz";
      const e = categoryMap.get(cat) ?? { revenue: 0, cost: 0, profit: 0, quantity: 0 };
      e.revenue += s.totalPrice; e.cost += s.purchasePrice * s.quantity; e.profit += s.profit; e.quantity += s.quantity;
      categoryMap.set(cat, e);
    }
    const categoryProfits = Array.from(categoryMap.entries())
      .map(([category, d]) => ({ category, ...d, profitPercent: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);

    // Aylık kâr trendi
    const monthMap = new Map<string, { revenue: number; cost: number; profit: number }>();
    for (const s of activeSales) {
      const key = s.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const e = monthMap.get(key) ?? { revenue: 0, cost: 0, profit: 0 };
      e.revenue += s.totalPrice; e.cost += s.purchasePrice * s.quantity; e.profit += s.profit;
      monthMap.set(key, e);
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .map(([month, d]) => ({ month, ...d, profitPercent: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const totalRevenue = activeSales.reduce((s, x) => s + x.totalPrice, 0);
    const totalCost = activeSales.reduce((s, x) => s + x.purchasePrice * x.quantity, 0);
    const totalProfit = activeSales.reduce((s, x) => s + x.profit, 0);

    res.json({
      startDate: String(req.query.startDate),
      endDate: String(req.query.endDate),
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitPercent: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        totalTransactions: activeSales.length,
      },
      productProfits,
      categoryProfits,
      monthlyTrend,
    });
  } catch (err) {
    req.log?.error({ err }, "Profit report error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ ANALİZİ (dönemsel)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/customer-analytics", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Başlangıç ve bitiş tarihi gerekli"));

    const sales = await db.select().from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, range.start), lte(salesTable.createdAt, range.end)));

    const customers = await db.select().from(customersTable).where(eq(customersTable.companyId, cid));
    const custMap = Object.fromEntries(customers.map(c => [c.id, c]));

    // Müşteri bazlı ciro (customerId olan satışlar)
    const customerSalesMap = new Map<number, { customerName: string; code: string; transactions: number; revenue: number; profit: number }>();
    for (const s of sales.filter(s => s.customerId && !s.returned)) {
      const cust = custMap[s.customerId!];
      if (!cust) continue;
      const e = customerSalesMap.get(s.customerId!) ?? { customerName: cust.name, code: cust.code, transactions: 0, revenue: 0, profit: 0 };
      e.transactions += 1; e.revenue += s.totalPrice; e.profit += s.profit;
      customerSalesMap.set(s.customerId!, e);
    }
    const topCustomersBySales = Array.from(customerSalesMap.values())
      .sort((a, b) => b.revenue - a.revenue).slice(0, 20);

    // En borçlu müşteriler (mevcut bakiyeden)
    const topDebtors = customers
      .filter(c => c.isActive && c.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, 10)
      .map(c => ({ id: c.id, code: c.code, name: c.name, balance: c.currentBalance }));

    // Toplam aktif müşteri + bakiye özeti
    const totalDebt = customers.filter(c => c.isActive).reduce((s, c) => s + Math.max(0, c.currentBalance), 0);

    res.json({
      startDate: String(req.query.startDate),
      endDate: String(req.query.endDate),
      totalCustomers: customers.filter(c => c.isActive).length,
      totalDebt,
      topCustomersBySales,
      topDebtors,
    });
  } catch (err) {
    req.log?.error({ err }, "Customer analytics error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ ANALİZİ (dönemsel)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/supplier-analytics", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Başlangıç ve bitiş tarihi gerekli"));

    const purchases = await db.select().from(purchasesTable)
      .where(and(eq(purchasesTable.companyId, cid), gte(purchasesTable.invoiceDate, range.start), lte(purchasesTable.invoiceDate, range.end)));

    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, cid));
    const suppMap = Object.fromEntries(suppliers.map(s => [s.id, s]));

    // Tedarikçi bazlı harcama
    const suppSpendMap = new Map<number, { supplierName: string; code: string; invoiceCount: number; totalSpend: number }>();
    for (const p of purchases) {
      const sup = suppMap[p.supplierId];
      if (!sup) continue;
      const e = suppSpendMap.get(p.supplierId) ?? { supplierName: sup.name, code: sup.code, invoiceCount: 0, totalSpend: 0 };
      e.invoiceCount += 1; e.totalSpend += p.totalAmount;
      suppSpendMap.set(p.supplierId, e);
    }
    const topSuppliersBySpend = Array.from(suppSpendMap.values())
      .sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 20);

    // En borçlu tedarikçiler (mevcut bakiyeden)
    const topCreditors = suppliers
      .filter(s => s.isActive && s.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, 10)
      .map(s => ({ id: s.id, code: s.code, name: s.name, balance: s.currentBalance }));

    // Aylık alış trendi
    const monthMap = new Map<string, { totalSpend: number; invoiceCount: number }>();
    for (const p of purchases) {
      const key = p.invoiceDate.toISOString().substring(0, 7);
      const e = monthMap.get(key) ?? { totalSpend: 0, invoiceCount: 0 };
      e.totalSpend += p.totalAmount; e.invoiceCount += 1;
      monthMap.set(key, e);
    }
    const monthlyPurchases = Array.from(monthMap.entries())
      .map(([month, d]) => ({ month, ...d })).sort((a, b) => a.month.localeCompare(b.month));

    const totalPurchaseAmount = purchases.reduce((s, p) => s + p.totalAmount, 0);
    const totalDebt = suppliers.filter(s => s.isActive).reduce((s, sup) => s + Math.max(0, sup.currentBalance), 0);

    res.json({
      startDate: String(req.query.startDate),
      endDate: String(req.query.endDate),
      totalSuppliers: suppliers.filter(s => s.isActive).length,
      totalPurchaseAmount,
      totalDebt,
      topSuppliersBySpend,
      topCreditors,
      monthlyPurchases,
    });
  } catch (err) {
    req.log?.error({ err }, "Supplier analytics error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ ÖZET RAPORU
// ─────────────────────────────────────────────────────────────────────────────
router.get("/purchases-summary", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Başlangıç ve bitiş tarihi gerekli"));

    const purchases = await db.select().from(purchasesTable)
      .where(and(eq(purchasesTable.companyId, cid), gte(purchasesTable.invoiceDate, range.start), lte(purchasesTable.invoiceDate, range.end)))
      .orderBy(desc(purchasesTable.invoiceDate));

    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, cid));
    const suppMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

    const enriched = purchases.map(p => ({ ...p, supplierName: suppMap[p.supplierId] ?? "" }));
    const totalAmount = purchases.reduce((s, p) => s + p.totalAmount, 0);
    const totalTax = purchases.reduce((s, p) => s + p.taxAmount, 0);

    const dailyMap = new Map<string, { count: number; amount: number }>();
    for (const p of purchases) {
      const key = p.invoiceDate.toISOString().split("T")[0]!;
      const e = dailyMap.get(key) ?? { count: 0, amount: 0 };
      e.count += 1; e.amount += p.totalAmount;
      dailyMap.set(key, e);
    }
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      startDate: String(req.query.startDate),
      endDate: String(req.query.endDate),
      totalPurchases: purchases.length,
      totalAmount,
      totalTax,
      dailyBreakdown,
      purchases: enriched,
    });
  } catch (err) {
    req.log?.error({ err }, "Purchases summary error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT — SATIŞLAR
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/sales", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Tarih aralığı gerekli"));

    const sales = await db.select().from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, range.start), lte(salesTable.createdAt, range.end)))
      .orderBy(desc(salesTable.createdAt));

    const header = ["Tarih", "Ürün Kodu", "Ürün Adı", "Miktar", "Birim Fiyat", "Toplam", "Maliyet", "Kâr", "Ödeme Yöntemi", "Satış Tipi", "İade"];
    const rows = sales.map(s => [
      s.createdAt.toLocaleDateString("tr-TR"),
      `"${s.productCode}"`,
      `"${s.productName}"`,
      s.quantity,
      s.unitPrice.toFixed(2),
      s.totalPrice.toFixed(2),
      (s.purchasePrice * s.quantity).toFixed(2),
      s.profit.toFixed(2),
      s.paymentMethod ?? "",
      s.saleType === "wholesale" ? "Toptan" : "Perakende",
      s.returned ? "Evet" : "Hayır",
    ]);

    const csv = [header.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="satis-raporu-${range.start.toISOString().split("T")[0]}.csv"`);
    res.send("\uFEFF" + csv); // BOM for Excel
  } catch (err) {
    req.log?.error({ err }, "Export sales CSV error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT — ALIŞLAR
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/purchases", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return void res.status(400).json(Errors.badRequest("Tarih aralığı gerekli"));

    const purchases = await db.select().from(purchasesTable)
      .where(and(eq(purchasesTable.companyId, cid), gte(purchasesTable.invoiceDate, range.start), lte(purchasesTable.invoiceDate, range.end)))
      .orderBy(desc(purchasesTable.invoiceDate));
    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, cid));
    const suppMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

    const header = ["Tarih", "Fatura No", "Tedarikçi", "Ara Toplam", "KDV", "İskonto", "Toplam", "Ödeme Durumu"];
    const rows = purchases.map(p => [
      p.invoiceDate.toLocaleDateString("tr-TR"),
      `"${p.invoiceNo ?? ""}"`,
      `"${suppMap[p.supplierId] ?? ""}"`,
      p.subtotalAmount.toFixed(2),
      p.taxAmount.toFixed(2),
      p.discountAmount.toFixed(2),
      p.totalAmount.toFixed(2),
      p.paymentStatus,
    ]);

    const csv = [header.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="alis-raporu-${range.start.toISOString().split("T")[0]}.csv"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    req.log?.error({ err }, "Export purchases CSV error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT — STOK
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/stock", requireAuth, requireRole(["admin", "viewer"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const products = await db.select().from(productsTable).where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true)));

    const header = ["Ürün Kodu", "Barkod", "Ürün Adı", "Marka", "Kategori", "Stok", "Min Stok", "Alış Fiyatı", "Satış Fiyatı", "Stok Değeri (Alış)", "Stok Değeri (Satış)"];
    const rows = products.map(p => [
      `"${p.productCode}"`,
      `"${p.barcode ?? ""}"`,
      `"${p.name}"`,
      `"${p.brand ?? ""}"`,
      `"${p.category ?? ""}"`,
      p.stock,
      p.minStock,
      p.purchasePrice.toFixed(2),
      p.salePrice.toFixed(2),
      (p.stock * p.purchasePrice).toFixed(2),
      (p.stock * p.salePrice).toFixed(2),
    ]);

    const csv = [header.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="stok-raporu-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    req.log?.error({ err }, "Export stock CSV error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GÜNLÜK ÖZET (mevcut)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/daily-summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { date } = req.query;
    if (req.session.user?.role === "super_admin")
      return void res.status(403).json(Errors.badRequest("Super admin bu raporu göremez"));
    const targetDate = date ? String(date) : new Date().toISOString().split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate!))
      return void res.status(400).json(Errors.badRequest("Geçersiz tarih formatı. YYYY-MM-DD kullanın."));
    const start = new Date(`${targetDate}T00:00:00.000Z`);
    const end = new Date(`${targetDate}T23:59:59.999Z`);
    const sales = await db.select().from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
      .orderBy(desc(salesTable.createdAt));
    const activeSales = sales.filter(s => !s.returned);
    const returnedSales = sales.filter(s => s.returned);
    const totalRevenue = activeSales.reduce((s, x) => s + x.totalPrice, 0);
    const totalProfit = activeSales.reduce((s, x) => s + x.profit, 0);
    const totalReturnedAmount = returnedSales.reduce((s, x) => s + x.totalPrice, 0);
    const netRevenue = totalRevenue - totalReturnedAmount;
    const paymentBreakdown = { cash: 0, card: 0, transfer: 0, other: 0 };
    for (const s of activeSales) {
      const m = (s.paymentMethod || "other") as keyof typeof paymentBreakdown;
      if (m in paymentBreakdown) paymentBreakdown[m] += s.totalPrice;
      else paymentBreakdown.other += s.totalPrice;
    }
    const productMap = new Map<number, { productName: string; productCode: string; quantity: number; revenue: number }>();
    for (const s of activeSales) {
      const e = productMap.get(s.productId) ?? { productName: s.productName, productCode: s.productCode, quantity: 0, revenue: 0 };
      e.quantity += s.quantity; e.revenue += s.totalPrice;
      productMap.set(s.productId, e);
    }
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const [{ count: lowStockCount }] = await db.select({ count: dbCount() }).from(productsTable)
      .where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true), lte(productsTable.stock, productsTable.minStock)));
    res.json({
      date: targetDate, createdAtRange: { start: start.toISOString(), end: end.toISOString() },
      totalSalesCount: activeSales.length, totalRevenue, totalProfit, netRevenue,
      totalReturnedCount: returnedSales.length, totalReturnedAmount,
      paymentBreakdown, topProducts, lowStockCount,
    });
  } catch (err) {
    req.log?.error({ err }, "Daily summary error");
    res.status(500).json(Errors.internal());
  }
});

export default router;
