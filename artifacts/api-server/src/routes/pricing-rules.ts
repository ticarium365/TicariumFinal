import { Router } from "express";
import { z } from "zod";
import { and, eq, asc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  priceEngineRulesTable,
  productsTable,
  productChannelListingsTable,
  computePriceFromRule,
  ruleMatches,
  PRICING_MODES,
  ROUNDING_MODES,
  CHANNEL_KEYS,
  type PricingRule,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

const ruleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  channelKey: z.string().max(50).nullable().optional(),
  categoryFilter: z.array(z.string().max(100)).max(50).nullable().optional(),
  brandFilter: z.array(z.string().max(100)).max(50).nullable().optional(),
  productIds: z.array(z.number().int().positive()).max(500).nullable().optional(),
  mode: z.enum(PRICING_MODES),
  value: z.number().min(-99).max(100000),
  minPrice: z.number().nonnegative().nullable().optional(),
  maxPrice: z.number().nonnegative().nullable().optional(),
  roundingMode: z.enum(ROUNDING_MODES).optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
});

const PATCHABLE = [
  "name", "description", "priority", "isActive", "channelKey",
  "categoryFilter", "brandFilter", "productIds",
  "mode", "value", "minPrice", "maxPrice", "roundingMode",
  "validFrom", "validTo",
] as const;

// LIST
router.get("/", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const rows = await db
    .select()
    .from(priceEngineRulesTable)
    .where(eq(priceEngineRulesTable.companyId, cid))
    .orderBy(asc(priceEngineRulesTable.priority));
  res.json({ items: rows });
});

// CREATE
router.post("/", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz kural", details: parsed.error.flatten() } });
    return;
  }
  const d = parsed.data;
  const [row] = await db.insert(priceEngineRulesTable).values({
    companyId: cid,
    name: d.name,
    description: d.description ?? null,
    priority: d.priority ?? 100,
    isActive: d.isActive ?? true,
    channelKey: d.channelKey ?? null,
    categoryFilter: d.categoryFilter ?? null,
    brandFilter: d.brandFilter ?? null,
    productIds: d.productIds ?? null,
    mode: d.mode,
    value: d.value,
    minPrice: d.minPrice ?? null,
    maxPrice: d.maxPrice ?? null,
    roundingMode: d.roundingMode ?? "none",
    validFrom: d.validFrom ? new Date(d.validFrom) : null,
    validTo: d.validTo ? new Date(d.validTo) : null,
  }).returning();
  res.status(201).json(row);
});

// UPDATE
router.patch("/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz id" } });
    return;
  }
  const parsed = ruleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz veri", details: parsed.error.flatten() } });
    return;
  }
  const update: Record<string, any> = { updatedAt: new Date() };
  for (const k of PATCHABLE) {
    if (k in parsed.data) {
      const v = (parsed.data as any)[k];
      if (k === "validFrom" || k === "validTo") update[k] = v ? new Date(v) : null;
      else update[k] = v;
    }
  }
  if (Object.keys(update).length === 1) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Güncellenecek alan yok" } });
    return;
  }
  const [row] = await db.update(priceEngineRulesTable)
    .set(update)
    .where(and(eq(priceEngineRulesTable.id, id), eq(priceEngineRulesTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kural bulunamadı" } });
    return;
  }
  res.json(row);
});

// DELETE
router.delete("/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const [row] = await db.delete(priceEngineRulesTable)
    .where(and(eq(priceEngineRulesTable.id, id), eq(priceEngineRulesTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kural bulunamadı" } });
    return;
  }
  res.json({ ok: true });
});

// PREVIEW — kural setini bir ürün listesi üzerinde simüle et
router.post("/preview", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const schema = z.object({
    channelKey: z.string().max(50),
    productIds: z.array(z.number().int().positive()).min(1).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz preview parametreleri" } });
    return;
  }
  const { channelKey, productIds } = parsed.data;

  const products = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    productCode: productsTable.productCode,
    category: productsTable.category,
    brand: productsTable.brand,
    purchasePrice: productsTable.purchasePrice,
    salePrice: productsTable.salePrice,
  }).from(productsTable)
    .where(and(eq(productsTable.companyId, cid), inArray(productsTable.id, productIds)));

  const rules = await db.select().from(priceEngineRulesTable)
    .where(and(eq(priceEngineRulesTable.companyId, cid), eq(priceEngineRulesTable.isActive, true)))
    .orderBy(asc(priceEngineRulesTable.priority));

  const results = products.map((p) => {
    const matched = rules.find((r) => ruleMatches({ rule: r as PricingRule, channelKey, product: p }));
    if (!matched) {
      return { productId: p.id, name: p.name, basePrice: p.salePrice, computedPrice: p.salePrice, matchedRuleId: null, matchedRuleName: null };
    }
    const computed = computePriceFromRule({
      basePrice: p.salePrice, purchasePrice: p.purchasePrice, rule: matched as any,
    });
    return {
      productId: p.id, name: p.name, basePrice: p.salePrice,
      computedPrice: computed,
      matchedRuleId: matched.id, matchedRuleName: matched.name,
      delta: Math.round((computed - p.salePrice) * 100) / 100,
      deltaPct: p.salePrice > 0 ? Math.round(((computed - p.salePrice) / p.salePrice) * 10000) / 100 : 0,
    };
  });
  res.json({ items: results });
});

// APPLY — kural setini product_channel_listings tablosuna yaz (idempotent upsert)
router.post("/apply", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const schema = z.object({
    channelKey: z.enum(CHANNEL_KEYS as any),
    dryRun: z.boolean().optional(),
    productIds: z.array(z.number().int().positive()).max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz apply parametreleri" } });
    return;
  }
  const { channelKey, dryRun = false, productIds } = parsed.data;

  const productsQuery = db.select({
    id: productsTable.id,
    category: productsTable.category,
    brand: productsTable.brand,
    purchasePrice: productsTable.purchasePrice,
    salePrice: productsTable.salePrice,
  }).from(productsTable);

  const products = productIds?.length
    ? await productsQuery.where(and(
        eq(productsTable.companyId, cid),
        eq(productsTable.isActive, true),
        inArray(productsTable.id, productIds),
      ))
    : await productsQuery.where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true)));

  const rules = await db.select().from(priceEngineRulesTable)
    .where(and(eq(priceEngineRulesTable.companyId, cid), eq(priceEngineRulesTable.isActive, true)))
    .orderBy(asc(priceEngineRulesTable.priority));

  // Hesapla
  let skipped = 0;
  const rows: Array<{ productId: number; computedPrice: number; minPrice: number | null; ruleId: number }> = [];
  const sample: any[] = [];

  for (const p of products) {
    const matched = rules.find((r) => ruleMatches({ rule: r as PricingRule, channelKey, product: { id: p.id, category: p.category, brand: p.brand } }));
    if (!matched) { skipped++; continue; }
    const computed = computePriceFromRule({
      basePrice: p.salePrice, purchasePrice: p.purchasePrice, rule: matched as any,
    });
    rows.push({ productId: p.id, computedPrice: computed, minPrice: matched.minPrice ?? null, ruleId: matched.id });
    if (sample.length < 5) sample.push({ productId: p.id, computedPrice: computed, ruleId: matched.id });
  }

  if (!dryRun && rows.length > 0) {
    // Aynı (company, channel) için eşzamanlı apply'ı engelle: PostgreSQL advisory lock
    // Hash: companyId + channelKey'in deterministik bigint
    const lockHash = `${cid}-pricing-apply-${channelKey}`;
    let lockKey = 0;
    for (let i = 0; i < lockHash.length; i++) lockKey = ((lockKey << 5) - lockKey + lockHash.charCodeAt(i)) | 0;

    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${lockKey}) as locked`);
    const acquired = (lockResult.rows?.[0] as any)?.locked === true;
    if (!acquired) {
      res.status(409).json({ error: { code: "CONCURRENT_APPLY", message: "Bu kanalda başka bir uygulama işlemi devam ediyor. Lütfen bekleyin." } });
      return;
    }

    try {
      // Chunked batched upsert (parametre limitini aşmamak için 500'lü gruplar)
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await db.insert(productChannelListingsTable).values(
          chunk.map(r => ({
            companyId: cid,
            productId: r.productId,
            channelKey,
            isEnabled: true,
            priceMode: "fixed",
            priceValue: r.computedPrice,
            minPrice: r.minPrice,
          }))
        ).onConflictDoUpdate({
          target: [productChannelListingsTable.companyId, productChannelListingsTable.productId, productChannelListingsTable.channelKey],
          set: {
            priceMode: sql`EXCLUDED.price_mode`,
            priceValue: sql`EXCLUDED.price_value`,
            minPrice: sql`EXCLUDED.min_price`,
            updatedAt: new Date(),
          },
        });
      }
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
    }
  }
  res.json({ ok: true, dryRun, processed: products.length, updated: rows.length, skipped, sample });
});

export default router;
