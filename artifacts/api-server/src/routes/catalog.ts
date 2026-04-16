import { Router, Request, Response } from "express";
import { db, productsTable } from "@workspace/db";
import { ilike, and, eq, or, asc, desc, count, sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { search, category, brand, sortBy = "name", sortOrder = "asc", page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(productsTable.companyId, cid)];

    if (search) {
      const searchStr = `%${search}%`;
      conditions.push(
        or(
          ilike(productsTable.name, searchStr),
          ilike(productsTable.productCode, searchStr),
          ilike(productsTable.brand, searchStr),
          ilike(productsTable.category, searchStr)
        )
      );
    }
    if (category) conditions.push(eq(productsTable.category, String(category)));
    if (brand) conditions.push(eq(productsTable.brand, String(brand)));

    const whereClause = and(...conditions);

    const orderColumn = {
      name: productsTable.name,
      productCode: productsTable.productCode,
      salePrice: productsTable.salePrice,
      category: productsTable.category,
    }[String(sortBy)] ?? productsTable.name;

    const orderFn = sortOrder === "desc" ? desc : asc;

    const selectFields = {
      id: productsTable.id,
      productCode: productsTable.productCode,
      name: productsTable.name,
      brand: productsTable.brand,
      category: productsTable.category,
      description: productsTable.description,
      stock: productsTable.stock,
      minStock: productsTable.minStock,
      salePrice: productsTable.salePrice,
      barcode: productsTable.barcode,
    };

    const [products, totalResult, categories, brands] = await Promise.all([
      db.select(selectFields).from(productsTable).where(whereClause).orderBy(orderFn(orderColumn)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(productsTable).where(whereClause),
      db.selectDistinct({ category: productsTable.category }).from(productsTable)
        .where(and(eq(productsTable.companyId, cid), sql`${productsTable.category} IS NOT NULL`))
        .orderBy(productsTable.category),
      db.selectDistinct({ brand: productsTable.brand }).from(productsTable)
        .where(and(eq(productsTable.companyId, cid), sql`${productsTable.brand} IS NOT NULL`))
        .orderBy(productsTable.brand),
    ]);

    const total = totalResult[0]?.count ?? 0;

    res.json({
      products,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      categories: categories.map((c) => c.category).filter(Boolean),
      brands: brands.map((b) => b.brand).filter(Boolean),
    });
  } catch (err) {
    req.log?.error({ err }, "Catalog list error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const [product] = await db
      .select({
        id: productsTable.id,
        productCode: productsTable.productCode,
        name: productsTable.name,
        brand: productsTable.brand,
        category: productsTable.category,
        description: productsTable.description,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
        salePrice: productsTable.salePrice,
        barcode: productsTable.barcode,
      })
      .from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, cid)));

    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }

    res.json(product);
  } catch (err) {
    req.log?.error({ err }, "Catalog get product error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
