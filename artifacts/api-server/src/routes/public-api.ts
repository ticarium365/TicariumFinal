import { Router, type IRouter, type Request, type Response } from "express";
import { db, productsTable, salesTable, campaignsTable, catalogSettingsTable, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, and, lte, gte, sql, desc, ilike, or } from "drizzle-orm";
import { requireApiKey, requireScope } from "../middlewares/api-key-auth.js";

const router: IRouter = Router();

// ─── Tüm public endpoint'ler API key ile korunur ──────────────────────────────
router.use("/public/v1", requireApiKey);

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/info — API bilgisi + company info
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/info", async (req: Request, res: Response) => {
  const company = (req as any).company;
  res.json({
    api: { version: "1.0", name: "Ticarium365 Public API" },
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
    },
    scopes: (req as any).apiKeyScopes,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/products — ürün listesi (sayfalama + arama)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/products", requireScope("read"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const { q, page = "1", limit = "20", category } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  try {
    const conditions = [eq(productsTable.companyId, companyId)];
    if (category) conditions.push(eq(productsTable.category, category));

    let rows = await db.select({
      id: productsTable.id,
      barcode: productsTable.barcode,
      name: productsTable.name,
      category: productsTable.category,
      brand: productsTable.brand,
      salePrice: productsTable.salePrice,
      purchasePrice: productsTable.purchasePrice,
      stock: productsTable.stock,
      minStock: productsTable.minStock,
    }).from(productsTable)
      .where(and(...conditions))
      .orderBy(productsTable.name)
      .limit(limitNum)
      .offset(offset);

    if (q) {
      const lower = q.toLowerCase();
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.barcode ?? "").toLowerCase().includes(lower) ||
        (p.brand ?? "").toLowerCase().includes(lower),
      );
    }

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(productsTable).where(and(...conditions));

    res.json({
      products: rows,
      pagination: { page: pageNum, limit: limitNum, total: count, pages: Math.ceil(count / limitNum) },
    });
  } catch (err) {
    req.log.error({ err }, "public products error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/products/:barcode — barkod ile ürün sorgulama
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/products/:barcode", requireScope("read"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const { barcode } = req.params;
  try {
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.companyId, companyId), eq(productsTable.barcode, barcode)));
    if (!product) { res.status(404).json({ error: "Ürün bulunamadı" }); return; }
    res.json(product);
  } catch (err) {
    req.log.error({ err }, "public product by barcode error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/inventory — stok özeti
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/inventory", requireScope("read"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const [stats] = await db.select({
      totalProducts: sql<number>`count(*)::int`,
      totalStock: sql<number>`coalesce(sum(stock), 0)::int`,
      lowStockCount: sql<number>`count(*) filter (where stock <= min_stock and min_stock > 0)::int`,
      outOfStockCount: sql<number>`count(*) filter (where stock = 0)::int`,
    }).from(productsTable).where(eq(productsTable.companyId, companyId));

    // Kategorilere göre stok
    const byCategory = await db.select({
      category: productsTable.category,
      count: sql<number>`count(*)::int`,
      totalStock: sql<number>`coalesce(sum(stock), 0)::int`,
    }).from(productsTable)
      .where(eq(productsTable.companyId, companyId))
      .groupBy(productsTable.category)
      .orderBy(desc(sql`count(*)`));

    res.json({ ...stats, byCategory });
  } catch (err) {
    req.log.error({ err }, "public inventory error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/campaigns — aktif kampanyalar
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/campaigns", requireScope("read"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const campaigns = await db.select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      discountType: campaignsTable.discountType,
      discountValue: campaignsTable.discountValue,
      scope: campaignsTable.scope,
      startDate: campaignsTable.startDate,
      endDate: campaignsTable.endDate,
      couponCode: campaignsTable.couponCode,
    }).from(campaignsTable).where(and(
      eq(campaignsTable.companyId, companyId),
      eq(campaignsTable.isActive, true),
      lte(campaignsTable.startDate, today),
      gte(campaignsTable.endDate, today),
    ));
    res.json({ campaigns });
  } catch (err) {
    req.log.error({ err }, "public campaigns error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/stats — özet istatistikler (write+ gerekli)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/stats", requireScope("write"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = today.slice(0, 7) + "-01";
  try {
    const [salesStats] = await db.select({
      totalSales: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(total_price), 0)`,
    }).from(salesTable)
      .where(and(eq(salesTable.companyId, companyId), gte(salesTable.createdAt, new Date(startOfMonth))));

    const [invStats] = await db.select({
      totalProducts: sql<number>`count(*)::int`,
      lowStockCount: sql<number>`count(*) filter (where stock <= min_stock and min_stock > 0)::int`,
    }).from(productsTable).where(eq(productsTable.companyId, companyId));

    res.json({
      month: today.slice(0, 7),
      sales: salesStats,
      inventory: invStats,
    });
  } catch (err) {
    req.log.error({ err }, "public stats error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/v1/catalog — katalog bilgisi + ürünler
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/v1/catalog", requireScope("read"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const [settings] = await db.select().from(catalogSettingsTable)
      .where(eq(catalogSettingsTable.companyId, companyId));
    if (!settings?.isEnabled) {
      return void res.status(403).json({ error: "Katalog aktif değil" });
    }
    const products = await db.select({
      id: productsTable.id,
      barcode: productsTable.barcode,
      name: productsTable.name,
      category: productsTable.category,
      brand: productsTable.brand,
      stock: productsTable.stock,
      salePrice: settings.showPrices ? productsTable.salePrice : sql<null>`null`,
    }).from(productsTable)
      .where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive, true)))
      .orderBy(productsTable.name);
    res.json({
      catalog: {
        title: settings.title,
        description: settings.description,
        themeColor: settings.themeColor,
        allowOrders: settings.allowOrders,
      },
      products,
    });
  } catch (err) {
    req.log.error({ err }, "public catalog error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /public/v1/orders — katalog üzerinden sipariş oluştur
// ─────────────────────────────────────────────────────────────────────────────
router.post("/public/v1/orders", requireScope("write"), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const { customerName, customerEmail, customerPhone, notes, items } = req.body as {
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    notes?: string;
    items: Array<{ productId: number; quantity: number }>;
  };
  if (!customerName || !Array.isArray(items) || items.length === 0) {
    return void res.status(400).json({ error: "customerName ve items zorunlu" });
  }
  try {
    const [settings] = await db.select({ allowOrders: catalogSettingsTable.allowOrders, isEnabled: catalogSettingsTable.isEnabled })
      .from(catalogSettingsTable).where(eq(catalogSettingsTable.companyId, companyId));
    if (!settings?.isEnabled || !settings?.allowOrders) {
      return void res.status(403).json({ error: "Bu katalog sipariş kabul etmiyor" });
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    let totalAmount = 0;

    const [order] = await db.insert(ordersTable).values({
      companyId,
      orderNo: `ORD-${dateStr}-TEMP`,
      customerName,
      customerEmail,
      customerPhone,
      notes,
      totalAmount: "0",
      source: "catalog",
    }).returning();
    const orderNo = `ORD-${dateStr}-${String(order.id).padStart(4, "0")}`;
    await db.update(ordersTable).set({ orderNo }).where(eq(ordersTable.id, order.id));

    for (const item of items) {
      const [product] = await db.select({ name: productsTable.name, barcode: productsTable.barcode, salePrice: productsTable.salePrice })
        .from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.companyId, companyId)));
      if (!product) continue;
      const lineTotal = item.quantity * product.salePrice;
      totalAmount += lineTotal;
      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: item.productId,
        productName: product.name,
        barcode: product.barcode ?? null,
        quantity: item.quantity,
        unitPrice: String(product.salePrice),
        totalPrice: String(lineTotal.toFixed(2)),
      });
    }

    await db.update(ordersTable).set({ totalAmount: String(totalAmount.toFixed(2)) })
      .where(eq(ordersTable.id, order.id));

    res.status(201).json({ order: { ...order, totalAmount: String(totalAmount.toFixed(2)), orderNo } });
  } catch (err) {
    req.log.error({ err }, "public order error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
