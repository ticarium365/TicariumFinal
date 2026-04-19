import { Router, Request, Response } from "express";
import {
  db,
  companiesTable,
  b2bCatalogItemsTable,
  productsTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray, or, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod/v4";

const router = Router();
router.use(requireAuth);

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const itemInputSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(80).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  unit: z.string().max(20).default("adet"),
  listPrice: z.number().min(0).nullable().optional(),
  currency: z.string().max(8).default("TRY"),
  minOrderQty: z.number().positive().default(1),
  leadDays: z.number().int().nonnegative().nullable().optional(),
  imageUrl: z.string().max(500).optional().nullable(),
  isPublished: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  sourceProductId: z.number().int().positive().nullable().optional(),
});

router.get("/mine", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select()
      .from(b2bCatalogItemsTable)
      .where(eq(b2bCatalogItemsTable.companyId, companyId))
      .orderBy(asc(b2bCatalogItemsTable.sortOrder), desc(b2bCatalogItemsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "b2b catalog mine failed");
    res.status(500).json({ error: "Katalog alınamadı" });
  }
});

/**
 * GET /b2b/catalog/marketplace
 * Tüm tenantların yayınladığı (isPublished=true) B2B katalog ürünlerini
 * firma bilgisiyle birlikte döner. Cross-tenant — herhangi bir authenticated kullanıcı erişebilir.
 * Query: q (arama: ürün/firma), category, companyId, sort (new|price_asc|price_desc|name), limit, offset
 */
router.get("/marketplace", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const category = String(req.query.category ?? "").trim();
    const companyIdRaw = String(req.query.companyId ?? "").trim();
    const city = String(req.query.city ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const minOrderQtyRaw = String(req.query.minOrderQty ?? "").trim();
    const fastOnly = String(req.query.fastOnly ?? "") === "1" || String(req.query.fastOnly ?? "") === "true";
    const certifiedOnly = String(req.query.certifiedOnly ?? "") === "1" || String(req.query.certifiedOnly ?? "") === "true";
    const sort = String(req.query.sort ?? "new");
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    // Sprint I — Satınalma vitrin: SADECE onaylı (isPublished=true) VE
    // (bağlı kaynak ürün yoksa tablo doğrudan stoklu sayılır; varsa stok > 0)
    const stockOk = sql`(${b2bCatalogItemsTable.sourceProductId} IS NULL OR ${productsTable.stock} > 0)`;
    const conds: any[] = [eq(b2bCatalogItemsTable.isPublished, true), stockOk];
    if (q) {
      const like = `%${q}%`;
      conds.push(
        or(
          ilike(b2bCatalogItemsTable.name, like),
          ilike(b2bCatalogItemsTable.code, like),
          ilike(b2bCatalogItemsTable.description, like),
          ilike(b2bCatalogItemsTable.category, like),
          ilike(companiesTable.name, like),
          ilike(companiesTable.subdomain, like),
          ilike(productsTable.brand, like),
        )
      );
    }
    if (category) conds.push(eq(b2bCatalogItemsTable.category, category));
    const cid = parseId(companyIdRaw);
    if (cid) conds.push(eq(b2bCatalogItemsTable.companyId, cid));
    if (city) conds.push(ilike(companiesTable.city, city));
    if (brand) conds.push(ilike(productsTable.brand, brand));
    const minOq = Number(minOrderQtyRaw);
    if (Number.isFinite(minOq) && minOq > 0) {
      conds.push(sql`${b2bCatalogItemsTable.minOrderQty} <= ${minOq}`);
    }
    if (fastOnly) {
      // "Hızlı teslimat" — leadDays NULL ise hariç, ≤ 3 gün
      conds.push(sql`${b2bCatalogItemsTable.leadDays} IS NOT NULL AND ${b2bCatalogItemsTable.leadDays} <= 3`);
    }
    if (certifiedOnly) {
      conds.push(eq(companiesTable.isVerified, true));
    }

    const where = conds.length > 1 ? and(...conds) : conds[0];

    const orderBy =
      sort === "price_asc"
        ? [asc(sql`COALESCE(${b2bCatalogItemsTable.listPrice}, 999999999)`), desc(b2bCatalogItemsTable.createdAt)]
        : sort === "price_desc"
        ? [desc(sql`COALESCE(${b2bCatalogItemsTable.listPrice}, 0)`), desc(b2bCatalogItemsTable.createdAt)]
        : sort === "name"
        ? [asc(b2bCatalogItemsTable.name)]
        : [desc(b2bCatalogItemsTable.createdAt)];

    const rows = await db
      .select({
        id: b2bCatalogItemsTable.id,
        companyId: b2bCatalogItemsTable.companyId,
        name: b2bCatalogItemsTable.name,
        code: b2bCatalogItemsTable.code,
        description: b2bCatalogItemsTable.description,
        category: b2bCatalogItemsTable.category,
        unit: b2bCatalogItemsTable.unit,
        listPrice: b2bCatalogItemsTable.listPrice,
        currency: b2bCatalogItemsTable.currency,
        minOrderQty: b2bCatalogItemsTable.minOrderQty,
        leadDays: b2bCatalogItemsTable.leadDays,
        imageUrl: b2bCatalogItemsTable.imageUrl,
        createdAt: b2bCatalogItemsTable.createdAt,
        companyName: companiesTable.name,
        companySubdomain: companiesTable.subdomain,
        // Sprint I — yeni vitrin alanları (şehir, sertifika, marka, gerçek stok)
        companyCity: companiesTable.city,
        companyVerified: companiesTable.isVerified,
        productBrand: productsTable.brand,
        productStock: productsTable.stock,
      })
      .from(b2bCatalogItemsTable)
      .innerJoin(companiesTable, eq(b2bCatalogItemsTable.companyId, companiesTable.id))
      .leftJoin(productsTable, eq(productsTable.id, b2bCatalogItemsTable.sourceProductId))
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(b2bCatalogItemsTable)
      .innerJoin(companiesTable, eq(b2bCatalogItemsTable.companyId, companiesTable.id))
      .leftJoin(productsTable, eq(productsTable.id, b2bCatalogItemsTable.sourceProductId))
      .where(where);

    res.json({ items: rows, total, limit, offset });
  } catch (err) {
    req.log.error({ err }, "b2b catalog marketplace failed");
    res.status(500).json({ error: "Vitrin yüklenemedi" });
  }
});

/**
 * GET /b2b/catalog/marketplace/categories
 * Vitrinde kullanılan farklı kategori adları (filtre çipleri için).
 */
router.get("/marketplace/categories", async (_req: Request, res: Response) => {
  try {
    const stockOk = sql`(${b2bCatalogItemsTable.sourceProductId} IS NULL OR ${productsTable.stock} > 0)`;
    const rows = await db
      .selectDistinct({ category: b2bCatalogItemsTable.category })
      .from(b2bCatalogItemsTable)
      .leftJoin(productsTable, eq(productsTable.id, b2bCatalogItemsTable.sourceProductId))
      .where(and(eq(b2bCatalogItemsTable.isPublished, true), stockOk));
    const cats = rows
      .map((r) => r.category)
      .filter((c): c is string => !!c && c.trim().length > 0)
      .sort((a, b) => a.localeCompare(b, "tr"));
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: "Kategori listesi alınamadı" });
  }
});

/**
 * GET /b2b/catalog/marketplace/companies
 * Vitrinde ürünü bulunan firmaların kısa listesi (filtre çipleri için).
 */
/**
 * GET /b2b/catalog/marketplace/cities
 * Vitrinde aktif (onaylı + stoklu) ürünü olan firmaların farklı şehirleri.
 */
router.get("/marketplace/cities", async (_req: Request, res: Response) => {
  try {
    const stockOk = sql`(${b2bCatalogItemsTable.sourceProductId} IS NULL OR ${productsTable.stock} > 0)`;
    const rows = await db
      .selectDistinct({ city: companiesTable.city })
      .from(b2bCatalogItemsTable)
      .innerJoin(companiesTable, eq(b2bCatalogItemsTable.companyId, companiesTable.id))
      .leftJoin(productsTable, eq(productsTable.id, b2bCatalogItemsTable.sourceProductId))
      .where(and(eq(b2bCatalogItemsTable.isPublished, true), stockOk));
    const cities = rows
      .map((r) => r.city)
      .filter((c): c is string => !!c && c.trim().length > 0)
      .sort((a, b) => a.localeCompare(b, "tr"));
    res.json(cities);
  } catch (err) {
    res.status(500).json({ error: "Şehir listesi alınamadı" });
  }
});

/**
 * GET /b2b/catalog/marketplace/brands
 * Vitrinde aktif olan ürünlerin farklı markaları (products.brand).
 */
router.get("/marketplace/brands", async (_req: Request, res: Response) => {
  try {
    const stockOk = sql`(${b2bCatalogItemsTable.sourceProductId} IS NULL OR ${productsTable.stock} > 0)`;
    const rows = await db
      .selectDistinct({ brand: productsTable.brand })
      .from(b2bCatalogItemsTable)
      .leftJoin(productsTable, eq(productsTable.id, b2bCatalogItemsTable.sourceProductId))
      .where(and(eq(b2bCatalogItemsTable.isPublished, true), stockOk));
    const brands = rows
      .map((r) => r.brand)
      .filter((b): b is string => !!b && b.trim().length > 0)
      .sort((a, b) => a.localeCompare(b, "tr"));
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: "Marka listesi alınamadı" });
  }
});

router.get("/marketplace/companies", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .selectDistinct({
        id: companiesTable.id,
        name: companiesTable.name,
        subdomain: companiesTable.subdomain,
      })
      .from(b2bCatalogItemsTable)
      .innerJoin(companiesTable, eq(b2bCatalogItemsTable.companyId, companiesTable.id))
      .leftJoin(productsTable, eq(productsTable.id, b2bCatalogItemsTable.sourceProductId))
      .where(and(
        eq(b2bCatalogItemsTable.isPublished, true),
        sql`(${b2bCatalogItemsTable.sourceProductId} IS NULL OR ${productsTable.stock} > 0)`,
      ))
      .orderBy(asc(companiesTable.name));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Firma listesi alınamadı" });
  }
});

router.get("/by-subdomain/:subdomain", async (req: Request, res: Response) => {
  try {
    const sub = String(req.params.subdomain ?? "").toLowerCase();
    if (!sub) return res.status(400).json({ error: "Subdomain gerekli" });
    const [company] = await db
      .select({ id: companiesTable.id, name: companiesTable.name, subdomain: companiesTable.subdomain })
      .from(companiesTable)
      .where(eq(companiesTable.subdomain, sub))
      .limit(1);
    if (!company) return res.status(404).json({ error: "Firma bulunamadı" });
    const rows = await db
      .select()
      .from(b2bCatalogItemsTable)
      .where(and(eq(b2bCatalogItemsTable.companyId, company.id), eq(b2bCatalogItemsTable.isPublished, true)))
      .orderBy(asc(b2bCatalogItemsTable.sortOrder), desc(b2bCatalogItemsTable.createdAt));
    res.json({ company, items: rows });
  } catch (err) {
    req.log.error({ err }, "b2b catalog by-subdomain failed");
    res.status(500).json({ error: "Katalog alınamadı" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const parsed = itemInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Geçersiz veri", details: parsed.error.issues });
    }
    if (parsed.data.sourceProductId) {
      const [p] = await db
        .select({ id: productsTable.id, companyId: productsTable.companyId })
        .from(productsTable)
        .where(eq(productsTable.id, parsed.data.sourceProductId))
        .limit(1);
      if (!p || p.companyId !== companyId) {
        return res.status(400).json({ error: "Kaynak ürün geçersiz" });
      }
    }
    const [created] = await db
      .insert(b2bCatalogItemsTable)
      .values({
        companyId,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        description: parsed.data.description ?? null,
        category: parsed.data.category ?? null,
        unit: parsed.data.unit,
        listPrice: parsed.data.listPrice ?? null,
        currency: parsed.data.currency,
        minOrderQty: parsed.data.minOrderQty,
        leadDays: parsed.data.leadDays ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        isPublished: parsed.data.isPublished,
        sortOrder: parsed.data.sortOrder,
        sourceProductId: parsed.data.sourceProductId ?? null,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "b2b catalog create failed");
    res.status(500).json({ error: "Katalog kalemi oluşturulamadı" });
  }
});

router.post("/import-from-products", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const schema = z.object({ productIds: z.array(z.number().int().positive()).min(1).max(200) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Geçersiz veri" });
    const toImport = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.companyId, companyId), inArray(productsTable.id, parsed.data.productIds)));
    if (toImport.length === 0) return res.status(400).json({ error: "İçeri aktarılacak ürün yok" });

    const existing = await db
      .select({ sourceProductId: b2bCatalogItemsTable.sourceProductId })
      .from(b2bCatalogItemsTable)
      .where(and(eq(b2bCatalogItemsTable.companyId, companyId), inArray(b2bCatalogItemsTable.sourceProductId, parsed.data.productIds)));
    const existingSet = new Set(existing.map((e) => e.sourceProductId).filter((x): x is number => x != null));
    const fresh = toImport.filter((p) => !existingSet.has(p.id));
    if (fresh.length === 0) return res.json({ ok: true, inserted: 0, skipped: toImport.length });

    await db.insert(b2bCatalogItemsTable).values(
      fresh.map((p, idx) => ({
        companyId,
        sourceProductId: p.id,
        name: p.name,
        code: p.productCode,
        description: p.description ?? null,
        category: p.category ?? null,
        unit: "adet",
        listPrice: p.salePrice && p.salePrice > 0 ? p.salePrice : null,
        currency: "TRY",
        minOrderQty: 1,
        sortOrder: idx,
        isPublished: true,
      }))
    );
    res.json({ ok: true, inserted: fresh.length, skipped: toImport.length - fresh.length });
  } catch (err) {
    req.log.error({ err }, "b2b catalog import failed");
    res.status(500).json({ error: "İçeri aktarma başarısız" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Geçersiz id" });
    const parsed = itemInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Geçersiz veri" });
    const patch: Record<string, any> = { ...parsed.data, updatedAt: new Date() };
    delete patch.sourceProductId;
    const updated = await db
      .update(b2bCatalogItemsTable)
      .set(patch)
      .where(and(eq(b2bCatalogItemsTable.id, id), eq(b2bCatalogItemsTable.companyId, companyId)))
      .returning();
    if (updated.length === 0) return res.status(404).json({ error: "Kalem bulunamadı" });
    res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "b2b catalog update failed");
    res.status(500).json({ error: "Güncellenemedi" });
  }
});

router.post("/:id/toggle", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Geçersiz id" });
    const [item] = await db
      .select({ isPublished: b2bCatalogItemsTable.isPublished })
      .from(b2bCatalogItemsTable)
      .where(and(eq(b2bCatalogItemsTable.id, id), eq(b2bCatalogItemsTable.companyId, companyId)))
      .limit(1);
    if (!item) return res.status(404).json({ error: "Kalem bulunamadı" });
    await db
      .update(b2bCatalogItemsTable)
      .set({ isPublished: !item.isPublished, updatedAt: new Date() })
      .where(and(eq(b2bCatalogItemsTable.id, id), eq(b2bCatalogItemsTable.companyId, companyId)));
    res.json({ ok: true, isPublished: !item.isPublished });
  } catch (err) {
    req.log.error({ err }, "b2b catalog toggle failed");
    res.status(500).json({ error: "Güncellenemedi" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Geçersiz id" });
    const deleted = await db
      .delete(b2bCatalogItemsTable)
      .where(and(eq(b2bCatalogItemsTable.id, id), eq(b2bCatalogItemsTable.companyId, companyId)))
      .returning({ id: b2bCatalogItemsTable.id });
    if (deleted.length === 0) return res.status(404).json({ error: "Kalem bulunamadı" });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "b2b catalog delete failed");
    res.status(500).json({ error: "Silinemedi" });
  }
});

export default router;
