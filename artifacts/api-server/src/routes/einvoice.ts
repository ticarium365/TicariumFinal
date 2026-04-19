import { Router, type Request, type Response } from "express";
import { db, einvoiceSettingsTable, einvoiceOutboxTable, einvoiceInboxTable, einvoiceEventsTable, salesTable, customersTable, companiesTable } from "@workspace/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { encryptSecrets, isSensitiveKey } from "../lib/secret-crypto.js";

// Helper: hassas alanları maskele (response için, asla decrypt edilmiş plaintext dönme)
function maskConfig(config: Record<string, any> | null | undefined) {
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(config || {})) {
    if (typeof v === "string" && (isSensitiveKey(k) || (v.startsWith("enc:v1:")))) {
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
    config: encryptSecrets(merged),
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
  // Idempotency: header veya body ile gönderildiyse — aynı anahtarla çift POST aynı kaydı döner
  const idempotencyKey = (req.header("Idempotency-Key") || req.body?.idempotencyKey || null);
  const idemKeyStr = idempotencyKey ? String(idempotencyKey) : null;

  // Toplamları önceden hesapla (rezerve insert'te kullanılır)
  const totals = (lines as any[]).reduce((s: any, l: any) => {
    const lineSub = (l.quantity || 0) * (l.unitPrice || 0);
    const lineDisc = l.discountAmount || 0;
    const lineNet = lineSub - lineDisc;
    const lineVat = lineNet * ((l.vatRate || 0) / 100);
    s.total += lineNet + lineVat;
    s.tax += lineVat;
    return s;
  }, { total: 0, tax: 0 });

  // RESERVE-FIRST PATTERN: idempotency key varsa, provider'ı çağırmadan ÖNCE DB'ye rezerve satır insert ediyoruz.
  // Aynı anda gelen ikinci istek partial unique index nedeniyle 23505 alır → mevcut satırı döner. Sadece kazanan provider çağırır.
  let settings: any;
  let providerInst: any;
  try {
    const r = await getProviderForCompany(companyId);
    settings = r.settings;
    providerInst = r.provider;
  } catch (e: any) {
    return res.status(500).json({ error: "provider_unavailable", detail: e?.message });
  }

  let reservedRow: any = null;
  if (idemKeyStr) {
    try {
      const [row] = await db.insert(einvoiceOutboxTable).values({
        companyId,
        saleId: saleId || null,
        documentNumber: documentNumber || null,
        receiverVkn: receiver.vkn || null,
        receiverName: receiver.name,
        receiverAlias: receiver.alias || null,
        receiverEmail: receiver.email || null,
        invoiceType: invoiceType || "SATIS",
        profile: profile || settings.defaultProfile || "TICARIFATURA",
        scenario: scenario || "EFATURA",
        invoiceDate: new Date(invoiceDate || Date.now()),
        totalAmount: Math.round(totals.total * 100) / 100,
        taxAmount: Math.round(totals.tax * 100) / 100,
        currency: currency || "TRY",
        provider: settings.provider,
        externalId: null,
        externalNo: null,
        status: "reserving",
        payload: { sender, receiver, lines, invoiceType, profile, scenario, invoiceDate, currency, notes, documentNumber },
        lastResponse: null,
        attemptCount: 0,
        createdBy: userId,
        idempotencyKey: idemKeyStr,
      }).returning();
      reservedRow = row;
    } catch (e: any) {
      // 23505 = unique_violation (Postgres). drizzle/pg can nest the original code under .cause.
      const code = e?.code || e?.cause?.code || e?.original?.code;
      const msg = e?.message || e?.cause?.message || "";
      if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        const [existing] = await db.select().from(einvoiceOutboxTable).where(and(
          eq(einvoiceOutboxTable.companyId, companyId),
          eq(einvoiceOutboxTable.idempotencyKey, idemKeyStr),
        )).limit(1);
        if (existing) return res.status(200).json(existing);
      }
      console.error("[einvoice/outbox] reserve_failed:", { code, msg, stack: e?.stack?.split("\n")[0] });
      return res.status(500).json({ error: "reserve_failed" });
    }
  }

  try {
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
    const result = await providerInst.createInvoice(payload);

    let row: any;
    if (reservedRow) {
      const [updated] = await db.update(einvoiceOutboxTable).set({
        externalId: result.externalId,
        externalNo: result.externalNo || null,
        status: result.status || "draft",
        lastResponse: result.raw || null,
        updatedAt: new Date(),
      }).where(eq(einvoiceOutboxTable.id, reservedRow.id)).returning();
      row = updated;
    } else {
      const [inserted] = await db.insert(einvoiceOutboxTable).values({
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
        idempotencyKey: null,
      }).returning();
      row = inserted;
    }

    await logEvent({ companyId, provider: settings.provider, event: "invoice_created",
      outboxId: row.id, message: `Outbox #${row.id} oluşturuldu (ETTN ${result.externalId})` });
    res.status(201).json(row);
  } catch (e: any) {
    // Provider hatası: rezerve edildiyse satırı failed işaretle ve idempotencyKey'i null'la (retry'da yeniden rezerve edilebilsin)
    if (reservedRow) {
      await db.update(einvoiceOutboxTable).set({
        status: "failed",
        idempotencyKey: null,
        lastResponse: { error: String(e?.message || e) },
        updatedAt: new Date(),
      }).where(eq(einvoiceOutboxTable.id, reservedRow.id));
    }
    res.status(500).json({ error: "create_failed", detail: e?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 62 — Satıştan otomatik fatura oluşturma (POS köprüsü)
// Aynı müşteriye ait bir veya birden çok satış satırını birleştirip e-fatura
// taslağı üretir. Sender bilgileri einvoice_settings.config'ten okunur.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/from-sales", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const { saleIds, scenario, profile, invoiceType, notes } = req.body || {};

  if (!Array.isArray(saleIds) || saleIds.length === 0) {
    return res.status(400).json({ error: "saleIds dizisi gerekli" });
  }
  const ids = saleIds.map((n: any) => Number(n)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return res.status(400).json({ error: "Geçerli saleId yok" });
  }

  // 1) Satışları yükle (tenant scoped)
  const sales = await db.select().from(salesTable)
    .where(and(eq(salesTable.companyId, companyId), inArray(salesTable.id, ids)));
  if (sales.length === 0) {
    return res.status(404).json({ error: "Satış bulunamadı" });
  }
  // Tüm satışlar aynı müşteriye ait olmalı
  const customerIds = new Set(sales.map((s) => s.customerId).filter((c) => c !== null && c !== undefined));
  if (customerIds.size > 1) {
    return res.status(400).json({ error: "Tüm satışlar aynı müşteriye ait olmalı" });
  }
  const customerId = sales[0].customerId;

  // 2) Müşteri / Şirket / Provider ayarları paralel
  const [customerRow, companyRow, providerSetup] = await Promise.all([
    customerId
      ? db.select().from(customersTable).where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, companyId))).limit(1).then((r) => r[0] || null)
      : Promise.resolve(null),
    db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1).then((r) => r[0] || null),
    getProviderForCompany(companyId).catch((e: any) => ({ error: e?.message }) as any),
  ]);

  if ("error" in providerSetup) {
    return res.status(500).json({ error: "provider_unavailable", detail: (providerSetup as any).error });
  }
  const { provider: providerInst, settings } = providerSetup as Awaited<ReturnType<typeof getProviderForCompany>>;
  const cfg = (settings.config as Record<string, any>) || {};

  if (!customerRow) {
    return res.status(400).json({ error: "Müşteri seçilmemiş satıştan e-fatura kesilemez" });
  }
  if (!customerRow.taxNumber) {
    return res.status(400).json({ error: "Müşterinin VKN/TCKN bilgisi eksik" });
  }

  // 3) Sender (kendi şirketimiz) — config'ten oku, eksikse hata
  const senderVkn = cfg.senderVkn as string | undefined;
  if (!senderVkn) {
    return res.status(400).json({ error: "Gönderici VKN tanımsız (Ayarlar → E-Fatura → senderVkn)" });
  }
  const sender = {
    vkn: senderVkn,
    alias: (settings.defaultSenderAlias as string | null) || (cfg.senderAlias as string | null) || null,
    name: (cfg.senderName as string | undefined) || companyRow?.name || "Şirketim",
    taxOffice: (cfg.senderTaxOffice as string | null) || null,
    address: (cfg.senderAddress as string | null) || null,
    city: (cfg.senderCity as string | null) || null,
    district: (cfg.senderDistrict as string | null) || null,
    country: "TR",
    email: (cfg.senderEmail as string | null) || null,
    phone: (cfg.senderPhone as string | null) || null,
  };

  // 4) Receiver — müşteriden
  const receiver = {
    vkn: customerRow.taxNumber,
    alias: null,
    name: customerRow.name,
    taxOffice: customerRow.taxOffice || null,
    address: customerRow.address || null,
    country: "TR",
    email: customerRow.email || null,
    phone: customerRow.phone || null,
  };

  // 5) Lines — satışlardan (KDV oranı satışta yok → varsayılan %20; ileride product.vatRate)
  const defaultVatRate = Number(cfg.defaultVatRate ?? 20);
  const lines = sales.map((s) => ({
    productCode: s.productCode,
    name: s.productName,
    quantity: s.quantity,
    unitCode: "C62",
    unitPrice: s.unitPrice,
    vatRate: defaultVatRate,
    discountAmount: 0,
    description: null,
  }));

  // 6) Provider'a gönder + outbox'a yaz
  const totals = lines.reduce((acc, l) => {
    const sub = l.quantity * l.unitPrice;
    const vat = sub * (l.vatRate / 100);
    acc.total += sub + vat;
    acc.tax += vat;
    return acc;
  }, { total: 0, tax: 0 });

  try {
    const payload: EInvoiceCreatePayload = {
      invoiceType: invoiceType || "SATIS",
      profile: profile || (settings as any).defaultProfile || "TICARIFATURA",
      scenario: scenario || "EFATURA",
      invoiceDate: new Date(),
      currency: "TRY",
      documentNumber: null,
      notes: notes || [`Satış ID: ${ids.join(", ")}`],
      sender,
      receiver,
      lines,
    };
    const result = await providerInst.createInvoice(payload);

    const [row] = await db.insert(einvoiceOutboxTable).values({
      companyId,
      saleId: ids[0],
      documentNumber: null,
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
      currency: "TRY",
      provider: settings.provider,
      externalId: result.externalId,
      externalNo: result.externalNo || null,
      status: result.status || "draft",
      payload,
      lastResponse: result.raw || null,
      attemptCount: 0,
      createdBy: userId,
      idempotencyKey: null,
    }).returning();

    await logEvent({
      companyId, provider: settings.provider, event: "invoice_created_from_sale",
      outboxId: row.id,
      message: `Outbox #${row.id} satış #${ids.join(",")} köprüsünden üretildi (ETTN ${result.externalId})`,
    });
    res.status(201).json(row);
  } catch (e: any) {
    console.error("[einvoice/from-sales] create_failed:", e);
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
  // Atomik kilit: yalnızca iptal edilebilir durumlardan birinde ise "cancelling"e al
  const [locked] = await db.update(einvoiceOutboxTable).set({
    status: "cancelling", updatedAt: new Date(),
  }).where(and(
    eq(einvoiceOutboxTable.id, id),
    eq(einvoiceOutboxTable.companyId, companyId),
    sql`${einvoiceOutboxTable.status} IN ('draft','queued','failed','sent','accepted')`,
  )).returning();
  if (!locked) {
    const [exists] = await db.select().from(einvoiceOutboxTable)
      .where(and(eq(einvoiceOutboxTable.id, id), eq(einvoiceOutboxTable.companyId, companyId))).limit(1);
    if (!exists) return res.status(404).json({ error: "not_found" });
    return res.status(409).json({ error: "not_cancellable", status: exists.status });
  }
  if (!locked.externalId) {
    await db.update(einvoiceOutboxTable).set({ status: "failed", statusMessage: "ETTN yok", updatedAt: new Date() }).where(eq(einvoiceOutboxTable.id, id));
    return res.status(400).json({ error: "external_id_missing" });
  }
  try {
    const { provider } = await getProviderForCompany(companyId);
    const result = await provider.cancelInvoice(locked.externalId, reason);
    const [updated] = await db.update(einvoiceOutboxTable).set({
      status: result.status === "cancelled" ? "cancelled" : "failed",
      statusMessage: result.message || null,
      lastResponse: result.raw || result,
      updatedAt: new Date(),
    }).where(eq(einvoiceOutboxTable.id, id)).returning();
    await logEvent({ companyId, provider: locked.provider, event: "invoice_cancelled",
      outboxId: id, message: result.message });
    res.json(updated);
  } catch (e: any) {
    await db.update(einvoiceOutboxTable).set({
      status: "failed", statusMessage: e?.message || String(e), updatedAt: new Date(),
    }).where(eq(einvoiceOutboxTable.id, id));
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
