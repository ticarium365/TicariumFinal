import { Router, type Request, type Response } from "express";
import { db, einvoiceSettingsTable, einvoiceOutboxTable, einvoiceInboxTable, einvoiceEventsTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

// Helper: hassas alanları maskele
function maskConfig(config: Record<string, any> | null | undefined) {
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(config || {})) {
    if (typeof v === "string" && /password|secret|token|apikey/i.test(k)) {
      safe[k] = v ? "********" : "";
    } else {
      safe[k] = v;
    }
  }
  return safe;
}
function sanitizeSettings(row: any) {
  if (!row) return row;
  return { ...row, config: maskConfig(row.config) };
}

const requireWriter = requireRole(["admin", "staff", "super_admin"]);
import { getProviderForCompany, PROVIDER_META, PROVIDER_REGISTRY, logEvent } from "../services/einvoice/factory.js";
import type { EInvoiceCreatePayload } from "../services/einvoice/types.js";

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// AYARLAR
// ─────────────────────────────────────────────────────────────────────────────
router.get("/providers", async (_req: Request, res: Response) => {
  res.json(PROVIDER_META);
});

router.get("/settings", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { settings } = await getProviderForCompany(companyId);
  res.json(sanitizeSettings(settings));
});

router.put("/settings", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { provider, sandbox, enabled, config, defaultSenderAlias, defaultProfile } = req.body || {};
  if (provider && !PROVIDER_REGISTRY[provider]) {
    return res.status(400).json({ error: "Bilinmeyen provider", provider });
  }
  const [existing] = await db.select().from(einvoiceSettingsTable).where(eq(einvoiceSettingsTable.companyId, companyId)).limit(1);
  // Mevcut config ile gelen config'i birleştir (placeholder ******** olanları yazma)
  const merged: Record<string, any> = { ...(existing?.config as any || {}) };
  if (config && typeof config === "object") {
    for (const [k, v] of Object.entries(config as any)) {
      if (typeof v === "string" && v === "********") continue; // mask placeholder
      merged[k] = v;
    }
  }
  const patch: any = {
    config: merged,
    updatedAt: new Date(),
  };
  if (provider !== undefined) patch.provider = provider;
  if (sandbox !== undefined) patch.sandbox = !!sandbox;
  if (enabled !== undefined) patch.enabled = !!enabled;
  if (defaultSenderAlias !== undefined) patch.defaultSenderAlias = defaultSenderAlias;
  if (defaultProfile !== undefined) patch.defaultProfile = defaultProfile;

  let row;
  if (existing) {
    [row] = await db.update(einvoiceSettingsTable).set(patch).where(eq(einvoiceSettingsTable.companyId, companyId)).returning();
  } else {
    [row] = await db.insert(einvoiceSettingsTable).values({ companyId, ...patch }).returning();
  }
  res.json(sanitizeSettings(row));
});

router.post("/health-check", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  try {
    const { provider, settings } = await getProviderForCompany(companyId);
    const result = await provider.healthCheck();
    await db.update(einvoiceSettingsTable).set({
      lastHealthCheck: result.checkedAt,
      lastHealthOk: result.ok,
      lastHealthMessage: result.message,
    }).where(eq(einvoiceSettingsTable.companyId, companyId));
    await logEvent({ companyId, provider: settings.provider, event: "health_check",
      level: result.ok ? "info" : "warn", message: result.message, payload: result.meta });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: "health_check_failed", message: e?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OUTBOX — Giden faturalar
// ─────────────────────────────────────────────────────────────────────────────
router.get("/outbox", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { status, limit = "100" } = req.query as any;
  const conds = [eq(einvoiceOutboxTable.companyId, companyId)];
  if (status) conds.push(eq(einvoiceOutboxTable.status, String(status)));
  const rows = await db.select().from(einvoiceOutboxTable).where(and(...conds))
    .orderBy(desc(einvoiceOutboxTable.createdAt)).limit(Number(limit));
  res.json(rows);
});

router.get("/outbox/:id", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const [row] = await db.select().from(einvoiceOutboxTable)
    .where(and(eq(einvoiceOutboxTable.id, id), eq(einvoiceOutboxTable.companyId, companyId))).limit(1);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

router.post("/outbox", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const { sender, receiver, lines, invoiceType, profile, scenario, invoiceDate, currency, notes, documentNumber, saleId } = req.body || {};
  if (!receiver?.name || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "receiver.name ve en az bir satır gerekli" });
  }
  try {
    const { provider, settings } = await getProviderForCompany(companyId);
    const payload: EInvoiceCreatePayload = {
      invoiceType: invoiceType || "SATIS",
      profile: profile || settings.defaultProfile || "TICARIFATURA",
      scenario: scenario || "EFATURA",
      invoiceDate: new Date(invoiceDate || Date.now()),
      currency: currency || "TRY",
      documentNumber: documentNumber || null,
      notes: notes || [],
      sender,
      receiver,
      lines,
    };
    const result = await provider.createInvoice(payload);
    const totals = lines.reduce((s: any, l: any) => {
      const lineSub = (l.quantity || 0) * (l.unitPrice || 0);
      const lineDisc = l.discountAmount || 0;
      const lineNet = lineSub - lineDisc;
      const lineVat = lineNet * ((l.vatRate || 0) / 100);
      s.total += lineNet + lineVat;
      s.tax += lineVat;
      return s;
    }, { total: 0, tax: 0 });

    const [row] = await db.insert(einvoiceOutboxTable).values({
      companyId,
      saleId: saleId || null,
      documentNumber: documentNumber || null,
      receiverVkn: receiver.vkn || null,
      receiverName: receiver.name,
      receiverAlias: receiver.alias || null,
      receiverEmail: receiver.email || null,
      invoiceType: payload.invoiceType,
      profile: payload.profile,
      scenario: payload.scenario,
      invoiceDate: payload.invoiceDate,
      totalAmount: Math.round(totals.total * 100) / 100,
      taxAmount: Math.round(totals.tax * 100) / 100,
      currency: payload.currency || "TRY",
      provider: settings.provider,
      externalId: result.externalId,
      externalNo: result.externalNo || null,
      status: result.status || "draft",
      payload,
      lastResponse: result.raw || null,
      attemptCount: 0,
      createdBy: userId,
    }).returning();

    await logEvent({ companyId, provider: settings.provider, event: "invoice_created",
      outboxId: row.id, message: `Outbox #${row.id} oluşturuldu (ETTN ${result.externalId})` });
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: "create_failed", detail: e?.message });
  }
});

router.post("/outbox/:id/send", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  // Atomik kilit: yalnızca draft|failed|queued ise "sending" durumuna alır
  const [locked] = await db.update(einvoiceOutboxTable).set({
    status: "sending",
    lastAttemptAt: new Date(),
    attemptCount: sql`${einvoiceOutboxTable.attemptCount} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(einvoiceOutboxTable.id, id),
    eq(einvoiceOutboxTable.companyId, companyId),
    sql`${einvoiceOutboxTable.status} IN ('draft','failed','queued')`,
  )).returning();
  if (!locked) {
    // Ya yok ya da başka bir istek aldı / zaten gönderilmiş
    const [exists] = await db.select().from(einvoiceOutboxTable)
      .where(and(eq(einvoiceOutboxTable.id, id), eq(einvoiceOutboxTable.companyId, companyId))).limit(1);
    if (!exists) return res.status(404).json({ error: "not_found" });
    return res.status(409).json({ error: "not_sendable", status: exists.status });
  }
  if (!locked.externalId) {
    await db.update(einvoiceOutboxTable).set({ status: "failed", statusMessage: "ETTN yok" }).where(eq(einvoiceOutboxTable.id, id));
    return res.status(400).json({ error: "external_id_missing" });
  }
  const row = locked;
  try {
    const { provider } = await getProviderForCompany(companyId);
    const result = await provider.sendInvoice(row.externalId!);
    const [updated] = await db.update(einvoiceOutboxTable).set({
      status: result.status === "failed" ? "failed" : (result.status === "accepted" ? "accepted" : "sent"),
      statusMessage: result.message || null,
      lastResponse: result.raw || result,
      updatedAt: new Date(),
    }).where(eq(einvoiceOutboxTable.id, id)).returning();
    await logEvent({ companyId, provider: row.provider, event: "invoice_sent",
      outboxId: id, level: result.status === "failed" ? "error" : "info", message: result.message });
    res.json(updated);
  } catch (e: any) {
    await db.update(einvoiceOutboxTable).set({
      status: "failed", statusMessage: e?.message || String(e),
      attemptCount: (row.attemptCount || 0) + 1, lastAttemptAt: new Date(),
    }).where(eq(einvoiceOutboxTable.id, id));
    res.status(500).json({ error: "send_failed", detail: e?.message });
  }
});

router.post("/outbox/:id/cancel", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const reason = req.body?.reason;
  const [row] = await db.select().from(einvoiceOutboxTable)
    .where(and(eq(einvoiceOutboxTable.id, id), eq(einvoiceOutboxTable.companyId, companyId))).limit(1);
  if (!row?.externalId) return res.status(404).json({ error: "not_found" });
  try {
    const { provider } = await getProviderForCompany(companyId);
    const result = await provider.cancelInvoice(row.externalId, reason);
    const [updated] = await db.update(einvoiceOutboxTable).set({
      status: result.status === "cancelled" ? "cancelled" : "failed",
      statusMessage: result.message || null,
      lastResponse: result.raw || result,
      updatedAt: new Date(),
    }).where(eq(einvoiceOutboxTable.id, id)).returning();
    await logEvent({ companyId, provider: row.provider, event: "invoice_cancelled",
      outboxId: id, message: result.message });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: "cancel_failed", detail: e?.message });
  }
});

router.get("/outbox/:id/pdf", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const [row] = await db.select().from(einvoiceOutboxTable)
    .where(and(eq(einvoiceOutboxTable.id, id), eq(einvoiceOutboxTable.companyId, companyId))).limit(1);
  if (!row?.externalId) return res.status(404).json({ error: "not_found" });
  const { provider } = await getProviderForCompany(companyId);
  if (!provider.getInvoicePdf) return res.status(400).json({ error: "pdf_not_supported" });
  const pdf = await provider.getInvoicePdf(row.externalId);
  if (!pdf) return res.status(404).json({ error: "pdf_not_found" });
  res.setHeader("Content-Type", pdf.mime);
  res.send(pdf.buffer);
});

// ─────────────────────────────────────────────────────────────────────────────
// INBOX — Gelen faturalar
// ─────────────────────────────────────────────────────────────────────────────
router.get("/inbox", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { status, limit = "100" } = req.query as any;
  const conds = [eq(einvoiceInboxTable.companyId, companyId)];
  if (status) conds.push(eq(einvoiceInboxTable.status, String(status)));
  const rows = await db.select().from(einvoiceInboxTable).where(and(...conds))
    .orderBy(desc(einvoiceInboxTable.invoiceDate)).limit(Number(limit));
  res.json(rows);
});

router.post("/inbox/poll", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const since = req.body?.since ? new Date(req.body.since) : new Date(Date.now() - 7 * 86400000);
  try {
    const { provider, settings } = await getProviderForCompany(companyId);
    const incoming = await provider.getIncomingInvoices({ since, limit: 200 });
    let inserted = 0, skipped = 0, failed = 0;
    for (const inv of incoming) {
      try {
        const result = await db.insert(einvoiceInboxTable).values({
          companyId,
          provider: settings.provider,
          externalId: inv.externalId,
          senderVkn: inv.senderVkn || null,
          senderName: inv.senderName,
          senderAlias: inv.senderAlias || null,
          invoiceNo: inv.invoiceNo || null,
          invoiceDate: inv.invoiceDate,
          receivedAt: inv.receivedAt || new Date(),
          totalAmount: inv.totalAmount,
          taxAmount: inv.taxAmount,
          currency: inv.currency || "TRY",
          profile: inv.profile || null,
          rawXml: inv.rawXml || null,
          pdfUrl: inv.pdfUrl || null,
          payload: inv.raw || null,
        }).onConflictDoNothing({
          target: [einvoiceInboxTable.companyId, einvoiceInboxTable.provider, einvoiceInboxTable.externalId],
        }).returning({ id: einvoiceInboxTable.id });
        if (result.length > 0) inserted++; else skipped++;
      } catch (e) {
        failed++;
        console.error("[einvoice/inbox/poll] insert failed", inv.externalId, e);
      }
    }
    await logEvent({ companyId, provider: settings.provider, event: "inbox_polled",
      message: `Inbox poll: ${inserted} yeni / ${skipped} mevcut` });
    res.json({ inserted, skipped, total: incoming.length });
  } catch (e: any) {
    res.status(500).json({ error: "poll_failed", detail: e?.message });
  }
});

router.patch("/inbox/:id", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const id = Number(req.params.id);
  const { status, responseStatus } = req.body || {};
  const patch: any = { updatedAt: new Date() };
  if (status) patch.status = status;
  if (responseStatus) patch.responseStatus = responseStatus;
  const [row] = await db.update(einvoiceInboxTable).set(patch)
    .where(and(eq(einvoiceInboxTable.id, id), eq(einvoiceInboxTable.companyId, companyId))).returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS / Audit log
// ─────────────────────────────────────────────────────────────────────────────
router.get("/events", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const limit = Number(req.query.limit || 50);
  const rows = await db.select().from(einvoiceEventsTable)
    .where(eq(einvoiceEventsTable.companyId, companyId))
    .orderBy(desc(einvoiceEventsTable.createdAt)).limit(limit);
  res.json(rows);
});

router.get("/stats", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const out = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM einvoice_outbox
    WHERE company_id = ${companyId}
    GROUP BY status
  `);
  const inb = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM einvoice_inbox
    WHERE company_id = ${companyId}
    GROUP BY status
  `);
  res.json({
    outbox: out.rows,
    inbox: inb.rows,
  });
});

export default router;
