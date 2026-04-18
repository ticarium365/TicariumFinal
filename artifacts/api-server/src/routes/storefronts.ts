import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  storefrontsTable,
  storefrontProductsTable,
  productsTable,
  companiesTable,
  STOREFRONT_TYPES,
  STOREFRONT_PAYMENT_MODES,
  STOREFRONT_STATUSES,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const paymentConfigSchema = z.object({
  iban: z.string().max(40).optional(),
  payoutCycle: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  posProvider: z.string().max(50).optional(),
  redirectUrl: z.string().url().max(500).optional(),
  whatsappNumber: z.string().max(20).optional(),
}).strict().partial();

const themeConfigSchema = z.object({
  primaryColor: z.string().max(20).optional(),
  logoUrl: z.string().max(500).optional(),
  headline: z.string().max(200).optional(),
  font: z.string().max(50).optional(),
}).strict().partial();

const embedConfigSchema = z.object({
  allowedOrigins: z.array(z.string().max(200)).max(20).optional(),
  position: z.enum(["inline", "modal", "drawer"]).optional(),
  defaultCategory: z.string().max(100).optional(),
}).strict().partial();

const upsertSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(STOREFRONT_TYPES),
  slug: z.string().min(2).max(60).optional(),
  customDomain: z.string().max(200).nullable().optional(),
  status: z.enum(STOREFRONT_STATUSES).optional(),
  productSelectionMode: z.enum(["all", "selected"]).optional(),
  paymentMode: z.enum(STOREFRONT_PAYMENT_MODES).optional(),
  paymentConfig: paymentConfigSchema.optional(),
  agreementCommissionPct: z.number().min(0).max(100).optional(),
  agreementNotes: z.string().max(2000).nullable().optional(),
  themeConfig: themeConfigSchema.optional(),
  embedConfig: embedConfigSchema.optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
});

// PATCH için izin verilen field whitelist'i — strip extra fields
const PATCHABLE_FIELDS = [
  "name", "status", "customDomain", "productSelectionMode",
  "paymentMode", "paymentConfig", "agreementCommissionPct", "agreementNotes",
  "themeConfig", "embedConfig", "contactPhone", "contactEmail",
  "seoTitle", "seoDescription",
] as const;

// Hassas alanları viewer/staff'tan gizle
function redactForRole(sf: any, role: string) {
  if (role === "admin" || role === "super_admin") return sf;
  const { agreementNotes, agreementCommissionPct, paymentConfig, ...safe } = sf;
  return safe;
}

// LIST mağazalar
router.get("/", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const role = req.session!.user!.role;
  const rows = await db
    .select()
    .from(storefrontsTable)
    .where(eq(storefrontsTable.companyId, cid))
    .orderBy(desc(storefrontsTable.createdAt));

  const ids = rows.map((r) => r.id);
  let counts = new Map<number, number>();
  if (ids.length) {
    const cnt = await db
      .select({ id: storefrontProductsTable.storefrontId })
      .from(storefrontProductsTable)
      .where(inArray(storefrontProductsTable.storefrontId, ids));
    cnt.forEach((c) => counts.set(c.id, (counts.get(c.id) || 0) + 1));
  }
  res.json({
    items: rows.map((r) => redactForRole({ ...r, productCount: counts.get(r.id) || 0 }, role)),
  });
});

// CREATE
router.post("/", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz veri", details: parsed.error.flatten() } });
    return;
  }
  const data = parsed.data;
  const company = await db.select().from(companiesTable).where(eq(companiesTable.id, cid)).limit(1);
  const baseSlug = data.slug ? slugify(data.slug) : slugify(`${company[0]?.subdomain || "magaza"}-${data.name}`);

  // unique slug guard
  let slug = baseSlug || `magaza-${Date.now()}`;
  let i = 1;
  while (true) {
    const ex = await db.select({ id: storefrontsTable.id }).from(storefrontsTable).where(eq(storefrontsTable.slug, slug)).limit(1);
    if (!ex.length) break;
    i++;
    slug = `${baseSlug}-${i}`;
  }

  // Race condition guard: unique violation 23505 → suffix retry max 5x
  let row: any;
  let attempt = 0;
  while (attempt < 5) {
    try {
      const inserted = await db
        .insert(storefrontsTable)
        .values({
          companyId: cid,
          name: data.name,
          type: data.type,
          slug,
          customDomain: data.customDomain ?? null,
          status: data.status ?? "draft",
          productSelectionMode: data.productSelectionMode ?? "selected",
          paymentMode: data.paymentMode ?? "merchant_pos",
          paymentConfig: data.paymentConfig ?? {},
          agreementCommissionPct: data.agreementCommissionPct ?? 0,
          agreementNotes: data.agreementNotes ?? null,
          themeConfig: data.themeConfig ?? {},
          embedConfig: data.embedConfig ?? {},
          contactPhone: data.contactPhone ?? null,
          contactEmail: data.contactEmail ?? null,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
        })
        .returning();
      row = inserted[0];
      break;
    } catch (e: any) {
      if (e?.code === "23505" && attempt < 4) {
        attempt++;
        slug = `${baseSlug}-${Math.floor(Math.random() * 9000) + 1000}`;
        continue;
      }
      throw e;
    }
  }
  res.status(201).json(row);
});

// READ (with products)
router.get("/:id", requireAuth, async (req, res) => {
  const cid = req.session!.user!.companyId;
  const role = req.session!.user!.role;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz id" } });
    return;
  }
  const [sf] = await db
    .select()
    .from(storefrontsTable)
    .where(and(eq(storefrontsTable.id, id), eq(storefrontsTable.companyId, cid)))
    .limit(1);
  if (!sf) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }
  const items = await db
    .select({
      id: storefrontProductsTable.id,
      productId: storefrontProductsTable.productId,
      isActive: storefrontProductsTable.isActive,
      customTitle: storefrontProductsTable.customTitle,
      customPrice: storefrontProductsTable.customPrice,
      displayOrder: storefrontProductsTable.displayOrder,
      productName: productsTable.name,
      productCode: productsTable.productCode,
      basePrice: productsTable.salePrice,
      stock: productsTable.stock,
    })
    .from(storefrontProductsTable)
    .innerJoin(productsTable, eq(productsTable.id, storefrontProductsTable.productId))
    .where(eq(storefrontProductsTable.storefrontId, id))
    .orderBy(asc(storefrontProductsTable.displayOrder));
  res.json({ ...redactForRole(sf, role), products: items });
});

// UPDATE — slug değiştirilemez (yayınlandıktan sonra SEO/link bozulmaması için)
router.patch("/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz id" } });
    return;
  }
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz veri", details: parsed.error.flatten() } });
    return;
  }
  // Whitelist'le filtrele — slug, type, companyId değiştirilemez
  const update: Record<string, any> = { updatedAt: new Date() };
  for (const key of PATCHABLE_FIELDS) {
    if (key in parsed.data) update[key] = (parsed.data as any)[key];
  }
  if (Object.keys(update).length === 1) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Güncellenecek alan yok" } });
    return;
  }
  const [row] = await db
    .update(storefrontsTable)
    .set(update)
    .where(and(eq(storefrontsTable.id, id), eq(storefrontsTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }
  res.json(row);
});

// DELETE
router.delete("/:id", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const [row] = await db
    .delete(storefrontsTable)
    .where(and(eq(storefrontsTable.id, id), eq(storefrontsTable.companyId, cid)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }
  res.json({ ok: true });
});

// LINK products (bulk add)
router.post("/:id/products", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const schema = z.object({ productIds: z.array(z.number().int().positive()).min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz ürün listesi" } });
    return;
  }
  const [sf] = await db
    .select()
    .from(storefrontsTable)
    .where(and(eq(storefrontsTable.id, id), eq(storefrontsTable.companyId, cid)))
    .limit(1);
  if (!sf) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }
  // ürünlerin company'ye ait olduğunu doğrula
  const valid = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.companyId, cid), inArray(productsTable.id, parsed.data.productIds)));
  const validIds = new Set(valid.map((v) => v.id));
  const inserts = parsed.data.productIds
    .filter((pid) => validIds.has(pid))
    .map((pid) => ({ storefrontId: id, productId: pid }));
  if (!inserts.length) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçerli ürün bulunamadı" } });
    return;
  }
  await db.insert(storefrontProductsTable).values(inserts).onConflictDoNothing();
  res.json({ ok: true, added: inserts.length });
});

// UPDATE single linked product (price/title/active/order)
router.patch("/:id/products/:linkId", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  const schema = z.object({
    isActive: z.boolean().optional(),
    customTitle: z.string().max(200).nullable().optional(),
    customPrice: z.number().nonnegative().nullable().optional(),
    displayOrder: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz veri" } });
    return;
  }
  // ownership guard
  const [sf] = await db
    .select({ id: storefrontsTable.id })
    .from(storefrontsTable)
    .where(and(eq(storefrontsTable.id, id), eq(storefrontsTable.companyId, cid)))
    .limit(1);
  if (!sf) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }
  const [row] = await db
    .update(storefrontProductsTable)
    .set(parsed.data)
    .where(and(eq(storefrontProductsTable.id, linkId), eq(storefrontProductsTable.storefrontId, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Bağlantı bulunamadı" } });
    return;
  }
  res.json(row);
});

// UNLINK
router.delete("/:id/products/:linkId", requireRole(["admin", "super_admin"]), async (req, res) => {
  const cid = req.session!.user!.companyId;
  const id = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  const [sf] = await db
    .select({ id: storefrontsTable.id })
    .from(storefrontsTable)
    .where(and(eq(storefrontsTable.id, id), eq(storefrontsTable.companyId, cid)))
    .limit(1);
  if (!sf) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }
  await db
    .delete(storefrontProductsTable)
    .where(and(eq(storefrontProductsTable.id, linkId), eq(storefrontProductsTable.storefrontId, id)));
  res.json({ ok: true });
});

export default router;
