import { Router, Request, Response } from "express";
import {
  db,
  companiesTable,
  b2bOrdersTable,
  b2bQuoteRequestsTable,
  b2bQuoteItemsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod/v4";

const router = Router();
router.use(requireAuth);

function parseId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function firstQs(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return typeof val[0] === "string" ? val[0] : undefined;
  return typeof val === "string" ? val : undefined;
}

/** ILIKE metakarakterlerini sadeleştirir; min 2 karakter. */
function normalizeOrderSearch(val: unknown): string | null {
  const s = firstQs(val)?.trim();
  if (!s || s.length < 2) return null;
  return s.replace(/[%_\\]/g, " ").slice(0, 80);
}

function parsePageParams(req: Request): { limit: number; offset: number } {
  const rawLimit = Number(req.query.limit);
  const rawPage = Number(req.query.page);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
    : 30;
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  return { limit, offset: (page - 1) * limit };
}

const ORDER_FIELDS = {
  id: b2bOrdersTable.id,
  quoteId: b2bOrdersTable.quoteId,
  buyerCompanyId: b2bOrdersTable.buyerCompanyId,
  sellerCompanyId: b2bOrdersTable.sellerCompanyId,
  code: b2bOrdersTable.code,
  status: b2bOrdersTable.status,
  totalAmount: b2bOrdersTable.totalAmount,
  currency: b2bOrdersTable.currency,
  shippingCity: b2bOrdersTable.shippingCity,
  shippingAddress: b2bOrdersTable.shippingAddress,
  contactPhone: b2bOrdersTable.contactPhone,
  trackingNo: b2bOrdersTable.trackingNo,
  carrier: b2bOrdersTable.carrier,
  sellerNote: b2bOrdersTable.sellerNote,
  buyerNote: b2bOrdersTable.buyerNote,
  cancelReason: b2bOrdersTable.cancelReason,
  confirmedAt: b2bOrdersTable.confirmedAt,
  shippedAt: b2bOrdersTable.shippedAt,
  deliveredAt: b2bOrdersTable.deliveredAt,
  completedAt: b2bOrdersTable.completedAt,
  cancelledAt: b2bOrdersTable.cancelledAt,
  createdAt: b2bOrdersTable.createdAt,
  updatedAt: b2bOrdersTable.updatedAt,
};

async function attachCompanies(rows: any[]) {
  if (rows.length === 0) return rows;
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.buyerCompanyId, r.sellerCompanyId]).filter((x): x is number => typeof x === "number"))
  );
  if (ids.length === 0) return rows;
  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      subdomain: companiesTable.subdomain,
      primaryColor: companiesTable.primaryColor,
      logoUrl: companiesTable.logoUrl,
    })
    .from(companiesTable)
    .where(inArray(companiesTable.id, ids));
  type CoMini = (typeof companies)[number];
  const map = new Map<number, CoMini>(companies.map((c: CoMini) => [c.id, c]));
  return rows.map((r) => ({
    ...r,
    buyerCompany: map.get(r.buyerCompanyId) ?? null,
    sellerCompany: map.get(r.sellerCompanyId) ?? null,
  }));
}

router.get("/inbox", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const status = firstQs(req.query.status);
    const conds = [eq(b2bOrdersTable.sellerCompanyId, companyId)];
    if (status && status !== "all") conds.push(eq(b2bOrdersTable.status, status));
    const nq = normalizeOrderSearch(req.query.q);
    if (nq) {
      const p = `%${nq}%`;
      conds.push(sql`(
        ${b2bOrdersTable.code}::text ILIKE ${p}
        OR COALESCE(${b2bOrdersTable.trackingNo}, '')::text ILIKE ${p}
        OR EXISTS (
          SELECT 1 FROM companies bc
          WHERE bc.id = ${b2bOrdersTable.buyerCompanyId} AND bc.name ILIKE ${p}
        )
        OR EXISTS (
          SELECT 1 FROM companies sc
          WHERE sc.id = ${b2bOrdersTable.sellerCompanyId} AND sc.name ILIKE ${p}
        )
      )`);
    }
    const whereClause = and(...conds);
    const { limit, offset } = parsePageParams(req);
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(b2bOrdersTable).where(whereClause),
      db
        .select(ORDER_FIELDS)
        .from(b2bOrdersTable)
        .where(whereClause)
        .orderBy(desc(b2bOrdersTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    return res.json({ items: await attachCompanies(rows), total: Number(total ?? 0) });
  } catch (err) {
    req.log.error({ err }, "b2b orders inbox failed");
    return res.status(500).json({ error: "Siparişler alınamadı" });
  }
});

router.get("/outbox", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const status = firstQs(req.query.status);
    const conds = [eq(b2bOrdersTable.buyerCompanyId, companyId)];
    if (status && status !== "all") conds.push(eq(b2bOrdersTable.status, status));
    const nq = normalizeOrderSearch(req.query.q);
    if (nq) {
      const p = `%${nq}%`;
      conds.push(sql`(
        ${b2bOrdersTable.code}::text ILIKE ${p}
        OR COALESCE(${b2bOrdersTable.trackingNo}, '')::text ILIKE ${p}
        OR EXISTS (
          SELECT 1 FROM companies bc
          WHERE bc.id = ${b2bOrdersTable.buyerCompanyId} AND bc.name ILIKE ${p}
        )
        OR EXISTS (
          SELECT 1 FROM companies sc
          WHERE sc.id = ${b2bOrdersTable.sellerCompanyId} AND sc.name ILIKE ${p}
        )
      )`);
    }
    const whereClause = and(...conds);
    const { limit, offset } = parsePageParams(req);
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(b2bOrdersTable).where(whereClause),
      db
        .select(ORDER_FIELDS)
        .from(b2bOrdersTable)
        .where(whereClause)
        .orderBy(desc(b2bOrdersTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    return res.json({ items: await attachCompanies(rows), total: Number(total ?? 0) });
  } catch (err) {
    req.log.error({ err }, "b2b orders outbox failed");
    return res.status(500).json({ error: "Siparişler alınamadı" });
  }
});

function rollupStatusCounts(rows: { status: string; c: number | string }[]) {
  const get = (s: string) => Number(rows.find((r) => r.status === s)?.c ?? 0);
  return {
    pending: get("pending"),
    confirmed: get("confirmed"),
    shipped: get("shipped"),
    delivered: get("delivered"),
    completed: get("completed"),
    cancelled: get("cancelled"),
  };
}

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const [inboxRows, outboxRows] = await Promise.all([
      db
        .select({ status: b2bOrdersTable.status, c: sql<number>`count(*)::int` })
        .from(b2bOrdersTable)
        .where(eq(b2bOrdersTable.sellerCompanyId, companyId))
        .groupBy(b2bOrdersTable.status),
      db
        .select({ status: b2bOrdersTable.status, c: sql<number>`count(*)::int` })
        .from(b2bOrdersTable)
        .where(eq(b2bOrdersTable.buyerCompanyId, companyId))
        .groupBy(b2bOrdersTable.status),
    ]);
    return res.json({ inbox: rollupStatusCounts(inboxRows), outbox: rollupStatusCounts(outboxRows) });
  } catch (err) {
    req.log.error({ err }, "b2b orders stats failed");
    return res.status(500).json({ error: "İstatistik alınamadı" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const orderId = parseId(req.params.id);
    if (!orderId) return res.status(400).json({ error: "Geçersiz sipariş kimliği" });
    const [order] = await db
      .select(ORDER_FIELDS)
      .from(b2bOrdersTable)
      .where(eq(b2bOrdersTable.id, orderId))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });
    if (order.buyerCompanyId !== companyId && order.sellerCompanyId !== companyId) {
      return res.status(403).json({ error: "Yetkisiz" });
    }
    const items = await db
      .select()
      .from(b2bQuoteItemsTable)
      .where(eq(b2bQuoteItemsTable.requestId, order.quoteId));
    const [enriched] = await attachCompanies([order]);
    return res.json({ order: enriched, items });
  } catch (err) {
    req.log.error({ err }, "b2b order detail failed");
    return res.status(500).json({ error: "Sipariş alınamadı" });
  }
});

const statusUpdateSchema = z.object({
  status: z.enum(["pending", "confirmed", "shipped", "delivered", "completed", "cancelled"]),
  trackingNo: z.string().max(120).optional(),
  carrier: z.string().max(120).optional(),
  sellerNote: z.string().max(1000).optional(),
  buyerNote: z.string().max(1000).optional(),
  cancelReason: z.string().max(500).optional(),
});

const VALID_TRANSITIONS: Record<string, { seller: string[]; buyer: string[] }> = {
  pending: { seller: ["confirmed", "cancelled"], buyer: ["cancelled"] },
  confirmed: { seller: ["shipped", "cancelled"], buyer: ["cancelled"] },
  shipped: { seller: ["delivered"], buyer: ["delivered", "completed"] },
  delivered: { seller: ["completed"], buyer: ["completed"] },
  completed: { seller: [], buyer: [] },
  cancelled: { seller: [], buyer: [] },
};

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const orderId = parseId(req.params.id);
    if (!orderId) return res.status(400).json({ error: "Geçersiz sipariş kimliği" });
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Geçersiz veri" });

    const [order] = await db
      .select()
      .from(b2bOrdersTable)
      .where(eq(b2bOrdersTable.id, orderId))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

    const role: "seller" | "buyer" =
      order.sellerCompanyId === companyId ? "seller" : order.buyerCompanyId === companyId ? "buyer" : (null as any);
    if (!role) return res.status(403).json({ error: "Yetkisiz" });

    const allowed = VALID_TRANSITIONS[order.status]?.[role] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return res.status(400).json({
        error: `'${order.status}' durumundan '${parsed.data.status}' durumuna geçemezsiniz`,
      });
    }

    const now = new Date();
    const patch: Record<string, any> = {
      status: parsed.data.status,
      updatedAt: now,
    };
    if (parsed.data.status === "confirmed") patch.confirmedAt = now;
    if (parsed.data.status === "shipped") {
      patch.shippedAt = now;
      if (parsed.data.trackingNo !== undefined) patch.trackingNo = parsed.data.trackingNo;
      if (parsed.data.carrier !== undefined) patch.carrier = parsed.data.carrier;
    }
    if (parsed.data.status === "delivered") patch.deliveredAt = now;
    if (parsed.data.status === "completed") patch.completedAt = now;
    if (parsed.data.status === "cancelled") {
      patch.cancelledAt = now;
      patch.cancelReason = parsed.data.cancelReason ?? null;
    }
    if (role === "seller" && parsed.data.sellerNote !== undefined) patch.sellerNote = parsed.data.sellerNote;
    if (role === "buyer" && parsed.data.buyerNote !== undefined) patch.buyerNote = parsed.data.buyerNote;

    await db
      .update(b2bOrdersTable)
      .set(patch)
      .where(
        and(
          eq(b2bOrdersTable.id, orderId),
          eq(b2bOrdersTable.status, order.status),
          or(
            eq(b2bOrdersTable.buyerCompanyId, companyId),
            eq(b2bOrdersTable.sellerCompanyId, companyId)
          )
        )
      );

    const otherCompanyId = role === "seller" ? order.buyerCompanyId : order.sellerCompanyId;
    const STATUS_LABELS: Record<string, string> = {
      pending: "Beklemede",
      confirmed: "Onaylandı",
      shipped: "Kargoya Verildi",
      delivered: "Teslim Edildi",
      completed: "Tamamlandı",
      cancelled: "İptal Edildi",
    };
    await db.insert(notificationsTable).values({
      companyId: otherCompanyId,
      type: "b2b_order_status",
      title: `Sipariş ${STATUS_LABELS[parsed.data.status] ?? parsed.data.status}: ${order.code}`,
      message: `${order.code} kodlu siparişin durumu güncellendi: ${STATUS_LABELS[parsed.data.status] ?? parsed.data.status}`,
      entityType: "b2b_order",
      entityId: order.id,
    });

    return res.json({ ok: true, status: parsed.data.status });
  } catch (err) {
    req.log.error({ err }, "b2b order status update failed");
    return res.status(500).json({ error: "Durum güncellenemedi" });
  }
});

export default router;
