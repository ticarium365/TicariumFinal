import { Router, Request, Response } from "express";
import {
  db,
  productsTable,
  productChannelListingsTable,
  CHANNEL_DEFINITIONS,
  CHANNEL_KEYS,
  computeEffectivePrice,
  computeEffectiveStock,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod/v4";

const router = Router();
router.use(requireAuth);

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

export default router;
