import { Router, Request, Response } from "express";
import {
  db, expenseCategoriesTable, expensesTable, cashRegistersTable, cashMovementsTable,
  salesTable,
} from "@workspace/db";
import { and, eq, gte, lte, desc, sql, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────
async function ensureDefaultRegister(companyId: number, userId: number) {
  const [existing] = await db.select().from(cashRegistersTable)
    .where(and(eq(cashRegistersTable.companyId, companyId), eq(cashRegistersTable.isDefault, true)));
  if (existing) return existing;
  const [created] = await db.insert(cashRegistersTable).values({
    companyId, name: "Ana Kasa", openingBalance: 0, currentBalance: 0, isDefault: true,
  }).returning();
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// GİDER KATEGORİLERİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/expense-categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const cats = await db.select().from(expenseCategoriesTable)
      .where(and(eq(expenseCategoriesTable.companyId, cid), eq(expenseCategoriesTable.isActive, true)))
      .orderBy(asc(expenseCategoriesTable.name));
    res.json({ categories: cats });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/expense-categories", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { name, icon, color } = req.body as { name?: string; icon?: string; color?: string };
    if (!name?.trim()) return void res.status(400).json(Errors.badRequest("Kategori adı gerekli"));
    const [cat] = await db.insert(expenseCategoriesTable).values({
      companyId: cid, name: name.trim(), icon: icon?.trim() || null, color: color?.trim() || null,
    }).returning();
    res.status(201).json({ category: cat });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.put("/expense-categories/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const { name, icon, color, isActive } = req.body as { name?: string; icon?: string; color?: string; isActive?: boolean };
    const [updated] = await db.update(expenseCategoriesTable)
      .set({ name: name?.trim(), icon: icon?.trim() || null, color: color?.trim() || null, isActive })
      .where(and(eq(expenseCategoriesTable.id, id), eq(expenseCategoriesTable.companyId, cid)))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Kategori"));
    res.json({ category: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GİDERLER
// ─────────────────────────────────────────────────────────────────────────────
router.get("/expenses", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { startDate, endDate, categoryId, page = "1", limit = "50" } = req.query as Record<string, string>;

    const conditions = [eq(expensesTable.companyId, cid)];
    if (startDate) {
      const d = new Date(startDate); d.setHours(0, 0, 0, 0);
      conditions.push(gte(expensesTable.expenseDate, d));
    }
    if (endDate) {
      const d = new Date(endDate); d.setHours(23, 59, 59, 999);
      conditions.push(lte(expensesTable.expenseDate, d));
    }
    if (categoryId) conditions.push(eq(expensesTable.categoryId, Number(categoryId)));

    const offset = (Number(page) - 1) * Number(limit);
    const expenses = await db.select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      description: expensesTable.description,
      expenseDate: expensesTable.expenseDate,
      paymentMethod: expensesTable.paymentMethod,
      notes: expensesTable.notes,
      categoryId: expensesTable.categoryId,
      categoryName: expenseCategoriesTable.name,
      categoryIcon: expenseCategoriesTable.icon,
      createdAt: expensesTable.createdAt,
    })
      .from(expensesTable)
      .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
      .where(and(...conditions))
      .orderBy(desc(expensesTable.expenseDate))
      .limit(Number(limit))
      .offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(expensesTable).where(and(...conditions));

    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
    res.json({ expenses, total, totalAmount });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/expenses", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { categoryId, amount, description, expenseDate, paymentMethod, notes } = req.body as {
      categoryId?: number; amount?: number; description?: string;
      expenseDate?: string; paymentMethod?: string; notes?: string;
    };

    if (!description?.trim()) return void res.status(400).json(Errors.badRequest("Açıklama gerekli"));
    if (!amount || amount <= 0) return void res.status(400).json(Errors.badRequest("Geçerli bir tutar girin"));
    if (!expenseDate) return void res.status(400).json(Errors.badRequest("Tarih gerekli"));

    const dateObj = new Date(expenseDate);
    if (isNaN(dateObj.getTime())) return void res.status(400).json(Errors.badRequest("Geçersiz tarih"));

    const [expense] = await db.insert(expensesTable).values({
      companyId: cid,
      categoryId: categoryId || null,
      amount,
      description: description.trim(),
      expenseDate: dateObj,
      paymentMethod: paymentMethod || "cash",
      notes: notes?.trim() || null,
      createdBy: uid,
    }).returning();

    // Nakit ödeme ise kasa hareketi oluştur
    if (paymentMethod === "cash" || !paymentMethod) {
      const register = await ensureDefaultRegister(cid, uid);
      const balBefore = register.currentBalance;
      const balAfter = balBefore - amount;
      await db.update(cashRegistersTable)
        .set({ currentBalance: balAfter, updatedAt: new Date() })
        .where(eq(cashRegistersTable.id, register.id));
      await db.insert(cashMovementsTable).values({
        companyId: cid,
        registerId: register.id,
        type: "expense",
        direction: "out",
        amount,
        description: description.trim(),
        categoryId: categoryId || null,
        refType: "expense",
        refId: expense.id,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        createdBy: uid,
      });
    }

    res.status(201).json({ expense });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/expenses/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [expense] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, cid)));
    if (!expense) return void res.status(404).json(Errors.notFound("Gider"));

    // Nakit ise kasayı geri al
    if (expense.paymentMethod === "cash") {
      const register = await ensureDefaultRegister(cid, req.userId);
      const balBefore = register.currentBalance;
      const balAfter = balBefore + expense.amount;
      await db.update(cashRegistersTable)
        .set({ currentBalance: balAfter, updatedAt: new Date() })
        .where(eq(cashRegistersTable.id, register.id));
      await db.insert(cashMovementsTable).values({
        companyId: cid,
        registerId: register.id,
        type: "expense",
        direction: "in",
        amount: expense.amount,
        description: `İptal: ${expense.description}`,
        refType: "expense",
        refId: expense.id,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        createdBy: req.userId,
      });
    }

    await db.delete(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.companyId, cid)));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// KASA / NAKİT HAREKETLERİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cash", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const registers = await db.select().from(cashRegistersTable)
      .where(and(eq(cashRegistersTable.companyId, cid), eq(cashRegistersTable.isActive, true)))
      .orderBy(desc(cashRegistersTable.isDefault));
    res.json({ registers });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.get("/cash/:registerId/movements", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const registerId = Number(req.params.registerId);
    if (isNaN(registerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { startDate, endDate, limit = "100" } = req.query as Record<string, string>;
    const conditions = [
      eq(cashMovementsTable.companyId, cid),
      eq(cashMovementsTable.registerId, registerId),
    ];
    if (startDate) {
      const d = new Date(startDate); d.setHours(0, 0, 0, 0);
      conditions.push(gte(cashMovementsTable.createdAt, d));
    }
    if (endDate) {
      const d = new Date(endDate); d.setHours(23, 59, 59, 999);
      conditions.push(lte(cashMovementsTable.createdAt, d));
    }

    const movements = await db.select().from(cashMovementsTable)
      .where(and(...conditions))
      .orderBy(desc(cashMovementsTable.createdAt))
      .limit(Number(limit));

    res.json({ movements });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Manuel nakit giriş/çıkış
router.post("/cash/:registerId/movements", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const registerId = Number(req.params.registerId);
    if (isNaN(registerId)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [register] = await db.select().from(cashRegistersTable)
      .where(and(eq(cashRegistersTable.id, registerId), eq(cashRegistersTable.companyId, cid)));
    if (!register) return void res.status(404).json(Errors.notFound("Kasa"));

    const { type, direction, amount, description } = req.body as {
      type?: string; direction?: string; amount?: number; description?: string;
    };

    if (!direction || !["in", "out"].includes(direction))
      return void res.status(400).json(Errors.badRequest("Yön 'in' veya 'out' olmalı"));
    if (!amount || amount <= 0)
      return void res.status(400).json(Errors.badRequest("Geçerli bir tutar girin"));
    if (!description?.trim())
      return void res.status(400).json(Errors.badRequest("Açıklama gerekli"));

    const balBefore = register.currentBalance;
    const balAfter = direction === "in" ? balBefore + amount : balBefore - amount;

    await db.update(cashRegistersTable)
      .set({ currentBalance: balAfter, updatedAt: new Date() })
      .where(eq(cashRegistersTable.id, registerId));

    const [movement] = await db.insert(cashMovementsTable).values({
      companyId: cid,
      registerId,
      type: type || "manual",
      direction,
      amount,
      description: description.trim(),
      refType: "manual",
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      createdBy: uid,
    }).returning();

    res.status(201).json({ movement, register: { ...register, currentBalance: balAfter } });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// FİNANS ÖZETİ (dashboard için)
// GET /api/finance/summary?startDate=&endDate=
// ─────────────────────────────────────────────────────────────────────────────
router.get("/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { startDate, endDate } = req.query as Record<string, string>;

    let start: Date, end: Date;
    if (startDate && endDate) {
      start = new Date(startDate); start.setHours(0, 0, 0, 0);
      end = new Date(endDate); end.setHours(23, 59, 59, 999);
    } else {
      // Varsayılan: bu ay
      start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      end = new Date(); end.setHours(23, 59, 59, 999);
    }

    // Satış geliri
    const salesRows = await db.select({
      totalRevenue: sql<number>`sum(total_price)::float`,
      totalProfit: sql<number>`sum(profit)::float`,
      count: sql<number>`count(*)::int`,
    }).from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)));
    const revenue = salesRows[0]?.totalRevenue ?? 0;
    const profit = salesRows[0]?.totalProfit ?? 0;
    const salesCount = salesRows[0]?.count ?? 0;

    // Giderler
    const expenseRows = await db.select({
      totalExpenses: sql<number>`sum(amount)::float`,
      count: sql<number>`count(*)::int`,
    }).from(expensesTable)
      .where(and(eq(expensesTable.companyId, cid), gte(expensesTable.expenseDate, start), lte(expensesTable.expenseDate, end)));
    const totalExpenses = expenseRows[0]?.totalExpenses ?? 0;
    const expenseCount = expenseRows[0]?.count ?? 0;

    // Kategori bazlı gider dökümü
    const categoryBreakdown = await db.select({
      categoryId: expensesTable.categoryId,
      categoryName: expenseCategoriesTable.name,
      categoryIcon: expenseCategoriesTable.icon,
      total: sql<number>`sum(${expensesTable.amount})::float`,
      count: sql<number>`count(*)::int`,
    })
      .from(expensesTable)
      .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
      .where(and(eq(expensesTable.companyId, cid), gte(expensesTable.expenseDate, start), lte(expensesTable.expenseDate, end)))
      .groupBy(expensesTable.categoryId, expenseCategoriesTable.name, expenseCategoriesTable.icon)
      .orderBy(desc(sql`sum(${expensesTable.amount})`));

    // Günlük satış + gider grafiği (son 30 gün veya tarih aralığı)
    const dailySales = await db.select({
      day: sql<string>`date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text`,
      revenue: sql<number>`sum(total_price)::float`,
      profit: sql<number>`sum(profit)::float`,
    }).from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
      .groupBy(sql`date_trunc('day', created_at AT TIME ZONE 'UTC')::date`);

    const dailyExpenses = await db.select({
      day: sql<string>`date_trunc('day', expense_date AT TIME ZONE 'UTC')::date::text`,
      total: sql<number>`sum(amount)::float`,
    }).from(expensesTable)
      .where(and(eq(expensesTable.companyId, cid), gte(expensesTable.expenseDate, start), lte(expensesTable.expenseDate, end)))
      .groupBy(sql`date_trunc('day', expense_date AT TIME ZONE 'UTC')::date`);

    // Kasa bakiyesi
    const registers = await db.select().from(cashRegistersTable)
      .where(and(eq(cashRegistersTable.companyId, cid), eq(cashRegistersTable.isActive, true)));
    const totalCashBalance = registers.reduce((s, r) => s + r.currentBalance, 0);

    // Net kar = satış karı - giderler
    const netProfit = profit - totalExpenses;

    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      revenue,
      profit,
      totalExpenses,
      netProfit,
      salesCount,
      expenseCount,
      totalCashBalance,
      categoryBreakdown,
      dailySales,
      dailyExpenses,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AYLLIK FİNANS ÖZETİ
// GET /api/finance/monthly-summary?year=2026
// ─────────────────────────────────────────────────────────────────────────────
router.get("/monthly-summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const start = new Date(`${year}-01-01T00:00:00Z`);
    const end = new Date(`${year}-12-31T23:59:59Z`);

    const monthlySales = await db.select({
      month: sql<string>`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')`,
      revenue: sql<number>`sum(total_price)::float`,
      profit: sql<number>`sum(profit)::float`,
      count: sql<number>`count(*)::int`,
    }).from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
      .groupBy(sql`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')`);

    const monthlyExpenses = await db.select({
      month: sql<string>`to_char(expense_date AT TIME ZONE 'UTC', 'YYYY-MM')`,
      total: sql<number>`sum(amount)::float`,
      count: sql<number>`count(*)::int`,
    }).from(expensesTable)
      .where(and(eq(expensesTable.companyId, cid), gte(expensesTable.expenseDate, start), lte(expensesTable.expenseDate, end)))
      .groupBy(sql`to_char(expense_date AT TIME ZONE 'UTC', 'YYYY-MM')`)
      .orderBy(sql`to_char(expense_date AT TIME ZONE 'UTC', 'YYYY-MM')`);

    res.json({ year, monthlySales, monthlyExpenses });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GİDER CSV EXPORT
// GET /api/finance/expenses/export?startDate=&endDate=
// ─────────────────────────────────────────────────────────────────────────────
router.get("/expenses/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { startDate, endDate } = req.query as Record<string, string>;

    const conditions = [eq(expensesTable.companyId, cid)];
    if (startDate) {
      const d = new Date(startDate); d.setHours(0, 0, 0, 0);
      conditions.push(gte(expensesTable.expenseDate, d));
    }
    if (endDate) {
      const d = new Date(endDate); d.setHours(23, 59, 59, 999);
      conditions.push(lte(expensesTable.expenseDate, d));
    }

    const expenses = await db.select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      description: expensesTable.description,
      expenseDate: expensesTable.expenseDate,
      paymentMethod: expensesTable.paymentMethod,
      notes: expensesTable.notes,
      categoryName: expenseCategoriesTable.name,
    })
      .from(expensesTable)
      .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
      .where(and(...conditions))
      .orderBy(desc(expensesTable.expenseDate));

    const PM_MAP: Record<string, string> = { cash: "Nakit", bank: "Banka", credit: "Kredi" };

    const rows = [
      ["Tarih", "Kategori", "Açıklama", "Tutar (TL)", "Ödeme Yöntemi", "Not"].join(";"),
      ...expenses.map(e => [
        new Date(e.expenseDate).toLocaleDateString("tr-TR"),
        e.categoryName ?? "Kategorisiz",
        `"${e.description}"`,
        e.amount.toFixed(2).replace(".", ","),
        PM_MAP[e.paymentMethod] ?? e.paymentMethod,
        e.notes ? `"${e.notes}"` : "",
      ].join(";")),
    ];

    const csv = "\uFEFF" + rows.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="giderler.csv"`);
    res.send(csv);
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

export default router;
