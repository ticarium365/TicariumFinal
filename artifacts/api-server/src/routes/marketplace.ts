import { Router, type Request, type Response } from "express";
import {
  db, channelAccountsTable, productChannelMappingsTable, pricingRulesTable, marketplaceOrdersTable,
  salesTable, productsTable, stockMovementsTable, customersTable,
  stockRulesTable, syncJobsTable, syncLogsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { idempotencyMiddleware } from "../middlewares/idempotency.js";
import { getProviderForAccount, MP_META, MP_REGISTRY, logSync } from "../services/marketplace/factory.js";
import { applyPricingRule, applyStockRule } from "../services/marketplace/types.js";
import { encryptSecrets } from "../lib/secret-crypto.js";

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
    credentials: encryptSecrets(credentials || {}, true), settings: settings || {},
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
  const patch: any = { updatedAt: new Date(), credentials: encryptSecrets(merged) };
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
  const orders = await db.execute(sql`SELECT status, COUNT(*)::int AS count FROM marketplace_orders WHERE company_id = ${companyId} GROUP BY status`);
  res.json({ accounts: accounts.rows, jobs: jobs.rows, publishedMappings: mappings.rows, orders: orders.rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE ORDERS — Sprint 51-55 (list, get, convert-to-sale)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  const companyId = req.companyId!;
  const { accountId, channelKey, status, converted, limit = "100" } = req.query as any;
  const conds = [eq(marketplaceOrdersTable.companyId, companyId)];
  if (accountId) conds.push(eq(marketplaceOrdersTable.accountId, Number(accountId)));
  if (channelKey) conds.push(eq(marketplaceOrdersTable.channelKey, String(channelKey)));
  if (status) conds.push(eq(marketplaceOrdersTable.status, String(status)));
  if (converted === "true") conds.push(sql`${marketplaceOrdersTable.convertedSaleId} IS NOT NULL`);
  if (converted === "false") conds.push(sql`${marketplaceOrdersTable.convertedSaleId} IS NULL`);
  const rows = await db.select().from(marketplaceOrdersTable).where(and(...conds))
    .orderBy(desc(marketplaceOrdersTable.pulledAt)).limit(Math.min(500, Number(limit) || 100));
  res.json(rows);
});

router.get("/orders/:id", async (req, res) => {
  const [row] = await db.select().from(marketplaceOrdersTable)
    .where(and(eq(marketplaceOrdersTable.id, Number(req.params.id)),
               eq(marketplaceOrdersTable.companyId, req.companyId!))).limit(1);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

/**
 * POST /marketplace/orders/:id/convert-to-sale
 * Idempotent: convertedSaleId set ise mevcut sale ID döner, hiç insert yapılmaz.
 * Transactional: Sale insert + stock decrement + stock_movement + order.convertedSaleId atomik.
 * Multi-item: Her item için ayrı sale satırı; convertedSaleId = ilk satışın id'si.
 * Item product matching: önce product_channel_mappings (channelSku/externalProductId),
 * fallback olarak products tablosunda barcode/productCode.
 */
router.post("/orders/:id/convert-to-sale", requireWriter, idempotencyMiddleware, async (req, res) => {
  const companyId = req.companyId!;
  const orderId = Number(req.params.id);
  const userId = req.session.user?.id;
  const userName = req.session.user?.fullName || req.session.user?.username;

  try {
    const result = await db.transaction(async (tx) => {
      // FOR UPDATE: paralel convert isteklerini serileştir
      const [order] = await tx.execute(sql`
        SELECT * FROM marketplace_orders
        WHERE id = ${orderId} AND company_id = ${companyId}
        FOR UPDATE
      `).then((r: any) => r.rows);
      if (!order) return { status: 404, body: { error: "order_not_found" } };

      // Idempotent: zaten dönüştürülmüşse mevcut bilgiyi dön (account+channel+order scope'lu)
      if (order.converted_sale_id) {
        const sales = await tx.select().from(salesTable)
          .where(and(eq(salesTable.companyId, companyId),
                     eq(salesTable.channelKey, order.channel_key),
                     eq(salesTable.channelOrderId, order.external_order_id)));
        return { status: 200, body: {
          alreadyConverted: true, orderId: order.id,
          primarySaleId: order.converted_sale_id, sales,
        } };
      }

      const items = (order.items_json || []) as any[];
      if (!items.length) return { status: 400, body: { error: "no_items" } };

      const createdSales: any[] = [];
      const skipped: any[] = [];
      // All-or-nothing: ilk skip'te tüm tx rollback edilir
      let abortReason: string | null = null;

      for (const it of items) {
        // 1. Mapping: önce externalProductId, sonra channelSku — ardışık dene
        let productId: number | null = null;
        const channelSku = it.channelSku || it.sku;
        const extPid = it.externalProductId;
        if (extPid) {
          const [m] = await tx.select().from(productChannelMappingsTable).where(and(
            eq(productChannelMappingsTable.companyId, companyId),
            eq(productChannelMappingsTable.accountId, order.account_id),
            eq(productChannelMappingsTable.externalProductId, String(extPid)),
          )).limit(1);
          if (m) productId = m.productId;
        }
        if (!productId && channelSku) {
          const [m] = await tx.select().from(productChannelMappingsTable).where(and(
            eq(productChannelMappingsTable.companyId, companyId),
            eq(productChannelMappingsTable.accountId, order.account_id),
            eq(productChannelMappingsTable.channelSku, String(channelSku)),
          )).limit(1);
          if (m) productId = m.productId;
        }
        // 2. Fallback: barcode (channelBarcode veya barcode), sonra productCode (channelSku ile eşleştir)
        const barcode = it.channelBarcode || it.barcode;
        if (!productId && barcode) {
          const [p] = await tx.select().from(productsTable).where(and(
            eq(productsTable.companyId, companyId),
            eq(productsTable.barcode, String(barcode)),
          )).limit(1);
          if (p) productId = p.id;
        }
        if (!productId && channelSku) {
          const [p] = await tx.select().from(productsTable).where(and(
            eq(productsTable.companyId, companyId),
            eq(productsTable.productCode, String(channelSku)),
          )).limit(1);
          if (p) productId = p.id;
        }
        if (!productId) {
          skipped.push({ item: it, reason: "product_not_matched" });
          abortReason = abortReason || "product_not_matched";
          continue;
        }

        // Ürünü kilitle (stok yarışı)
        const [product] = await tx.execute(sql`
          SELECT * FROM products WHERE id = ${productId} AND company_id = ${companyId} FOR UPDATE
        `).then((r: any) => r.rows);
        if (!product) {
          skipped.push({ item: it, reason: "product_disappeared" });
          abortReason = abortReason || "product_disappeared";
          continue;
        }

        const qty = Number(it.quantity || 1);
        const unitPrice = Number(it.unitPrice || (Number(it.totalPrice || 0) / Math.max(1, qty)) || 0);
        const totalPrice = Number(it.totalPrice ?? unitPrice * qty);
        const purchasePrice = Number(product.purchase_price || 0);
        const profit = (unitPrice - purchasePrice) * qty;

        if ((product.stock || 0) < qty) {
          skipped.push({ item: it, reason: "insufficient_stock", available: product.stock, requested: qty });
          abortReason = abortReason || "insufficient_stock";
          continue;
        }

        // Sale insert
        const [sale] = await tx.insert(salesTable).values({
          companyId, productId,
          productName: product.name,
          productCode: product.product_code,
          barcode: product.barcode || null,
          quantity: qty,
          unitPrice, totalPrice,
          purchasePrice, profit,
          userId, soldBy: userName,
          paymentMethod: "transfer",
          channelKey: order.channel_key,
          channelOrderId: order.external_order_id,
        } as any).returning();
        createdSales.push(sale);

        // Stok düş
        await tx.update(productsTable).set({
          stock: (product.stock || 0) - qty, updatedAt: new Date(),
        }).where(eq(productsTable.id, productId));

        // Stock movement
        await tx.insert(stockMovementsTable).values({
          companyId, productId,
          productName: product.name, productCode: product.product_code,
          type: "sale", quantity: -qty,
          note: `Pazaryeri ${order.channel_key} sipariş #${order.external_order_id}`,
          refId: sale.id,
          createdBy: userName,
        } as any);
      }

      // All-or-nothing: bir item bile başarısızsa tüm tx rollback (throw → drizzle rollback)
      if (abortReason) {
        // Throw ederek rollback'i tetikle; çağrı dışında 422 olarak yanıtla
        const err: any = new Error("conversion_aborted");
        err.code = "ABORT";
        err.skipped = skipped;
        err.abortReason = abortReason;
        throw err;
      }
      if (!createdSales.length) {
        return { status: 422, body: { error: "no_sales_created", skipped } };
      }

      // Order'ı işaretle (idempotency için)
      const primarySaleId = createdSales[0].id;
      await tx.update(marketplaceOrdersTable).set({
        convertedSaleId: primarySaleId,
        convertedAt: new Date(),
        status: "invoiced",
        updatedAt: new Date(),
      }).where(eq(marketplaceOrdersTable.id, orderId));

      return { status: 200, body: {
        ok: true, orderId, primarySaleId, sales: createdSales, skipped,
      } };
    });
    res.status(result.status).json(result.body);
  } catch (e: any) {
    if (e?.code === "ABORT") {
      return res.status(422).json({
        error: "conversion_aborted",
        reason: e.abortReason,
        skipped: e.skipped || [],
      });
    }
    req.log?.error({ err: e }, "convert-to-sale failed");
    res.status(500).json({ error: "conversion_failed", message: e?.message });
  }
});

export default router;
