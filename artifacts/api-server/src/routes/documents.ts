import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  documentsTable,
  documentCategoriesTable,
} from "@workspace/db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ─── Zod şemaları ─────────────────────────────────────────────────────────────

const CreateCategoryBody = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#6366f1"),
});

const CreateDocumentBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
  objectPath: z.string().min(1),
  categoryId: z.number().int().optional(),
  entityType: z.string().optional(),
  entityId: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional().default(false),
});

// ─── KATEGORİLER ─────────────────────────────────────────────────────────────

// GET /documents/categories
router.get("/documents/categories", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const rows = await db
      .select()
      .from(documentCategoriesTable)
      .where(eq(documentCategoriesTable.companyId, companyId))
      .orderBy(documentCategoriesTable.name);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "categories list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /documents/categories
router.post("/documents/categories", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  try {
    const [cat] = await db.insert(documentCategoriesTable).values({
      companyId,
      ...parsed.data,
    }).returning();
    res.status(201).json(cat);
  } catch (err) {
    req.log.error({ err }, "category create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /documents/categories/:id
router.put("/documents/categories/:id", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const parsed = CreateCategoryBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db.update(documentCategoriesTable)
      .set(parsed.data)
      .where(and(eq(documentCategoriesTable.id, id), eq(documentCategoriesTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "category update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /documents/categories/:id
router.delete("/documents/categories/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    // Kategori silince evrakların categoryId'sini NULL yap
    await db.update(documentsTable)
      .set({ categoryId: null })
      .where(and(eq(documentsTable.categoryId, id), eq(documentsTable.companyId, companyId)));
    await db.delete(documentCategoriesTable)
      .where(and(eq(documentCategoriesTable.id, id), eq(documentCategoriesTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "category delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─── EVRAKLAR ─────────────────────────────────────────────────────────────────

// GET /documents — liste (filtreli)
router.get("/documents", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const {
    search, categoryId, entityType, entityId, page = "1", limit = "20",
  } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * pageSize;

  try {
    const conditions = [eq(documentsTable.companyId, companyId)];
    if (search) conditions.push(ilike(documentsTable.name, `%${search}%`));
    if (categoryId) conditions.push(eq(documentsTable.categoryId, parseInt(categoryId, 10)));
    if (entityType) conditions.push(eq(documentsTable.entityType, entityType));
    if (entityId) conditions.push(eq(documentsTable.entityId, parseInt(entityId, 10)));

    const [rows, totalRes] = await Promise.all([
      db.select().from(documentsTable)
        .where(and(...conditions))
        .orderBy(desc(documentsTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(documentsTable)
        .where(and(...conditions)),
    ]);

    const documents = rows.map((doc) => ({
      ...doc,
      tags: doc.tags ? JSON.parse(doc.tags) : [],
    }));

    res.json({ documents, total: totalRes[0].count, page: pageNum, limit: pageSize });
  } catch (err) {
    req.log.error({ err }, "documents list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /documents/:id
router.get("/documents/:id", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [doc] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));
    if (!doc) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json({ ...doc, tags: doc.tags ? JSON.parse(doc.tags) : [] });
  } catch (err) {
    req.log.error({ err }, "document get error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /documents — DB kaydı oluştur (GCS yüklemesi zaten tamamlandı)
router.post("/documents", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const userId = (req as any).user?.id as number | undefined;
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  const { tags, ...rest } = parsed.data;
  try {
    const [doc] = await db.insert(documentsTable).values({
      companyId,
      uploadedBy: userId,
      tags: tags ? JSON.stringify(tags) : null,
      ...rest,
    }).returning();
    res.status(201).json({ ...doc, tags: doc.tags ? JSON.parse(doc.tags) : [] });
  } catch (err) {
    req.log.error({ err }, "document create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /documents/:id
router.put("/documents/:id", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const UpdateBody = CreateDocumentBody.pick({
    name: true, description: true, categoryId: true, entityType: true, entityId: true, tags: true, isPublic: true,
  }).partial();
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  const { tags, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (tags !== undefined) updateData.tags = JSON.stringify(tags);
  try {
    const [updated] = await db.update(documentsTable)
      .set(updateData)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json({ ...updated, tags: updated.tags ? JSON.parse(updated.tags) : [] });
  } catch (err) {
    req.log.error({ err }, "document update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /documents/:id
router.delete("/documents/:id", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [doc] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));
    if (!doc) { res.status(404).json({ error: "Bulunamadı" }); return; }

    await db.delete(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "document delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /documents/:id/download — redirect to object storage URL
router.get("/documents/:id/download", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const { Readable } = await import("stream");
  try {
    const [doc] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));
    if (!doc) { res.status(404).json({ error: "Bulunamadı" }); return; }

    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const response = await objectStorageService.downloadObject(objectFile, 300);

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
    res.status(response.status);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    req.log.error({ err }, "document download error");
    res.status(500).json({ error: "İndirme başarısız" });
  }
});

export default router;
