// ─────────────────────────────────────────────────────────────────────────────
// Sprint E — Buyer Portal: Discovery + RFQ
// /buyer/*  → alıcı (accountType IN buyer|both) endpoint'leri
// /seller/* → satıcı (accountType IN seller|both) RFQ inbox endpoint'leri
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express";
import { and, eq, inArray, ilike, or, desc, sql, count } from "drizzle-orm";
import {
  db,
  companiesTable,
  buyerRfqsTable,
  buyerRfqTargetsTable,
  productsTable,
  contactRequestsTable,
  usersTable,
  buyerFavoriteSellersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { audit } from "../lib/audit.js";
const requireWriter = requireRole(["admin", "staff", "super_admin"]);
import { z } from "zod";

const buyerRouter = Router();
const sellerRouter = Router();

// ─── Authz: buyer modunda olmayanları engelle ─────────────────────────────────
function requireBuyerAccount(req: Request, res: Response, next: Function) {
  // accountType session'a auth.ts tarafından login'de yazıldı (Sprint D + I)
  // purchasing hesap tipi de tüm /buyer/* endpoint'lerini kullanabilir.
  const at = (req.session.user as any)?.accountType ?? "seller";
  if (at !== "buyer" && at !== "both" && at !== "purchasing") {
    return res.status(403).json({
      error: "buyer_access_required",
      message: "Bu uç nokta sadece alıcı/satınalma hesap tipi için kullanılabilir.",
    });
  }
  next();
}

function requireSellerAccount(req: Request, res: Response, next: Function) {
  const at = (req.session.user as any)?.accountType ?? "seller";
  if (at !== "seller" && at !== "both") {
    return res.status(403).json({
      error: "seller_access_required",
      message: "Bu uç nokta sadece satıcı (seller) hesap tipi için kullanılabilir.",
    });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// BUYER endpoints — /buyer/*
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /buyer/sellers — discovery: aktif satıcı firmaları listele.
 * Query: q (firma adı arama), limit (default 50, max 100)
 */
buyerRouter.get("/sellers", requireAuth, requireBuyerAccount, async (req: Request, res: Response) => {
  const q = (req.query.q ? String(req.query.q) : "").trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const myCompanyId = req.session.user!.companyId;

  const conds = [
    eq(companiesTable.isActive, true),
    or(eq(companiesTable.accountType, "seller"), eq(companiesTable.accountType, "both"))!,
    // Kendi şirketini discovery sonuçlarında gösterme
    sql`${companiesTable.id} <> ${myCompanyId}`,
  ];
  if (q) conds.push(ilike(companiesTable.name, `%${q}%`));

  const sellers = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      subdomain: companiesTable.subdomain,
      sector: companiesTable.sector,
      logoUrl: companiesTable.logoUrl,
      primaryColor: companiesTable.primaryColor,
    })
    .from(companiesTable)
    .where(and(...conds))
    .orderBy(companiesTable.name)
    .limit(limit);

  res.json({ sellers, total: sellers.length });
});

/**
 * GET /buyer/sellers/:id — satıcı detayı + ürün özeti (tenant-cross okuma; sadece public alanlar).
 */
buyerRouter.get("/sellers/:id", requireAuth, requireBuyerAccount, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid_id" });

  const [seller] = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      subdomain: companiesTable.subdomain,
      sector: companiesTable.sector,
      logoUrl: companiesTable.logoUrl,
      primaryColor: companiesTable.primaryColor,
      accountType: companiesTable.accountType,
    })
    .from(companiesTable)
    .where(and(
      eq(companiesTable.id, id),
      eq(companiesTable.isActive, true),
      or(eq(companiesTable.accountType, "seller"), eq(companiesTable.accountType, "both"))!,
    ))
    .limit(1);
  if (!seller) return res.status(404).json({ error: "seller_not_found" });

  // Ürün özeti — sadece public alan, max 20 örnek
  const [{ totalProducts }] = await db
    .select({ totalProducts: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(and(eq(productsTable.companyId, id), eq(productsTable.isActive, true)));

  const sampleProducts = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      brand: productsTable.brand,
      category: productsTable.category,
    })
    .from(productsTable)
    .where(and(eq(productsTable.companyId, id), eq(productsTable.isActive, true)))
    .orderBy(desc(productsTable.id))
    .limit(20);

  res.json({ seller, totalProducts, sampleProducts });
});

// ─── RFQ create (buyer side) ──────────────────────────────────────────────────
const createRfqSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    qty: z.number().positive(),
    unit: z.string().min(1).max(20),
    specs: z.string().max(500).optional(),
    targetUnitPrice: z.number().nonnegative().optional(),
  })).min(1).max(50),
  deadline: z.string().datetime().optional(),
  currency: z.string().length(3).default("TRY"),
  targetSellerCompanyIds: z.array(z.number().int().positive()).min(1).max(20),
  /** lead düşürme: true ise her hedef satıcıya contact_request kaydı atılır. */
  dropLeads: z.boolean().default(true),
});

/**
 * POST /buyer/rfqs — yeni RFQ oluştur ve hedef satıcılara dağıt.
 * Atomic: rfq + targets + (opsiyonel) leads tek transaction'da.
 */
buyerRouter.post("/rfqs", requireAuth, requireBuyerAccount, requireWriter, async (req: Request, res: Response) => {
  const parsed = createRfqSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
  }
  const body = parsed.data;
  const buyerCompanyId = req.session.user!.companyId;
  const userId = req.session.user!.id;

  // Hedef satıcılar gerçekten satıcı mı + aktif mi?
  const validSellers = await db
    .select({ id: companiesTable.id, name: companiesTable.name, accountType: companiesTable.accountType })
    .from(companiesTable)
    .where(and(
      inArray(companiesTable.id, body.targetSellerCompanyIds),
      eq(companiesTable.isActive, true),
      or(eq(companiesTable.accountType, "seller"), eq(companiesTable.accountType, "both"))!,
    ));
  if (validSellers.length === 0) {
    return res.status(400).json({ error: "no_valid_sellers", message: "Hedef satıcı listesi geçersiz veya pasif." });
  }
  // Kendi şirketini hedefleme
  const targets = validSellers.filter((s) => s.id !== buyerCompanyId);
  if (targets.length === 0) {
    return res.status(400).json({ error: "self_target_only" });
  }

  const validIds = new Set(validSellers.map((s) => s.id));
  const invalidSellerCompanyIds = body.targetSellerCompanyIds.filter((id) => !validIds.has(id));
  const result = await db.transaction(async (tx) => {
    const [rfq] = await tx.insert(buyerRfqsTable).values({
      buyerCompanyId,
      createdBy: userId,
      title: body.title,
      description: body.description ?? null,
      items: body.items,
      deadline: body.deadline ? new Date(body.deadline) : null,
      currency: body.currency,
      status: "sent", // direkt gönder; draft akışı Sprint F
    }).returning();

    const targetRows = await tx.insert(buyerRfqTargetsTable).values(
      targets.map((s) => ({
        rfqId: rfq.id,
        sellerCompanyId: s.id,
        status: "pending" as const,
      })),
    ).returning();

    // Lead düşürme: her satıcı için contact_request — satıcının CRM'inde "yeni sorgu" gibi görünür
    let leadsCreated = 0;
    if (body.dropLeads) {
      // Buyer firma + kullanıcı bilgisi (tek seferlik query)
      const [buyer] = await tx.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, buyerCompanyId)).limit(1);
      const [user] = await tx.select({ fullName: usersTable.fullName, email: usersTable.email, username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const fullName = user?.fullName || user?.username || "Bilinmiyor";
      const email = user?.email || `rfq-${rfq.id}@ticarium365.local`;
      const phone = "—"; // contact_requests phone notNull; placeholder
      // Satıcı başına bir lead — rfq id notes'ta
      const leadValues = targets.map((s) => ({
        fullName,
        companyName: buyer?.name ?? null,
        phone,
        email,
        status: 'new',
        notes: `RFQ #${rfq.id} → ${s.name}: ${body.title}`,
        sellerCompanyId: s.id,
        buyerCompanyId,
        rfqId: rfq.id,
        sourceType: 'rfq',
      }));
      const inserted = await tx.insert(contactRequestsTable).values(leadValues).returning({ id: contactRequestsTable.id });
      leadsCreated = inserted.length;
    }

    return { rfq, targets: targetRows, leadsCreated };
  });

  res.status(201).json({ ...result, invalidSellerCompanyIds });
});

/**
 * GET /buyer/rfqs — alıcının kendi RFQ'larını listele (status filtresi opsiyonel).
 */
buyerRouter.get("/rfqs", requireAuth, requireBuyerAccount, async (req: Request, res: Response) => {
  const buyerCompanyId = req.session.user!.companyId;
  const status = req.query.status ? String(req.query.status) : null;
  const conds = [eq(buyerRfqsTable.buyerCompanyId, buyerCompanyId)];
  if (status) conds.push(eq(buyerRfqsTable.status, status as any));

  const rfqs = await db.select().from(buyerRfqsTable).where(and(...conds)).orderBy(desc(buyerRfqsTable.createdAt)).limit(200);

  // Her RFQ için target sayısı (tek query, GROUP BY)
  const rfqIds = rfqs.map((r) => r.id);
  let targetCounts: Record<number, { total: number; quoted: number; viewed: number; pending: number }> = {};
  if (rfqIds.length > 0) {
    const rows = await db
      .select({
        rfqId: buyerRfqTargetsTable.rfqId,
        status: buyerRfqTargetsTable.status,
        cnt: count(buyerRfqTargetsTable.id),
      })
      .from(buyerRfqTargetsTable)
      .where(inArray(buyerRfqTargetsTable.rfqId, rfqIds))
      .groupBy(buyerRfqTargetsTable.rfqId, buyerRfqTargetsTable.status);
    for (const r of rows) {
      const acc = targetCounts[r.rfqId] ??= { total: 0, quoted: 0, viewed: 0, pending: 0 };
      acc.total += Number(r.cnt);
      if (r.status === "quoted") acc.quoted += Number(r.cnt);
      else if (r.status === "viewed") acc.viewed += Number(r.cnt);
      else if (r.status === "pending") acc.pending += Number(r.cnt);
    }
  }

  res.json(rfqs.map((r) => ({ ...r, targetCounts: targetCounts[r.id] ?? { total: 0, quoted: 0, viewed: 0, pending: 0 } })));
});

/**
 * GET /buyer/rfqs/:id — RFQ detayı + targets (satıcı isimleriyle).
 */
buyerRouter.get("/rfqs/:id", requireAuth, requireBuyerAccount, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid_id" });
  const buyerCompanyId = req.session.user!.companyId;

  const [rfq] = await db.select().from(buyerRfqsTable)
    .where(and(eq(buyerRfqsTable.id, id), eq(buyerRfqsTable.buyerCompanyId, buyerCompanyId)))
    .limit(1);
  if (!rfq) return res.status(404).json({ error: "rfq_not_found" });

  const targets = await db
    .select({
      id: buyerRfqTargetsTable.id,
      sellerCompanyId: buyerRfqTargetsTable.sellerCompanyId,
      status: buyerRfqTargetsTable.status,
      quoteLines: buyerRfqTargetsTable.quoteLines,
      quoteTotal: buyerRfqTargetsTable.quoteTotal,
      quoteCurrency: buyerRfqTargetsTable.quoteCurrency,
      quoteValidUntil: buyerRfqTargetsTable.quoteValidUntil,
      quotedAt: buyerRfqTargetsTable.quotedAt,
      viewedAt: buyerRfqTargetsTable.viewedAt,
      createdAt: buyerRfqTargetsTable.createdAt,
      sellerName: companiesTable.name,
      sellerSubdomain: companiesTable.subdomain,
    })
    .from(buyerRfqTargetsTable)
    .leftJoin(companiesTable, eq(companiesTable.id, buyerRfqTargetsTable.sellerCompanyId))
    .where(eq(buyerRfqTargetsTable.rfqId, id));

  res.json({ ...rfq, targets });
});

/**
 * POST /buyer/rfqs/:id/cancel — RFQ iptal.
 */
buyerRouter.post("/rfqs/:id/cancel", requireAuth, requireBuyerAccount, requireWriter, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid_id" });
  const buyerCompanyId = req.session.user!.companyId;

  const [updated] = await db.update(buyerRfqsTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(
      eq(buyerRfqsTable.id, id),
      eq(buyerRfqsTable.buyerCompanyId, buyerCompanyId),
      inArray(buyerRfqsTable.status, ["draft", "sent", "responded"]),
    ))
    .returning();
  if (!updated) return res.status(404).json({ error: "rfq_not_cancellable", message: "RFQ bulunamadı veya iptal edilebilir durumda değil." });
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════
// SELLER endpoints — /seller/*
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /seller/rfqs/inbox — bu satıcı firmasını hedefleyen RFQ target'ları.
 * Query: status (pending|viewed|quoted|declined|awarded)
 */
sellerRouter.get("/rfqs/inbox", requireAuth, requireSellerAccount, async (req: Request, res: Response) => {
  const sellerCompanyId = req.session.user!.companyId;
  const status = req.query.status ? String(req.query.status) : null;

  const conds = [eq(buyerRfqTargetsTable.sellerCompanyId, sellerCompanyId)];
  if (status) conds.push(eq(buyerRfqTargetsTable.status, status as any));

  const rows = await db
    .select({
      targetId: buyerRfqTargetsTable.id,
      targetStatus: buyerRfqTargetsTable.status,
      viewedAt: buyerRfqTargetsTable.viewedAt,
      quotedAt: buyerRfqTargetsTable.quotedAt,
      quoteTotal: buyerRfqTargetsTable.quoteTotal,
      rfqId: buyerRfqsTable.id,
      title: buyerRfqsTable.title,
      description: buyerRfqsTable.description,
      items: buyerRfqsTable.items,
      deadline: buyerRfqsTable.deadline,
      currency: buyerRfqsTable.currency,
      rfqStatus: buyerRfqsTable.status,
      createdAt: buyerRfqsTable.createdAt,
      buyerCompanyId: buyerRfqsTable.buyerCompanyId,
      buyerName: companiesTable.name,
    })
    .from(buyerRfqTargetsTable)
    .innerJoin(buyerRfqsTable, eq(buyerRfqsTable.id, buyerRfqTargetsTable.rfqId))
    .leftJoin(companiesTable, eq(companiesTable.id, buyerRfqsTable.buyerCompanyId))
    .where(and(...conds))
    .orderBy(desc(buyerRfqsTable.createdAt))
    .limit(200);

  res.json(rows);
});

/**
 * POST /seller/rfqs/:targetId/view — satıcı RFQ'yu açtığında pending→viewed.
 * Idempotent: viewedAt set edilmiş target'a tekrar çağrı 200 + mevcut row.
 */
sellerRouter.post("/rfqs/:targetId/view", requireAuth, requireSellerAccount, requireWriter, async (req: Request, res: Response) => {
  const targetId = Number(req.params.targetId);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: "invalid_id" });
  const sellerCompanyId = req.session.user!.companyId;

  // Önce var mı + bizim mi kontrol
  const [existing] = await db.select().from(buyerRfqTargetsTable)
    .where(and(eq(buyerRfqTargetsTable.id, targetId), eq(buyerRfqTargetsTable.sellerCompanyId, sellerCompanyId)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "target_not_found" });

  if (existing.viewedAt) return res.json(existing); // idempotent
  const newStatus = existing.status === "pending" ? "viewed" : existing.status;
  const [updated] = await db.update(buyerRfqTargetsTable)
    .set({ status: newStatus, viewedAt: new Date(), updatedAt: new Date() })
    .where(eq(buyerRfqTargetsTable.id, targetId))
    .returning();
  res.json(updated);
});


// ═══════════════════════════════════════════════════════════════════════════
// Sprint F — Quote Response & Comparison
// ═══════════════════════════════════════════════════════════════════════════

const quoteSubmitSchema = z.object({
  quoteLines: z.array(z.object({
    itemIndex: z.number().int().nonnegative(),
    unitPrice: z.number().nonnegative(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    notes: z.string().max(500).optional(),
  })).min(1).max(50),
  quoteCurrency: z.string().length(3).default("TRY"),
  quoteValidUntil: z.string().datetime().optional(),
});

/**
 * POST /seller/rfqs/:targetId/quote — satıcı teklif gönderir.
 * Status geçişi: pending|viewed → quoted; quotedAt set, quoteTotal hesapla.
 * RFQ.status: 'sent' iken ilk yanıt geldiğinde 'responded' olur (idempotent).
 * Awarded/declined target tekrar quote alamaz.
 */
sellerRouter.post("/rfqs/:targetId/quote", requireAuth, requireSellerAccount, requireWriter, async (req: Request, res: Response) => {
  const targetId = Number(req.params.targetId);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: "invalid_id" });
  const sellerCompanyId = req.session.user!.companyId;

  const parsed = quoteSubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
  const body = parsed.data;

  const [target] = await db.select().from(buyerRfqTargetsTable)
    .where(and(eq(buyerRfqTargetsTable.id, targetId), eq(buyerRfqTargetsTable.sellerCompanyId, sellerCompanyId)))
    .limit(1);
  if (!target) return res.status(404).json({ error: "target_not_found" });
  if (target.status === "awarded") return res.status(409).json({ error: "already_awarded" });
  if (target.status === "declined") return res.status(409).json({ error: "already_declined" });
  if (target.status === "quoted") return res.status(409).json({ error: "already_quoted" });
  if (target.status !== "pending" && target.status !== "viewed") {
    return res.status(409).json({ error: "invalid_target_status", status: target.status });
  }

  // RFQ var mı + cancelled/awarded değil mi?
  const [rfq] = await db.select().from(buyerRfqsTable).where(eq(buyerRfqsTable.id, target.rfqId)).limit(1);
  if (!rfq) return res.status(404).json({ error: "rfq_not_found" });
  if (rfq.status === "cancelled") return res.status(409).json({ error: "rfq_cancelled" });
  if (rfq.status === "awarded") return res.status(409).json({ error: "rfq_awarded" });

  // quoteLines × items qty → total
  const items = (rfq.items ?? []) as Array<{ qty: number; name: string; unit: string }>;
  let total = 0;
  for (const line of body.quoteLines) {
    if (line.itemIndex < 0 || line.itemIndex >= items.length) {
      return res.status(400).json({ error: "invalid_item_index", itemIndex: line.itemIndex });
    }
    total += Number(items[line.itemIndex].qty) * Number(line.unitPrice);
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(buyerRfqTargetsTable)
      .set({
        status: "quoted",
        quoteLines: body.quoteLines,
        quoteTotal: total.toFixed(2),
        quoteCurrency: body.quoteCurrency,
        quoteValidUntil: body.quoteValidUntil ? new Date(body.quoteValidUntil) : null,
        quotedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(buyerRfqTargetsTable.id, targetId))
      .returning();
    // RFQ status: ilk yanıt geldiğinde 'sent' → 'responded'
    if (rfq.status === "sent") {
      await tx.update(buyerRfqsTable).set({ status: "responded", updatedAt: new Date() }).where(eq(buyerRfqsTable.id, rfq.id));
    }
    return updated;
  });

  await audit({ req, action: "RFQ_QUOTE", entity: "buyer_rfq_target", entityId: targetId, details: { rfqId: rfq.id, total, lineCount: body.quoteLines.length } });
  res.json(result);
});

/**
 * POST /seller/rfqs/:targetId/decline — satıcı reddeder.
 */
sellerRouter.post("/rfqs/:targetId/decline", requireAuth, requireSellerAccount, requireWriter, async (req: Request, res: Response) => {
  const targetId = Number(req.params.targetId);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: "invalid_id" });
  const sellerCompanyId = req.session.user!.companyId;

  const [target] = await db.select().from(buyerRfqTargetsTable)
    .where(and(eq(buyerRfqTargetsTable.id, targetId), eq(buyerRfqTargetsTable.sellerCompanyId, sellerCompanyId)))
    .limit(1);
  if (!target) return res.status(404).json({ error: "target_not_found" });
  if (target.status === "awarded") return res.status(409).json({ error: "already_awarded" });
  if (target.status === "declined") return res.json(target); // idempotent
  if (target.status === "quoted") return res.status(409).json({ error: "already_quoted" });
  if (target.status !== "pending" && target.status !== "viewed") {
    return res.status(409).json({ error: "invalid_target_status", status: target.status });
  }

  const [updated] = await db.update(buyerRfqTargetsTable)
    .set({ status: "declined", updatedAt: new Date() })
    .where(eq(buyerRfqTargetsTable.id, targetId))
    .returning();
  await audit({ req, action: "RFQ_DECLINE", entity: "buyer_rfq_target", entityId: targetId, details: { rfqId: target.rfqId } });
  res.json(updated);
});

/**
 * GET /buyer/rfqs/:id/comparison — alıcı için karşılaştırma görünümü.
 * Item × satıcı matrisi + en iyi (en düşük) fiyat highlight.
 */
buyerRouter.get("/rfqs/:id/comparison", requireAuth, requireBuyerAccount, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid_id" });
  const buyerCompanyId = req.session.user!.companyId;

  const [rfq] = await db.select().from(buyerRfqsTable)
    .where(and(eq(buyerRfqsTable.id, id), eq(buyerRfqsTable.buyerCompanyId, buyerCompanyId)))
    .limit(1);
  if (!rfq) return res.status(404).json({ error: "rfq_not_found" });

  const targets = await db
    .select({
      targetId: buyerRfqTargetsTable.id,
      sellerCompanyId: buyerRfqTargetsTable.sellerCompanyId,
      status: buyerRfqTargetsTable.status,
      quoteLines: buyerRfqTargetsTable.quoteLines,
      quoteTotal: buyerRfqTargetsTable.quoteTotal,
      quoteCurrency: buyerRfqTargetsTable.quoteCurrency,
      quoteValidUntil: buyerRfqTargetsTable.quoteValidUntil,
      quotedAt: buyerRfqTargetsTable.quotedAt,
      sellerName: companiesTable.name,
    })
    .from(buyerRfqTargetsTable)
    .leftJoin(companiesTable, eq(companiesTable.id, buyerRfqTargetsTable.sellerCompanyId))
    .where(eq(buyerRfqTargetsTable.rfqId, id));

  const items = (rfq.items ?? []) as Array<{ name: string; qty: number; unit: string; specs?: string }>;
  // matrix[itemIndex] = [{ targetId, sellerName, unitPrice, leadTimeDays, lineTotal, isBest }]
  const matrix = items.map((item, idx) => {
    const offers = targets
      .filter((t) => t.status === "quoted" && Array.isArray(t.quoteLines))
      .map((t) => {
        const line = (t.quoteLines as any[]).find((l) => l.itemIndex === idx);
        if (!line) return null;
        return {
          targetId: t.targetId,
          sellerCompanyId: t.sellerCompanyId,
          sellerName: t.sellerName,
          unitPrice: Number(line.unitPrice),
          leadTimeDays: line.leadTimeDays ?? null,
          notes: line.notes ?? null,
          lineTotal: Number(item.qty) * Number(line.unitPrice),
          isBest: false,
        };
      })
      .filter(Boolean) as Array<{ unitPrice: number; isBest: boolean; [k: string]: any }>;
    if (offers.length > 0) {
      const minPrice = Math.min(...offers.map((o) => o.unitPrice));
      offers.forEach((o) => { if (o.unitPrice === minPrice) o.isBest = true; });
    }
    return { itemIndex: idx, item, offers };
  });

  // Per-target totals + ranking
  const quotedTargets = targets.filter((t) => t.status === "quoted");
  const totals = quotedTargets.map((t) => ({
    targetId: t.targetId,
    sellerCompanyId: t.sellerCompanyId,
    sellerName: t.sellerName,
    quoteTotal: t.quoteTotal !== null ? Number(t.quoteTotal) : null,
    quoteCurrency: t.quoteCurrency,
    quoteValidUntil: t.quoteValidUntil,
    quotedAt: t.quotedAt,
  })).sort((a, b) => (a.quoteTotal ?? Infinity) - (b.quoteTotal ?? Infinity));

  res.json({
    rfqId: rfq.id,
    title: rfq.title,
    status: rfq.status,
    awardedTargetId: rfq.awardedTargetId,
    awardedAt: rfq.awardedAt,
    items,
    matrix,
    totals,
    quotedCount: quotedTargets.length,
    targetCount: targets.length,
  });
});

/**
 * POST /buyer/rfqs/:id/award — alıcı bir teklifi kabul eder.
 * Body: { targetId }
 * Geçişler: rfq.status='awarded', awardedTargetId, awardedAt; targets[awarded].status='awarded';
 *           diğer 'quoted' target'lar 'declined' (audit trail).
 */
const awardSchema = z.object({ targetId: z.number().int().positive() });
buyerRouter.post("/rfqs/:id/award", requireAuth, requireBuyerAccount, requireWriter, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid_id" });
  const buyerCompanyId = req.session.user!.companyId;
  const parsed = awardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
  const { targetId } = parsed.data;

  const [rfq] = await db.select().from(buyerRfqsTable)
    .where(and(eq(buyerRfqsTable.id, id), eq(buyerRfqsTable.buyerCompanyId, buyerCompanyId)))
    .limit(1);
  if (!rfq) return res.status(404).json({ error: "rfq_not_found" });
  if (rfq.status === "awarded") return res.status(409).json({ error: "already_awarded" });
  if (rfq.status === "cancelled") return res.status(409).json({ error: "rfq_cancelled" });

  const [target] = await db.select().from(buyerRfqTargetsTable)
    .where(and(eq(buyerRfqTargetsTable.id, targetId), eq(buyerRfqTargetsTable.rfqId, id)))
    .limit(1);
  if (!target) return res.status(404).json({ error: "target_not_found" });
  if (target.status !== "quoted") return res.status(400).json({ error: "target_not_quoted", status: target.status });

  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const [updatedRfq] = await tx.update(buyerRfqsTable)
      .set({ status: "awarded", awardedTargetId: targetId, awardedAt: now, updatedAt: now })
      .where(eq(buyerRfqsTable.id, id))
      .returning();
    const [winner] = await tx.update(buyerRfqTargetsTable)
      .set({ status: "awarded", updatedAt: now })
      .where(eq(buyerRfqTargetsTable.id, targetId))
      .returning();
    // Diğer quoted target'lar declined'a düşer
    await tx.update(buyerRfqTargetsTable)
      .set({ status: "declined", updatedAt: now })
      .where(and(
        eq(buyerRfqTargetsTable.rfqId, id),
        sql`${buyerRfqTargetsTable.id} <> ${targetId}`,
        eq(buyerRfqTargetsTable.status, "quoted"),
      ));
    return { rfq: updatedRfq, winner };
  });

  await audit({ req, action: "RFQ_AWARD", entity: "buyer_rfq", entityId: id, details: { targetId, sellerCompanyId: target.sellerCompanyId, total: target.quoteTotal } });
  res.json(result);
});



// ─────────────────────────────────────────────────────────────────────────────
// Sprint I — Favori Tedarikçiler (Satınalma Hesabı için)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /buyer/favorites — kendi firmanın favori satıcıları (firma bilgileriyle join). */
buyerRouter.get("/favorites", requireAuth, requireBuyerAccount, async (req: Request, res: Response) => {
  const myCompanyId = req.session.user!.companyId;
  const rows = await db
    .select({
      id: buyerFavoriteSellersTable.id,
      sellerCompanyId: buyerFavoriteSellersTable.sellerCompanyId,
      note: buyerFavoriteSellersTable.note,
      createdAt: buyerFavoriteSellersTable.createdAt,
      sellerName: companiesTable.name,
      sellerSubdomain: companiesTable.subdomain,
      sellerLogoUrl: companiesTable.logoUrl,
    })
    .from(buyerFavoriteSellersTable)
    .innerJoin(companiesTable, eq(buyerFavoriteSellersTable.sellerCompanyId, companiesTable.id))
    .where(eq(buyerFavoriteSellersTable.buyerCompanyId, myCompanyId))
    .orderBy(desc(buyerFavoriteSellersTable.createdAt));
  res.json({ favorites: rows });
});

/** POST /buyer/favorites — { sellerCompanyId, note? } — idempotent (zaten varsa sessizce başarılı). */
buyerRouter.post("/favorites", requireAuth, requireBuyerAccount, requireWriter, async (req: Request, res: Response) => {
  const myCompanyId = req.session.user!.companyId;
  const sid = Number((req.body as any)?.sellerCompanyId);
  if (!Number.isFinite(sid) || sid <= 0) return res.status(400).json({ error: "invalid_seller_id" });
  if (sid === myCompanyId) return res.status(400).json({ error: "cannot_favorite_self" });
  const note = typeof (req.body as any)?.note === "string" ? String((req.body as any).note).slice(0, 500) : null;
  try {
    const [row] = await db.insert(buyerFavoriteSellersTable).values({
      buyerCompanyId: myCompanyId, sellerCompanyId: sid, note,
    }).returning();
    res.status(201).json({ favorite: row });
  } catch (err: any) {
    if (String(err?.code) === "23505") {
      const [existing] = await db.select().from(buyerFavoriteSellersTable)
        .where(and(eq(buyerFavoriteSellersTable.buyerCompanyId, myCompanyId), eq(buyerFavoriteSellersTable.sellerCompanyId, sid)));
      return res.status(200).json({ favorite: existing, deduped: true });
    }
    throw err;
  }
});

/** DELETE /buyer/favorites/:sellerId — favoriden çıkar. */
buyerRouter.delete("/favorites/:sellerId", requireAuth, requireBuyerAccount, requireWriter, async (req: Request, res: Response) => {
  const myCompanyId = req.session.user!.companyId;
  const sid = Number(req.params.sellerId);
  if (!Number.isFinite(sid) || sid <= 0) return res.status(400).json({ error: "invalid_seller_id" });
  await db.delete(buyerFavoriteSellersTable)
    .where(and(eq(buyerFavoriteSellersTable.buyerCompanyId, myCompanyId), eq(buyerFavoriteSellersTable.sellerCompanyId, sid)));
  res.json({ ok: true });
});


export { buyerRouter, sellerRouter };
