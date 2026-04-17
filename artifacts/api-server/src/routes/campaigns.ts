import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, campaignsTable } from "@workspace/db";
import { eq, and, lte, gte, desc } from "drizzle-orm";
import { requireAdmin, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// ─── Zod şemaları ────────────────────────────────────────────────────────────
const CampaignBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  discountType: z.enum(["percent", "fixed", "buy_x_get_y"]).default("percent"),
  discountValue: z.number().positive(),
  scope: z.enum(["all", "category", "product"]).default("all"),
  scopeIds: z.array(z.number().int()).default([]),
  minQuantity: z.number().int().min(1).default(1),
  minAmount: z.number().optional().nullable(),
  maxUses: z.number().int().optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isActive: z.boolean().default(true),
  couponCode: z.string().optional().nullable(),
});

const DISCOUNT_LABELS: Record<string, string> = {
  percent: "Yüzde İndirim",
  fixed: "Sabit İndirim",
  buy_x_get_y: "Al X Öde Y",
};

const SCOPE_LABELS: Record<string, string> = {
  all: "Tüm Ürünler",
  category: "Kategoriye Özel",
  product: "Ürüne Özel",
};

function enrichCampaign(c: Record<string, unknown>) {
  const now = new Date();
  const start = new Date(c.startDate as string);
  const end = new Date(c.endDate as string);
  let statusLabel = "Pasif";
  if (c.isActive) {
    if (now < start) statusLabel = "Planlandı";
    else if (now > end) statusLabel = "Sona Erdi";
    else statusLabel = "Aktif";
  }
  return {
    ...c,
    discountLabel: DISCOUNT_LABELS[c.discountType as string] ?? c.discountType,
    scopeLabel: SCOPE_LABELS[c.scope as string] ?? c.scope,
    statusLabel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KAMPANYA CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /campaigns
router.get("/campaigns", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const rows = await db.select().from(campaignsTable)
      .where(eq(campaignsTable.companyId, companyId))
      .orderBy(desc(campaignsTable.createdAt));
    res.json({ campaigns: rows.map(enrichCampaign) });
  } catch (err) {
    req.log.error({ err }, "campaigns list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /campaigns/active — sadece aktif ve tarih aralığında olanlar
router.get("/campaigns/active", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rows = await db.select().from(campaignsTable)
      .where(and(
        eq(campaignsTable.companyId, companyId),
        eq(campaignsTable.isActive, true),
        lte(campaignsTable.startDate, today),
        gte(campaignsTable.endDate, today),
      ))
      .orderBy(desc(campaignsTable.createdAt));
    res.json({ campaigns: rows.map(enrichCampaign) });
  } catch (err) {
    req.log.error({ err }, "active campaigns error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /campaigns
router.post("/campaigns", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const parsed = CampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  try {
    const { discountValue, minAmount, ...rest } = parsed.data;
    const [campaign] = await db.insert(campaignsTable).values({
      companyId,
      ...rest,
      discountValue: discountValue.toString(),
      minAmount: minAmount != null ? minAmount.toString() : null,
    }).returning();
    res.status(201).json(enrichCampaign(campaign as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "campaign create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /campaigns/:id
router.get("/campaigns/:id", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [c] = await db.select().from(campaignsTable)
      .where(and(eq(campaignsTable.id, id), eq(campaignsTable.companyId, companyId)));
    if (!c) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json(enrichCampaign(c as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "campaign get error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /campaigns/:id
router.put("/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const parsed = CampaignBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  try {
    const { discountValue, minAmount, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (discountValue !== undefined) updateData.discountValue = discountValue.toString();
    if (minAmount !== undefined) updateData.minAmount = minAmount != null ? minAmount.toString() : null;

    const [updated] = await db.update(campaignsTable)
      .set(updateData as any)
      .where(and(eq(campaignsTable.id, id), eq(campaignsTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json(enrichCampaign(updated as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "campaign update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /campaigns/:id/toggle
router.patch("/campaigns/:id/toggle", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [existing] = await db.select().from(campaignsTable)
      .where(and(eq(campaignsTable.id, id), eq(campaignsTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Bulunamadı" }); return; }
    const [updated] = await db.update(campaignsTable)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(campaignsTable.id, id))
      .returning();
    res.json({ ok: true, isActive: updated!.isActive });
  } catch (err) {
    req.log.error({ err }, "campaign toggle error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /campaigns/apply — verilen ürün ID + tutar için aktif kampanyaları uygula
router.post("/campaigns/apply", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const { productId, categoryId, amount, quantity } = req.body as {
    productId?: number;
    categoryId?: number;
    amount: number;
    quantity?: number;
  };
  const today = new Date().toISOString().slice(0, 10);
  try {
    const activeCampaigns = await db.select().from(campaignsTable)
      .where(and(
        eq(campaignsTable.companyId, companyId),
        eq(campaignsTable.isActive, true),
        lte(campaignsTable.startDate, today),
        gte(campaignsTable.endDate, today),
      ));

    // Kampanyayı bu ürüne/kategoriye uygulayabilir mi?
    const applicable = activeCampaigns.filter((c) => {
      if (c.scope === "all") return true;
      if (c.scope === "product" && productId && (c.scopeIds as number[]).includes(productId)) return true;
      if (c.scope === "category" && categoryId && (c.scopeIds as number[]).includes(categoryId)) return true;
      return false;
    }).filter((c) => {
      const minAmt = c.minAmount ? parseFloat(c.minAmount as string) : 0;
      const minQty = c.minQuantity ?? 1;
      return amount >= minAmt && (quantity ?? 1) >= minQty;
    });

    // En büyük indirimi bul
    let bestDiscount = 0;
    let bestCampaign = null;
    for (const c of applicable) {
      const val = parseFloat(c.discountValue as string);
      let discount = 0;
      if (c.discountType === "percent") discount = (amount * val) / 100;
      else if (c.discountType === "fixed") discount = Math.min(val, amount);
      if (discount > bestDiscount) { bestDiscount = discount; bestCampaign = c; }
    }

    res.json({
      applicable: applicable.map(enrichCampaign),
      bestCampaign: bestCampaign ? enrichCampaign(bestCampaign as unknown as Record<string, unknown>) : null,
      discountAmount: bestDiscount,
      finalAmount: Math.max(0, amount - bestDiscount),
    });
  } catch (err) {
    req.log.error({ err }, "campaign apply error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /campaigns/:id
router.delete("/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [deleted] = await db.delete(campaignsTable)
      .where(and(eq(campaignsTable.id, id), eq(campaignsTable.companyId, companyId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "campaign delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
