import { Router, Request, Response } from "express";
import { db, customersTable, customerTransactionsTable, salesTable } from "@workspace/db";
import { eq, and, ilike, or, desc, count, sql, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ─────────────────────────────────────────────────────────────────────────────

async function recalcBalance(customerId: number, companyId: number): Promise<number> {
  const rows = await db
    .select({
      debit: sql<number>`COALESCE(SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END), 0)`,
      credit: sql<number>`COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0)`,
    })
    .from(customerTransactionsTable)
    .where(and(
      eq(customerTransactionsTable.customerId, customerId),
      eq(customerTransactionsTable.companyId, companyId),
    ));

  const debit = Number(rows[0]?.debit ?? 0);
  const credit = Number(rows[0]?.credit ?? 0);
  const balance = debit - credit;

  await db
    .update(customersTable)
    .set({ currentBalance: balance, updatedAt: new Date() })
    .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, companyId)));

  return balance;
}

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ LİSTESİ
// ─────────────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { search, active, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(customersTable.companyId, cid)];

    if (active !== undefined) {
      conditions.push(eq(customersTable.isActive, active === "true"));
    }

    let whereClause = and(...conditions);
    if (search) {
      const q = `%${search}%`;
      whereClause = and(
        ...conditions,
        or(
          ilike(customersTable.name, q),
          ilike(customersTable.code, q),
          ilike(customersTable.phone, q),
          ilike(customersTable.email, q),
        )
      );
    }

    const [customers, totalResult] = await Promise.all([
      db.select().from(customersTable).where(whereClause)
        .orderBy(asc(customersTable.name))
        .limit(limitNum).offset(offset),
      db.select({ count: count() }).from(customersTable).where(whereClause),
    ]);

    res.json({
      customers,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "List customers error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EN BORÇLU MÜŞTERİLER
// ─────────────────────────────────────────────────────────────────────────────

router.get("/top-debtors", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const customers = await db
      .select()
      .from(customersTable)
      .where(and(
        eq(customersTable.companyId, cid),
        eq(customersTable.isActive, true),
        sql`${customersTable.currentBalance} > 0`,
      ))
      .orderBy(desc(customersTable.currentBalance))
      .limit(10);

    res.json({ customers });
  } catch (err) {
    req.log?.error({ err }, "Top debtors error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ DETAYI
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz müşteri ID"));

    const [customer] = await db
      .select()
      .from(customersTable)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)));

    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));

    res.json({ customer });
  } catch (err) {
    req.log?.error({ err }, "Get customer error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ OLUŞTURMA
// ─────────────────────────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { code, name, type, phone, email, city, district, address,
            contactPerson, taxOffice, taxNumber, creditLimit, openingBalance, notes } = req.body;

    if (!code || !name) return void res.status(400).json(Errors.badRequest("Kod ve ad zorunludur"));

    const existing = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.companyId, cid), eq(customersTable.code, code)));

    if (existing.length) return void res.status(409).json(Errors.conflict("DUPLICATE_CODE", "Bu müşteri kodu zaten kullanılıyor"));

    const ob = parseFloat(openingBalance) || 0;

    const [customer] = await db.insert(customersTable).values({
      companyId: cid,
      code,
      name,
      type: type || "individual",
      phone: phone || null,
      email: email || null,
      city: city || null,
      district: district || null,
      address: address || null,
      contactPerson: contactPerson || null,
      taxOffice: taxOffice || null,
      taxNumber: taxNumber || null,
      creditLimit: parseFloat(creditLimit) || 0,
      openingBalance: ob,
      currentBalance: ob,
      notes: notes || null,
    }).returning();

    // Açılış bakiyesi varsa transaction oluştur
    if (ob !== 0) {
      await db.insert(customerTransactionsTable).values({
        companyId: cid,
        customerId: customer.id,
        type: "adjustment",
        direction: ob > 0 ? "debit" : "credit",
        amount: Math.abs(ob),
        referenceType: "manual",
        description: "Açılış bakiyesi",
        createdBy: req.session.user.id,
      });
    }

    await audit({ req, action: "CUSTOMER_CREATE", entity: "customer", entityId: customer.id, details: { code, name } });
    res.status(201).json({ customer });
  } catch (err) {
    req.log?.error({ err }, "Create customer error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ GÜNCELLEME
// ─────────────────────────────────────────────────────────────────────────────

router.put("/:id", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [existing] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)));
    if (!existing) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));
    if (!existing.isActive) return void res.status(400).json(Errors.badRequest("Pasif müşteri düzenlenemez"));

    // code değişiyorsa duplicate check
    if (req.body.code && req.body.code !== existing.code) {
      const dup = await db.select({ id: customersTable.id }).from(customersTable)
        .where(and(eq(customersTable.companyId, cid), eq(customersTable.code, req.body.code)));
      if (dup.length) return void res.status(409).json(Errors.conflict("DUPLICATE_CODE", "Bu kod zaten kullanılıyor"));
    }

    const updateData: Partial<typeof customersTable.$inferInsert> = { updatedAt: new Date() };
    const fields = ["code","name","type","phone","email","city","district","address",
                    "contactPerson","taxOffice","taxNumber","creditLimit","notes"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) (updateData as Record<string, unknown>)[f] = req.body[f];
    }

    const [updated] = await db.update(customersTable).set(updateData)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)))
      .returning();

    await audit({ req, action: "CUSTOMER_UPDATE", entity: "customer", entityId: id });
    res.json({ customer: updated });
  } catch (err) {
    req.log?.error({ err }, "Update customer error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ SİLME (soft delete)
// ─────────────────────────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [customer] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));

    await db.update(customersTable).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)));

    await audit({ req, action: "CUSTOMER_DELETE", entity: "customer", entityId: id });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Delete customer error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ GERİ YÜKLEME
// ─────────────────────────────────────────────────────────────────────────────

router.patch("/:id/restore", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [customer] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));

    await db.update(customersTable).set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, cid)));

    await audit({ req, action: "CUSTOMER_RESTORE", entity: "customer", entityId: id });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Restore customer error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CARİ HAREKETLERİ
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/transactions", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const [customer] = await db.select({ id: customersTable.id }).from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));

    const [txs, totalResult] = await Promise.all([
      db.select().from(customerTransactionsTable)
        .where(and(
          eq(customerTransactionsTable.customerId, customerId),
          eq(customerTransactionsTable.companyId, cid),
        ))
        .orderBy(desc(customerTransactionsTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: count() }).from(customerTransactionsTable)
        .where(and(
          eq(customerTransactionsTable.customerId, customerId),
          eq(customerTransactionsTable.companyId, cid),
        )),
    ]);

    // Running balance hesapla (sondan başa doğru)
    const total = totalResult[0]?.count ?? 0;
    res.json({
      transactions: txs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "Get transactions error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAHSİLAT (PAYMENT)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/:id/payment", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { amount, paymentMethod, note } = req.body;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return void res.status(400).json(Errors.badRequest("Tutar 0'dan büyük olmalı"));

    const [customer] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));
    if (!customer.isActive) return void res.status(400).json(Errors.badRequest("Pasif müşteriye işlem yapılamaz"));

    const [tx] = await db.insert(customerTransactionsTable).values({
      companyId: cid,
      customerId,
      type: "payment",
      direction: "credit",
      amount: amountNum,
      referenceType: "manual",
      description: note || `Tahsilat${paymentMethod ? ` — ${paymentMethod}` : ""}`,
      createdBy: req.session.user.id,
    }).returning();

    const newBalance = await recalcBalance(customerId, cid);
    await audit({ req, action: "CUSTOMER_PAYMENT", entity: "customer", entityId: customerId, details: { amount: amountNum, paymentMethod } });

    res.json({ ok: true, transaction: tx, newBalance });
  } catch (err) {
    req.log?.error({ err }, "Customer payment error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BAKIYE DÜZELTMESİ (ADJUSTMENT)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/:id/adjustment", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { amount, direction, note } = req.body;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return void res.status(400).json(Errors.badRequest("Tutar 0'dan büyük olmalı"));
    if (!["debit", "credit"].includes(direction)) return void res.status(400).json(Errors.badRequest("direction: debit veya credit olmalı"));

    const [customer] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));
    if (!customer.isActive) return void res.status(400).json(Errors.badRequest("Pasif müşteriye işlem yapılamaz"));

    const [tx] = await db.insert(customerTransactionsTable).values({
      companyId: cid,
      customerId,
      type: "adjustment",
      direction,
      amount: amountNum,
      referenceType: "manual",
      description: note || "Manuel bakiye düzeltmesi",
      createdBy: req.session.user.id,
    }).returning();

    const newBalance = await recalcBalance(customerId, cid);
    await audit({ req, action: "CUSTOMER_ADJUSTMENT", entity: "customer", entityId: customerId, details: { amount: amountNum, direction } });

    res.json({ ok: true, transaction: tx, newBalance });
  } catch (err) {
    req.log?.error({ err }, "Customer adjustment error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HESAP EKSTRESI
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/statement", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [customer] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));

    const txs = await db.select().from(customerTransactionsTable)
      .where(and(
        eq(customerTransactionsTable.customerId, customerId),
        eq(customerTransactionsTable.companyId, cid),
      ))
      .orderBy(asc(customerTransactionsTable.createdAt));

    // Running balance hesapla
    let running = 0;
    const lines = txs.map(tx => {
      if (tx.direction === "debit") running += tx.amount;
      else running -= tx.amount;
      return { ...tx, runningBalance: running };
    });

    res.json({
      customer,
      transactions: lines,
      currentBalance: customer.currentBalance,
    });
  } catch (err) {
    req.log?.error({ err }, "Statement error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ SATIŞ GEÇMİŞİ
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/sales", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const [customer] = await db.select({ id: customersTable.id }).from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, cid)));
    if (!customer) return void res.status(404).json(Errors.notFound("Müşteri bulunamadı"));

    const [sales, totalResult] = await Promise.all([
      db.select().from(salesTable)
        .where(and(
          eq(salesTable.customerId, customerId),
          eq(salesTable.companyId, cid),
        ))
        .orderBy(desc(salesTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: count() }).from(salesTable)
        .where(and(eq(salesTable.customerId, customerId), eq(salesTable.companyId, cid))),
    ]);

    res.json({
      sales,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "Customer sales error");
    res.status(500).json(Errors.internal());
  }
});

export default router;
