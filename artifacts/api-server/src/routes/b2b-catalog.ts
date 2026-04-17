import { Router, Request, Response } from "express";
import {
  db,
  companiesTable,
  b2bCatalogItemsTable,
  productsTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
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
