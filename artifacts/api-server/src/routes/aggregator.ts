import { Router, type Request, type Response } from "express";
import {
  db,
  aggregatorListingsTable,
  productsTable,
  companiesTable,
  normalizeMatchKey,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// =================== PUBLIC (no auth) ===================
// GET /api/public/v1/pazar — cross-tenant aggregator marketplace listing
export const aggregatorPublicRouter = Router();
aggregatorPublicRouter.get("/public/v1/pazar", async (req: Request, res: Response) => {
  const q = (req.query.q as string || "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));

  // chosen=true ve aktif olanları, en ucuzdan; her match_key için bir tane (chosen)
  const baseConds: any[] = [
    eq(aggregatorListingsTable.status, "active"),
    eq(aggregatorListingsTable.chosen, true),
  ];

  const rows = await db
    .select({
      id: aggregatorListingsTable.id,
      matchKey: aggregatorListingsTable.matchKey,
      salePrice: aggregatorListingsTable.salePrice,
      sourceCompanyId: aggregatorListingsTable.sourceCompanyId,
      productId: productsTable.id,
      productName: productsTable.name,
      barcode: productsTable.barcode,
      stock: productsTable.stock,
      brand: productsTable.brand,
      category: productsTable.category,
      companyName: companiesTable.name,
    })
    .from(aggregatorListingsTable)
    .innerJoin(productsTable, eq(productsTable.id, aggregatorListingsTable.sourceProductId))
    .innerJoin(companiesTable, eq(companiesTable.id, aggregatorListingsTable.sourceCompanyId))
    .where(and(...baseConds))
    .orderBy(aggregatorListingsTable.salePrice)
    .limit(limit);

  let filtered = rows as any[];
  if (q) {
    filtered = filtered.filter((r) =>
      String(r.productName || "").toLowerCase().includes(q) ||
      String(r.brand || "").toLowerCase().includes(q) ||
      String(r.category || "").toLowerCase().includes(q) ||
      String(r.barcode || "").toLowerCase().includes(q)
    );
  }
  res.json({
    count: filtered.length,
    items: filtered.map((r: any) => ({
      id: r.id,
      name: r.productName,
      brand: r.brand,
      category: r.category,
      barcode: r.barcode,
      imageUrl: r.imageUrl,
      stock: r.stock || 0,
      price: r.salePrice,
      seller: r.companyName,
    })),
  });
});

// =================== AUTH (super admin only) ===================
router.use(requireAuth);
const requireAdmin = requireRole(["super_admin", "admin"]);

// GET /api/aggregator/listings — şu anki firmanın aday/aktif kayıtlarını listele
router.get("/aggregator/listings", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const status = (req.query.status as string) || null;
  const conds: any[] = [eq(aggregatorListingsTable.sourceCompanyId, companyId)];
  if (status) conds.push(eq(aggregatorListingsTable.status, status));
  const rows = await db.select({
    id: aggregatorListingsTable.id,
    matchKey: aggregatorListingsTable.matchKey,
    sourceProductId: aggregatorListingsTable.sourceProductId,
    sourcePrice: aggregatorListingsTable.sourcePrice,
    marginPct: aggregatorListingsTable.marginPct,
    salePrice: aggregatorListingsTable.salePrice,
    status: aggregatorListingsTable.status,
    chosen: aggregatorListingsTable.chosen,
    productName: productsTable.name,
    barcode: productsTable.barcode,
    stock: productsTable.stock,
  })
    .from(aggregatorListingsTable)
    .leftJoin(productsTable, eq(productsTable.id, aggregatorListingsTable.sourceProductId))
    .where(and(...conds))
    .orderBy(desc(aggregatorListingsTable.updatedAt));
  res.json(rows);
});

// Atomic CTE: her etkilenen match_key için en ucuz active satırı chosen=true, diğerleri false
async function recomputeChosen(matchKeys: string[]) {
  if (!matchKeys.length) return;
  const uniq = Array.from(new Set(matchKeys));
  // advisory lock — eşzamanlı recompute'ları sırala (sabit anahtar)
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7390737)`);
    // 1) Tüm chosen=false (etkilenen keylerde)
    await tx.update(aggregatorListingsTable)
      .set({ chosen: false })
      .where(inArray(aggregatorListingsTable.matchKey, uniq));
    // 2) Her key için en ucuz active'i bul ve chosen=true yap (CTE ile tek statement)
    const winnersRes = await tx.execute(sql`
      SELECT DISTINCT ON (match_key) id
      FROM aggregator_listings
      WHERE match_key IN ${uniq.length === 1 ? sql`(${uniq[0]})` : sql.raw(`(${uniq.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")})`)}
        AND status = 'active'
      ORDER BY match_key, sale_price ASC, id ASC
    `);
    const winnerIds = (winnersRes.rows as any[]).map((r) => Number(r.id));
    if (winnerIds.length) {
      await tx.update(aggregatorListingsTable)
        .set({ chosen: true })
        .where(inArray(aggregatorListingsTable.id, winnerIds));
    }
  });
}

async function getKeyOfListing(id: number, companyId: number): Promise<string | null> {
  const [row] = await db.select({ k: aggregatorListingsTable.matchKey })
    .from(aggregatorListingsTable)
    .where(and(eq(aggregatorListingsTable.id, id), eq(aggregatorListingsTable.sourceCompanyId, companyId)))
    .limit(1);
  return row?.k ?? null;
}

// POST /api/aggregator/scan — şirketin satılır ürünlerini aday listeye yansıt
router.post("/aggregator/scan", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const marginPct = Number(req.body?.marginPct ?? 15);
  const minStock = Number(req.body?.minStock ?? 1);
  const products = await db.select().from(productsTable)
    .where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive as any, true)));
  let inserted = 0, updated = 0;
  for (const p of products as any[]) {
    if ((p.stock || 0) < minStock) continue;
    if (!p.salePrice || Number(p.salePrice) <= 0) continue;
    const key = normalizeMatchKey(p.name || "", p.barcode);
    const sourcePrice = Number(p.salePrice);
    const salePrice = Math.round(sourcePrice * (1 + marginPct / 100) * 100) / 100;
    const existing = await db.select().from(aggregatorListingsTable).where(and(
      eq(aggregatorListingsTable.sourceCompanyId, companyId),
      eq(aggregatorListingsTable.sourceProductId, p.id),
    )).limit(1);
    if (existing.length) {
      await db.update(aggregatorListingsTable).set({
        matchKey: key, sourcePrice, marginPct, salePrice, updatedAt: new Date(),
      }).where(eq(aggregatorListingsTable.id, existing[0].id));
      updated++;
    } else {
      await db.insert(aggregatorListingsTable).values({
        matchKey: key, sourceCompanyId: companyId, sourceProductId: p.id,
        sourcePrice, marginPct, salePrice, status: "candidate", chosen: false,
      });
      inserted++;
    }
  }
  // Bu şirketin tüm match_key'leri için chosen'i atomik recompute et
  const keysRes = await db.execute(sql`
    SELECT DISTINCT match_key FROM aggregator_listings WHERE source_company_id = ${companyId}
  `);
  const keys = (keysRes.rows as any[]).map((r) => r.match_key as string);
  await recomputeChosen(keys);
  res.json({ inserted, updated, scanned: (products as any[]).length });
});

router.post("/aggregator/listings/:id/activate", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const [row] = await db.update(aggregatorListingsTable).set({ status: "active", updatedAt: new Date() })
    .where(and(eq(aggregatorListingsTable.id, id), eq(aggregatorListingsTable.sourceCompanyId, companyId)))
    .returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  await recomputeChosen([row.matchKey]);
  res.json(row);
});

router.post("/aggregator/listings/:id/pause", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  // önce key'i al; pause sonrası chosen=false (active filtrelendiği için recompute zaten kaldıracak)
  const [row] = await db.update(aggregatorListingsTable).set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(aggregatorListingsTable.id, id), eq(aggregatorListingsTable.sourceCompanyId, companyId)))
    .returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  await recomputeChosen([row.matchKey]);
  res.json(row);
});

router.put("/aggregator/listings/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const { marginPct } = req.body || {};
  const [existing] = await db.select().from(aggregatorListingsTable)
    .where(and(eq(aggregatorListingsTable.id, id), eq(aggregatorListingsTable.sourceCompanyId, companyId)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const m = Number(marginPct ?? existing.marginPct);
  const newSale = Math.round(Number(existing.sourcePrice) * (1 + m / 100) * 100) / 100;
  const [row] = await db.update(aggregatorListingsTable).set({
    marginPct: m, salePrice: newSale, updatedAt: new Date(),
  }).where(eq(aggregatorListingsTable.id, id)).returning();
  await recomputeChosen([existing.matchKey]);
  res.json(row);
});

router.delete("/aggregator/listings/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const key = await getKeyOfListing(Number(req.params.id), companyId);
  await db.delete(aggregatorListingsTable).where(and(
    eq(aggregatorListingsTable.id, Number(req.params.id)),
    eq(aggregatorListingsTable.sourceCompanyId, companyId),
  ));
  if (key) await recomputeChosen([key]);
  res.json({ ok: true });
});

router.get("/aggregator/stats", requireAdmin, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const r = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'candidate') AS candidate,
      COUNT(*) FILTER (WHERE status = 'active') AS active,
      COUNT(*) FILTER (WHERE status = 'paused') AS paused,
      COUNT(*) FILTER (WHERE chosen = true) AS chosen
    FROM aggregator_listings WHERE source_company_id = ${companyId}
  `);
  res.json((r.rows as any[])[0] || {});
});

export default router;
