import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  financeDocumentsTable,
  financeDocFoldersTable,
  financeDocMailboxesTable,
  suppliersTable,
  customersTable,
  usersTable,
  FINANCE_DOC_TYPES,
  FINANCE_DOC_STATUSES,
  FINANCE_DOC_SOURCES,
  type FinanceDocType,
  type FinanceDocStatus,
} from "@workspace/db";
import {
  expensesTable,
  expenseCategoriesTable,
  purchasesTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte, lte, ilike, or, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import OpenAI from "openai";
// pdf-parse: tree-shake için lazy import (CJS, runtime)
async function pdfParseLazy(buffer: Buffer): Promise<{ text: string }> {
  // @ts-ignore
  const mod: any = await import("pdf-parse");
  const fn = mod?.default ?? mod;
  return fn(buffer);
}

const router: IRouter = Router();
router.use(requireAuth);

const objectStorage = new ObjectStorageService();

// Maskeli secret yardımcısı (mailbox ayarları için)
const SECRET_MASK = "********";
function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  return SECRET_MASK;
}

// Encrypt-at-rest (Sprint 70) — imapPassword AES-256-GCM ile saklanır.
// IMAP poll worker decrypt etmek için secret-crypto.decryptString kullanmalı.
import { encryptString as _encryptSecret } from "../lib/secret-crypto.js";

// ─────────────────────────────────────────────────────────────────────────────
// META — sabit listeler (frontend dropdown'ları için)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/meta", (_req: Request, res: Response) => {
  res.json({
    docTypes: FINANCE_DOC_TYPES,
    statuses: FINANCE_DOC_STATUSES,
    sources: FINANCE_DOC_SOURCES,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// İSTATİSTİKLER — sol menü/dashboard için
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;

    const byStatus = await db
      .select({
        status: financeDocumentsTable.status,
        count: count(),
      })
      .from(financeDocumentsTable)
      .where(eq(financeDocumentsTable.companyId, companyId))
      .groupBy(financeDocumentsTable.status);

    const byType = await db
      .select({
        docType: financeDocumentsTable.docType,
        count: count(),
      })
      .from(financeDocumentsTable)
      .where(eq(financeDocumentsTable.companyId, companyId))
      .groupBy(financeDocumentsTable.docType);

    const totals = await db
      .select({
        total: count(),
        totalAmount: sql<string>`COALESCE(SUM(${financeDocumentsTable.totalAmount}), 0)`,
      })
      .from(financeDocumentsTable)
      .where(eq(financeDocumentsTable.companyId, companyId));

    const statusMap: Record<string, number> = {};
    for (const s of FINANCE_DOC_STATUSES) statusMap[s] = 0;
    for (const r of byStatus) statusMap[r.status] = Number(r.count);

    const typeMap: Record<string, number> = {};
    for (const t of FINANCE_DOC_TYPES) typeMap[t] = 0;
    for (const r of byType) typeMap[r.docType] = Number(r.count);

    res.json({
      total: Number(totals[0]?.total ?? 0),
      totalAmount: totals[0]?.totalAmount ?? "0",
      byStatus: statusMap,
      byType: typeMap,
    });
  } catch (e) {
    console.error("[finance-documents/stats]", e);
    res.status(500).json({ error: "stats failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// KLASÖRLER — list/create/update/delete
// ─────────────────────────────────────────────────────────────────────────────
router.get("/folders", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const folders = await db
      .select()
      .from(financeDocFoldersTable)
      .where(eq(financeDocFoldersTable.companyId, companyId))
      .orderBy(financeDocFoldersTable.sortOrder, financeDocFoldersTable.name);
    res.json(folders);
  } catch (e) {
    console.error("[finance-documents/folders GET]", e);
    res.status(500).json({ error: "list failed" });
  }
});

// Yardımcı: parent klasörün aynı tenant'a ait olduğunu doğrula
async function assertSameTenantFolder(folderId: number, companyId: number): Promise<boolean> {
  const [r] = await db
    .select({ id: financeDocFoldersTable.id })
    .from(financeDocFoldersTable)
    .where(
      and(
        eq(financeDocFoldersTable.id, folderId),
        eq(financeDocFoldersTable.companyId, companyId),
      ),
    )
    .limit(1);
  return !!r;
}

router.post("/folders", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const { name, color, icon, parentId, sortOrder } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "name required" });

    if (parentId != null) {
      const ok = await assertSameTenantFolder(Number(parentId), companyId);
      if (!ok) return res.status(400).json({ error: "invalid parentId" });
    }

    const [created] = await db
      .insert(financeDocFoldersTable)
      .values({
        companyId,
        name: name.trim(),
        color: color || "#6366f1",
        icon: icon || null,
        parentId: parentId ?? null,
        sortOrder: sortOrder ?? 0,
      })
      .returning();
    res.status(201).json(created);
  } catch (e) {
    console.error("[finance-documents/folders POST]", e);
    res.status(500).json({ error: "create failed" });
  }
});

router.put("/folders/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);
    const { name, color, icon, parentId, sortOrder } = req.body ?? {};

    if (parentId != null) {
      if (Number(parentId) === id) {
        return res.status(400).json({ error: "parentId cannot equal own id" });
      }
      const ok = await assertSameTenantFolder(Number(parentId), companyId);
      if (!ok) return res.status(400).json({ error: "invalid parentId" });
    }

    const [updated] = await db
      .update(financeDocFoldersTable)
      .set({
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      })
      .where(
        and(
          eq(financeDocFoldersTable.id, id),
          eq(financeDocFoldersTable.companyId, companyId),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  } catch (e) {
    console.error("[finance-documents/folders PUT]", e);
    res.status(500).json({ error: "update failed" });
  }
});

router.delete("/folders/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);

    // Bu klasördeki belgeleri "klasörsüz" yap (silmiyoruz!)
    await db
      .update(financeDocumentsTable)
      .set({ folderId: null })
      .where(
        and(
          eq(financeDocumentsTable.companyId, companyId),
          eq(financeDocumentsTable.folderId, id),
        ),
      );

    const [del] = await db
      .delete(financeDocFoldersTable)
      .where(
        and(
          eq(financeDocFoldersTable.id, id),
          eq(financeDocFoldersTable.companyId, companyId),
        ),
      )
      .returning();

    if (!del) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[finance-documents/folders DELETE]", e);
    res.status(500).json({ error: "delete failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD — 2 adımlı:
//  1) POST /upload-url → signed PUT URL döner (frontend GCS'e direkt yükler)
//  2) POST /            → DB satırını oluşturur (objectPath ile)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/upload-url", async (_req: Request, res: Response) => {
  try {
    const url = await objectStorage.getObjectEntityUploadURL();
    res.json({ uploadURL: url });
  } catch (e) {
    console.error("[finance-documents/upload-url]", e);
    res.status(500).json({ error: "upload url failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LİSTE — filtreler: status, docType, folderId, supplierId, customerId,
//                    search (title/originalName/documentNumber/partyName),
//                    dateFrom, dateTo, source, isFavorite
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const {
      status, docType, folderId, supplierId, customerId,
      search, dateFrom, dateTo, source, isFavorite,
      limit = "50", offset = "0",
    } = req.query as Record<string, string | undefined>;

    const conditions = [eq(financeDocumentsTable.companyId, companyId)];

    if (status && (FINANCE_DOC_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(financeDocumentsTable.status, status));
    }
    if (docType && (FINANCE_DOC_TYPES as readonly string[]).includes(docType)) {
      conditions.push(eq(financeDocumentsTable.docType, docType));
    }
    if (folderId === "null") {
      conditions.push(sql`${financeDocumentsTable.folderId} IS NULL`);
    } else if (folderId) {
      conditions.push(eq(financeDocumentsTable.folderId, Number(folderId)));
    }
    if (supplierId) conditions.push(eq(financeDocumentsTable.supplierId, Number(supplierId)));
    if (customerId) conditions.push(eq(financeDocumentsTable.customerId, Number(customerId)));
    if (source && (FINANCE_DOC_SOURCES as readonly string[]).includes(source)) {
      conditions.push(eq(financeDocumentsTable.source, source));
    }
    if (isFavorite === "true") conditions.push(eq(financeDocumentsTable.isFavorite, true));
    if (dateFrom) conditions.push(gte(financeDocumentsTable.documentDate, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(financeDocumentsTable.documentDate, new Date(dateTo)));

    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(financeDocumentsTable.title, q),
          ilike(financeDocumentsTable.originalName, q),
          ilike(financeDocumentsTable.documentNumber, q),
          ilike(financeDocumentsTable.partyName, q),
          ilike(financeDocumentsTable.description, q),
        )!,
      );
    }

    const lim = Math.min(Math.max(Number(limit), 1), 200);
    const off = Math.max(Number(offset), 0);

    const rows = await db
      .select({
        id: financeDocumentsTable.id,
        folderId: financeDocumentsTable.folderId,
        fileName: financeDocumentsTable.fileName,
        originalName: financeDocumentsTable.originalName,
        mimeType: financeDocumentsTable.mimeType,
        fileSize: financeDocumentsTable.fileSize,
        objectPath: financeDocumentsTable.objectPath,
        docType: financeDocumentsTable.docType,
        status: financeDocumentsTable.status,
        source: financeDocumentsTable.source,
        title: financeDocumentsTable.title,
        description: financeDocumentsTable.description,
        documentNumber: financeDocumentsTable.documentNumber,
        documentDate: financeDocumentsTable.documentDate,
        dueDate: financeDocumentsTable.dueDate,
        supplierId: financeDocumentsTable.supplierId,
        supplierName: suppliersTable.name,
        customerId: financeDocumentsTable.customerId,
        customerName: customersTable.name,
        partyName: financeDocumentsTable.partyName,
        partyTaxNumber: financeDocumentsTable.partyTaxNumber,
        subtotal: financeDocumentsTable.subtotal,
        vatAmount: financeDocumentsTable.vatAmount,
        totalAmount: financeDocumentsTable.totalAmount,
        currency: financeDocumentsTable.currency,
        tags: financeDocumentsTable.tags,
        isFavorite: financeDocumentsTable.isFavorite,
        hasOcr: financeDocumentsTable.hasOcr,
        convertedToType: financeDocumentsTable.convertedToType,
        convertedToId: financeDocumentsTable.convertedToId,
        createdAt: financeDocumentsTable.createdAt,
        updatedAt: financeDocumentsTable.updatedAt,
      })
      .from(financeDocumentsTable)
      .leftJoin(suppliersTable, eq(suppliersTable.id, financeDocumentsTable.supplierId))
      .leftJoin(customersTable, eq(customersTable.id, financeDocumentsTable.customerId))
      .where(and(...conditions))
      .orderBy(desc(financeDocumentsTable.createdAt))
      .limit(lim)
      .offset(off);

    res.json(rows);
  } catch (e) {
    console.error("[finance-documents GET]", e);
    res.status(500).json({ error: "list failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — upload sonrası DB kaydı
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const userId = req.session?.userId;
    const {
      uploadURL,            // signed URL (normalize edilecek)
      objectPath: rawPath,  // veya direkt path
      originalName,
      mimeType,
      fileSize,
      docType = "diger",
      folderId,
      title,
      description,
      documentNumber,
      documentDate,
      dueDate,
      supplierId,
      customerId,
      partyName,
      partyTaxNumber,
      subtotal,
      vatAmount,
      totalAmount,
      currency = "TRY",
      tags,
      source = "manual",
    } = req.body ?? {};

    if (!originalName || !mimeType || fileSize == null) {
      return res.status(400).json({ error: "originalName, mimeType, fileSize required" });
    }
    const inputPath = uploadURL || rawPath;
    if (!inputPath) {
      return res.status(400).json({ error: "uploadURL or objectPath required" });
    }

    const objectPath = objectStorage.normalizeObjectEntityPath(inputPath);

    // Tipi/durumu doğrula
    const safeType: FinanceDocType =
      (FINANCE_DOC_TYPES as readonly string[]).includes(docType)
        ? (docType as FinanceDocType)
        : "diger";

    // Tarih alanlarını güvenli parse
    const parseDate = (v: unknown) => {
      if (!v) return null;
      const d = new Date(v as string);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // Folder cross-tenant kontrolü
    if (folderId) {
      const f = await db
        .select({ id: financeDocFoldersTable.id })
        .from(financeDocFoldersTable)
        .where(
          and(
            eq(financeDocFoldersTable.id, Number(folderId)),
            eq(financeDocFoldersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!f.length) return res.status(400).json({ error: "invalid folderId" });
    }

    // Supplier/Customer cross-tenant kontrolü
    if (supplierId) {
      const s = await db
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(and(eq(suppliersTable.id, Number(supplierId)), eq(suppliersTable.companyId, companyId)))
        .limit(1);
      if (!s.length) return res.status(400).json({ error: "invalid supplierId" });
    }
    if (customerId) {
      const c = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(and(eq(customersTable.id, Number(customerId)), eq(customersTable.companyId, companyId)))
        .limit(1);
      if (!c.length) return res.status(400).json({ error: "invalid customerId" });
    }

    const fileName = objectPath.split("/").pop() || originalName;

    const [created] = await db
      .insert(financeDocumentsTable)
      .values({
        companyId,
        folderId: folderId ?? null,
        fileName,
        originalName,
        mimeType,
        fileSize: Number(fileSize),
        objectPath,
        docType: safeType,
        status: "yeni",
        source: (FINANCE_DOC_SOURCES as readonly string[]).includes(source) ? source : "manual",
        title: title ?? null,
        description: description ?? null,
        documentNumber: documentNumber ?? null,
        documentDate: parseDate(documentDate),
        dueDate: parseDate(dueDate),
        supplierId: supplierId ?? null,
        customerId: customerId ?? null,
        partyName: partyName ?? null,
        partyTaxNumber: partyTaxNumber ?? null,
        subtotal: subtotal ?? null,
        vatAmount: vatAmount ?? null,
        totalAmount: totalAmount ?? null,
        currency,
        tags: Array.isArray(tags) ? tags : [],
        uploadedBy: userId ?? null,
      })
      .returning();

    res.status(201).json(created);
  } catch (e) {
    console.error("[finance-documents POST]", e);
    res.status(500).json({ error: "create failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DETAY — signed download URL ile
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);

    const [doc] = await db
      .select({
        doc: financeDocumentsTable,
        supplier: { id: suppliersTable.id, name: suppliersTable.name },
        customer: { id: customersTable.id, name: customersTable.name },
        uploader: { id: usersTable.id, username: usersTable.username },
      })
      .from(financeDocumentsTable)
      .leftJoin(suppliersTable, eq(suppliersTable.id, financeDocumentsTable.supplierId))
      .leftJoin(customersTable, eq(customersTable.id, financeDocumentsTable.customerId))
      .leftJoin(usersTable, eq(usersTable.id, financeDocumentsTable.uploadedBy))
      .where(
        and(
          eq(financeDocumentsTable.id, id),
          eq(financeDocumentsTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (!doc) return res.status(404).json({ error: "not found" });

    res.json({
      ...doc.doc,
      supplier: doc.supplier?.id ? doc.supplier : null,
      customer: doc.customer?.id ? doc.customer : null,
      uploader: doc.uploader?.id ? doc.uploader : null,
    });
  } catch (e) {
    console.error("[finance-documents GET :id]", e);
    res.status(500).json({ error: "get failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — meta güncelleme (status, folder, tutarlar, parti vb.)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const userId = req.session?.userId;
    const id = Number(req.params.id);
    const body = req.body ?? {};

    // Mevcut kayıt ve cross-tenant kontrol
    const [existing] = await db
      .select()
      .from(financeDocumentsTable)
      .where(
        and(
          eq(financeDocumentsTable.id, id),
          eq(financeDocumentsTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!existing) return res.status(404).json({ error: "not found" });

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.status !== undefined) {
      if (!(FINANCE_DOC_STATUSES as readonly string[]).includes(body.status)) {
        return res.status(400).json({ error: "invalid status" });
      }
      updates.status = body.status;
      if ((body.status === "islendi" || body.status === "onay_bekliyor") && existing.status === "yeni") {
        updates.processedBy = userId ?? null;
        updates.processedAt = new Date();
      }
    }
    if (body.docType !== undefined) {
      if (!(FINANCE_DOC_TYPES as readonly string[]).includes(body.docType)) {
        return res.status(400).json({ error: "invalid docType" });
      }
      updates.docType = body.docType;
    }
    if (body.folderId !== undefined) {
      if (body.folderId !== null) {
        const f = await db
          .select({ id: financeDocFoldersTable.id })
          .from(financeDocFoldersTable)
          .where(
            and(
              eq(financeDocFoldersTable.id, Number(body.folderId)),
              eq(financeDocFoldersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!f.length) return res.status(400).json({ error: "invalid folderId" });
      }
      updates.folderId = body.folderId;
    }
    if (body.supplierId !== undefined) {
      if (body.supplierId !== null) {
        const s = await db
          .select({ id: suppliersTable.id })
          .from(suppliersTable)
          .where(and(eq(suppliersTable.id, Number(body.supplierId)), eq(suppliersTable.companyId, companyId)))
          .limit(1);
        if (!s.length) return res.status(400).json({ error: "invalid supplierId" });
      }
      updates.supplierId = body.supplierId;
    }
    if (body.customerId !== undefined) {
      if (body.customerId !== null) {
        const c = await db
          .select({ id: customersTable.id })
          .from(customersTable)
          .where(and(eq(customersTable.id, Number(body.customerId)), eq(customersTable.companyId, companyId)))
          .limit(1);
        if (!c.length) return res.status(400).json({ error: "invalid customerId" });
      }
      updates.customerId = body.customerId;
    }

    const passthrough = [
      "title", "description", "documentNumber", "partyName", "partyTaxNumber",
      "subtotal", "vatAmount", "totalAmount", "currency", "isFavorite",
    ];
    for (const k of passthrough) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (body.documentDate !== undefined) {
      updates.documentDate = body.documentDate ? new Date(body.documentDate) : null;
    }
    if (body.dueDate !== undefined) {
      updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.tags !== undefined) {
      updates.tags = Array.isArray(body.tags) ? body.tags : [];
    }

    const [updated] = await db
      .update(financeDocumentsTable)
      .set(updates)
      .where(
        and(
          eq(financeDocumentsTable.id, id),
          eq(financeDocumentsTable.companyId, companyId),
        ),
      )
      .returning();

    res.json(updated);
  } catch (e) {
    console.error("[finance-documents PATCH]", e);
    res.status(500).json({ error: "update failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — soft yapmıyoruz, tablo silimi (object kalsın diye storage'tan silmiyoruz)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);

    const [del] = await db
      .delete(financeDocumentsTable)
      .where(
        and(
          eq(financeDocumentsTable.id, id),
          eq(financeDocumentsTable.companyId, companyId),
        ),
      )
      .returning();

    if (!del) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[finance-documents DELETE]", e);
    res.status(500).json({ error: "delete failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD — proxy ile (storage route'u zaten var ama burada erişim kontrolü
// yapıp 302 ile yönlendiriyoruz: belge bizim mi diye kontrol et).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/download", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);

    const [doc] = await db
      .select({
        objectPath: financeDocumentsTable.objectPath,
        originalName: financeDocumentsTable.originalName,
      })
      .from(financeDocumentsTable)
      .where(
        and(
          eq(financeDocumentsTable.id, id),
          eq(financeDocumentsTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (!doc) return res.status(404).json({ error: "not found" });

    const file = await objectStorage.getObjectEntityFile(doc.objectPath);
    const response = await objectStorage.downloadObject(file, 300);

    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.originalName)}"`,
    );
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) return res.end();
        res.write(Buffer.from(value));
        return pump();
      };
      await pump();
    } else {
      res.end();
    }
  } catch (e) {
    console.error("[finance-documents/download]", e);
    res.status(500).json({ error: "download failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAILBOX — mail kutusu konfigürasyonu (Sprint 56 — pull henüz aktif değil)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mailbox/config", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const [mb] = await db
      .select()
      .from(financeDocMailboxesTable)
      .where(eq(financeDocMailboxesTable.companyId, companyId))
      .limit(1);

    if (!mb) {
      return res.json({
        configured: false,
        suggestedInboundAddress: `belgeler+co${companyId}@ticarium365.com`,
      });
    }

    res.json({
      configured: true,
      ...mb,
      imapPassword: maskSecret(mb.imapPassword),
    });
  } catch (e) {
    console.error("[finance-documents/mailbox GET]", e);
    res.status(500).json({ error: "mailbox get failed" });
  }
});

router.put("/mailbox/config", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const {
      inboundAddress, imapHost, imapPort, imapUser, imapPassword,
      defaultFolderId, defaultDocType, isActive,
    } = req.body ?? {};
    if (!inboundAddress?.trim()) {
      return res.status(400).json({ error: "inboundAddress required" });
    }

    if (defaultFolderId != null) {
      const ok = await assertSameTenantFolder(Number(defaultFolderId), companyId);
      if (!ok) return res.status(400).json({ error: "invalid defaultFolderId" });
    }

    const [existing] = await db
      .select()
      .from(financeDocMailboxesTable)
      .where(eq(financeDocMailboxesTable.companyId, companyId))
      .limit(1);

    // Maskeli geldiyse mevcut password'ü koru; yeni password ise encrypt-at-rest
    const finalPassword =
      imapPassword === SECRET_MASK
        ? existing?.imapPassword ?? null
        : imapPassword
          ? _encryptSecret(String(imapPassword))
          : null;

    const safeType = (FINANCE_DOC_TYPES as readonly string[]).includes(defaultDocType)
      ? defaultDocType
      : "gelen_fatura";

    if (existing) {
      const [u] = await db
        .update(financeDocMailboxesTable)
        .set({
          inboundAddress: inboundAddress.trim(),
          imapHost: imapHost ?? null,
          imapPort: imapPort ?? null,
          imapUser: imapUser ?? null,
          imapPassword: finalPassword,
          defaultFolderId: defaultFolderId ?? null,
          defaultDocType: safeType,
          isActive: !!isActive,
        })
        .where(eq(financeDocMailboxesTable.companyId, companyId))
        .returning();
      return res.json({ ...u, imapPassword: maskSecret(u.imapPassword) });
    }

    const [c] = await db
      .insert(financeDocMailboxesTable)
      .values({
        companyId,
        inboundAddress: inboundAddress.trim(),
        imapHost: imapHost ?? null,
        imapPort: imapPort ?? null,
        imapUser: imapUser ?? null,
        imapPassword: finalPassword,
        defaultFolderId: defaultFolderId ?? null,
        defaultDocType: safeType,
        isActive: !!isActive,
      })
      .returning();
    res.json({ ...c, imapPassword: maskSecret(c.imapPassword) });
  } catch (e) {
    console.error("[finance-documents/mailbox PUT]", e);
    res.status(500).json({ error: "mailbox update failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 57 — OCR (GPT-5.2 Vision + pdf-parse fallback)
// ═══════════════════════════════════════════════════════════════════════════
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const OCR_SYSTEM_PROMPT = `Sen bir Türk fatura / dekont / gider belgesi analiz uzmanısın.
Verilen belgeden YALNIZCA aşağıdaki JSON şemasını döndür (markdown yok, açıklama yok):
{
  "docType": "gelen_fatura"|"giden_fatura"|"e_arsiv"|"e_fatura"|"dekont"|"gider_fisi"|"irsaliye"|"sozlesme"|"diger",
  "documentNumber": string|null,
  "documentDate": string|null,         // ISO YYYY-MM-DD
  "dueDate": string|null,              // ISO YYYY-MM-DD
  "partyName": string|null,            // karşı taraf (tedarikçi/müşteri) ünvanı
  "partyTaxNumber": string|null,       // VKN/TCKN
  "subtotal": number|null,             // KDV hariç tutar
  "vatAmount": number|null,
  "totalAmount": number|null,
  "currency": "TRY"|"USD"|"EUR"|"GBP",
  "lineItems": [{"name":string,"qty":number|null,"unitPrice":number|null,"total":number|null}]
}
Türkçe sayı formatı (1.234,56) → 1234.56 dönüştür. Bilinmeyen alan null bırak.`;

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

router.post("/:id/ocr", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);
    const [doc] = await db
      .select()
      .from(financeDocumentsTable)
      .where(and(eq(financeDocumentsTable.id, id), eq(financeDocumentsTable.companyId, companyId)))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Dosyayı indir
    const file = await objectStorage.getObjectEntityFile(doc.objectPath);
    const fileBuffer = await streamToBuffer(file.createReadStream());
    const mime = (doc.mimeType || "").toLowerCase();

    let messages: any[];
    let extractedText = "";

    if (mime.startsWith("image/")) {
      const dataUrl = `data:${mime};base64,${fileBuffer.toString("base64")}`;
      messages = [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Bu belgeden istenen JSON'u çıkar." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ];
    } else if (mime.includes("pdf")) {
      try {
        const parsed = await pdfParseLazy(fileBuffer);
        extractedText = (parsed?.text || "").slice(0, 16000);
      } catch {
        extractedText = "";
      }
      if (!extractedText.trim()) {
        return res.status(422).json({
          error: "PDF metin çıkarılamadı (taranmış PDF olabilir). Şimdilik resim formatına çevirip yükleyin.",
        });
      }
      messages = [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { role: "user", content: `Aşağıdaki PDF metninden JSON'u çıkar:\n\n${extractedText}` },
      ];
    } else {
      return res.status(415).json({ error: `Desteklenmeyen mime: ${mime}` });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    // Veritabanına yansıt (mevcut alanları override etme — sadece boşları doldur)
    const patch: Record<string, unknown> = {
      hasOcr: true,
      ocrText: extractedText || raw,
      metadata: { ...(doc.metadata as object || {}), ocr: parsed },
      updatedAt: new Date(),
    };
    if (parsed.docType && (FINANCE_DOC_TYPES as readonly string[]).includes(parsed.docType) && doc.docType === "diger") {
      patch.docType = parsed.docType;
    }
    if (!doc.documentNumber && parsed.documentNumber) patch.documentNumber = String(parsed.documentNumber);
    if (!doc.documentDate && parsed.documentDate) {
      const d = new Date(parsed.documentDate);
      if (!isNaN(d.getTime())) patch.documentDate = d;
    }
    if (!doc.dueDate && parsed.dueDate) {
      const d = new Date(parsed.dueDate);
      if (!isNaN(d.getTime())) patch.dueDate = d;
    }
    if (!doc.partyName && parsed.partyName) patch.partyName = String(parsed.partyName);
    if (!doc.partyTaxNumber && parsed.partyTaxNumber) patch.partyTaxNumber = String(parsed.partyTaxNumber);
    if (!doc.subtotal && parsed.subtotal != null) patch.subtotal = String(parsed.subtotal);
    if (!doc.vatAmount && parsed.vatAmount != null) patch.vatAmount = String(parsed.vatAmount);
    if (!doc.totalAmount && parsed.totalAmount != null) patch.totalAmount = String(parsed.totalAmount);
    if (parsed.currency && ["TRY","USD","EUR","GBP"].includes(parsed.currency)) patch.currency = parsed.currency;

    const [updated] = await db
      .update(financeDocumentsTable)
      .set(patch)
      .where(and(eq(financeDocumentsTable.id, id), eq(financeDocumentsTable.companyId, companyId)))
      .returning();

    res.json({ ok: true, ocr: parsed, document: updated });
  } catch (e: any) {
    console.error("[finance-documents/ocr]", e);
    res.status(500).json({ error: "OCR failed", detail: e?.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 58 — OTOMATİK DÖNÜŞÜM (belge → alış faturası / gider)
// ═══════════════════════════════════════════════════════════════════════════

// Belgeyi alış faturası kaydına çevir (sadece doc_type=gelen_fatura/e_fatura/e_arsiv için)
router.post("/:id/convert-to-purchase", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);
    const [doc] = await db
      .select()
      .from(financeDocumentsTable)
      .where(and(eq(financeDocumentsTable.id, id), eq(financeDocumentsTable.companyId, companyId)))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.convertedToType) {
      return res.status(409).json({ error: `Bu belge zaten ${doc.convertedToType} #${doc.convertedToId} olarak dönüştürülmüş.` });
    }
    if (!doc.supplierId) {
      return res.status(400).json({ error: "Önce tedarikçi (supplier) seçilmeli." });
    }
    if (!doc.totalAmount) {
      return res.status(400).json({ error: "Toplam tutar boş." });
    }

    const total = Number(doc.totalAmount);
    const tax = Number(doc.vatAmount || 0);
    const subtotal = Number(doc.subtotal || total - tax);

    const [purchase] = await db.insert(purchasesTable).values({
      companyId,
      supplierId: doc.supplierId,
      invoiceNo: doc.documentNumber || `BLG-${doc.id}`,
      invoiceDate: doc.documentDate || new Date(),
      subtotalAmount: subtotal,
      taxAmount: tax,
      discountAmount: 0,
      totalAmount: total,
      paymentStatus: "unpaid",
      note: `Belge Merkezi'nden otomatik oluşturuldu (#${doc.id})`,
      createdBy: req.session.user?.id ?? null,
    }).returning();

    await db.update(financeDocumentsTable)
      .set({
        convertedToType: "purchase",
        convertedToId: purchase.id,
        status: "islendi",
        processedBy: req.session.user?.id ?? null,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(financeDocumentsTable.id, id), eq(financeDocumentsTable.companyId, companyId)));

    res.json({ ok: true, purchase });
  } catch (e: any) {
    console.error("[finance-documents/convert-to-purchase]", e);
    res.status(500).json({ error: "Conversion failed", detail: e?.message });
  }
});

// Belgeyi gider kaydına çevir
router.post("/:id/convert-to-expense", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const id = Number(req.params.id);
    const { categoryId } = req.body ?? {};
    const [doc] = await db
      .select()
      .from(financeDocumentsTable)
      .where(and(eq(financeDocumentsTable.id, id), eq(financeDocumentsTable.companyId, companyId)))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.convertedToType) {
      return res.status(409).json({ error: `Bu belge zaten ${doc.convertedToType} #${doc.convertedToId} olarak dönüştürülmüş.` });
    }
    if (!doc.totalAmount) return res.status(400).json({ error: "Toplam tutar boş." });

    if (categoryId != null) {
      const [cat] = await db.select({ id: expenseCategoriesTable.id })
        .from(expenseCategoriesTable)
        .where(and(eq(expenseCategoriesTable.id, Number(categoryId)), eq(expenseCategoriesTable.companyId, companyId)))
        .limit(1);
      if (!cat) return res.status(400).json({ error: "Geçersiz categoryId." });
    }

    const [expense] = await db.insert(expensesTable).values({
      companyId,
      categoryId: categoryId ? Number(categoryId) : null,
      amount: Number(doc.totalAmount),
      description: doc.title || doc.partyName || doc.originalName || `Belge #${doc.id}`,
      expenseDate: doc.documentDate || new Date(),
      paymentMethod: "cash",
      notes: `Belge Merkezi'nden otomatik (#${doc.id}) — ${doc.documentNumber || ""}`,
      createdBy: req.session.user?.id ?? null,
    }).returning();

    await db.update(financeDocumentsTable)
      .set({
        convertedToType: "expense",
        convertedToId: expense.id,
        status: "islendi",
        processedBy: req.session.user?.id ?? null,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(financeDocumentsTable.id, id), eq(financeDocumentsTable.companyId, companyId)));

    res.json({ ok: true, expense });
  } catch (e: any) {
    console.error("[finance-documents/convert-to-expense]", e);
    res.status(500).json({ error: "Conversion failed", detail: e?.message });
  }
});

export default router;
