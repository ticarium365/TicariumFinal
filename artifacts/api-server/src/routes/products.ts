import { Router, Request, Response } from "express";
import { db, productsTable, productViewsTable, salesTable } from "@workspace/db";
import { eq, like, ilike, and, lte, or, desc, asc, count, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

function calcProfitPercent(purchasePrice: number, salePrice: number): number {
  if (purchasePrice === 0) return 0;
  return ((salePrice - purchasePrice) / purchasePrice) * 100;
}

async function getViews30Days(productId: number): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [result] = await db
    .select({ count: count() })
    .from(productViewsTable)
    .where(
      and(
        eq(productViewsTable.productId, productId),
        gte(productViewsTable.viewedAt, thirtyDaysAgo)
      )
    );
  return result?.count ?? 0;
}

async function getSales30Days(productId: number): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)` })
    .from(salesTable)
    .where(
      and(
        eq(salesTable.productId, productId),
        gte(salesTable.createdAt, thirtyDaysAgo)
      )
    );
  return Number(result?.total ?? 0);
}

async function formatProduct(p: typeof productsTable.$inferSelect) {
  const [views, sales] = await Promise.all([
    getViews30Days(p.id),
    getSales30Days(p.id),
  ]);
  return {
    ...p,
    views30Days: views,
    sales30Days: sales,
  };
}

router.get("/categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const results = await db
      .selectDistinct({ category: productsTable.category })
      .from(productsTable)
      .where(sql`${productsTable.category} IS NOT NULL`)
      .orderBy(productsTable.category);
    res.json(results.map((r) => r.category).filter(Boolean));
  } catch (err) {
    req.log?.error({ err }, "List categories error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/brands", requireAuth, async (req: Request, res: Response) => {
  try {
    const results = await db
      .selectDistinct({ brand: productsTable.brand })
      .from(productsTable)
      .where(sql`${productsTable.brand} IS NOT NULL`)
      .orderBy(productsTable.brand);
    res.json(results.map((r) => r.brand).filter(Boolean));
  } catch (err) {
    req.log?.error({ err }, "List brands error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/generate-barcode", requireAuth, async (req: Request, res: Response) => {
  try {
    let barcode: string;
    let isUnique = false;
    do {
      barcode = String(Math.floor(100000000000 + Math.random() * 900000000000));
      const [existing] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(eq(productsTable.barcode, barcode));
      isUnique = !existing;
    } while (!isUnique);
    res.json({ barcode });
  } catch (err) {
    req.log?.error({ err }, "Generate barcode error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/generate-barcode", requireAuth, async (req: Request, res: Response) => {
  try {
    let barcode: string;
    let isUnique = false;
    do {
      barcode = String(Math.floor(100000000000 + Math.random() * 900000000000));
      const [existing] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(eq(productsTable.barcode, barcode));
      isUnique = !existing;
    } while (!isUnique);
    res.json({ barcode });
  } catch (err) {
    req.log?.error({ err }, "Generate barcode error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/barcode/:barcode", requireAuth, async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.barcode, barcode!));
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

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      brand,
      lowStock,
      sortBy = "name",
      sortOrder = "asc",
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    if (search) {
      const searchStr = `%${search}%`;
      conditions.push(
        or(
          ilike(productsTable.name, searchStr),
          ilike(productsTable.productCode, searchStr),
          ilike(productsTable.barcode, searchStr),
          ilike(productsTable.brand, searchStr),
          ilike(productsTable.category, searchStr)
        )
      );
    }

    if (category) {
      conditions.push(eq(productsTable.category, String(category)));
    }

    if (brand) {
      conditions.push(eq(productsTable.brand, String(brand)));
    }

    if (lowStock === "true") {
      conditions.push(lte(productsTable.stock, productsTable.minStock));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

    const [products, totalResult] = await Promise.all([
      db.select().from(productsTable)
        .where(whereClause)
        .orderBy(orderFn(orderColumn))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: count() }).from(productsTable).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const productIds = products.map((p) => p.id);

    const [viewCounts, saleCounts] = await Promise.all([
      productIds.length > 0
        ? db.select({
            productId: productViewsTable.productId,
            cnt: count(),
          })
          .from(productViewsTable)
          .where(
            and(
              sql`${productViewsTable.productId} = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]`)})`,
              gte(productViewsTable.viewedAt, thirtyDaysAgo)
            )
          )
          .groupBy(productViewsTable.productId)
        : Promise.resolve([]),
      productIds.length > 0
        ? db.select({
            productId: salesTable.productId,
            total: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)`,
          })
          .from(salesTable)
          .where(
            and(
              sql`${salesTable.productId} = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]`)})`,
              gte(salesTable.createdAt, thirtyDaysAgo)
            )
          )
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

    res.json({
      products: formatted,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "List products error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { productCode, barcode, name, brand, category, description, stock, minStock, purchasePrice, salePrice, profitPercent } = req.body;
    if (!productCode || !name || stock === undefined || minStock === undefined || purchasePrice === undefined || salePrice === undefined) {
      res.status(400).json({ error: "Bad Request", message: "Zorunlu alanlar eksik" });
      return;
    }

    const finalProfitPercent = profitPercent !== undefined
      ? profitPercent
      : calcProfitPercent(parseFloat(purchasePrice), parseFloat(salePrice));

    if (barcode) {
      const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.barcode, barcode));
      if (existing) {
        res.status(409).json({ error: "Conflict", message: "Bu barkod zaten kullanılıyor" });
        return;
      }
    }

    const [product] = await db.insert(productsTable).values({
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
    }).returning();

    res.status(201).json(await formatProduct(product!));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Ürün kodu veya barkod zaten kullanılıyor" });
      return;
    }
    req.log?.error({ err }, "Create product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }

    await db.insert(productViewsTable).values({ productId: id });

    res.json(await formatProduct(product));
  } catch (err) {
    req.log?.error({ err }, "Get product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const { productCode, barcode, name, brand, category, description, stock, minStock, purchasePrice, salePrice, profitPercent } = req.body;

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

    const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning();
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

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.json({ message: "Ürün silindi" });
  } catch (err) {
    req.log?.error({ err }, "Delete product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:id/quick-update", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const { stock, purchasePrice, salePrice, profitPercent } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (stock !== undefined) updateData.stock = parseInt(stock);
    if (purchasePrice !== undefined) updateData.purchasePrice = parseFloat(purchasePrice);
    if (salePrice !== undefined) updateData.salePrice = parseFloat(salePrice);
    if (profitPercent !== undefined) {
      updateData.profitPercent = parseFloat(profitPercent);
    } else if (purchasePrice !== undefined && salePrice !== undefined) {
      updateData.profitPercent = calcProfitPercent(parseFloat(purchasePrice), parseFloat(salePrice));
    }

    const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning();
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }
    res.json(await formatProduct(product));
  } catch (err) {
    req.log?.error({ err }, "Quick update product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
