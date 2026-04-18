import { Router, type Request, type Response } from "express";
import { db, adChannelsTable, adSpendsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

const PRESETS: Array<{ code: string; name: string; platform: string }> = [
  { code: "google_ads", name: "Google Ads", platform: "google" },
  { code: "meta_ads", name: "Meta (Facebook/Instagram) Ads", platform: "meta" },
  { code: "tiktok_ads", name: "TikTok Ads", platform: "tiktok" },
  { code: "trendyol_ads", name: "Trendyol Reklam", platform: "trendyol" },
  { code: "hepsiburada_ads", name: "Hepsiburada Reklam", platform: "hepsiburada" },
  { code: "n11_ads", name: "n11 Reklam", platform: "n11" },
  { code: "google_business", name: "Google Business / SEO", platform: "google" },
  { code: "influencer", name: "Influencer / Sponsorluk", platform: "custom" },
  { code: "billboard", name: "Açık Hava / Billboard", platform: "custom" },
  { code: "tv_radio", name: "TV / Radyo", platform: "custom" },
];

router.get("/presets", (_req, res) => res.json(PRESETS));

router.get("/channels", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const rows = await db.select().from(adChannelsTable).where(eq(adChannelsTable.companyId, companyId)).orderBy(adChannelsTable.name);
  res.json(rows);
});

router.post("/channels", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { code, name, platform } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: "code ve name zorunlu" });
  try {
    const [row] = await db.insert(adChannelsTable).values({
      companyId, code: String(code).slice(0, 40), name: String(name).slice(0, 120),
      platform: platform || "custom",
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "duplicate_code" });
    res.status(500).json({ error: "create_failed" });
  }
});

router.put("/channels/:id", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const { name, platform, isActive } = req.body || {};
  const patch: any = { updatedAt: new Date() };
  if (name !== undefined) patch.name = String(name).slice(0, 120);
  if (platform !== undefined) patch.platform = platform;
  if (isActive !== undefined) patch.isActive = isActive ? 1 : 0;
  const [row] = await db.update(adChannelsTable).set(patch)
    .where(and(eq(adChannelsTable.id, id), eq(adChannelsTable.companyId, companyId))).returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

router.delete("/channels/:id", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  await db.delete(adChannelsTable).where(and(
    eq(adChannelsTable.id, Number(req.params.id)),
    eq(adChannelsTable.companyId, companyId),
  ));
  res.json({ ok: true });
});

router.get("/spends", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const period = (req.query.period as string) || null;
  const conds: any[] = [eq(adSpendsTable.companyId, companyId)];
  if (period) conds.push(eq(adSpendsTable.period, period));
  const rows = await db.select().from(adSpendsTable).where(and(...conds)).orderBy(desc(adSpendsTable.period), desc(adSpendsTable.id));
  res.json(rows);
});

router.post("/spends", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { channelId, period, budgetAmount, spendAmount, impressions, clicks, leads, orders, attributedRevenue, notes } = req.body || {};
  if (!channelId || !period) return res.status(400).json({ error: "channelId ve period zorunlu" });
  if (!/^\d{4}-\d{2}$/.test(String(period))) return res.status(400).json({ error: "period YYYY-MM olmalı" });
  // verify channel belongs to company
  const [ch] = await db.select().from(adChannelsTable)
    .where(and(eq(adChannelsTable.id, Number(channelId)), eq(adChannelsTable.companyId, companyId))).limit(1);
  if (!ch) return res.status(404).json({ error: "channel_not_found" });
  // ON CONFLICT atomic upsert (channelId, period) — eşzamanlı yazımlarda 23505 yok
  try {
    const [row] = await db.insert(adSpendsTable).values({
      companyId, channelId: Number(channelId), period,
      budgetAmount: budgetAmount || "0",
      spendAmount: spendAmount || "0",
      impressions: Number(impressions) || 0,
      clicks: Number(clicks) || 0,
      leads: Number(leads) || 0,
      orders: Number(orders) || 0,
      attributedRevenue: attributedRevenue || "0",
      notes: notes || null,
    }).onConflictDoUpdate({
      target: [adSpendsTable.channelId, adSpendsTable.period],
      set: {
        budgetAmount: budgetAmount ?? sql`${adSpendsTable.budgetAmount}`,
        spendAmount: spendAmount ?? sql`${adSpendsTable.spendAmount}`,
        impressions: impressions ?? sql`${adSpendsTable.impressions}`,
        clicks: clicks ?? sql`${adSpendsTable.clicks}`,
        leads: leads ?? sql`${adSpendsTable.leads}`,
        orders: orders ?? sql`${adSpendsTable.orders}`,
        attributedRevenue: attributedRevenue ?? sql`${adSpendsTable.attributedRevenue}`,
        notes: notes ?? sql`${adSpendsTable.notes}`,
        updatedAt: new Date(),
      },
    }).returning();
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: "upsert_failed" });
  }
});

router.delete("/spends/:id", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  await db.delete(adSpendsTable).where(and(
    eq(adSpendsTable.id, Number(req.params.id)),
    eq(adSpendsTable.companyId, companyId),
  ));
  res.json({ ok: true });
});

router.get("/summary", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
  const rows = await db.select({
    channelId: adSpendsTable.channelId,
    channelName: adChannelsTable.name,
    platform: adChannelsTable.platform,
    budgetAmount: adSpendsTable.budgetAmount,
    spendAmount: adSpendsTable.spendAmount,
    impressions: adSpendsTable.impressions,
    clicks: adSpendsTable.clicks,
    leads: adSpendsTable.leads,
    orders: adSpendsTable.orders,
    attributedRevenue: adSpendsTable.attributedRevenue,
  }).from(adSpendsTable)
    .leftJoin(adChannelsTable, eq(adSpendsTable.channelId, adChannelsTable.id))
    .where(and(eq(adSpendsTable.companyId, companyId), eq(adSpendsTable.period, period)));

  const computed = rows.map((r: any) => {
    const spend = Number(r.spendAmount || 0);
    const rev = Number(r.attributedRevenue || 0);
    const clicks = Number(r.clicks || 0);
    const orders = Number(r.orders || 0);
    return {
      ...r,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpa: orders > 0 ? spend / orders : 0,
      roas: spend > 0 ? rev / spend : 0,
      profit: rev - spend,
      budgetUsedPct: Number(r.budgetAmount || 0) > 0 ? (spend / Number(r.budgetAmount)) * 100 : 0,
    };
  });
  const totals = computed.reduce((a: any, r: any) => ({
    budget: a.budget + Number(r.budgetAmount || 0),
    spend: a.spend + Number(r.spendAmount || 0),
    impressions: a.impressions + (r.impressions || 0),
    clicks: a.clicks + (r.clicks || 0),
    leads: a.leads + (r.leads || 0),
    orders: a.orders + (r.orders || 0),
    revenue: a.revenue + Number(r.attributedRevenue || 0),
  }), { budget: 0, spend: 0, impressions: 0, clicks: 0, leads: 0, orders: 0, revenue: 0 });
  const overall = {
    ...totals,
    profit: totals.revenue - totals.spend,
    roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
    cpa: totals.orders > 0 ? totals.spend / totals.orders : 0,
    budgetUsedPct: totals.budget > 0 ? (totals.spend / totals.budget) * 100 : 0,
  };
  res.json({ period, channels: computed, totals: overall });
});

router.get("/trend", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));
  const rows = await db.execute(sql`
    SELECT period,
      SUM(spend_amount)::numeric AS spend,
      SUM(attributed_revenue)::numeric AS revenue,
      SUM(orders)::int AS orders
    FROM ad_spends WHERE company_id = ${companyId}
    GROUP BY period ORDER BY period DESC LIMIT ${months}
  `);
  const list = (rows.rows as any[]).reverse().map((r: any) => ({
    period: r.period,
    spend: Number(r.spend || 0),
    revenue: Number(r.revenue || 0),
    orders: Number(r.orders || 0),
    roas: Number(r.spend) > 0 ? Number(r.revenue) / Number(r.spend) : 0,
  }));
  res.json(list);
});

export default router;
