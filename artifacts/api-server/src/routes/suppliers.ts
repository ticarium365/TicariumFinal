import { Router, Request, Response } from "express";
import {
  db, suppliersTable, supplierTransactionsTable,
  purchasesTable, purchaseItemsTable, productsTable, stockMovementsTable,
} from "@workspace/db";
import { eq, and, ilike, or, desc, asc, count, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────
async function recalcSupplierBalance(supplierId: number, companyId: number): Promise<number> {
  const rows = await db.select({
    debit: sql<number>`COALESCE(SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END), 0)`,
    credit: sql<number>`COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0)`,
  }).from(supplierTransactionsTable).where(and(
    eq(supplierTransactionsTable.supplierId, supplierId),
    eq(supplierTransactionsTable.companyId, companyId),
  ));
  const balance = Number(rows[0]?.debit ?? 0) - Number(rows[0]?.credit ?? 0);
  await db.update(suppliersTable).set({ currentBalance: balance, updatedAt: new Date() })
    .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)));
  return balance;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ LİSTESİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { search, active, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;
    const conditions: ReturnType<typeof eq>[] = [eq(suppliersTable.companyId, cid)];
    if (active !== undefined) conditions.push(eq(suppliersTable.isActive, active === "true"));
    let whereClause = and(...conditions);
    if (search) {
      const q = `%${search}%`;
      whereClause = and(...conditions, or(
        ilike(suppliersTable.name, q),
        ilike(suppliersTable.code, q),
        ilike(suppliersTable.phone, q),
      ));
    }
    const [suppliers, totalResult] = await Promise.all([
      db.select().from(suppliersTable).where(whereClause).orderBy(asc(suppliersTable.name)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(suppliersTable).where(whereClause),
    ]);
    res.json({ suppliers, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum) });
  } catch (err) {
    req.log?.error({ err }, "List suppliers error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EN BORÇLU TEDARİKÇİLER
// ─────────────────────────────────────────────────────────────────────────────
router.get("/top-creditors", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const suppliers = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.companyId, cid), eq(suppliersTable.isActive, true), sql`${suppliersTable.currentBalance} > 0`))
      .orderBy(desc(suppliersTable.currentBalance)).limit(10);
    res.json({ suppliers });
  } catch (err) {
    req.log?.error({ err }, "Top creditors error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ DETAYI
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid)));
    if (!supplier) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    res.json({ supplier });
  } catch (err) {
    req.log?.error({ err }, "Get supplier error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ OLUŞTURMA
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { code, name, phone, email, city, district, address, contactPerson,
            taxOffice, taxNumber, openingBalance, notes } = req.body;
    if (!code || !name) return void res.status(400).json(Errors.badRequest("Kod ve ad zorunludur"));
    const existing = await db.select({ id: suppliersTable.id }).from(suppliersTable)
      .where(and(eq(suppliersTable.companyId, cid), eq(suppliersTable.code, code)));
    if (existing.length) return void res.status(409).json(Errors.conflict("DUPLICATE_CODE", "Bu tedarikçi kodu zaten kullanılıyor"));
    const ob = parseFloat(openingBalance) || 0;
    const [supplier] = await db.insert(suppliersTable).values({
      companyId: cid, code, name,
      phone: phone || null, email: email || null, city: city || null,
      district: district || null, address: address || null, contactPerson: contactPerson || null,
      taxOffice: taxOffice || null, taxNumber: taxNumber || null,
      openingBalance: ob, currentBalance: ob, notes: notes || null,
    }).returning();
    if (ob !== 0) {
      await db.insert(supplierTransactionsTable).values({
        companyId: cid, supplierId: supplier.id, type: "adjustment",
        direction: ob > 0 ? "debit" : "credit", amount: Math.abs(ob),
        referenceType: "manual", description: "Açılış bakiyesi",
        createdBy: req.session.user.id,
      });
    }
    await audit({ req, action: "SUPPLIER_CREATE", entity: "supplier", entityId: supplier.id, details: { code, name } });
    res.status(201).json({ supplier });
  } catch (err) {
    req.log?.error({ err }, "Create supplier error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ GÜNCELLEME
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const [existing] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid)));
    if (!existing) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    if (!existing.isActive) return void res.status(400).json(Errors.badRequest("Pasif tedarikçi düzenlenemez"));
    if (req.body.code && req.body.code !== existing.code) {
      const dup = await db.select({ id: suppliersTable.id }).from(suppliersTable)
        .where(and(eq(suppliersTable.companyId, cid), eq(suppliersTable.code, req.body.code)));
      if (dup.length) return void res.status(409).json(Errors.conflict("DUPLICATE_CODE", "Bu kod zaten kullanılıyor"));
    }
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const fields = ["code","name","phone","email","city","district","address","contactPerson","taxOffice","taxNumber","notes"] as const;
    for (const f of fields) { if (req.body[f] !== undefined) updateData[f] = req.body[f]; }
    const [updated] = await db.update(suppliersTable).set(updateData as Partial<typeof suppliersTable.$inferInsert>)
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid))).returning();
    await audit({ req, action: "SUPPLIER_UPDATE", entity: "supplier", entityId: id });
    res.json({ supplier: updated });
  } catch (err) {
    req.log?.error({ err }, "Update supplier error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ SİL (soft)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const [s] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid)));
    if (!s) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    await db.update(suppliersTable).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid)));
    await audit({ req, action: "SUPPLIER_DELETE", entity: "supplier", entityId: id });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Delete supplier error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ GERİ YÜKLEME
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/restore", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const [s] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid)));
    if (!s) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    await db.update(suppliersTable).set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, cid)));
    await audit({ req, action: "SUPPLIER_RESTORE", entity: "supplier", entityId: id });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Restore supplier error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ HAREKETLERİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/transactions", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const supplierId = parseInt(req.params.id);
    if (isNaN(supplierId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const { page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;
    const [s] = await db.select({ id: suppliersTable.id }).from(suppliersTable)
      .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, cid)));
    if (!s) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    const [txs, total] = await Promise.all([
      db.select().from(supplierTransactionsTable)
        .where(and(eq(supplierTransactionsTable.supplierId, supplierId), eq(supplierTransactionsTable.companyId, cid)))
        .orderBy(desc(supplierTransactionsTable.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(supplierTransactionsTable)
        .where(and(eq(supplierTransactionsTable.supplierId, supplierId), eq(supplierTransactionsTable.companyId, cid))),
    ]);
    res.json({ transactions: txs, total: total[0]?.count ?? 0, page: pageNum, limit: limitNum,
      totalPages: Math.ceil((total[0]?.count ?? 0) / limitNum) });
  } catch (err) {
    req.log?.error({ err }, "Supplier transactions error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ ÖDEMESİ
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/payment", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const supplierId = parseInt(req.params.id);
    if (isNaN(supplierId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const { amount, paymentMethod, note } = req.body;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return void res.status(400).json(Errors.badRequest("Tutar 0'dan büyük olmalı"));
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, cid)));
    if (!supplier) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    if (!supplier.isActive) return void res.status(400).json(Errors.badRequest("Pasif tedarikçiye işlem yapılamaz"));
    const [tx] = await db.insert(supplierTransactionsTable).values({
      companyId: cid, supplierId, type: "payment", direction: "credit", amount: amountNum,
      referenceType: "manual", description: note || `Ödeme${paymentMethod ? ` — ${paymentMethod}` : ""}`,
      createdBy: req.session.user.id,
    }).returning();
    const newBalance = await recalcSupplierBalance(supplierId, cid);
    await audit({ req, action: "SUPPLIER_PAYMENT", entity: "supplier", entityId: supplierId, details: { amount: amountNum } });
    res.json({ ok: true, transaction: tx, newBalance });
  } catch (err) {
    req.log?.error({ err }, "Supplier payment error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ BAKİYE DÜZELTMESİ
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/adjustment", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const supplierId = parseInt(req.params.id);
    if (isNaN(supplierId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const { amount, direction, note } = req.body;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return void res.status(400).json(Errors.badRequest("Tutar 0'dan büyük olmalı"));
    if (!["debit", "credit"].includes(direction)) return void res.status(400).json(Errors.badRequest("direction: debit veya credit olmalı"));
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, cid)));
    if (!supplier) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    if (!supplier.isActive) return void res.status(400).json(Errors.badRequest("Pasif tedarikçiye işlem yapılamaz"));
    const [tx] = await db.insert(supplierTransactionsTable).values({
      companyId: cid, supplierId, type: "adjustment", direction, amount: amountNum,
      referenceType: "manual", description: note || "Manuel bakiye düzeltmesi",
      createdBy: req.session.user.id,
    }).returning();
    const newBalance = await recalcSupplierBalance(supplierId, cid);
    await audit({ req, action: "SUPPLIER_ADJUSTMENT", entity: "supplier", entityId: supplierId, details: { amount: amountNum, direction } });
    res.json({ ok: true, transaction: tx, newBalance });
  } catch (err) {
    req.log?.error({ err }, "Supplier adjustment error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HESAP EKSTRESİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/statement", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const supplierId = parseInt(req.params.id);
    if (isNaN(supplierId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, cid)));
    if (!supplier) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    const txs = await db.select().from(supplierTransactionsTable)
      .where(and(eq(supplierTransactionsTable.supplierId, supplierId), eq(supplierTransactionsTable.companyId, cid)))
      .orderBy(asc(supplierTransactionsTable.createdAt));
    let running = 0;
    const lines = txs.map(tx => {
      if (tx.direction === "debit") running += tx.amount;
      else running -= tx.amount;
      return { ...tx, runningBalance: running };
    });
    res.json({ supplier, transactions: lines, currentBalance: supplier.currentBalance });
  } catch (err) {
    req.log?.error({ err }, "Supplier statement error");
    res.status(500).json(Errors.internal());
  }
});

export default router;
