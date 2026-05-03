import { Router, Request, Response } from "express";
import {
  db,
  companiesTable,
  companyNetworkProfilesTable,
  b2bQuoteRequestsTable,
  b2bQuoteItemsTable,
  b2bMessagesTable,
  b2bOrdersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, or, inArray, sql, count, lt, gte, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod";

const router = Router();

router.use(requireAuth);

const createQuoteSchema = z.object({
  toSubdomain: z.string().min(1),
  subject: z.string().min(2).max(200),
  message: z.string().max(2000).optional(),
  contactPhone: z.string().max(40).optional(),
  contactEmail: z.string().max(120).optional(),
  deliveryCity: z.string().max(120).optional(),
  deliveryAddress: z.string().max(500).optional(),
  expectedDeliveryDate: z.string().optional(),
  items: z
    .array(
      z.object({
        productName: z.string().min(1).max(200),
        productCode: z.string().max(80).optional(),
        description: z.string().max(500).optional(),
        quantity: z.number().positive(),
        unit: z.string().max(20).default("adet"),
      })
    )
    .min(1)
    .max(50),
});

const respondQuoteSchema = z.object({
  validUntil: z.string().optional(),
  sellerNote: z.string().max(2000).optional(),
  currency: z.string().max(8).default("TRY"),
  items: z.array(
    z.object({
      id: z.number().int(),
      quotedPrice: z.number().min(0).nullable(),
      isAvailable: z.boolean().default(true),
      quotedNote: z.string().max(500).optional(),
    })
  ),
});

const decisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().max(500).optional(),
});

const messageSchema = z.object({
  body: z.string().min(1).max(2000),
});

function makeCode() {
  const d = new Date();
  const ymd = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RFQ-${ymd}-${rand}`;
}

async function loadAuthorized(quoteId: number, companyId: number) {
  const [q] = await db
    .select({
      id: b2bQuoteRequestsTable.id,
      fromCompanyId: b2bQuoteRequestsTable.fromCompanyId,
      toCompanyId: b2bQuoteRequestsTable.toCompanyId,
      code: b2bQuoteRequestsTable.code,
      status: b2bQuoteRequestsTable.status,
      subject: b2bQuoteRequestsTable.subject,
      message: b2bQuoteRequestsTable.message,
      contactPhone: b2bQuoteRequestsTable.contactPhone,
      contactEmail: b2bQuoteRequestsTable.contactEmail,
      deliveryCity: b2bQuoteRequestsTable.deliveryCity,
      deliveryAddress: b2bQuoteRequestsTable.deliveryAddress,
      expectedDeliveryDate: b2bQuoteRequestsTable.expectedDeliveryDate,
      validUntil: b2bQuoteRequestsTable.validUntil,
      sellerNote: b2bQuoteRequestsTable.sellerNote,
      quotedTotalAmount: b2bQuoteRequestsTable.quotedTotalAmount,
      quotedCurrency: b2bQuoteRequestsTable.quotedCurrency,
      rejectReason: b2bQuoteRequestsTable.rejectReason,
      respondedAt: b2bQuoteRequestsTable.respondedAt,
      decidedAt: b2bQuoteRequestsTable.decidedAt,
      createdAt: b2bQuoteRequestsTable.createdAt,
    })
    .from(b2bQuoteRequestsTable)
    .where(eq(b2bQuoteRequestsTable.id, quoteId))
    .limit(1);
  if (!q) return null;
  if (q.fromCompanyId !== companyId && q.toCompanyId !== companyId) return null;
  return q;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function attachCompanyMeta(rows: any[]) {
  const ids = Array.from(new Set(rows.flatMap((r) => [r.fromCompanyId, r.toCompanyId])));
  if (ids.length === 0) return rows;
  const validIds = ids.filter((x): x is number => typeof x === "number");
  if (validIds.length === 0) return rows;
  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      subdomain: companiesTable.subdomain,
      primaryColor: companiesTable.primaryColor,
      logoUrl: companiesTable.logoUrl,
    })
    .from(companiesTable)
    .where(inArray(companiesTable.id, validIds));
  const map = new Map(companies.map((c) => [c.id, c]));
  return rows.map((r) => ({
    ...r,
    fromCompany: map.get(r.fromCompanyId) ?? null,
    toCompany: map.get(r.toCompanyId) ?? null,
  }));
}

const QUOTE_FIELDS = {
  id: b2bQuoteRequestsTable.id,
  fromCompanyId: b2bQuoteRequestsTable.fromCompanyId,
  toCompanyId: b2bQuoteRequestsTable.toCompanyId,
  code: b2bQuoteRequestsTable.code,
  subject: b2bQuoteRequestsTable.subject,
  message: b2bQuoteRequestsTable.message,
  status: b2bQuoteRequestsTable.status,
  contactPhone: b2bQuoteRequestsTable.contactPhone,
  contactEmail: b2bQuoteRequestsTable.contactEmail,
  deliveryCity: b2bQuoteRequestsTable.deliveryCity,
  deliveryAddress: b2bQuoteRequestsTable.deliveryAddress,
  expectedDeliveryDate: b2bQuoteRequestsTable.expectedDeliveryDate,
  validUntil: b2bQuoteRequestsTable.validUntil,
  sellerNote: b2bQuoteRequestsTable.sellerNote,
  quotedTotalAmount: b2bQuoteRequestsTable.quotedTotalAmount,
  quotedCurrency: b2bQuoteRequestsTable.quotedCurrency,
  rejectReason: b2bQuoteRequestsTable.rejectReason,
  respondedAt: b2bQuoteRequestsTable.respondedAt,
  decidedAt: b2bQuoteRequestsTable.decidedAt,
  createdAt: b2bQuoteRequestsTable.createdAt,
  updatedAt: b2bQuoteRequestsTable.updatedAt,
};

const ITEM_FIELDS = {
  id: b2bQuoteItemsTable.id,
  requestId: b2bQuoteItemsTable.requestId,
  productName: b2bQuoteItemsTable.productName,
  productCode: b2bQuoteItemsTable.productCode,
  description: b2bQuoteItemsTable.description,
  quantity: b2bQuoteItemsTable.quantity,
  unit: b2bQuoteItemsTable.unit,
  quotedPrice: b2bQuoteItemsTable.quotedPrice,
  quotedNote: b2bQuoteItemsTable.quotedNote,
  isAvailable: b2bQuoteItemsTable.isAvailable,
  sortOrder: b2bQuoteItemsTable.sortOrder,
};

const MESSAGE_FIELDS = {
  id: b2bMessagesTable.id,
  requestId: b2bMessagesTable.requestId,
  fromCompanyId: b2bMessagesTable.fromCompanyId,
  body: b2bMessagesTable.body,
  createdAt: b2bMessagesTable.createdAt,
};

router.get("/quotes/inbox", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const status = req.query.status as string | undefined;
    const conditions = [eq(b2bQuoteRequestsTable.toCompanyId, companyId)];
    if (status && status !== "all") conditions.push(eq(b2bQuoteRequestsTable.status, status));
    const rows = await db
      .select(QUOTE_FIELDS)
      .from(b2bQuoteRequestsTable)
      .where(and(...conditions))
      .orderBy(desc(b2bQuoteRequestsTable.createdAt))
      .limit(200);
    const enriched = await attachCompanyMeta(rows);
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "b2b inbox failed");
    res.status(500).json({ error: "Liste alınamadı" });
  }
});

router.get("/quotes/outbox", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const status = req.query.status as string | undefined;
    const conditions = [eq(b2bQuoteRequestsTable.fromCompanyId, companyId)];
    if (status && status !== "all") conditions.push(eq(b2bQuoteRequestsTable.status, status));
    const rows = await db
      .select(QUOTE_FIELDS)
      .from(b2bQuoteRequestsTable)
      .where(and(...conditions))
      .orderBy(desc(b2bQuoteRequestsTable.createdAt))
      .limit(200);
    req.log.info({ rowCount: rows.length, sample: rows[0] }, "outbox rows fetched");
    const enriched = await attachCompanyMeta(rows);
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "b2b outbox failed");
    res.status(500).json({ error: "Liste alınamadı" });
  }
});

/** Satıcı/alıcı SLA sinyalleri + son 30 gün kabul — liste sayfaları için hafif. */
router.get("/quotes/pipeline-metrics", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const now = new Date();
    const ago48h = new Date(now.getTime() - 48 * 3600 * 1000);
    const ago72h = new Date(now.getTime() - 72 * 3600 * 1000);
    const ago30d = new Date(now);
    ago30d.setDate(ago30d.getDate() - 30);

    const [
      sellerPending48,
      sellerPending72,
      buyerPending48,
      inboxQuotedAwaitingBuyer,
      sellerAcceptedQuotes30d,
    ] = await Promise.all([
      db.select({ c: count() }).from(b2bQuoteRequestsTable).where(and(
        eq(b2bQuoteRequestsTable.toCompanyId, companyId),
        eq(b2bQuoteRequestsTable.status, "pending"),
        lt(b2bQuoteRequestsTable.createdAt, ago48h),
      )),
      db.select({ c: count() }).from(b2bQuoteRequestsTable).where(and(
        eq(b2bQuoteRequestsTable.toCompanyId, companyId),
        eq(b2bQuoteRequestsTable.status, "pending"),
        lt(b2bQuoteRequestsTable.createdAt, ago72h),
      )),
      db.select({ c: count() }).from(b2bQuoteRequestsTable).where(and(
        eq(b2bQuoteRequestsTable.fromCompanyId, companyId),
        eq(b2bQuoteRequestsTable.status, "pending"),
        lt(b2bQuoteRequestsTable.createdAt, ago48h),
      )),
      db.select({ c: count() }).from(b2bQuoteRequestsTable).where(and(
        eq(b2bQuoteRequestsTable.toCompanyId, companyId),
        eq(b2bQuoteRequestsTable.status, "quoted"),
      )),
      db.select({ c: count() }).from(b2bQuoteRequestsTable).where(and(
        eq(b2bQuoteRequestsTable.toCompanyId, companyId),
        eq(b2bQuoteRequestsTable.status, "accepted"),
        isNotNull(b2bQuoteRequestsTable.decidedAt),
        gte(b2bQuoteRequestsTable.decidedAt, ago30d),
      )),
    ]);

    return res.json({
      sellerInboxPendingOver48h: Number(sellerPending48[0]?.c ?? 0),
      sellerInboxPendingOver72h: Number(sellerPending72[0]?.c ?? 0),
      buyerOutboxPendingOver48h: Number(buyerPending48[0]?.c ?? 0),
      sellerInboxQuotedAwaitingBuyer: Number(inboxQuotedAwaitingBuyer[0]?.c ?? 0),
      sellerAcceptedQuotesLast30Days: Number(sellerAcceptedQuotes30d[0]?.c ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "b2b pipeline metrics failed");
    return res.status(500).json({ error: "Metrik alınamadı" });
  }
});

router.get("/quotes/stats", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const [inbox, outbox] = await Promise.all([
      db
        .select({ status: b2bQuoteRequestsTable.status, c: sql<number>`count(*)::int` })
        .from(b2bQuoteRequestsTable)
        .where(eq(b2bQuoteRequestsTable.toCompanyId, companyId))
        .groupBy(b2bQuoteRequestsTable.status),
      db
        .select({ status: b2bQuoteRequestsTable.status, c: sql<number>`count(*)::int` })
        .from(b2bQuoteRequestsTable)
        .where(eq(b2bQuoteRequestsTable.fromCompanyId, companyId))
        .groupBy(b2bQuoteRequestsTable.status),
    ]);
    const sumOf = (rows: any[], s: string) => rows.find((r) => r.status === s)?.c ?? 0;
    res.json({
      inbox: {
        pending: sumOf(inbox, "pending"),
        quoted: sumOf(inbox, "quoted"),
        accepted: sumOf(inbox, "accepted"),
        rejected: sumOf(inbox, "rejected"),
      },
      outbox: {
        pending: sumOf(outbox, "pending"),
        quoted: sumOf(outbox, "quoted"),
        accepted: sumOf(outbox, "accepted"),
        rejected: sumOf(outbox, "rejected"),
      },
    });
  } catch (err) {
    req.log.error({ err }, "b2b stats failed");
    res.status(500).json({ error: "İstatistik alınamadı" });
  }
});

router.get("/quotes/:id", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const quoteId = parseId(req.params.id);
    if (!quoteId) return res.status(400).json({ error: "Geçersiz teklif kimliği" });
    const quote = await loadAuthorized(quoteId, companyId);
    if (!quote) return res.status(404).json({ error: "Teklif bulunamadı" });

    const [items, messages, [enriched]] = await Promise.all([
      db
        .select(ITEM_FIELDS)
        .from(b2bQuoteItemsTable)
        .where(eq(b2bQuoteItemsTable.requestId, quoteId))
        .orderBy(b2bQuoteItemsTable.sortOrder, b2bQuoteItemsTable.id),
      db
        .select(MESSAGE_FIELDS)
        .from(b2bMessagesTable)
        .where(eq(b2bMessagesTable.requestId, quoteId))
        .orderBy(b2bMessagesTable.createdAt),
      attachCompanyMeta([quote]),
    ]);

    res.json({
      quote: enriched,
      items,
      messages,
      role: quote.fromCompanyId === companyId ? "buyer" : "seller",
    });
  } catch (err) {
    req.log.error({ err }, "b2b quote get failed");
    res.status(500).json({ error: "Teklif alınamadı" });
  }
});

router.post("/quotes", async (req: Request, res: Response) => {
  try {
    const fromCompanyId = req.companyId!;
    const parsed = createQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Geçersiz veri", details: parsed.error.issues });
    }

    const [seller] = await db
      .select({ id: companiesTable.id, name: companiesTable.name })
      .from(companiesTable)
      .innerJoin(
        companyNetworkProfilesTable,
        eq(companiesTable.id, companyNetworkProfilesTable.companyId)
      )
      .where(
        and(
          eq(companiesTable.subdomain, parsed.data.toSubdomain),
          eq(companyNetworkProfilesTable.isVisible, true),
          eq(companyNetworkProfilesTable.acceptOffers, true)
        )
      )
      .limit(1);

    if (!seller) {
      return res.status(404).json({ error: "Bu firma teklif kabul etmiyor" });
    }
    if (seller.id === fromCompanyId) {
      return res.status(400).json({ error: "Kendinize teklif gönderemezsiniz" });
    }

    const code = makeCode();
    const [created] = await db
      .insert(b2bQuoteRequestsTable)
      .values({
        fromCompanyId,
        toCompanyId: seller.id,
        code,
        subject: parsed.data.subject,
        message: parsed.data.message ?? null,
        contactPhone: parsed.data.contactPhone ?? null,
        contactEmail: parsed.data.contactEmail ?? null,
        deliveryCity: parsed.data.deliveryCity ?? null,
        deliveryAddress: parsed.data.deliveryAddress ?? null,
        expectedDeliveryDate: parsed.data.expectedDeliveryDate
          ? new Date(parsed.data.expectedDeliveryDate)
          : null,
      })
      .returning();

    await db.insert(b2bQuoteItemsTable).values(
      parsed.data.items.map((it, idx) => ({
        requestId: created.id,
        productName: it.productName,
        productCode: it.productCode ?? null,
        description: it.description ?? null,
        quantity: it.quantity,
        unit: it.unit ?? "adet",
        sortOrder: idx,
      }))
    );

    const [buyer] = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, fromCompanyId))
      .limit(1);

    await db.insert(notificationsTable).values({
      companyId: seller.id,
      type: "b2b_quote_request",
      title: `Yeni Teklif İsteği: ${code}`,
      message: `${buyer?.name ?? "Bir firma"} sizden teklif istedi: "${parsed.data.subject}"`,
    });

    res.status(201).json({ id: created.id, code: created.code });
  } catch (err) {
    req.log.error({ err }, "b2b quote create failed");
    res.status(500).json({ error: "Teklif oluşturulamadı" });
  }
});

router.post("/quotes/:id/respond", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const userId = req.session?.userId;
    const quoteId = parseId(req.params.id);
    if (!quoteId) return res.status(400).json({ error: "Geçersiz teklif kimliği" });
    const quote = await loadAuthorized(quoteId, companyId);
    if (!quote) return res.status(404).json({ error: "Teklif bulunamadı" });
    if (quote.toCompanyId !== companyId) {
      return res.status(403).json({ error: "Sadece satıcı yanıt verebilir" });
    }
    if (quote.status !== "pending") {
      return res.status(400).json({ error: "Bu teklif zaten yanıtlanmış" });
    }

    const parsed = respondQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Geçersiz veri", details: parsed.error.issues });
    }

    const existingItems = await db
      .select(ITEM_FIELDS)
      .from(b2bQuoteItemsTable)
      .where(eq(b2bQuoteItemsTable.requestId, quoteId));
    const itemMap = new Map(existingItems.map((i) => [i.id, i]));

    let total = 0;
    for (const it of parsed.data.items) {
      const orig = itemMap.get(it.id);
      if (!orig) continue;
      await db
        .update(b2bQuoteItemsTable)
        .set({
          quotedPrice: it.quotedPrice,
          quotedNote: it.quotedNote ?? null,
          isAvailable: it.isAvailable,
        })
        .where(eq(b2bQuoteItemsTable.id, it.id));
      if (it.isAvailable && it.quotedPrice != null) {
        total += it.quotedPrice * orig.quantity;
      }
    }

    await db
      .update(b2bQuoteRequestsTable)
      .set({
        status: "quoted",
        sellerNote: parsed.data.sellerNote ?? null,
        validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
        quotedTotalAmount: total,
        quotedCurrency: parsed.data.currency,
        respondedAt: new Date(),
        respondedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(b2bQuoteRequestsTable.id, quoteId));

    const [seller] = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);

    await db.insert(notificationsTable).values({
      companyId: quote.fromCompanyId,
      type: "b2b_quote_response",
      title: `Teklif Yanıtı: ${quote.code}`,
      message: `${seller?.name ?? "Satıcı"} teklifinize yanıt verdi: ${total.toFixed(2)} ${parsed.data.currency}`,
    });

    res.json({ ok: true, total });
  } catch (err) {
    req.log.error({ err }, "b2b quote respond failed");
    res.status(500).json({ error: "Yanıt gönderilemedi" });
  }
});

router.post("/quotes/:id/decision", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const quoteId = parseId(req.params.id);
    if (!quoteId) return res.status(400).json({ error: "Geçersiz teklif kimliği" });
    const quote = await loadAuthorized(quoteId, companyId);
    if (!quote) return res.status(404).json({ error: "Teklif bulunamadı" });
    if (quote.fromCompanyId !== companyId) {
      return res.status(403).json({ error: "Sadece alıcı karar verebilir" });
    }
    if (quote.status !== "quoted") {
      return res.status(400).json({ error: "Bu teklif henüz yanıtlanmamış" });
    }

    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Geçersiz veri" });
    }

    const updated = await db
      .update(b2bQuoteRequestsTable)
      .set({
        status: parsed.data.decision,
        rejectReason: parsed.data.decision === "rejected" ? parsed.data.reason ?? null : null,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(b2bQuoteRequestsTable.id, quoteId), eq(b2bQuoteRequestsTable.status, "quoted")))
      .returning({ id: b2bQuoteRequestsTable.id });
    if (updated.length === 0) {
      return res.status(409).json({ error: "Bu teklif zaten karara bağlanmış" });
    }

    const [buyer] = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);

    let orderId: number | null = null;
    let orderCode: string | null = null;
    if (parsed.data.decision === "accepted") {
      const code = `ORD-${new Date()
        .toISOString()
        .slice(2, 10)
        .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const [order] = await db
        .insert(b2bOrdersTable)
        .values({
          quoteId,
          buyerCompanyId: quote.fromCompanyId,
          sellerCompanyId: quote.toCompanyId,
          code,
          status: "pending",
          totalAmount: quote.quotedTotalAmount ?? 0,
          currency: quote.quotedCurrency ?? "TRY",
          shippingCity: quote.deliveryCity,
          shippingAddress: quote.deliveryAddress,
          contactPhone: quote.contactPhone,
        })
        .returning({ id: b2bOrdersTable.id, code: b2bOrdersTable.code });
      orderId = order.id;
      orderCode = order.code;
    }

    await db.insert(notificationsTable).values({
      companyId: quote.toCompanyId,
      type: "b2b_quote_decision",
      title: `Teklif ${parsed.data.decision === "accepted" ? "Kabul Edildi" : "Reddedildi"}: ${quote.code}`,
      message:
        parsed.data.decision === "accepted" && orderCode
          ? `${buyer?.name ?? "Alıcı"} teklifinizi kabul etti. Sipariş oluşturuldu: ${orderCode}`
          : `${buyer?.name ?? "Alıcı"} teklifinizi ${parsed.data.decision === "accepted" ? "kabul etti" : "reddetti"}`,
      entityType: orderId ? "b2b_order" : "b2b_quote",
      entityId: orderId ?? quoteId,
    });

    res.json({ ok: true, status: parsed.data.decision, orderId, orderCode });
  } catch (err) {
    req.log.error({ err }, "b2b decision failed");
    res.status(500).json({ error: "Karar kaydedilemedi" });
  }
});

router.post("/quotes/:id/cancel", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const quoteId = parseId(req.params.id);
    if (!quoteId) return res.status(400).json({ error: "Geçersiz teklif kimliği" });
    const quote = await loadAuthorized(quoteId, companyId);
    if (!quote) return res.status(404).json({ error: "Teklif bulunamadı" });
    if (quote.fromCompanyId !== companyId) {
      return res.status(403).json({ error: "Sadece alıcı iptal edebilir" });
    }
    if (!["pending", "quoted"].includes(quote.status)) {
      return res.status(400).json({ error: "Bu teklif iptal edilemez" });
    }

    await db
      .update(b2bQuoteRequestsTable)
      .set({ status: "cancelled", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(b2bQuoteRequestsTable.id, quoteId));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "b2b cancel failed");
    res.status(500).json({ error: "İptal başarısız" });
  }
});

router.get("/quotes/:id/messages", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const quoteId = parseId(req.params.id);
    if (!quoteId) return res.status(400).json({ error: "Geçersiz teklif kimliği" });
    const quote = await loadAuthorized(quoteId, companyId);
    if (!quote) return res.status(404).json({ error: "Teklif bulunamadı" });
    const msgs = await db
      .select(MESSAGE_FIELDS)
      .from(b2bMessagesTable)
      .where(eq(b2bMessagesTable.requestId, quoteId))
      .orderBy(b2bMessagesTable.createdAt);
    res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "b2b messages list failed");
    res.status(500).json({ error: "Mesajlar alınamadı" });
  }
});

router.post("/quotes/:id/messages", async (req: Request, res: Response) => {
  try {
    const companyId = req.companyId!;
    const quoteId = parseId(req.params.id);
    if (!quoteId) return res.status(400).json({ error: "Geçersiz teklif kimliği" });
    const quote = await loadAuthorized(quoteId, companyId);
    if (!quote) return res.status(404).json({ error: "Teklif bulunamadı" });

    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Mesaj boş olamaz" });

    const [created] = await db
      .insert(b2bMessagesTable)
      .values({
        requestId: quoteId,
        fromCompanyId: companyId,
        body: parsed.data.body,
      })
      .returning();

    const otherCompanyId =
      quote.fromCompanyId === companyId ? quote.toCompanyId : quote.fromCompanyId;

    await db.insert(notificationsTable).values({
      companyId: otherCompanyId,
      type: "b2b_message",
      title: `Yeni Mesaj: ${quote.code}`,
      message: parsed.data.body.slice(0, 200),
    });

    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "b2b message failed");
    res.status(500).json({ error: "Mesaj gönderilemedi" });
  }
});

export default router;
