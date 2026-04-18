import { Router, Request, Response } from "express";
import { db, productsTable, productViewsTable, salesTable } from "@workspace/db";
import { eq, ilike, and, lte, or, desc, asc, count, gte, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { audit } from "../lib/audit.js";
import multer from "multer";
import * as XLSX from "xlsx";

const router = Router();

// Multer: bellekte tut, diske yazma (max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Yalnızca .xlsx, .xls veya .csv dosyaları kabul edilir") as any, ok);
  },
});

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
      .where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true), sql`${productsTable.category} IS NOT NULL`))
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
      .where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true), sql`${productsTable.brand} IS NOT NULL`))
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
        eq(productsTable.isActive, true),
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

    const conditions: any[] = [eq(productsTable.companyId, cid), eq(productsTable.isActive, true)];

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

// GET /api/products/import-template — indirilebilir boş Excel şablonu
router.get("/import-template", requireAuth, async (_req: Request, res: Response) => {
  const headers = [
    "Ürün Kodu", "Barkod", "Ürün Adı", "Marka", "Kategori",
    "Açıklama", "Stok", "Min. Stok", "Alış Fiyatı (TL)", "Satış Fiyatı (TL)", "İndirim (%)",
  ];
  const example = [
    "URUN-001", "1234567890123", "Örnek Ürün", "Marka A", "Kategori B",
    "Ürün açıklaması", 10, 2, 50.00, 100.00, 0,
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = [
    { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 18 },
    { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ürünler");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="urun-import-sablonu.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// POST /api/products/import — Excel/CSV içe aktar (admin zorunlu)
router.post(
  "/import",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const cid = req.companyId;
      const mode = (req.body.mode as string) ?? "skip"; // "skip" | "update"

      if (!req.file) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Dosya yüklenmedi", details: null } });
        return;
      }

      // Excel / CSV parse
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Dosya boş ya da geçersiz format", details: null } });
        return;
      }

      // Sütun eşleme (hem Türkçe hem İngilizce sütun adlarını kabul et)
      function col(row: Record<string, unknown>, ...keys: string[]): string {
        for (const k of keys) {
          const v = row[k];
          if (v !== undefined && v !== "") return String(v).trim();
        }
        return "";
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const errors: { row: number; message: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2; // Excel satır numarası (1-indexed header + 1)

        const productCode = col(row, "Ürün Kodu", "productCode", "urun_kodu", "Product Code");
        const name = col(row, "Ürün Adı", "name", "urun_adi", "Product Name");
        const barcode = col(row, "Barkod", "barcode") || null;
        const brand = col(row, "Marka", "brand") || null;
        const category = col(row, "Kategori", "category") || null;
        const description = col(row, "Açıklama", "description") || null;
        const stockRaw = col(row, "Stok", "stock");
        const minStockRaw = col(row, "Min. Stok", "minStock", "min_stock");
        const purchasePriceRaw = col(row, "Alış Fiyatı (TL)", "purchasePrice", "alis_fiyati");
        const salePriceRaw = col(row, "Satış Fiyatı (TL)", "salePrice", "satis_fiyati");
        const discountRaw = col(row, "İndirim (%)", "discountSalePct", "indirim");

        // Zorunlu alan kontrolü
        if (!productCode) { errors.push({ row: rowNum, message: "Ürün Kodu boş" }); skipped++; continue; }
        if (!name) { errors.push({ row: rowNum, message: `'${productCode}': Ürün Adı boş` }); skipped++; continue; }

        const stock = parseInt(stockRaw) || 0;
        const minStock = parseInt(minStockRaw) || 0;
        const purchasePrice = parseFloat(purchasePriceRaw.replace(",", ".")) || 0;
        const salePrice = parseFloat(salePriceRaw.replace(",", ".")) || 0;
        const discountSalePct = parseFloat(discountRaw.replace(",", ".")) || 0;

        if (salePrice <= 0) { errors.push({ row: rowNum, message: `'${productCode}': Satış Fiyatı geçersiz` }); skipped++; continue; }

        const profitPercent = calcProfitPercent(purchasePrice, salePrice);

        try {
          // Mevcut ürünü kontrol et (bu şirkette aynı ürün kodu)
          const [existing] = await db.select({ id: productsTable.id, isActive: productsTable.isActive })
            .from(productsTable)
            .where(and(eq(productsTable.companyId, cid), eq(productsTable.productCode, productCode)));

          if (existing) {
            if (mode === "update") {
              // Barkod çakışma kontrolü (başka ürüne ait barkod mu?)
              if (barcode) {
                const [barcodeConflict] = await db.select({ id: productsTable.id })
                  .from(productsTable)
                  .where(and(eq(productsTable.companyId, cid), eq(productsTable.barcode, barcode)));
                if (barcodeConflict && barcodeConflict.id !== existing.id) {
                  errors.push({ row: rowNum, message: `'${productCode}': Barkod başka ürüne ait` });
                  skipped++;
                  continue;
                }
              }
              await db.update(productsTable)
                .set({ name, barcode, brand, category, description, stock, minStock, purchasePrice, salePrice, profitPercent, discountSalePct, isActive: true, updatedAt: new Date() })
                .where(eq(productsTable.id, existing.id));
              updated++;
            } else {
              // mode=skip
              errors.push({ row: rowNum, message: `'${productCode}': Zaten mevcut, atlandı` });
              skipped++;
            }
          } else {
            // Barkod çakışma kontrolü
            if (barcode) {
              const [barcodeConflict] = await db.select({ id: productsTable.id })
                .from(productsTable)
                .where(and(eq(productsTable.companyId, cid), eq(productsTable.barcode, barcode)));
              if (barcodeConflict) {
                errors.push({ row: rowNum, message: `'${productCode}': Barkod başka ürüne ait` });
                skipped++;
                continue;
              }
            }
            await db.insert(productsTable).values({
              companyId: cid, productCode, name, barcode, brand, category, description,
              stock, minStock, purchasePrice, salePrice, profitPercent, discountSalePct,
            });
            imported++;
          }
        } catch (rowErr: any) {
          req.log?.error({ rowErr, rowNum }, "Import row error");
          errors.push({ row: rowNum, message: `'${productCode}': Beklenmeyen hata` });
          skipped++;
        }
      }

      res.json({ imported, updated, skipped, total: rows.length, errors });
    } catch (err) {
      req.log?.error({ err }, "Import products error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası oluştu", details: null } });
    }
  }
);

// GET /api/products
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { search, category, brand, lowStock, sortBy = "name", sortOrder = "asc", page = 1, limit = 50, showInactive } = req.query;

    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    // showInactive=true yalnızca admin/super_admin için geçerlidir
    const role = req.session?.user?.role;
    const canSeeInactive = showInactive === "true" && (role === "admin" || role === "super_admin");
    const conditions: any[] = [eq(productsTable.companyId, cid)];
    if (!canSeeInactive) conditions.push(eq(productsTable.isActive, true));

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
    await audit({ req, action: "PRODUCT_UPDATE", entity: "product", entityId: product.id,
      details: { productCode: product.productCode, name: product.name, changes: Object.keys(updateData) } });
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

// DELETE /api/products/:id  — soft delete (isActive=false)
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const [deactivated] = await db.update(productsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, cid), eq(productsTable.isActive, true)))
      .returning({ id: productsTable.id });
    if (!deactivated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Ürün bulunamadı veya zaten silinmiş", details: null } });
      return;
    }
    await audit({ req, action: "PRODUCT_DELETE", entity: "product", entityId: deactivated.id });
    res.json({ message: "Ürün silindi" });
  } catch (err) {
    req.log?.error({ err }, "Delete product error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası oluştu", details: null } });
  }
});

// PATCH /api/products/:id/restore  — soft-deleted ürünü geri yükle (admin+)
router.patch("/:id/restore", requireAuth, async (req: Request, res: Response) => {
  try {
    const role = req.session?.user?.role;
    if (role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bu işlem için yetkiniz yok", details: null } });
      return;
    }
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const [restored] = await db.update(productsTable)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(productsTable.id, id), eq(productsTable.companyId, cid), eq(productsTable.isActive, false)))
      .returning({ id: productsTable.id });
    if (!restored) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Silinmiş ürün bulunamadı", details: null } });
      return;
    }
    res.json({ message: "Ürün geri yüklendi" });
  } catch (err) {
    req.log?.error({ err }, "Restore product error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası oluştu", details: null } });
  }
});

export default router;
