import { Router, Request, Response } from "express";
import {
  db, branchesTable, branchStockTable, branchTransfersTable,
  branchTransferItemsTable, branchUsersTable, productsTable,
} from "@workspace/db";
import { and, eq, desc, sql, asc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBE CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { includeInactive } = req.query as Record<string, string>;
    const conditions = [eq(branchesTable.companyId, cid)];
    if (!includeInactive) conditions.push(eq(branchesTable.isActive, true));

    const branches = await db.select().from(branchesTable)
      .where(and(...conditions))
      .orderBy(desc(branchesTable.isMain), asc(branchesTable.name));

    // Her şube için kullanıcı sayısını ve stok ürün sayısını getir
    const branchIds = branches.map(b => b.id);
    const userCounts = branchIds.length > 0
      ? await db.select({
          branchId: branchUsersTable.branchId,
          count: sql<number>`count(*)::int`,
        }).from(branchUsersTable).where(inArray(branchUsersTable.branchId, branchIds))
          .groupBy(branchUsersTable.branchId)
      : [];

    const result = branches.map(b => ({
      ...b,
      userCount: userCounts.find(u => u.branchId === b.id)?.count ?? 0,
    }));

    res.json({ branches: result });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [branch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, id), eq(branchesTable.companyId, cid)));
    if (!branch) return void res.status(404).json(Errors.notFound("Şube"));

    // Bu şubeye atanmış kullanıcılar
    const users = await db.select().from(branchUsersTable)
      .where(and(eq(branchUsersTable.branchId, id), eq(branchUsersTable.companyId, cid)));

    res.json({ branch, users });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { name, address, phone, email, isMain } = req.body as {
      name?: string; address?: string; phone?: string; email?: string; isMain?: boolean;
    };

    if (!name?.trim()) return void res.status(400).json(Errors.badRequest("Şube adı gerekli"));

    // isMain true ise diğer şubeleri güncelle
    if (isMain) {
      await db.update(branchesTable).set({ isMain: false })
        .where(eq(branchesTable.companyId, cid));
    }

    const [branch] = await db.insert(branchesTable).values({
      companyId: cid,
      name: name.trim(),
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      isMain: isMain ?? false,
    }).returning();

    res.status(201).json({ branch });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.put("/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { name, address, phone, email, isMain, isActive } = req.body as {
      name?: string; address?: string; phone?: string; email?: string;
      isMain?: boolean; isActive?: boolean;
    };

    if (isMain) {
      await db.update(branchesTable).set({ isMain: false })
        .where(and(eq(branchesTable.companyId, cid)));
    }

    const [updated] = await db.update(branchesTable)
      .set({
        name: name?.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        isMain,
        isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(branchesTable.id, id), eq(branchesTable.companyId, cid)))
      .returning();

    if (!updated) return void res.status(404).json(Errors.notFound("Şube"));
    res.json({ branch: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [branch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, id), eq(branchesTable.companyId, cid)));
    if (!branch) return void res.status(404).json(Errors.notFound("Şube"));
    if (branch.isMain) return void res.status(409).json(Errors.conflict("CANNOT_DELETE_MAIN", "Ana şube silinemez"));

    // Soft delete: deaktif et
    await db.update(branchesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(branchesTable.id, id), eq(branchesTable.companyId, cid)));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBE STOKLARI
// GET /branches/:id/stock  — şubedeki stok seviyelerini listele
// POST /branches/:id/stock — stok seviyesi ekle/güncelle (müdahale)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/stock", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const branchId = Number(req.params.id);
    if (isNaN(branchId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [branch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, branchId), eq(branchesTable.companyId, cid)));
    if (!branch) return void res.status(404).json(Errors.notFound("Şube"));

    const { search, lowStock } = req.query as Record<string, string>;

    let query = db.select({
      productId: branchStockTable.productId,
      branchId: branchStockTable.branchId,
      quantity: branchStockTable.quantity,
      updatedAt: branchStockTable.updatedAt,
      productName: productsTable.name,
      productCode: productsTable.productCode,
      barcode: productsTable.barcode,
      minStock: productsTable.minStock,
    })
      .from(branchStockTable)
      .innerJoin(productsTable, eq(branchStockTable.productId, productsTable.id))
      .where(and(
        eq(branchStockTable.branchId, branchId),
        eq(branchStockTable.companyId, cid),
      ))
      .orderBy(asc(productsTable.name));

    const stocks = await query;

    const filtered = stocks.filter(s => {
      if (search) {
        const q = search.toLowerCase();
        if (!s.productName.toLowerCase().includes(q) && !s.barcode?.toLowerCase().includes(q) && !s.productCode.toLowerCase().includes(q)) return false;
      }
      if (lowStock === "1" && s.quantity > s.minStock) return false;
      return true;
    });

    res.json({ stocks: filtered, branchName: branch.name });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Stok seviyesi ekle/güncelle (toplu)
router.post("/:id/stock", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const branchId = Number(req.params.id);
    if (isNaN(branchId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [branch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, branchId), eq(branchesTable.companyId, cid)));
    if (!branch) return void res.status(404).json(Errors.notFound("Şube"));

    const { items } = req.body as { items?: { productId: number; quantity: number }[] };
    if (!items || items.length === 0) return void res.status(400).json(Errors.badRequest("items dizisi gerekli"));

    const upserted: number[] = [];
    for (const item of items) {
      if (typeof item.productId !== "number" || typeof item.quantity !== "number") continue;
      await db.insert(branchStockTable)
        .values({ branchId, companyId: cid, productId: item.productId, quantity: item.quantity })
        .onConflictDoUpdate({
          target: [branchStockTable.branchId, branchStockTable.productId],
          set: { quantity: item.quantity, updatedAt: new Date() },
        });
      upserted.push(item.productId);
    }

    res.json({ updated: upserted.length });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ŞUBELER ARASI TRANSFER
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transfers/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { status, branchId, limit = "50" } = req.query as Record<string, string>;

    const conditions = [eq(branchTransfersTable.companyId, cid)];
    if (status) conditions.push(eq(branchTransfersTable.status, status));
    if (branchId) {
      const bid = Number(branchId);
      conditions.push(sql`(${branchTransfersTable.fromBranchId} = ${bid} OR ${branchTransfersTable.toBranchId} = ${bid})`);
    }

    const transfers = await db.select({
      id: branchTransfersTable.id,
      fromBranchId: branchTransfersTable.fromBranchId,
      toBranchId: branchTransfersTable.toBranchId,
      status: branchTransfersTable.status,
      notes: branchTransfersTable.notes,
      createdAt: branchTransfersTable.createdAt,
      completedAt: branchTransfersTable.completedAt,
      fromBranchName: sql<string>`"fb"."name"`,
      toBranchName: sql<string>`"tb"."name"`,
    })
      .from(branchTransfersTable)
      .leftJoin(sql`branches as "fb"`, sql`"fb"."id" = ${branchTransfersTable.fromBranchId}`)
      .leftJoin(sql`branches as "tb"`, sql`"tb"."id" = ${branchTransfersTable.toBranchId}`)
      .where(and(...conditions))
      .orderBy(desc(branchTransfersTable.createdAt))
      .limit(Number(limit));

    // Her transfer için kalemleri de getir
    const transferIds = transfers.map(t => t.id);
    const items = transferIds.length > 0
      ? await db.select({
          transferId: branchTransferItemsTable.transferId,
          productId: branchTransferItemsTable.productId,
          quantity: branchTransferItemsTable.quantity,
          productName: productsTable.name,
          productCode: productsTable.productCode,
        })
          .from(branchTransferItemsTable)
          .innerJoin(productsTable, eq(branchTransferItemsTable.productId, productsTable.id))
          .where(inArray(branchTransferItemsTable.transferId, transferIds))
      : [];

    const result = transfers.map(t => ({
      ...t,
      items: items.filter(i => i.transferId === t.id),
    }));

    res.json({ transfers: result });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/transfers", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { fromBranchId, toBranchId, notes, items } = req.body as {
      fromBranchId?: number; toBranchId?: number; notes?: string;
      items?: { productId: number; quantity: number }[];
    };

    if (!fromBranchId || !toBranchId) return void res.status(400).json(Errors.badRequest("Kaynak ve hedef şube gerekli"));
    if (fromBranchId === toBranchId) return void res.status(400).json(Errors.badRequest("Kaynak ve hedef şube aynı olamaz"));
    if (!items || items.length === 0) return void res.status(400).json(Errors.badRequest("En az bir ürün gerekli"));

    // Şubelerin bu şirkete ait olduğunu kontrol et
    const [fromBranch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, fromBranchId), eq(branchesTable.companyId, cid)));
    const [toBranch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, toBranchId), eq(branchesTable.companyId, cid)));

    if (!fromBranch) return void res.status(404).json(Errors.notFound("Kaynak şube"));
    if (!toBranch) return void res.status(404).json(Errors.notFound("Hedef şube"));

    const [transfer] = await db.insert(branchTransfersTable).values({
      companyId: cid,
      fromBranchId,
      toBranchId,
      notes: notes?.trim() || null,
      createdBy: uid,
      status: "pending",
    }).returning();

    // Kalemleri ekle
    for (const item of items) {
      if (item.productId && item.quantity > 0) {
        await db.insert(branchTransferItemsTable).values({
          transferId: transfer.id,
          productId: item.productId,
          quantity: item.quantity,
        });
      }
    }

    res.status(201).json({ transfer });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Transfer tamamla (stok günceller)
router.post("/transfers/:id/complete", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [transfer] = await db.select().from(branchTransfersTable)
      .where(and(eq(branchTransfersTable.id, id), eq(branchTransfersTable.companyId, cid)));
    if (!transfer) return void res.status(404).json(Errors.notFound("Transfer"));
    if (transfer.status !== "pending")
      return void res.status(409).json(Errors.conflict("TRANSFER_NOT_PENDING", "Sadece bekleyen transferler tamamlanabilir"));

    const items = await db.select().from(branchTransferItemsTable)
      .where(eq(branchTransferItemsTable.transferId, id));

    // Kaynak şubeden düş, hedef şubeye ekle
    for (const item of items) {
      // Kaynak şube stok
      const [fromStock] = await db.select().from(branchStockTable)
        .where(and(eq(branchStockTable.branchId, transfer.fromBranchId), eq(branchStockTable.productId, item.productId)));

      const currentQty = fromStock?.quantity ?? 0;
      if (currentQty < item.quantity) {
        return void res.status(409).json(Errors.conflict(
          "INSUFFICIENT_BRANCH_STOCK",
          `${item.productId} ürünü için yeterli şube stoğu yok (mevcut: ${currentQty}, istenen: ${item.quantity})`
        ));
      }

      await db.insert(branchStockTable)
        .values({ branchId: transfer.fromBranchId, companyId: cid, productId: item.productId, quantity: currentQty - item.quantity })
        .onConflictDoUpdate({
          target: [branchStockTable.branchId, branchStockTable.productId],
          set: { quantity: currentQty - item.quantity, updatedAt: new Date() },
        });

      const [toStock] = await db.select().from(branchStockTable)
        .where(and(eq(branchStockTable.branchId, transfer.toBranchId), eq(branchStockTable.productId, item.productId)));
      const toQty = (toStock?.quantity ?? 0) + item.quantity;

      await db.insert(branchStockTable)
        .values({ branchId: transfer.toBranchId, companyId: cid, productId: item.productId, quantity: toQty })
        .onConflictDoUpdate({
          target: [branchStockTable.branchId, branchStockTable.productId],
          set: { quantity: toQty, updatedAt: new Date() },
        });
    }

    const [updated] = await db.update(branchTransfersTable)
      .set({ status: "completed", completedBy: uid, completedAt: new Date() })
      .where(eq(branchTransfersTable.id, id))
      .returning();

    res.json({ transfer: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Transfer iptal
router.post("/transfers/:id/cancel", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [transfer] = await db.select().from(branchTransfersTable)
      .where(and(eq(branchTransfersTable.id, id), eq(branchTransfersTable.companyId, cid)));
    if (!transfer) return void res.status(404).json(Errors.notFound("Transfer"));
    if (transfer.status !== "pending")
      return void res.status(409).json(Errors.conflict("TRANSFER_NOT_PENDING", "Sadece bekleyen transferler iptal edilebilir"));

    const [updated] = await db.update(branchTransfersTable)
      .set({ status: "cancelled" })
      .where(eq(branchTransfersTable.id, id))
      .returning();

    res.json({ transfer: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// KULLANICI ATAMA
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/users", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const branchId = Number(req.params.id);
    if (isNaN(branchId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { userId } = req.body as { userId?: number };
    if (!userId) return void res.status(400).json(Errors.badRequest("userId gerekli"));

    const [branch] = await db.select().from(branchesTable)
      .where(and(eq(branchesTable.id, branchId), eq(branchesTable.companyId, cid)));
    if (!branch) return void res.status(404).json(Errors.notFound("Şube"));

    await db.insert(branchUsersTable)
      .values({ branchId, userId, companyId: cid })
      .onConflictDoNothing();

    res.status(201).json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/:id/users/:userId", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const branchId = Number(req.params.id);
    const userId = Number(req.params.userId);

    await db.delete(branchUsersTable)
      .where(and(
        eq(branchUsersTable.branchId, branchId),
        eq(branchUsersTable.userId, userId),
        eq(branchUsersTable.companyId, cid),
      ));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

export default router;
