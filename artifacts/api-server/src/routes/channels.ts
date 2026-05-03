import { Router, Request, Response } from "express";
import {
  db,
  productsTable,
  productChannelListingsTable,
  channelCredentialsTable,
  channelSyncLogsTable,
  CHANNEL_DEFINITIONS,
  CHANNEL_KEYS,
  computeEffectivePrice,
  computeEffectiveStock,
} from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getAdapter, hasAdapter } from "../services/channels/adapters.js";

const router = Router();
router.use(requireAuth);

function credentialsLookConfigured(creds: unknown): boolean {
  if (!creds || typeof creds !== "object") return false;
  return Object.values(creds as Record<string, unknown>).some((v) => {
    if (v == null) return false;
    const s = String(v).trim();
    if (!s) return false;
    if (s.includes("***")) return false;
    return true;
  });
}

const PRICE_MODES = ["fixed", "markup_pct", "markup_amount", "base"] as const;
const STOCK_MODES = ["full", "buffer", "fixed", "percent"] as const;

const listingPatchSchema = z.object({
  isEnabled: z.boolean().optional(),
  customTitle: z.string().max(300).nullable().optional(),
  customDescription: z.string().max(2000).nullable().optional(),
  customSku: z.string().max(120).nullable().optional(),
  customCategory: z.string().max(120).nullable().optional(),
  customImageUrl: z.string().max(500).nullable().optional(),
  priceMode: z.enum(PRICE_MODES).optional(),
  priceValue: z.number().nullable().optional(),
  minPrice: z.number().min(0).nullable().optional(),
  campaignPrice: z.number().min(0).nullable().optional(),
  campaignStartsAt: z.string().datetime().nullable().optional(),
  campaignEndsAt: z.string().datetime().nullable().optional(),
  stockMode: z.enum(STOCK_MODES).optional(),
  stockValue: z.number().nullable().optional(),
  minStockShow: z.number().int().min(0).nullable().optional(),
  maxStockShow: z.number().int().min(0).nullable().optional(),
  stopBelowCritical: z.boolean().optional(),
});

function projectListing(l: any, p: { salePrice: number; stock: number; minStock: number }) {
  return {
    ...l,
    effectivePrice: computeEffectivePrice({
      basePrice: p.salePrice,
      mode: l.priceMode,
      value: l.priceValue,
      minPrice: l.minPrice,
      campaignPrice: l.campaignPrice,
      campaignStartsAt: l.campaignStartsAt ? new Date(l.campaignStartsAt) : null,
      campaignEndsAt: l.campaignEndsAt ? new Date(l.campaignEndsAt) : null,
    }),
    effectiveStock: computeEffectiveStock({
      baseStock: p.stock,
      minStock: p.minStock,
      mode: l.stockMode,
      value: l.stockValue,
      minStockShow: l.minStockShow,
      maxStockShow: l.maxStockShow,
      stopBelowCritical: l.stopBelowCritical,
    }),
  };
}

router.get("/", async (_req: Request, res: Response) => {
  res.json(CHANNEL_DEFINITIONS);
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select({
        channelKey: productChannelListingsTable.channelKey,
        enabled: sql<number>`COUNT(*) FILTER (WHERE ${productChannelListingsTable.isEnabled} = true)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(productChannelListingsTable)
      .where(eq(productChannelListingsTable.companyId, companyId))
      .groupBy(productChannelListingsTable.channelKey);
    const map: Record<string, { enabled: number; total: number }> = {};
    for (const r of rows) map[r.channelKey] = { enabled: Number(r.enabled), total: Number(r.total) };
    res.json(map);
  } catch (err) {
    req.log.error({ err }, "channel stats failed");
    res.status(500).json({ error: "İstatistik alınamadı" });
  }
});

/** Logo + bağlantı rozeti + son senkron için kanal başına özet (liste ekranı) */
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const [statsRows, credRows, errLogs] = await Promise.all([
      db
        .select({
          channelKey: productChannelListingsTable.channelKey,
          enabled: sql<number>`COUNT(*) FILTER (WHERE ${productChannelListingsTable.isEnabled} = true)`,
          total: sql<number>`COUNT(*)`,
        })
        .from(productChannelListingsTable)
        .where(eq(productChannelListingsTable.companyId, companyId))
        .groupBy(productChannelListingsTable.channelKey),
      db.select().from(channelCredentialsTable).where(eq(channelCredentialsTable.companyId, companyId)),
      db
        .select({
          channelKey: channelSyncLogsTable.channelKey,
          errorMessage: channelSyncLogsTable.errorMessage,
        })
        .from(channelSyncLogsTable)
        .where(and(eq(channelSyncLogsTable.companyId, companyId), eq(channelSyncLogsTable.status, "error")))
        .orderBy(desc(channelSyncLogsTable.createdAt))
        .limit(400),
    ]);

    const statsMap: Record<string, { enabled: number; total: number }> = {};
    for (const r of statsRows) {
      statsMap[r.channelKey] = { enabled: Number(r.enabled), total: Number(r.total) };
    }
    const credByKey = Object.fromEntries(credRows.map((c) => [c.channelKey, c]));

    const latestErrByChannel: Record<string, string> = {};
    for (const r of errLogs) {
      if (latestErrByChannel[r.channelKey] != null) continue;
      if (r.errorMessage) latestErrByChannel[r.channelKey] = r.errorMessage;
    }

    const items = CHANNEL_DEFINITIONS.map((def) => {
      const stat = statsMap[def.key] ?? { enabled: 0, total: 0 };
      const cred = credByKey[def.key];
      const configured = cred ? credentialsLookConfigured(cred.credentials) : false;
      const adapter = hasAdapter(def.key);

      let connectionStatus: "connected" | "error" | "pending" | "n/a" = "n/a";
      let healthMessage: string | null = null;

      if (adapter) {
        if (!cred || !configured) {
          connectionStatus = "pending";
          healthMessage = "API bilgileri eksik veya kayıtlı değil";
        } else if (!cred.isActive) {
          connectionStatus = "pending";
          healthMessage = "Bağlantı pasif";
        } else if (cred.lastSyncStatus === "error") {
          connectionStatus = "error";
          healthMessage = latestErrByChannel[def.key] ?? "Son senkronizasyon başarısız";
        } else if (cred.lastSyncAt && (cred.lastSyncStatus === "success" || cred.lastSyncStatus === "partial")) {
          connectionStatus = "connected";
        } else if (!cred.lastSyncAt) {
          connectionStatus = "pending";
          healthMessage = "Henüz senkron tetiklenmedi";
        } else {
          connectionStatus = "pending";
          healthMessage = cred.lastSyncStatus ? `Durum: ${cred.lastSyncStatus}` : null;
        }
      }

      return {
        key: def.key,
        label: def.label,
        category: def.category,
        color: def.color,
        listingEnabled: stat.enabled,
        listingTotal: stat.total,
        adapter,
        connectionStatus,
        lastSyncAt:
          cred?.lastSyncAt != null ? new Date(cred.lastSyncAt as Date).toISOString() : null,
        healthMessage,
      };
    });

    res.json({ items });
  } catch (err) {
    req.log.error({ err }, "channel overview failed");
    res.status(500).json({ error: "Özet alınamadı" });
  }
});

router.get("/:channelKey/listings", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const channelKey = String(req.params.channelKey);
    if (!CHANNEL_KEYS.includes(channelKey as any)) return res.status(400).json({ error: "Geçersiz kanal" });
    const onlyEnabled = req.query.enabled === "true";

    const products = await db
      .select({
        id: productsTable.id,
        productCode: productsTable.productCode,
        name: productsTable.name,
        brand: productsTable.brand,
        category: productsTable.category,
        salePrice: productsTable.salePrice,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
        isActive: productsTable.isActive,
      })
      .from(productsTable)
      .where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive, true)));

    const listings = await db
      .select()
      .from(productChannelListingsTable)
      .where(
        and(
          eq(productChannelListingsTable.companyId, companyId),
          eq(productChannelListingsTable.channelKey, channelKey)
        )
      );
    const byProduct = new Map(listings.map((l) => [l.productId, l]));

    const items = products.map((p) => {
      const l = byProduct.get(p.id);
      if (!l) {
        return {
          product: p,
          listing: null,
          isEnabled: false,
          effectivePrice: p.salePrice,
          effectiveStock: p.stock,
        };
      }
      return { product: p, listing: l, ...projectListing(l, p) };
    });

    res.json(onlyEnabled ? items.filter((i) => i.isEnabled) : items);
  } catch (err) {
    req.log.error({ err }, "channel listings failed");
    res.status(500).json({ error: "Liste alınamadı" });
  }
});

router.get("/products/:productId/all", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: "Geçersiz id" });
    const [p] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)))
      .limit(1);
    if (!p) return res.status(404).json({ error: "Ürün bulunamadı" });

    const listings = await db
      .select()
      .from(productChannelListingsTable)
      .where(
        and(
          eq(productChannelListingsTable.companyId, companyId),
          eq(productChannelListingsTable.productId, productId)
        )
      );
    const byKey = new Map(listings.map((l) => [l.channelKey, l]));

    const channels = CHANNEL_DEFINITIONS.map((c) => {
      const l = byKey.get(c.key);
      return l
        ? { channel: c, listing: l, ...projectListing(l, p) }
        : {
            channel: c,
            listing: null,
            isEnabled: false,
            effectivePrice: p.salePrice,
            effectiveStock: p.stock,
          };
    });

    res.json({ product: p, channels });
  } catch (err) {
    req.log.error({ err }, "product channels failed");
    res.status(500).json({ error: "Kanallar alınamadı" });
  }
});

router.put("/products/:productId/:channelKey", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const productId = Number(req.params.productId);
    const channelKey = String(req.params.channelKey);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: "Geçersiz id" });
    if (!CHANNEL_KEYS.includes(channelKey as any)) return res.status(400).json({ error: "Geçersiz kanal" });
    const parsed = listingPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Geçersiz veri", details: parsed.error.issues });

    const [p] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)))
      .limit(1);
    if (!p) return res.status(404).json({ error: "Ürün bulunamadı" });

    const [existing] = await db
      .select()
      .from(productChannelListingsTable)
      .where(
        and(
          eq(productChannelListingsTable.companyId, companyId),
          eq(productChannelListingsTable.productId, productId),
          eq(productChannelListingsTable.channelKey, channelKey)
        )
      )
      .limit(1);

    const data = parsed.data;
    const valueObj: any = {
      ...data,
      campaignStartsAt: data.campaignStartsAt ? new Date(data.campaignStartsAt) : data.campaignStartsAt === null ? null : undefined,
      campaignEndsAt: data.campaignEndsAt ? new Date(data.campaignEndsAt) : data.campaignEndsAt === null ? null : undefined,
      updatedAt: new Date(),
    };
    Object.keys(valueObj).forEach((k) => valueObj[k] === undefined && delete valueObj[k]);

    let result;
    if (existing) {
      const [updated] = await db
        .update(productChannelListingsTable)
        .set(valueObj)
        .where(
          and(
            eq(productChannelListingsTable.id, existing.id),
            eq(productChannelListingsTable.companyId, companyId)
          )
        )
        .returning();
      result = updated;
    } else {
      const [created] = await db
        .insert(productChannelListingsTable)
        .values({
          companyId,
          productId,
          channelKey,
          isEnabled: data.isEnabled ?? false,
          ...valueObj,
        })
        .returning();
      result = created;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "channel listing upsert failed");
    res.status(500).json({ error: "Kaydedilemedi" });
  }
});

const bulkSchema = z.object({
  filter: z
    .object({
      productIds: z.array(z.number().int().positive()).optional(),
      brand: z.string().optional(),
      category: z.string().optional(),
      noSalesDays: z.number().int().positive().optional(), // not implemented (sales table unknown), skip
      maxStock: z.number().int().min(0).optional(),
      minStockGte: z.number().int().min(0).optional(),
    })
    .default({}),
  channels: z.array(z.string()).min(1),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("enable") }),
    z.object({ type: z.literal("disable") }),
    z.object({ type: z.literal("set_price_mode"), mode: z.enum(PRICE_MODES), value: z.number().nullable().optional() }),
    z.object({ type: z.literal("set_min_price"), minPrice: z.number().min(0).nullable() }),
    z.object({ type: z.literal("set_stock_mode"), mode: z.enum(STOCK_MODES), value: z.number().nullable().optional() }),
    z.object({ type: z.literal("set_stop_below_critical"), value: z.boolean() }),
    z.object({ type: z.literal("set_campaign"), campaignPrice: z.number().min(0).nullable(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional() }),
  ]),
});

router.post("/bulk", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Geçersiz veri", details: parsed.error.issues });
    const { filter, channels, action } = parsed.data;

    const invalid = channels.filter((c) => !CHANNEL_KEYS.includes(c as any));
    if (invalid.length) return res.status(400).json({ error: `Geçersiz kanal(lar): ${invalid.join(",")}` });

    const conditions = [eq(productsTable.companyId, companyId), eq(productsTable.isActive, true)];
    if (filter.productIds && filter.productIds.length > 0) conditions.push(inArray(productsTable.id, filter.productIds));
    if (filter.brand) conditions.push(eq(productsTable.brand, filter.brand));
    if (filter.category) conditions.push(eq(productsTable.category, filter.category));
    if (filter.maxStock != null) conditions.push(sql`${productsTable.stock} <= ${filter.maxStock}`);
    if (filter.minStockGte != null) conditions.push(sql`${productsTable.stock} >= ${filter.minStockGte}`);

    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(...conditions));
    if (products.length === 0) return res.json({ ok: true, affected: 0 });

    const productIds = products.map((p) => p.id);
    let totalAffected = 0;

    const insertDefaults = {
      isEnabled: action.type === "enable" ? true : action.type === "disable" ? false : false,
      priceMode: action.type === "set_price_mode" ? action.mode : "fixed",
      priceValue: action.type === "set_price_mode" ? action.value ?? null : null,
      minPrice: action.type === "set_min_price" ? action.minPrice : null,
      stockMode: action.type === "set_stock_mode" ? action.mode : "full",
      stockValue: action.type === "set_stock_mode" ? action.value ?? null : null,
      stopBelowCritical: action.type === "set_stop_below_critical" ? action.value : false,
      campaignPrice: action.type === "set_campaign" ? action.campaignPrice : null,
      campaignStartsAt:
        action.type === "set_campaign" && action.startsAt ? new Date(action.startsAt) : null,
      campaignEndsAt:
        action.type === "set_campaign" && action.endsAt ? new Date(action.endsAt) : null,
    };

    const updateSet: any = { updatedAt: new Date() };
    if (action.type === "enable") updateSet.isEnabled = true;
    else if (action.type === "disable") updateSet.isEnabled = false;
    else if (action.type === "set_price_mode") {
      updateSet.priceMode = action.mode;
      updateSet.priceValue = action.value ?? null;
    } else if (action.type === "set_min_price") updateSet.minPrice = action.minPrice;
    else if (action.type === "set_stock_mode") {
      updateSet.stockMode = action.mode;
      updateSet.stockValue = action.value ?? null;
    } else if (action.type === "set_stop_below_critical") updateSet.stopBelowCritical = action.value;
    else if (action.type === "set_campaign") {
      updateSet.campaignPrice = action.campaignPrice;
      updateSet.campaignStartsAt = action.startsAt ? new Date(action.startsAt) : null;
      updateSet.campaignEndsAt = action.endsAt ? new Date(action.endsAt) : null;
    }

    for (const channelKey of channels) {
      const rows = productIds.map((pid) => ({
        companyId,
        productId: pid,
        channelKey,
        ...insertDefaults,
      }));
      const inserted = await db
        .insert(productChannelListingsTable)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            productChannelListingsTable.companyId,
            productChannelListingsTable.productId,
            productChannelListingsTable.channelKey,
          ],
          set: updateSet,
        })
        .returning({ id: productChannelListingsTable.id });
      totalAffected += inserted.length;
    }

    res.json({ ok: true, affected: totalAffected, productCount: products.length, channels });
  } catch (err) {
    req.log.error({ err }, "channel bulk failed");
    res.status(500).json({ error: "Toplu işlem başarısız" });
  }
});

// ===== Credentials =====
function maskSecret(v: any): any {
  if (typeof v !== "string" || v.length === 0) return v;
  if (v.length <= 4) return "****";
  return v.slice(0, 2) + "***" + v.slice(-2);
}
function maskCredentials(creds: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(creds || {})) {
    if (/secret|key|token|password|api/i.test(k)) out[k] = maskSecret(creds[k]);
    else out[k] = creds[k];
  }
  return out;
}

router.get("/:channelKey/credentials", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const channelKey = req.params.channelKey;
  if (!CHANNEL_KEYS.includes(channelKey as any)) return res.status(404).json({ error: "Bilinmeyen kanal" });
  const [row] = await db
    .select()
    .from(channelCredentialsTable)
    .where(
      and(
        eq(channelCredentialsTable.companyId, companyId),
        eq(channelCredentialsTable.channelKey, channelKey)
      )
    )
    .limit(1);
  if (!row) return res.json({ channelKey, mode: "test", credentials: {}, isActive: false, configured: false });
  res.json({
    channelKey: row.channelKey,
    mode: row.mode,
    credentials: maskCredentials((row.credentials as Record<string, any>) ?? {}),
    isActive: row.isActive,
    configured: true,
    lastSyncAt: row.lastSyncAt,
    lastSyncStatus: row.lastSyncStatus,
  });
});

const credentialsPutSchema = z.object({
  mode: z.enum(["test", "live"]).default("test"),
  credentials: z.record(z.string(), z.any()).default({}),
  isActive: z.boolean().optional(),
});

router.put("/:channelKey/credentials", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const channelKey = req.params.channelKey;
  if (!CHANNEL_KEYS.includes(channelKey as any)) return res.status(404).json({ error: "Bilinmeyen kanal" });
  const parsed = credentialsPutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
  const data = parsed.data;

  // merge with existing creds: if a credential field comes back as masked ("**" pattern), keep existing
  const [existing] = await db
    .select()
    .from(channelCredentialsTable)
    .where(
      and(
        eq(channelCredentialsTable.companyId, companyId),
        eq(channelCredentialsTable.channelKey, channelKey)
      )
    )
    .limit(1);
  const existingCreds = (existing?.credentials as Record<string, any>) ?? {};
  const mergedCreds: Record<string, any> = { ...existingCreds };
  for (const k of Object.keys(data.credentials)) {
    const v = data.credentials[k];
    if (typeof v === "string" && v.includes("***")) continue; // masked passthrough
    mergedCreds[k] = v;
  }

  const [row] = await db
    .insert(channelCredentialsTable)
    .values({
      companyId,
      channelKey,
      mode: data.mode,
      credentials: mergedCreds,
      isActive: data.isActive ?? false,
    })
    .onConflictDoUpdate({
      target: [channelCredentialsTable.companyId, channelCredentialsTable.channelKey],
      set: {
        mode: data.mode,
        credentials: mergedCreds,
        isActive: data.isActive ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json({
    channelKey: row.channelKey,
    mode: row.mode,
    credentials: maskCredentials((row.credentials as Record<string, any>) ?? {}),
    isActive: row.isActive,
    configured: true,
  });
});

// ===== Sync trigger =====
router.post("/:channelKey/sync", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const channelKey = req.params.channelKey as any;
  if (!CHANNEL_KEYS.includes(channelKey)) return res.status(404).json({ error: "Bilinmeyen kanal" });
  if (!hasAdapter(channelKey)) return res.status(400).json({ error: "Bu kanal için adapter henüz tanımlı değil" });

  const adapter = getAdapter(channelKey)!;
  const [cred] = await db
    .select()
    .from(channelCredentialsTable)
    .where(
      and(
        eq(channelCredentialsTable.companyId, companyId),
        eq(channelCredentialsTable.channelKey, channelKey)
      )
    )
    .limit(1);
  const mode = (cred?.mode as "test" | "live") ?? "test";
  const credentials = (cred?.credentials as Record<string, any>) ?? {};
  const ctx = { companyId, channelKey, mode, credentials };

  // Fetch enabled listings joined with product
  const rows = await db
    .select({
      listing: productChannelListingsTable,
      product: productsTable,
    })
    .from(productChannelListingsTable)
    .innerJoin(productsTable, eq(productChannelListingsTable.productId, productsTable.id))
    .where(
      and(
        eq(productChannelListingsTable.companyId, companyId),
        eq(productChannelListingsTable.channelKey, channelKey),
        eq(productChannelListingsTable.isEnabled, true)
      )
    );

  let okCount = 0;
  let errCount = 0;
  const logRows: any[] = [];
  const startedAt = Date.now();

  for (const { listing, product } of rows) {
    const effectivePrice = computeEffectivePrice({
      basePrice: product.salePrice,
      mode: listing.priceMode,
      value: listing.priceValue,
      minPrice: listing.minPrice,
      campaignPrice: listing.campaignPrice,
      campaignStartsAt: listing.campaignStartsAt,
      campaignEndsAt: listing.campaignEndsAt,
    });
    const effectiveStock = computeEffectiveStock({
      baseStock: product.stock,
      minStock: product.minStock,
      mode: listing.stockMode,
      value: listing.stockValue,
      minStockShow: listing.minStockShow,
      maxStockShow: listing.maxStockShow,
      stopBelowCritical: listing.stopBelowCritical,
    });

    const t0 = Date.now();
    const result = await adapter.pushListing(ctx, {
      productId: product.id,
      productCode: product.productCode,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      effectivePrice,
      effectiveStock,
      customTitle: listing.customTitle,
      customSku: listing.customSku,
      customCategory: listing.customCategory,
      customImageUrl: listing.customImageUrl,
    });
    const durationMs = Date.now() - t0;

    logRows.push({
      companyId,
      channelKey,
      operation: "push_listing",
      productId: product.id,
      status: result.ok ? "success" : "error",
      mode,
      requestPayload: result.payload ?? null,
      responsePayload: result.response ?? null,
      errorMessage: result.error ?? null,
      durationMs,
    });
    if (result.ok) okCount++;
    else errCount++;
  }

  if (logRows.length > 0) {
    // chunk insert to avoid huge payloads
    const CHUNK = 500;
    for (let i = 0; i < logRows.length; i += CHUNK) {
      await db.insert(channelSyncLogsTable).values(logRows.slice(i, i + CHUNK));
    }
  }

  const overallStatus = errCount === 0 ? "success" : okCount === 0 ? "error" : "partial";
  await db
    .insert(channelCredentialsTable)
    .values({
      companyId,
      channelKey,
      mode,
      credentials,
      isActive: cred?.isActive ?? false,
      lastSyncAt: new Date(),
      lastSyncStatus: overallStatus,
    })
    .onConflictDoUpdate({
      target: [channelCredentialsTable.companyId, channelCredentialsTable.channelKey],
      set: { lastSyncAt: new Date(), lastSyncStatus: overallStatus, updatedAt: new Date() },
    });

  res.json({
    ok: true,
    mode,
    total: rows.length,
    success: okCount,
    error: errCount,
    status: overallStatus,
    durationMs: Date.now() - startedAt,
  });
});

// ===== Sync logs =====
router.get("/:channelKey/logs", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const channelKey = req.params.channelKey;
  if (!CHANNEL_KEYS.includes(channelKey as any)) return res.status(404).json({ error: "Bilinmeyen kanal" });
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const rows = await db
    .select()
    .from(channelSyncLogsTable)
    .where(
      and(
        eq(channelSyncLogsTable.companyId, companyId),
        eq(channelSyncLogsTable.channelKey, channelKey)
      )
    )
    .orderBy(desc(channelSyncLogsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

// ===== Excel export per channel =====
router.get("/:channelKey/export.xlsx", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const channelKey = req.params.channelKey as any;
  if (!CHANNEL_KEYS.includes(channelKey)) return res.status(404).json({ error: "Bilinmeyen kanal" });
  const onlyEnabled = req.query.onlyEnabled !== "false";

  const conds = [
    eq(productChannelListingsTable.companyId, companyId),
    eq(productChannelListingsTable.channelKey, channelKey),
  ];
  if (onlyEnabled) conds.push(eq(productChannelListingsTable.isEnabled, true));

  const rows = await db
    .select({ listing: productChannelListingsTable, product: productsTable })
    .from(productChannelListingsTable)
    .innerJoin(productsTable, eq(productChannelListingsTable.productId, productsTable.id))
    .where(and(...conds));

  const data = rows.map(({ listing, product }) => {
    const price = computeEffectivePrice({
      basePrice: product.salePrice,
      mode: listing.priceMode,
      value: listing.priceValue,
      minPrice: listing.minPrice,
      campaignPrice: listing.campaignPrice,
      campaignStartsAt: listing.campaignStartsAt,
      campaignEndsAt: listing.campaignEndsAt,
    });
    const stock = computeEffectiveStock({
      baseStock: product.stock,
      minStock: product.minStock,
      mode: listing.stockMode,
      value: listing.stockValue,
      minStockShow: listing.minStockShow,
      maxStockShow: listing.maxStockShow,
      stopBelowCritical: listing.stopBelowCritical,
    });
    // Trendyol-style columns (most common Turkish marketplace template)
    return {
      Barkod: product.barcode ?? product.productCode,
      "Stok Kodu": listing.customSku ?? product.productCode,
      "Ürün Adı": listing.customTitle ?? product.name,
      Marka: product.brand ?? "",
      Kategori: listing.customCategory ?? product.category ?? "",
      "Liste Fiyatı": price,
      "Satış Fiyatı": price,
      "Para Birimi": "TRY",
      "KDV Oranı": 20,
      Stok: stock,
      Açıklama: product.description ?? product.name,
      "Görsel URL": listing.customImageUrl ?? "",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, channelKey);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${channelKey}-export-${Date.now()}.xlsx"`);
  res.send(buf);
});

export default router;
