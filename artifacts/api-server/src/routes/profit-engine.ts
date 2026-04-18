import { Router, type Request, type Response } from "express";
import {
  db, holdingCostRulesTable, expenseAllocationsTable,
  productProfitSnapshotsTable, productsTable,
} from "@workspace/db";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/features.js";
import {
  recomputeCompanySnapshots, liveEffectiveCost,
} from "../services/profitEngine.js";

const router = Router();
router.use(requireAuth);

const requireAdmin = requireRole(["admin", "super_admin"]);
const requireViewer = requireRole(["admin", "staff", "viewer", "super_admin"]);
const requireWriter = requireRole(["admin", "super_admin"]);
const gateHolding = requireFeature("profit.holding_cost");
const gateDashboard = requireFeature("profit.true_dashboard");
const gateAdvisor = requireFeature("profit.ai_advisor");

// ─── HOLDING COST RULES ────────────────────────────────────────────────
router.get("/rules", gateHolding, requireViewer, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const [r] = await db.select().from(holdingCostRulesTable).where(eq(holdingCostRulesTable.companyId, cid));
  res.json(r ?? null);
});

router.put("/rules", gateHolding, requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const body = req.body ?? {};
  const data = {
    monthlyRent: Number(body.monthlyRent ?? 0),
    monthlyStaff: Number(body.monthlyStaff ?? 0),
    monthlyElectric: Number(body.monthlyElectric ?? 0),
    monthlyOther: Number(body.monthlyOther ?? 0),
    totalShelfM2: Number(body.totalShelfM2 ?? 100),
    defaultM2PerProduct: Number(body.defaultM2PerProduct ?? 0.05),
    capitalCostAnnualPct: Number(body.capitalCostAnnualPct ?? 30),
    spoilageRiskPct: Number(body.spoilageRiskPct ?? 0),
    allocMethod: body.allocMethod ?? "revenue",
    isEnabled: body.isEnabled !== false,
    updatedAt: new Date(),
  };
  const [existing] = await db.select().from(holdingCostRulesTable).where(eq(holdingCostRulesTable.companyId, cid));
  let row;
  if (existing) {
    [row] = await db.update(holdingCostRulesTable).set(data)
      .where(eq(holdingCostRulesTable.companyId, cid)).returning();
  } else {
    [row] = await db.insert(holdingCostRulesTable).values({ companyId: cid, ...data }).returning();
  }
  res.json(row);
});

// ─── EXPENSE ALLOCATIONS ──────────────────────────────────────────────
router.get("/expenses", gateHolding, requireViewer, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const rows = await db.select().from(expenseAllocationsTable)
    .where(eq(expenseAllocationsTable.companyId, cid))
    .orderBy(desc(expenseAllocationsTable.createdAt));
  res.json(rows);
});

router.post("/expenses", gateHolding, requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const b = req.body ?? {};
  if (!b.name || !b.amount) return res.status(400).json({ error: "name ve amount zorunlu" });
  const [row] = await db.insert(expenseAllocationsTable).values({
    companyId: cid,
    name: String(b.name),
    amount: Number(b.amount),
    allocMethod: b.allocMethod ?? "revenue",
    categoryFilter: b.categoryFilter ?? null,
    manualPct: b.manualPct != null ? Number(b.manualPct) : null,
    isActive: b.isActive !== false,
  }).returning();
  res.status(201).json(row);
});

router.put("/expenses/:id", gateHolding, requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const [row] = await db.update(expenseAllocationsTable).set({
    name: b.name, amount: b.amount != null ? Number(b.amount) : undefined,
    allocMethod: b.allocMethod, categoryFilter: b.categoryFilter,
    manualPct: b.manualPct != null ? Number(b.manualPct) : undefined,
    isActive: b.isActive,
    updatedAt: new Date(),
  } as any).where(and(
    eq(expenseAllocationsTable.id, id),
    eq(expenseAllocationsTable.companyId, cid),
  )).returning();
  if (!row) return res.status(404).json({ error: "Bulunamadı" });
  res.json(row);
});

router.delete("/expenses/:id", gateHolding, requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  await db.delete(expenseAllocationsTable).where(and(
    eq(expenseAllocationsTable.id, id),
    eq(expenseAllocationsTable.companyId, cid),
  ));
  res.json({ ok: true });
});

// ─── MANUEL RECOMPUTE ─────────────────────────────────────────────────
router.post("/recompute", gateHolding, requireAdmin, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const r = await recomputeCompanySnapshots(cid);
  res.json(r);
});

// ─── ÜRÜN BAZLI ETKİN MALİYET (canlı) ─────────────────────────────────
router.get("/products/:id/live", gateHolding, requireViewer, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  const r = await liveEffectiveCost(cid, id);
  if (!r) return res.status(404).json({ error: "Ürün bulunamadı" });
  res.json(r);
});

// ─── ÜRÜN BAZLI SNAPSHOT (en son) ─────────────────────────────────────
router.get("/products/:id/snapshot", gateHolding, requireViewer, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  const [snap] = await db.select().from(productProfitSnapshotsTable)
    .where(and(
      eq(productProfitSnapshotsTable.companyId, cid),
      eq(productProfitSnapshotsTable.productId, id),
    ))
    .orderBy(desc(productProfitSnapshotsTable.snapshotDate))
    .limit(1);
  res.json(snap ?? null);
});

// ─── DASHBOARD ────────────────────────────────────────────────────────
router.get("/dashboard", gateDashboard, requireViewer, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  // En güncel snapshot'lar (her ürün için en son)
  const latestRows = await db.execute(sql`
    SELECT DISTINCT ON (product_id) *
    FROM product_profit_snapshots
    WHERE company_id = ${cid}
    ORDER BY product_id, snapshot_date DESC
  `);
  const snaps = (latestRows.rows ?? []) as any[];

  if (snaps.length === 0) {
    return res.json({
      empty: true,
      totals: { stockValue: 0, dailyHoldingTotal: 0, dailyCapitalTotal: 0, todayBleed: 0 },
      topProfit: [], losing: [], stagnant: [], stars: [], capitalLocked: [],
      productCount: 0,
    });
  }

  const stockValue = snaps.reduce((a, s) => a + (s.purchase_price * s.stock_qty), 0);
  const dailyHoldingTotal = snaps.reduce((a, s) => a + (s.daily_holding_cost * s.stock_qty), 0);
  const dailyCapitalTotal = snaps.reduce((a, s) => a + (s.daily_capital_cost * s.stock_qty), 0);
  const todayBleed = dailyHoldingTotal + dailyCapitalTotal;

  // Ürün adlarını ek getir
  const productIds = snaps.map((s) => s.product_id);
  const products = await db.select({
    id: productsTable.id, name: productsTable.name, productCode: productsTable.productCode,
  }).from(productsTable).where(and(
    eq(productsTable.companyId, cid),
    inArray(productsTable.id, productIds),
  ));
  const nameMap = new Map(products.map((p) => [p.id, p]));

  const enrich = (s: any) => ({
    productId: s.product_id,
    name: nameMap.get(s.product_id)?.name ?? `#${s.product_id}`,
    code: nameMap.get(s.product_id)?.productCode ?? "",
    purchasePrice: s.purchase_price,
    salePrice: s.sale_price,
    stockQty: s.stock_qty,
    daysOnShelf: s.days_on_shelf,
    effectiveCost: s.effective_cost,
    trueProfit: s.true_profit,
    trueMarginPct: s.true_margin_pct,
    breakEvenDay: s.break_even_day,
    turnoverDays: s.turnover_days,
    status: s.status,
    extraCost: (s.total_holding_cost + s.total_capital_cost),
  });

  const sorted = [...snaps].map(enrich);
  const topProfit = [...sorted].sort((a, b) => b.trueProfit - a.trueProfit).slice(0, 10);
  const losing = sorted.filter((s) => s.status === "losing").slice(0, 20);
  const stagnant = sorted.filter((s) => s.status === "stagnant").slice(0, 20);
  const stars = sorted.filter((s) => s.status === "star").slice(0, 10);
  const capitalLocked = [...sorted].sort((a, b) => (b.purchasePrice * b.stockQty) - (a.purchasePrice * a.stockQty)).slice(0, 10);

  res.json({
    empty: false,
    totals: { stockValue, dailyHoldingTotal, dailyCapitalTotal, todayBleed },
    topProfit, losing, stagnant, stars, capitalLocked,
    productCount: snaps.length,
  });
});

// ─── AKILLI ÖNERİLER ──────────────────────────────────────────────────
router.get("/advisor", gateAdvisor, requireViewer, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const latestRows = await db.execute(sql`
    SELECT DISTINCT ON (product_id) *
    FROM product_profit_snapshots
    WHERE company_id = ${cid}
    ORDER BY product_id, snapshot_date DESC
  `);
  const snaps = (latestRows.rows ?? []) as any[];
  if (snaps.length === 0) return res.json({ suggestions: [] });

  const productIds = snaps.map((s) => s.product_id);
  const products = await db.select({
    id: productsTable.id, name: productsTable.name, productCode: productsTable.productCode,
    category: productsTable.category,
  }).from(productsTable).where(and(
    eq(productsTable.companyId, cid),
    inArray(productsTable.id, productIds),
  ));
  const nameMap = new Map(products.map((p) => [p.id, p]));

  const suggestions: any[] = [];
  for (const s of snaps) {
    const p = nameMap.get(s.product_id);
    if (!p) continue;
    const base = { productId: s.product_id, productName: p.name, productCode: p.productCode };

    if (s.true_profit < 0) {
      suggestions.push({
        ...base, severity: "critical", type: "losing",
        title: `${p.name} zarar yazıyor`,
        message: `Bu ürün her satışta ₺${Math.abs(s.true_profit).toFixed(2)} zarar ediyor. Fiyatı yükseltin veya stoğu eritin.`,
        action: "Fiyatı en az ₺" + (s.effective_cost * 1.1).toFixed(2) + " yapın",
      });
    } else if (s.status === "low_margin") {
      const newPrice = s.effective_cost * 1.15;
      suggestions.push({
        ...base, severity: "warning", type: "low_margin",
        title: `${p.name} marjı düşük (%${s.true_margin_pct.toFixed(1)})`,
        message: `Gerçek marjı %5'in altında. Fiyatı ₺${newPrice.toFixed(2)} yaparsanız sağlıklı %15 marj kazanırsınız.`,
        action: `Fiyatı ₺${newPrice.toFixed(2)} yapın`,
      });
    } else if (s.status === "stagnant") {
      suggestions.push({
        ...base, severity: "warning", type: "stagnant",
        title: `${p.name} ${s.days_on_shelf} gündür rafta`,
        message: `Sermayenizi kilitliyor (₺${(s.purchase_price * s.stock_qty).toFixed(0)}). İndirim kampanyası veya iadeyi düşünün.`,
        action: `%${Math.min(20, Math.round(s.days_on_shelf / 5))} indirim deneyin`,
      });
    } else if (s.status === "star") {
      suggestions.push({
        ...base, severity: "info", type: "star",
        title: `${p.name} yıldız ürün`,
        message: `Çok kârlı (%${s.true_margin_pct.toFixed(1)} marj) ve hızlı dönüyor (${s.turnover_days?.toFixed(0)} gün). Stoğu artırın!`,
        action: "Stok seviyesini 2x yapın",
      });
    } else if (s.break_even_day && s.break_even_day > 0 && s.break_even_day < 60) {
      suggestions.push({
        ...base, severity: "info", type: "break_even_warning",
        title: `${p.name} ${s.break_even_day} gün sonra zarar yazar`,
        message: `Bu ürün ${s.break_even_day}. günde maliyetlerle dolar. ${s.days_on_shelf} gündür rafta — hızlı satın.`,
        action: "Öncelikli sat veya sergile",
      });
    }
  }

  // Severity'ye göre sırala
  const order = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
  suggestions.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  res.json({ suggestions: suggestions.slice(0, 50) });
});

export default router;
