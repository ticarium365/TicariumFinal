// Sadakat & Puan Sistemi
import { Router, type Request, type Response } from "express";
import {
  db, loyaltySettingsTable, loyaltyTransactionsTable, customersTable, salesTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

async function getOrCreateSettings(companyId: number) {
  const [s] = await db.select().from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.companyId, companyId)).limit(1);
  if (s) return s;
  const [created] = await db.insert(loyaltySettingsTable).values({ companyId }).returning();
  return created;
}

router.get("/settings", async (req: Request, res: Response) => {
  const s = await getOrCreateSettings(req.companyId!);
  res.json(s);
});

router.put("/settings", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  await getOrCreateSettings(cid);
  const { pointsPerHundredTL, tlPerPoint, minRedeemPoints, isActive } = req.body || {};
  const [updated] = await db.update(loyaltySettingsTable).set({
    pointsPerHundredTL: pointsPerHundredTL != null ? Math.max(0, Number(pointsPerHundredTL)) : undefined,
    tlPerPoint: tlPerPoint != null ? Math.max(0, Number(tlPerPoint)) : undefined,
    minRedeemPoints: minRedeemPoints != null ? Math.max(0, Math.floor(Number(minRedeemPoints))) : undefined,
    isActive: isActive != null ? (isActive ? 1 : 0) : undefined,
    updatedAt: new Date(),
  }).where(eq(loyaltySettingsTable.companyId, cid)).returning();
  res.json(updated);
});

// Müşteri puan bakiyesi (toplam earn − redeem)
router.get("/customers/:id/balance", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const customerId = Number(req.params.id);
  const [row] = await db.select({ total: sql<number>`COALESCE(SUM(${loyaltyTransactionsTable.points}), 0)::int` })
    .from(loyaltyTransactionsTable)
    .where(and(
      eq(loyaltyTransactionsTable.companyId, cid),
      eq(loyaltyTransactionsTable.customerId, customerId),
    ));
  res.json({ customerId, balance: row?.total || 0 });
});

router.get("/customers/:id/transactions", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const customerId = Number(req.params.id);
  const rows = await db.select().from(loyaltyTransactionsTable)
    .where(and(
      eq(loyaltyTransactionsTable.companyId, cid),
      eq(loyaltyTransactionsTable.customerId, customerId),
    ))
    .orderBy(desc(loyaltyTransactionsTable.createdAt))
    .limit(100);
  res.json(rows);
});

// Manuel ayarlama (kazanç/harcama/düzeltme)
router.post("/customers/:id/adjust", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const customerId = Number(req.params.id);
  const { points, type, note } = req.body || {};
  const p = Math.floor(Number(points));
  if (!p || isNaN(p)) return res.status(400).json({ error: "points sayısal ve sıfır olmamalı" });
  const validTypes = ["earn", "redeem", "adjust"];
  const t = validTypes.includes(type) ? type : "adjust";

  const [cust] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, cid))).limit(1);
  if (!cust) return res.status(404).json({ error: "customer_not_found" });

  // Redeem ise bakiyeyi kontrol
  if (p < 0) {
    const [bal] = await db.select({ total: sql<number>`COALESCE(SUM(${loyaltyTransactionsTable.points}), 0)::int` })
      .from(loyaltyTransactionsTable)
      .where(and(eq(loyaltyTransactionsTable.companyId, cid), eq(loyaltyTransactionsTable.customerId, customerId)));
    if ((bal?.total || 0) + p < 0) return res.status(409).json({ error: "yetersiz puan bakiyesi" });
  }

  const [tx] = await db.insert(loyaltyTransactionsTable).values({
    companyId: cid, customerId, type: t, points: p, note: note || null,
    createdBy: req.session.user!.id,
  }).returning();
  res.status(201).json(tx);
});

// Bir satıştan otomatik puan kazanımı yarat (POS/sales tarafından çağrılır)
router.post("/earn-from-sale", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const { customerId, saleId, amount } = req.body || {};
  if (!customerId || !amount) return res.status(400).json({ error: "customerId & amount zorunlu" });

  // Tenant ownership: customer bu şirkete ait mi?
  const [cust] = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.id, Number(customerId)), eq(customersTable.companyId, cid))).limit(1);
  if (!cust) return res.status(404).json({ error: "customer_not_found" });

  // Sale verildiyse, o da bu şirkete ait olmalı
  let validSaleId: number | null = null;
  if (saleId) {
    const [sale] = await db.select({ id: salesTable.id }).from(salesTable)
      .where(and(eq(salesTable.id, Number(saleId)), eq(salesTable.companyId, cid))).limit(1);
    if (!sale) return res.status(404).json({ error: "sale_not_found" });
    validSaleId = sale.id;
  }

  const settings = await getOrCreateSettings(cid);
  if (!settings.isActive) return res.json({ skipped: "loyalty_inactive" });
  const earned = Math.floor((Number(amount) / 100) * settings.pointsPerHundredTL);
  if (earned <= 0) return res.json({ earned: 0 });
  const [tx] = await db.insert(loyaltyTransactionsTable).values({
    companyId: cid, customerId: Number(customerId), saleId: validSaleId,
    type: "earn", points: earned, amount: Number(amount),
    note: `Satış #${validSaleId || "-"} kazanımı`,
    createdBy: req.session.user!.id,
  }).returning();
  res.status(201).json({ earned, transaction: tx });
});

// Toplam müşteri sıralaması (top loyalty members)
router.get("/top-customers", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const rows = await db.select({
    customerId: loyaltyTransactionsTable.customerId,
    customerName: customersTable.name,
    customerCode: customersTable.code,
    balance: sql<number>`COALESCE(SUM(${loyaltyTransactionsTable.points}), 0)::int`,
  })
    .from(loyaltyTransactionsTable)
    .innerJoin(customersTable, and(
      eq(customersTable.id, loyaltyTransactionsTable.customerId),
      eq(customersTable.companyId, cid),
    ))
    .where(eq(loyaltyTransactionsTable.companyId, cid))
    .groupBy(loyaltyTransactionsTable.customerId, customersTable.name, customersTable.code)
    .orderBy(sql`COALESCE(SUM(${loyaltyTransactionsTable.points}), 0) DESC`)
    .limit(20);
  res.json(rows);
});

export default router;
