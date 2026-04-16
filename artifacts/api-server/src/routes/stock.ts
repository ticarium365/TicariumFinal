import { Router, Request, Response } from "express";
import { db, productsTable, stockMovementsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// POST /api/stock/entry — Stok girişi
router.post("/entry", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const { productId, quantity, purchasePrice, note } = req.body;
    if (!productId || !quantity) {
      res.status(400).json({ error: "Bad Request", message: "Ürün ve miktar zorunlu" });
      return;
    }
    const qty = parseInt(quantity);
    if (qty <= 0) {
      res.status(400).json({ error: "Bad Request", message: "Miktar 0'dan büyük olmalı" });
      return;
    }

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(productId)));
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }

    const newStock = product.stock + qty;
    const updateData: any = { stock: newStock, updatedAt: new Date() };
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      updateData.purchasePrice = parseFloat(purchasePrice);
    }

    await db.update(productsTable).set(updateData).where(eq(productsTable.id, product.id));

    const [movement] = await db.insert(stockMovementsTable).values({
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      type: "purchase",
      quantity: qty,
      note: note || null,
      createdBy: req.session.user?.fullName || req.session.user?.username,
    }).returning();

    res.status(201).json({
      message: "Stok girişi kaydedildi",
      movement,
      newStock,
    });
  } catch (err) {
    req.log?.error({ err }, "Stock entry error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/stock/correction — Stok düzeltme (admin only)
router.post("/correction", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const { productId, newStock, note } = req.body;
    if (!productId || newStock === undefined) {
      res.status(400).json({ error: "Bad Request", message: "Ürün ve yeni stok zorunlu" });
      return;
    }

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(productId)));
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }

    const targetStock = parseInt(newStock);
    const diff = targetStock - product.stock;

    await db.update(productsTable)
      .set({ stock: targetStock, updatedAt: new Date() })
      .where(eq(productsTable.id, product.id));

    const [movement] = await db.insert(stockMovementsTable).values({
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      type: "correction",
      quantity: diff,
      note: note || "Stok düzeltme",
      createdBy: req.session.user?.fullName || req.session.user?.username,
    }).returning();

    res.status(201).json({ message: "Stok düzeltildi", movement, newStock: targetStock });
  } catch (err) {
    req.log?.error({ err }, "Stock correction error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/stock/movements — Tüm stok hareketleri
router.get("/movements", requireAuth, async (req: Request, res: Response) => {
  try {
    const { productId, type, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [];
    if (productId) conditions.push(eq(stockMovementsTable.productId, parseInt(String(productId))));
    if (type) conditions.push(eq(stockMovementsTable.type, String(type)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [movements, totalResult] = await Promise.all([
      db.select().from(stockMovementsTable)
        .where(whereClause)
        .orderBy(desc(stockMovementsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: count() }).from(stockMovementsTable).where(whereClause),
    ]);

    res.json({
      movements,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "List movements error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
