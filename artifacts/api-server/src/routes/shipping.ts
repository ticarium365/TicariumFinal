import { Router } from "express";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  shippingZonesTable,
  shippingRulesTable,
  productShippingOverridesTable,
  productsTable,
  SHIPPING_CARRIERS,
  quoteShipping,
  normalizeCity,
  type ShippingZone,
  type ShippingRule,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// ─── ZONES ───────────────────────────────────────────────────────────────────
const zoneSchema = z.object({
  name: z.string().min(2).max(80),
  cities: z.array(z.string().min(1).max(50)).max(100),
  isDefault: z.boolean().optional(),
});
const ZONE_PATCH = ["name", "cities", "isDefault"] as const;

router.get("/zones", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const rows = await db.select().from(shippingZonesTable)
    .where(eq(shippingZonesTable.companyId, cid))
    .orderBy(asc(shippingZonesTable.name));
  res.json({ items: rows });
});

router.post("/zones", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const p = zoneSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz bölge", details: p.error.flatten() } });
    return;
  }
  const cities = p.data.cities.map(normalizeCity);
  const wantDefault = p.data.isDefault ?? false;
  try {
    const row = await db.transaction(async (tx) => {
      if (wantDefault) {
        await tx.update(shippingZonesTable).set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(shippingZonesTable.companyId, cid), eq(shippingZonesTable.isDefault, true)));
      }
      const [r] = await tx.insert(shippingZonesTable).values({
        companyId: cid, name: p.data.name, cities, isDefault: wantDefault,
      }).returning();
      return r;
    });
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: { code: "DB_ERROR", message: e.message } });
  }
});

router.patch("/zones/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const p = zoneSchema.partial().safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz veri" } });
    return;
  }
  const upd: Record<string, any> = { updatedAt: new Date() };
  for (const k of ZONE_PATCH) if (k in p.data) upd[k] = (p.data as any)[k];
  if ("cities" in upd) upd.cities = (upd.cities as string[]).map(normalizeCity);
  if (Object.keys(upd).length === 1) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Güncellenecek alan yok" } });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      // Eğer bu bölge varsayılan yapılıyorsa, diğerlerini önce kaldır
      if (upd.isDefault === true) {
        await tx.update(shippingZonesTable).set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(shippingZonesTable.companyId, cid),
            eq(shippingZonesTable.isDefault, true),
          ));
      }
      const [r] = await tx.update(shippingZonesTable).set(upd)
        .where(and(eq(shippingZonesTable.id, id), eq(shippingZonesTable.companyId, cid)))
        .returning();
      return r;
    });
    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Bölge yok" } });
      return;
    }
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: { code: "DB_ERROR", message: e.message } });
  }
});

router.delete("/zones/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const [row] = await db.delete(shippingZonesTable)
    .where(and(eq(shippingZonesTable.id, id), eq(shippingZonesTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Bölge yok" } });
    return;
  }
  res.json({ ok: true });
});

// ─── RULES ───────────────────────────────────────────────────────────────────
const ruleSchema = z.object({
  zoneId: z.number().int().positive(),
  name: z.string().min(2).max(120),
  carrier: z.enum(SHIPPING_CARRIERS).optional(),
  minDesi: z.number().nonnegative().max(1000),
  maxDesi: z.number().nonnegative().max(10000),
  price: z.number().nonnegative().max(100000),
  freeOverCartTotal: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
}).refine(d => d.maxDesi >= d.minDesi, { message: "maxDesi >= minDesi olmalı" });

const RULE_PATCH = ["zoneId", "name", "carrier", "minDesi", "maxDesi", "price", "freeOverCartTotal", "isActive", "priority"] as const;

router.get("/rules", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const rows = await db.select().from(shippingRulesTable)
    .where(eq(shippingRulesTable.companyId, cid))
    .orderBy(asc(shippingRulesTable.priority));
  res.json({ items: rows });
});

async function ensureZoneOwnership(companyId: number, zoneId: number): Promise<boolean> {
  const [z] = await db.select({ id: shippingZonesTable.id }).from(shippingZonesTable)
    .where(and(eq(shippingZonesTable.id, zoneId), eq(shippingZonesTable.companyId, companyId)));
  return !!z;
}

router.post("/rules", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const p = ruleSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz kural", details: p.error.flatten() } });
    return;
  }
  if (!(await ensureZoneOwnership(cid, p.data.zoneId))) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Bölge bulunamadı" } });
    return;
  }
  const [row] = await db.insert(shippingRulesTable).values({
    companyId: cid,
    zoneId: p.data.zoneId,
    name: p.data.name,
    carrier: p.data.carrier ?? "manual",
    minDesi: p.data.minDesi,
    maxDesi: p.data.maxDesi,
    price: p.data.price,
    freeOverCartTotal: p.data.freeOverCartTotal ?? null,
    isActive: p.data.isActive ?? true,
    priority: p.data.priority ?? 100,
  }).returning();
  res.status(201).json(row);
});

router.patch("/rules/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const p = ruleSchema.partial().safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz veri" } });
    return;
  }
  if (p.data.zoneId && !(await ensureZoneOwnership(cid, p.data.zoneId))) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Bölge bulunamadı" } });
    return;
  }
  const upd: Record<string, any> = { updatedAt: new Date() };
  for (const k of RULE_PATCH) if (k in p.data) upd[k] = (p.data as any)[k];
  if (Object.keys(upd).length === 1) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Güncellenecek alan yok" } });
    return;
  }
  const [row] = await db.update(shippingRulesTable).set(upd)
    .where(and(eq(shippingRulesTable.id, id), eq(shippingRulesTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kural yok" } });
    return;
  }
  res.json(row);
});

router.delete("/rules/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const [row] = await db.delete(shippingRulesTable)
    .where(and(eq(shippingRulesTable.id, id), eq(shippingRulesTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kural yok" } });
    return;
  }
  res.json({ ok: true });
});

// ─── PRODUCT OVERRIDE ────────────────────────────────────────────────────────
const overrideSchema = z.object({
  productId: z.number().int().positive(),
  fixedPrice: z.number().nonnegative().nullable().optional(),
  freeShipping: z.boolean().optional(),
  desi: z.number().nonnegative().max(1000).nullable().optional(),
});

router.get("/overrides", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const rows = await db.select().from(productShippingOverridesTable)
    .where(eq(productShippingOverridesTable.companyId, cid));
  res.json({ items: rows });
});

router.post("/overrides", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const p = overrideSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz override" } });
    return;
  }
  // Tenant doğrula
  const [prod] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, p.data.productId), eq(productsTable.companyId, cid)));
  if (!prod) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Ürün bulunamadı" } });
    return;
  }
  const [row] = await db.insert(productShippingOverridesTable).values({
    companyId: cid,
    productId: p.data.productId,
    fixedPrice: p.data.fixedPrice ?? null,
    freeShipping: p.data.freeShipping ?? false,
    desi: p.data.desi ?? null,
  }).onConflictDoUpdate({
    target: [productShippingOverridesTable.companyId, productShippingOverridesTable.productId],
    set: {
      fixedPrice: p.data.fixedPrice ?? null,
      freeShipping: p.data.freeShipping ?? false,
      desi: p.data.desi ?? null,
      updatedAt: new Date(),
    },
  }).returning();
  res.status(201).json(row);
});

router.delete("/overrides/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const [row] = await db.delete(productShippingOverridesTable)
    .where(and(eq(productShippingOverridesTable.id, id), eq(productShippingOverridesTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Override yok" } });
    return;
  }
  res.json({ ok: true });
});

// ─── QUOTE — fiyat hesabı ────────────────────────────────────────────────────
router.post("/quote", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const schema = z.object({
    city: z.string().min(2).max(50),
    totalDesi: z.number().nonnegative().max(10000),
    cartTotal: z.number().nonnegative().max(10_000_000),
    productId: z.number().int().positive().optional(),
    carrier: z.enum(SHIPPING_CARRIERS).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz quote parametreleri", details: p.error.flatten() } });
    return;
  }
  const zones = await db.select().from(shippingZonesTable)
    .where(eq(shippingZonesTable.companyId, cid));
  let rules = await db.select().from(shippingRulesTable)
    .where(eq(shippingRulesTable.companyId, cid));
  if (p.data.carrier) {
    rules = rules.filter((r) => r.carrier === p.data.carrier);
  }
  let override = null;
  if (p.data.productId) {
    const [o] = await db.select().from(productShippingOverridesTable)
      .where(and(
        eq(productShippingOverridesTable.companyId, cid),
        eq(productShippingOverridesTable.productId, p.data.productId),
      ));
    if (o) override = o;
  }
  const result = quoteShipping({
    zones: zones as ShippingZone[],
    rules: rules as ShippingRule[],
    city: p.data.city,
    totalDesi: p.data.totalDesi,
    cartTotal: p.data.cartTotal,
    productOverride: override,
  });
  res.json(result);
});

export default router;
