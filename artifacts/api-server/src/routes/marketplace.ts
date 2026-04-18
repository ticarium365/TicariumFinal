import { Router, type Request, type Response } from "express";
import {
  db, channelAccountsTable, productChannelMappingsTable, pricingRulesTable,
  stockRulesTable, syncJobsTable, syncLogsTable, productsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { getProviderForAccount, MP_META, MP_REGISTRY, logSync } from "../services/marketplace/factory.js";
import { applyPricingRule, applyStockRule } from "../services/marketplace/types.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

function maskCreds(c: Record<string, any> | null | undefined) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(c || {})) {
    if (typeof v === "string" && /password|secret|token|apikey|key/i.test(k)) {
      out[k] = v ? "********" : "";
    } else out[k] = v;
  }
  return out;
}
function sanitizeAccount(a: any) { return a ? { ...a, credentials: maskCreds(a.credentials) } : a; }

// ─── Providers ────────────────────────────────────────────────────────────────
router.get("/providers", (_req, res) => res.json(MP_META));

// ─── Accounts (mağazalar) ────────────────────────────────────────────────────
router.get("/accounts", async (req, res) => {
  const companyId = req.companyId!;
  const rows = await db.select().from(channelAccountsTable)
    .where(eq(channelAccountsTable.companyId, companyId)).orderBy(desc(channelAccountsTable.createdAt));
  res.json(rows.map(sanitizeAccount));
});

router.post("/accounts", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const { provider, name, sandbox, credentials, settings } = req.body || {};
  if (!provider || !name) return res.status(400).json({ error: "provider ve name zorunlu" });
  if (!MP_REGISTRY[provider]) return res.status(400).json({ error: "Bilinmeyen provider" });
  const [row] = await db.insert(channelAccountsTable).values({
    companyId, provider, name, sandbox: sandbox !== false,
    credentials: credentials || {}, settings: settings || {},
  }).returning();
  res.status(201).json(sanitizeAccount(row));
});

router.put("/accounts/:id", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const [existing] = await db.select().from(channelAccountsTable)
    .where(and(eq(channelAccountsTable.id, id), eq(channelAccountsTable.companyId, companyId))).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const merged = { ...(existing.credentials as any || {}) };
  for (const [k, v] of Object.entries(req.body?.credentials || {})) {
    if (typeof v === "string" && v === "********") continue;
    merged[k] = v;
  }
  const patch: any = { updatedAt: new Date(), credentials: merged };
  for (const k of ["name", "sandbox", "isActive", "settings"]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  const [row] = await db.update(channelAccountsTable).set(patch)
    .where(and(eq(channelAccountsTable.id, id), eq(channelAccountsTable.companyId, companyId))).returning();
  res.json(sanitizeAccount(row));
});

router.delete("/accounts/:id", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  await db.delete(channelAccountsTable).where(and(
    eq(channelAccountsTable.id, Number(req.params.id)),
    eq(channelAccountsTable.companyId, companyId),
  ));
  res.json({ ok: true });
});

router.post("/accounts/:id/health-check", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  try {
    const { provider } = await getProviderForAccount(companyId, id);
    const result = await provider.healthCheck();
    await db.update(channelAccountsTable).set({
      lastHealthOk: result.ok, lastHealthMessage: result.message, lastSyncAt: new Date(),
    }).where(eq(channelAccountsTable.id, id));
    await logSync({ companyId, accountId: id, operation: "health_check",
      level: result.ok ? "info" : "warn", status: result.ok ? "success" : "failed",
      message: result.message });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message });
  }
});

// ─── Mappings ────────────────────────────────────────────────────────────────
router.get("/accounts/:id/mappings", async (req, res) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const rows = await db.select().from(productChannelMappingsTable)
    .where(and(eq(productChannelMappingsTable.companyId, companyId), eq(productChannelMappingsTable.accountId, id)));
  res.json(rows);
});

router.post("/accounts/:id/mappings", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const accountId = Number(req.params.id);
  // Ownership: hesap bu firmaya mı ait?
  const [own] = await db.select({ id: channelAccountsTable.id }).from(channelAccountsTable).where(and(
    eq(channelAccountsTable.id, accountId), eq(channelAccountsTable.companyId, companyId),
  )).limit(1);
  if (!own) return res.status(404).json({ error: "account_not_found" });
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  const productIds = Array.from(new Set(items.map((i: any) => Number(i.productId)).filter(Boolean)));
  if (productIds.length === 0) return res.status(400).json({ error: "productId yok" });
  // Tüm productId'lerin bu firmaya ait olduğunu doğrula
  const validProducts = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.companyId, companyId), sql`${productsTable.id} = ANY(${productIds})`));
  const validSet = new Set(validProducts.map((r: any) => r.id));
  const inserted: any[] = [];
  for (const it of items) {
    if (!validSet.has(Number(it.productId))) continue;
    const [row] = await db.insert(productChannelMappingsTable).values({
      companyId, accountId, productId: it.productId,
      channelSku: it.channelSku || null, channelBarcode: it.channelBarcode || null,
      priceOverride: it.priceOverride ?? null, stockOverride: it.stockOverride ?? null,
      isPublished: !!it.isPublished, isActive: it.isActive !== false,
    }).onConflictDoNothing({ target: [productChannelMappingsTable.accountId, productChannelMappingsTable.productId] }).returning();
    if (row) inserted.push(row);
  }
  res.status(201).json({ inserted: inserted.length, items: inserted, skipped: items.length - inserted.length });
});

// ─── Pricing & Stock Rules ───────────────────────────────────────────────────
router.get("/pricing-rules", async (req, res) => {
  const rows = await db.select().from(pricingRulesTable)
    .where(eq(pricingRulesTable.companyId, req.companyId!)).orderBy(pricingRulesTable.priority);
  res.json(rows);
});
router.post("/pricing-rules", requireWriter, async (req, res) => {
  const [row] = await db.insert(pricingRulesTable).values({
    companyId: req.companyId!, ...req.body,
  }).returning();
  res.status(201).json(row);
});
router.delete("/pricing-rules/:id", requireWriter, async (req, res) => {
  await db.delete(pricingRulesTable).where(and(
    eq(pricingRulesTable.id, Number(req.params.id)),
    eq(pricingRulesTable.companyId, req.companyId!),
  ));
  res.json({ ok: true });
});
router.get("/stock-rules", async (req, res) => {
  const rows = await db.select().from(stockRulesTable)
    .where(eq(stockRulesTable.companyId, req.companyId!)).orderBy(stockRulesTable.priority);
  res.json(rows);
});
router.post("/stock-rules", requireWriter, async (req, res) => {
  const [row] = await db.insert(stockRulesTable).values({
    companyId: req.companyId!, ...req.body,
  }).returning();
  res.status(201).json(row);
});
router.delete("/stock-rules/:id", requireWriter, async (req, res) => {
  await db.delete(stockRulesTable).where(and(
    eq(stockRulesTable.id, Number(req.params.id)),
    eq(stockRulesTable.companyId, req.companyId!),
  ));
  res.json({ ok: true });
});

router.post("/preview-pricing", async (req, res) => {
  const { basePrice, rules } = req.body || {};
  let p = Number(basePrice) || 0;
  for (const r of (rules || [])) p = applyPricingRule(p, r);
  res.json({ finalPrice: p });
});
router.post("/preview-stock", async (req, res) => {
  const { physicalStock, rule } = req.body || {};
  res.json({ finalStock: applyStockRule(Number(physicalStock) || 0, rule || {}) });
});

// ─── Sync Jobs (kuyruğa al) ──────────────────────────────────────────────────
router.get("/jobs", async (req, res) => {
  const rows = await db.select().from(syncJobsTable)
    .where(eq(syncJobsTable.companyId, req.companyId!))
    .orderBy(desc(syncJobsTable.createdAt)).limit(100);
  res.json(rows);
});

router.post("/jobs", requireWriter, async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const { accountId, jobType, payload, priority } = req.body || {};
  if (!accountId || !jobType) return res.status(400).json({ error: "accountId ve jobType zorunlu" });
  // Ownership: hesap bu firmaya mı ait?
  const [own] = await db.select({ id: channelAccountsTable.id }).from(channelAccountsTable).where(and(
    eq(channelAccountsTable.id, Number(accountId)),
    eq(channelAccountsTable.companyId, companyId),
  )).limit(1);
  if (!own) return res.status(404).json({ error: "account_not_found" });
  const [row] = await db.insert(syncJobsTable).values({
    companyId, accountId, jobType, payload: payload || {}, priority: priority ?? 100, createdBy: userId,
  }).returning();
  res.status(201).json(row);
});

router.get("/logs", async (req, res) => {
  const rows = await db.select().from(syncLogsTable)
    .where(eq(syncLogsTable.companyId, req.companyId!))
    .orderBy(desc(syncLogsTable.createdAt)).limit(100);
  res.json(rows);
});

router.get("/stats", async (req, res) => {
  const companyId = req.companyId!;
  const accounts = await db.execute(sql`SELECT COUNT(*)::int AS count FROM channel_accounts WHERE company_id = ${companyId} AND is_active = true`);
  const jobs = await db.execute(sql`SELECT status, COUNT(*)::int AS count FROM sync_jobs WHERE company_id = ${companyId} GROUP BY status`);
  const mappings = await db.execute(sql`SELECT COUNT(*)::int AS count FROM product_channel_mappings WHERE company_id = ${companyId} AND is_published = true`);
  res.json({ accounts: accounts.rows, jobs: jobs.rows, publishedMappings: mappings.rows });
});

export default router;
