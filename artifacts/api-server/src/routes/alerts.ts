import { Router, Request, Response } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, and, lte, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// GET /api/alerts/low-stock
// Stoku minStock'a eşit veya altında olan aktif ürünler
router.get("/low-stock", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;

    const products = await db
      .select({
        id: productsTable.id,
        productCode: productsTable.productCode,
        name: productsTable.name,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
        category: productsTable.category,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.companyId, cid),
          eq(productsTable.isActive, true),
          lte(productsTable.stock, productsTable.minStock)
        )
      )
      .orderBy(asc(productsTable.stock))
      .limit(50);

    const count = products.length;
    const critical = products.filter((p) => p.stock === 0); // stok sıfır olanlar
    const low = products.filter((p) => p.stock > 0);       // stok düşük ama sıfır değil

    res.json({ count, critical: critical.length, low: low.length, products });
  } catch (err) {
    req.log?.error({ err }, "Low stock alert error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

export default router;
