import { Router, Request, Response } from "express";
import {
  db, productsTable, stockCountSessionsTable, stockCountItemsTable,
  stockMovementsTable,
} from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────
async function getSessionOrFail(sessionId: number, companyId: number) {
  const [session] = await db
    .select()
    .from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.companyId, companyId)));
  if (!session) throw { statusCode: 404, body: Errors.notFound("Sayım oturumu") };
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTURUM LİSTESİ
// GET /api/stock-counts
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const sessions = await db
      .select()
      .from(stockCountSessionsTable)
      .where(eq(stockCountSessionsTable.companyId, cid))
      .orderBy(desc(stockCountSessionsTable.openedAt));
    res.json({ sessions });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// YENİ OTURUM AÇ
// POST /api/stock-counts
// { name, notes? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { name, notes } = req.body as { name?: string; notes?: string };

    if (!name || !name.trim()) {
      return void res.status(400).json(Errors.badRequest("Sayım adı gerekli"));
    }

    // Zaten açık oturum var mı?
    const [existing] = await db
      .select()
      .from(stockCountSessionsTable)
      .where(and(eq(stockCountSessionsTable.companyId, cid), eq(stockCountSessionsTable.status, "open")));
    if (existing) {
      return void res.status(409).json(Errors.conflict("OPEN_SESSION_EXISTS", "Zaten açık bir sayım oturumu var. Önce onu kapatın.", { sessionId: existing.id }));
    }

    const [session] = await db.insert(stockCountSessionsTable).values({
      companyId: cid,
      name: name.trim(),
      notes: notes?.trim() || null,
      status: "open",
      openedBy: uid,
    }).returning();

    res.status(201).json({ session });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OTURUM DETAY
// GET /api/stock-counts/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const sid = Number(req.params.id);
    if (isNaN(sid)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    const items = await db
      .select()
      .from(stockCountItemsTable)
      .where(and(eq(stockCountItemsTable.sessionId, sid), eq(stockCountItemsTable.companyId, cid)))
      .orderBy(stockCountItemsTable.productCode);

    res.json({ session, items });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ÜRÜN SAY / GÜNCELLE
// POST /api/stock-counts/:id/items
// { productCode?, barcode?, productId?, countedQty, notes? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/items", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const sid = Number(req.params.id);
    if (isNaN(sid)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    if (session.status !== "open") {
      return void res.status(409).json(Errors.conflict("SESSION_CLOSED", "Bu sayım oturumu kapalı, düzenleme yapılamaz"));
    }

    const { productCode, barcode, productId, countedQty, notes } = req.body as {
      productCode?: string; barcode?: string; productId?: number;
      countedQty: number; notes?: string;
    };

    if (typeof countedQty !== "number" || countedQty < 0) {
      return void res.status(400).json(Errors.badRequest("Sayım miktarı 0 veya üstü olmalı"));
    }

    // Ürünü bul
    let product: typeof productsTable.$inferSelect | undefined;
    if (productId) {
      const [p] = await db.select().from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, cid)));
      product = p;
    } else if (barcode) {
      const [p] = await db.select().from(productsTable)
        .where(and(eq(productsTable.companyId, cid), eq(productsTable.barcode, barcode)));
      product = p;
    } else if (productCode) {
      const [p] = await db.select().from(productsTable)
        .where(and(eq(productsTable.companyId, cid), eq(productsTable.productCode, productCode)));
      product = p;
    }

    if (!product) {
      return void res.status(404).json(Errors.notFound("Ürün"));
    }

    // Upsert: item zaten varsa güncelle, yoksa ekle
    const [existing] = await db.select().from(stockCountItemsTable)
      .where(and(eq(stockCountItemsTable.sessionId, sid), eq(stockCountItemsTable.productId, product.id)));

    const diff = countedQty - product.stock;

    let item;
    if (existing) {
      const [updated] = await db.update(stockCountItemsTable)
        .set({ countedQty, diff, notes: notes?.trim() || null, countedAt: new Date() })
        .where(eq(stockCountItemsTable.id, existing.id))
        .returning();
      item = updated;
    } else {
      const [inserted] = await db.insert(stockCountItemsTable).values({
        sessionId: sid,
        companyId: cid,
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        systemStock: product.stock,
        countedQty,
        diff,
        notes: notes?.trim() || null,
      }).returning();
      item = inserted;
    }

    // Oturum toplamlarını güncelle
    const stats = await db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        totalDiff: sql<number>`sum(abs(diff))::int`,
      })
      .from(stockCountItemsTable)
      .where(eq(stockCountItemsTable.sessionId, sid));

    await db.update(stockCountSessionsTable)
      .set({
        totalProducts: stats[0]?.totalProducts ?? 0,
        totalDiff: stats[0]?.totalDiff ?? 0,
      })
      .where(eq(stockCountSessionsTable.id, sid));

    res.status(existing ? 200 : 201).json({ item });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SAYIM KALEMİ SİL
// DELETE /api/stock-counts/:id/items/:itemId
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id/items/:itemId", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const sid = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (isNaN(sid) || isNaN(itemId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    if (session.status !== "open") {
      return void res.status(409).json(Errors.conflict("SESSION_CLOSED", "Bu sayım oturumu kapalı"));
    }

    await db.delete(stockCountItemsTable)
      .where(and(eq(stockCountItemsTable.id, itemId), eq(stockCountItemsTable.sessionId, sid)));

    res.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TÜM ÜRÜNLERI OTURUMA EKLE (sistem stoku ile)
// POST /api/stock-counts/:id/load-all
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/load-all", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const sid = Number(req.params.id);
    if (isNaN(sid)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    if (session.status !== "open") {
      return void res.status(409).json(Errors.conflict("SESSION_CLOSED", "Bu sayım oturumu kapalı"));
    }

    const products = await db.select().from(productsTable)
      .where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true)));

    // Mevcut kalemleri çek, duplicate ekleme
    const existing = await db.select({ productId: stockCountItemsTable.productId })
      .from(stockCountItemsTable)
      .where(eq(stockCountItemsTable.sessionId, sid));
    const existingIds = new Set(existing.map(e => e.productId));

    const toInsert = products.filter(p => !existingIds.has(p.id));

    if (toInsert.length > 0) {
      await db.insert(stockCountItemsTable).values(
        toInsert.map(p => ({
          sessionId: sid,
          companyId: cid,
          productId: p.id,
          productCode: p.productCode,
          productName: p.name,
          systemStock: p.stock,
          countedQty: 0,
          diff: -p.stock, // başlangıçta 0 sayıldığı varsayılır
        }))
      );
    }

    const stats = await db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        totalDiff: sql<number>`sum(abs(diff))::int`,
      })
      .from(stockCountItemsTable)
      .where(eq(stockCountItemsTable.sessionId, sid));

    await db.update(stockCountSessionsTable)
      .set({
        totalProducts: stats[0]?.totalProducts ?? 0,
        totalDiff: stats[0]?.totalDiff ?? 0,
      })
      .where(eq(stockCountSessionsTable.id, sid));

    res.json({ added: toInsert.length, total: products.length });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OTURUMU KAPAT (sayım bitti, düzeltmeler hazır)
// POST /api/stock-counts/:id/close
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/close", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const sid = Number(req.params.id);
    if (isNaN(sid)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    if (session.status !== "open") {
      return void res.status(409).json(Errors.conflict("SESSION_CLOSED", "Oturum zaten kapalı"));
    }

    const [closed] = await db.update(stockCountSessionsTable)
      .set({ status: "closed", closedBy: uid, closedAt: new Date() })
      .where(eq(stockCountSessionsTable.id, sid))
      .returning();

    res.json({ session: closed });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TOPLU DÜZELTME ONAYLA — stok güncelle + stock_movements oluştur
// POST /api/stock-counts/:id/approve
// { itemIds?: number[] }  — boş ise tüm fark olan kalemler
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/approve", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const sid = Number(req.params.id);
    if (isNaN(sid)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    if (session.status === "approved") {
      return void res.status(409).json(Errors.conflict("ALREADY_APPROVED", "Bu sayım zaten onaylanmış"));
    }
    if (session.status === "open") {
      return void res.status(409).json(Errors.conflict("SESSION_OPEN", "Önce oturumu kapatın"));
    }

    const { itemIds } = req.body as { itemIds?: number[] };

    // Hangi kalemler uygulanacak
    let items = await db.select().from(stockCountItemsTable)
      .where(and(eq(stockCountItemsTable.sessionId, sid), eq(stockCountItemsTable.companyId, cid)));

    if (itemIds && itemIds.length > 0) {
      items = items.filter(i => itemIds.includes(i.id));
    }

    // Sadece farkı sıfır olmayan ve henüz uygulanmamış kalemler
    const toApply = items.filter(i => i.diff !== 0 && !i.isAdjusted);

    if (toApply.length === 0) {
      return void res.json({ adjusted: 0, message: "Düzeltilecek fark bulunamadı" });
    }

    let adjusted = 0;
    for (const item of toApply) {
      // Ürün stokunu güncelle
      const newStock = item.systemStock + item.diff; // = countedQty
      await db.update(productsTable)
        .set({ stock: newStock < 0 ? 0 : newStock })
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.companyId, cid)));

      // stock_movement oluştur
      await db.insert(stockMovementsTable).values({
        companyId: cid,
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode,
        type: "correction",
        quantity: item.diff,
        note: `Sayım düzeltmesi — Oturum #${sid}: ${session.name}`,
        refId: sid,
        createdBy: String(uid),
      });

      // Kalemi işaretlenmiş yap
      await db.update(stockCountItemsTable)
        .set({ isAdjusted: true })
        .where(eq(stockCountItemsTable.id, item.id));

      adjusted++;
    }

    // Oturumu onayla
    const [approved] = await db.update(stockCountSessionsTable)
      .set({ status: "approved", approvedBy: uid, approvedAt: new Date() })
      .where(eq(stockCountSessionsTable.id, sid))
      .returning();

    res.json({ session: approved, adjusted });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FARK RAPORU CSV
// GET /api/stock-counts/:id/export
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const sid = Number(req.params.id);
    if (isNaN(sid)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const session = await getSessionOrFail(sid, cid);
    const items = await db.select().from(stockCountItemsTable)
      .where(and(eq(stockCountItemsTable.sessionId, sid), eq(stockCountItemsTable.companyId, cid)))
      .orderBy(stockCountItemsTable.productCode);

    const rows = [
      ["Ürün Kodu", "Ürün Adı", "Sistem Stoku", "Sayılan Miktar", "Fark", "Durum"].join(";"),
      ...items.map(i => [
        i.productCode,
        `"${i.productName}"`,
        i.systemStock,
        i.countedQty,
        i.diff,
        i.isAdjusted ? "Düzeltildi" : i.diff === 0 ? "Eşleşiyor" : "Bekliyor",
      ].join(";")),
    ];

    const csv = "\uFEFF" + rows.join("\r\n");
    const safeBase = session.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
    const filename = `sayim_${safeBase}_${sid}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) {
      const err = e as { statusCode: number; body: object };
      return void res.status(err.statusCode).json(err.body);
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

export default router;
