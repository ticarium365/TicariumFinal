import { Router, Request, Response } from "express";
import { db, productsTable, productViewsTable, salesTable } from "@workspace/db";
import { eq, ilike, and, lte, or, desc, asc, count, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

function calcProfitPercent(purchasePrice: number, salePrice: number): number {
  if (purchasePrice === 0) return 0;
  return ((salePrice - purchasePrice) / purchasePrice) * 100;
}

async function formatProduct(p: typeof productsTable.$inferSelect) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [viewResult, saleResult] = await Promise.all([
    db.select({ count: count() }).from(productViewsTable).where(
      and(eq(productViewsTable.productId, p.id), gte(productViewsTable.viewedAt, thirtyDaysAgo))
    ),
    db.select({ total: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)` }).from(salesTable).where(
      and(eq(salesTable.productId, p.id), gte(salesTable.createdAt, thirtyDaysAgo))
    ),
  ]);

  return {
    ...p,
    views30Days: viewResult[0]?.count ?? 0,
    sales30Days: Number(saleResult[0]?.total ?? 0),
  };
}

// GET /api/products/categories
router.get("/categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const results = await db
      .selectDistinct({ category: productsTable.category })
      .from(productsTable)
      .where(and(eq(productsTable.companyId, cid), sql`${productsTable.category} IS NOT NULL`))
      .orderBy(productsTable.category);
    res.json(results.map((r) => r.category).filter(Boolean));
  } catch (err) {
    req.log?.error({ err }, "List categories error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/products/brands
router.get("/brands", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const results = await db
      .selectDistinct({ brand: productsTable.brand })
      .from(productsTable)
      .where(and(eq(productsTable.companyId, cid), sql`${productsTable.brand} IS NOT NULL`))
      .orderBy(productsTable.brand);
    res.json(results.map((r) => r.brand).filter(Boolean));
  } catch (err) {
    req.log?.error({ err }, "List brands error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/products/generate-barcode
router.get("/generate-barcode", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    let barcode: string;
    let isUnique = false;
    do {
      barcode = String(Math.floor(100000000000 + Math.random() * 900000000000));
      const [existing] = await db.select({ id: productsTable.id }).from(productsTable)
        .where(and(eq(productsTable.companyId, cid), eq(productsTable.barcode, barcode)));
      isUnique = !existing;
    } while (!isUnique);
    res.json({ barcode });
  } catch (err) {
    req.log?.error({ err }, "Generate barcode error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/products/generate-barcode
router.post("/generate-barcode", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    let barcode: string;
    let isUnique = false;
    do {
      barcode = String(Math.floor(100000000000 + Math.random() * 900000000000));
      const [existing] = await db.select({ id: productsTable.id }).from(productsTable)
        .where(and(eq(productsTable.companyId, cid), eq(productsTable.barcode, barcode)));
      isUnique = !existing;
    } while (!isUnique);
    res.json({ barcode });
  } catch (err) {
    req.log?.error({ err }, "Generate barcode error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/products/barcode/:barcode
router.get("/barcode/:barcode", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { barcode } = req.params;
    const [product] = await db
      .select()
      .from(productsTable)
      .where(and(
        eq(productsTable.companyId, cid),
        or(
          eq(productsTable.barcode, barcode!),
          eq(productsTable.productCode, barcode!)
        )
      ));
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }
    res.json(await formatProduct(product));
  } catch (err) {
    req.log?.error({ err }, "Get product by barcode error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/products/export
router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { search, category, brand, lowStock, sortBy = "name", sortOrder = "asc" } = req.query;

    const conditions: any[] = [eq(productsTable.companyId, cid)];

    if (search) {
      const searchStr = `%${search}%`;
      conditions.push(or(
        ilike(productsTable.name, searchStr),
        ilike(productsTable.productCode, searchStr),
        ilike(productsTable.barcode, searchStr),
        ilike(productsTable.brand, searchStr),
        ilike(productsTable.category, searchStr)
      ));
    }
    if (category) conditions.push(eq(productsTable.category, String(category)));
    if (brand) conditions.push(eq(productsTable.brand, String(brand)));
    if (lowStock === "true") conditions.push(lte(productsTable.stock, productsTable.minStock));

    const whereClause = and(...conditions);
    const orderColumn = {
      name: productsTable.name,
      productCode: productsTable.productCode,
      stock: productsTable.stock,
      salePrice: productsTable.salePrice,
      purchasePrice: productsTable.purchasePrice,
    }[String(sortBy)] ?? productsTable.name;
    const orderFn = sortOrder === "desc" ? desc : asc;

    const products = await db.select().from(productsTable).where(whereClause).orderBy(orderFn(orderColumn));
    res.json({ products, total: products.length });
  } catch (err) {
    req.log?.error({ err }, "Export products error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/products
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { search, category, brand, lowStock, sortBy = "name", sortOrder = "asc", page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(productsTable.companyId, cid)];

    if (search) {
      const searchStr = `%${search}%`;
      conditions.push(or(
        ilike(productsTable.name, searchStr),
        ilike(productsTable.productCode, searchStr),
        ilike(productsTable.barcode, searchStr),
        ilike(productsTable.brand, searchStr),
        ilike(productsTable.category, searchStr)
      ));
    }
    if (category) conditions.push(eq(productsTable.category, String(category)));
    if (brand) conditions.push(eq(productsTable.brand, String(brand)));
    if (lowStock === "true") conditions.push(lte(productsTable.stock, productsTable.minStock));

    const whereClause = and(...conditions);

    const orderColumn = {
      name: productsTable.name,
      productCode: productsTable.productCode,
      stock: productsTable.stock,
      salePrice: productsTable.salePrice,
      purchasePrice: productsTable.purchasePrice,
      profitPercent: productsTable.profitPercent,
      updatedAt: productsTable.updatedAt,
    }[String(sortBy)] ?? productsTable.name;
    const orderFn = sortOrder === "desc" ? desc : asc;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [products, totalResult] = await Promise.all([
      db.select().from(productsTable).where(whereClause).orderBy(orderFn(orderColumn)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(productsTable).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;
    const productIds = products.map((p) => p.id);

    const [viewCounts, saleCounts] = await Promise.all([
      productIds.length > 0
        ? db.select({ productId: productViewsTable.productId, cnt: count() })
            .from(productViewsTable)
            .where(and(
              sql`${productViewsTable.productId} = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]`)})`,
              gte(productViewsTable.viewedAt, thirtyDaysAgo)
            ))
            .groupBy(productViewsTable.productId)
        : Promise.resolve([]),
      productIds.length > 0
        ? db.select({ productId: salesTable.productId, total: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)` })
            .from(salesTable)
            .where(and(
              sql`${salesTable.productId} = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]`)})`,
              gte(salesTable.createdAt, thirtyDaysAgo)
            ))
            .groupBy(salesTable.productId)
        : Promise.resolve([]),
    ]);

    const viewMap = new Map(viewCounts.map((v) => [v.productId, v.cnt]));
    const saleMap = new Map(saleCounts.map((s) => [s.productId, Number(s.total)]));

    const formatted = products.map((p) => ({
      ...p,
      views30Days: viewMap.get(p.id) ?? 0,
      sales30Days: saleMap.get(p.id) ?? 0,
    }));

    res.json({ products: formatted, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    req.log?.error({ err }, "List products error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/products
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { productCode, barcode, name, brand, category, description, stock, minStock, purchasePrice, salePrice, profitPercent, discountSalePct } = req.body;
    if (!productCode || !name || stock === undefined || minStock === undefined || purchasePrice === undefined || salePrice === undefined) {
      res.status(400).json({ error: "Bad Request", message: "Zorunlu alanlar eksik" });
      return;
    }

    const finalProfitPercent = profitPercent !== undefined
      ? profitPercent
      : calcProfitPercent(parseFloat(purchasePrice), parseFloat(salePrice));

    if (barcode) {
      const [existingBarcode] = await db.select({ id: productsTable.id }).from(productsTable)
        .where(and(eq(productsTable.companyId, cid), eq(productsTable.barcode, barcode)));
      if (existingBarcode) {
        res.status(409).json({ error: { code: "DUPLICATE_BARCODE", message: "Bu barkod bu şirkette zaten kullanılıyor", details: null } });
        return;
      }
    }

    const [existingCode] = await db.select({ id: productsTable.id }).from(productsTable)
      .where(and(eq(productsTable.companyId, cid), eq(productsTable.productCode, productCode)));
    if (existingCode) {
      res.status(409).json({ error: { code: "DUPLICATE_PRODUCT_CODE", message: "Bu ürün kodu bu şirkette zaten kullanılıyor", details: null } });
      return;
    }

    const [product] = await db.insert(productsTable).values({
      companyId: cid,
      productCode,
      barcode: barcode || null,
      name,
      brand: brand || null,
      category: category || null,
      description: description || null,
      stock: parseInt(stock),
      minStock: parseInt(minStock),
      purchasePrice: parseFloat(purchasePrice),
      salePrice: parseFloat(salePrice),
      profitPercent: parseFloat(String(finalProfitPercent)),
      discountSalePct: discountSalePct !== undefined && discountSalePct !== "" ? parseFloat(discountSalePct) : 0,
    }).returning();

    res.status(201).json(await formatProduct(product!));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: { code: "DUPLICATE_BARCODE_OR_CODE", message: "Ürün kodu veya barkod bu şirkette zaten kullanılıyor", details: null } });
      return;
    }
    req.log?.error({ err }, "Create product error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası oluştu", details: null } });
  }
});

// GET /api/products/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, cid)));
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }

    await db.insert(productViewsTable).values({ companyId: cid, productId: id });

    res.json(await formatProduct(product));
  } catch (err) {
    req.log?.error({ err }, "Get product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/products/:id
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const { productCode, barcode, name, brand, category, description, stock, minStock, purchasePrice, salePrice, profitPercent, discountSalePct } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (productCode !== undefined) updateData.productCode = productCode;
    if (name !== undefined) updateData.name = name;
    if (brand !== undefined) updateData.brand = brand;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (stock !== undefined) updateData.stock = parseInt(stock);
    if (minStock !== undefined) updateData.minStock = parseInt(minStock);
    if (barcode !== undefined) updateData.barcode = barcode || null;
    if (purchasePrice !== undefined) updateData.purchasePrice = parseFloat(purchasePrice);
    if (salePrice !== undefined) updateData.salePrice = parseFloat(salePrice);
    if (profitPercent !== undefined) {
      updateData.profitPercent = parseFloat(profitPercent);
    } else if (purchasePrice !== undefined && salePrice !== undefined) {
      updateData.profitPercent = calcProfitPercent(parseFloat(purchasePrice), parseFloat(salePrice));
    }
    if (discountSalePct !== undefined) {
      updateData.discountSalePct = discountSalePct !== "" ? parseFloat(String(discountSalePct)) : 0;
    }

    const [product] = await db.update(productsTable).set(updateData)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, cid)))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }
    res.json(await formatProduct(product));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Barkod veya ürün kodu zaten kullanılıyor" });
      return;
    }
    req.log?.error({ err }, "Update product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const [deleted] = await db.delete(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, cid)))
      .returning({ id: productsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }
    res.json({ message: "Ürün silindi" });
  } catch (err) {
    req.log?.error({ err }, "Delete product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
