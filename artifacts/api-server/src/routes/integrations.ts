import { Router, Request, Response } from "express";
import {
  db, webhooksTable, webhookDeliveriesTable, apiKeysTable,
  accountingIntegrationsTable, ecommerceIntegrationsTable,
} from "@workspace/db";
import { and, eq, desc, sql, count, isNotNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { buildIntegrationCatalogResponse } from "../lib/integration-hub-catalog.js";
import { pingResolvedAdapter } from "../services/integration-hub/registry.js";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { channelAccountsTable, einvoiceSettingsTable } from "@workspace/db";
import { buildLiveReadinessBundleV1, loadTenantActivityProfile } from "../lib/integration-live-readiness.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get("/webhooks", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const hooks = await db.select().from(webhooksTable)
      .where(eq(webhooksTable.companyId, cid))
      .orderBy(desc(webhooksTable.createdAt));

    // Her webhook için son teslimat bilgisini getir
    const hookIds = hooks.map(h => h.id);
    const deliveryCounts = hookIds.length > 0
      ? await db.select({
          webhookId: webhookDeliveriesTable.webhookId,
          total: sql<number>`count(*)::int`,
          failed: sql<number>`count(*) filter (where success = false)::int`,
          lastAt: sql<string>`max(delivered_at)::text`,
        }).from(webhookDeliveriesTable)
          .where(sql`webhook_id = ANY(${sql.raw(`ARRAY[${hookIds.join(",")}]`)})`)
          .groupBy(webhookDeliveriesTable.webhookId)
      : [];

    const result = hooks.map(h => ({
      ...h,
      deliveryStats: deliveryCounts.find(d => d.webhookId === h.id) ?? { total: 0, failed: 0, lastAt: null },
    }));

    res.json({ webhooks: result });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/webhooks", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { name, url, events, secret } = req.body as {
      name?: string; url?: string; events?: string[]; secret?: string;
    };

    if (!name?.trim()) return void res.status(400).json(Errors.badRequest("Webhook adı gerekli"));
    if (!url?.trim()) return void res.status(400).json(Errors.badRequest("URL gerekli"));

    // Basit URL format kontrolü
    try { new URL(url); } catch {
      return void res.status(400).json(Errors.badRequest("Geçersiz URL formatı"));
    }

    const eventsJson = JSON.stringify(Array.isArray(events) ? events : []);

    const [hook] = await db.insert(webhooksTable).values({
      companyId: cid,
      name: name.trim(),
      url: url.trim(),
      events: eventsJson,
      secret: secret?.trim() || null,
      createdBy: uid,
    }).returning();

    res.status(201).json({ webhook: hook });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.put("/webhooks/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { name, url, events, secret, isActive } = req.body as {
      name?: string; url?: string; events?: string[]; secret?: string; isActive?: boolean;
    };

    if (url) {
      try { new URL(url); } catch {
        return void res.status(400).json(Errors.badRequest("Geçersiz URL formatı"));
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name.trim();
    if (url !== undefined) updateData.url = url.trim();
    if (events !== undefined) updateData.events = JSON.stringify(events);
    if (secret !== undefined) updateData.secret = secret.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(webhooksTable)
      .set(updateData)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.companyId, cid)))
      .returning();

    if (!updated) return void res.status(404).json(Errors.notFound("Webhook"));
    res.json({ webhook: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/webhooks/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    // Önce şirkete ait olduğunu doğrula
    const [hook] = await db.select({ id: webhooksTable.id })
      .from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.companyId, cid)));
    if (!hook) return void res.status(404).json(Errors.notFound("Webhook"));

    // Önce ilişkili delivery loglarını sil (FK constraint)
    await db.delete(webhookDeliveriesTable)
      .where(eq(webhookDeliveriesTable.webhookId, id));

    // Sonra webhook'u sil
    await db.delete(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.companyId, cid)));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Webhook test gönderimi (ping)
router.post("/webhooks/:id/test", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [hook] = await db.select().from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.companyId, cid)));
    if (!hook) return void res.status(404).json(Errors.notFound("Webhook"));

    const payload = {
      event: "test.ping",
      companyId: cid,
      timestamp: new Date().toISOString(),
      data: { message: "SMS Systems webhook test ping" },
    };
    const bodyStr = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-SMS-Event": "test.ping",
      "X-SMS-Timestamp": payload.timestamp,
    };
    if (hook.secret) {
      const sig = crypto.createHmac("sha256", hook.secret).update(bodyStr).digest("hex");
      headers["X-SMS-Signature"] = `sha256=${sig}`;
    }

    let statusCode: number | null = null;
    let responseText = "";
    let success = false;
    let errorMsg = "";

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10_000);
      const resp = await fetch(hook.url, { method: "POST", headers, body: bodyStr, signal: ctrl.signal });
      clearTimeout(timeout);
      statusCode = resp.status;
      responseText = (await resp.text()).slice(0, 500);
      success = resp.ok;
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    await db.insert(webhookDeliveriesTable).values({
      webhookId: id,
      companyId: cid,
      event: "test.ping",
      payload: bodyStr,
      statusCode: statusCode ?? undefined,
      response: responseText || undefined,
      success,
      errorMessage: errorMsg || undefined,
    });

    res.json({ success, statusCode, response: responseText, error: errorMsg || undefined });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Webhook teslimat logu
router.get("/webhooks/:id/deliveries", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [hook] = await db.select().from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.companyId, cid)));
    if (!hook) return void res.status(404).json(Errors.notFound("Webhook"));

    const deliveries = await db.select().from(webhookDeliveriesTable)
      .where(and(eq(webhookDeliveriesTable.webhookId, id), eq(webhookDeliveriesTable.companyId, cid)))
      .orderBy(desc(webhookDeliveriesTable.deliveredAt))
      .limit(100);

    res.json({ deliveries });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// API ANAHTARLARI
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api-keys", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const keys = await db.select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      scopes: apiKeysTable.scopes,
      isActive: apiKeysTable.isActive,
      lastUsedAt: apiKeysTable.lastUsedAt,
      expiresAt: apiKeysTable.expiresAt,
      createdAt: apiKeysTable.createdAt,
    }).from(apiKeysTable)
      .where(eq(apiKeysTable.companyId, cid))
      .orderBy(desc(apiKeysTable.createdAt));

    res.json({ apiKeys: keys });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/api-keys", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { name, scopes, expiresAt } = req.body as {
      name?: string; scopes?: string; expiresAt?: string;
    };

    if (!name?.trim()) return void res.status(400).json(Errors.badRequest("API Key adı gerekli"));

    // Güvenli random key üret
    const rawKey = `sms_${crypto.randomBytes(24).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const expDate = expiresAt ? new Date(expiresAt) : null;

    const [apiKey] = await db.insert(apiKeysTable).values({
      companyId: cid,
      name: name.trim(),
      keyHash,
      keyPrefix,
      scopes: scopes || "read",
      isActive: true,
      expiresAt: expDate ?? undefined,
      createdBy: uid,
    }).returning({ id: apiKeysTable.id, name: apiKeysTable.name, keyPrefix: apiKeysTable.keyPrefix, scopes: apiKeysTable.scopes, createdAt: apiKeysTable.createdAt });

    // Ham anahtar sadece bu response'da döner — sonradan erişilemez
    res.status(201).json({ apiKey: { ...apiKey, rawKey } });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/api-keys/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [deleted] = await db.delete(apiKeysTable)
      .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.companyId, cid)))
      .returning();
    if (!deleted) return void res.status(404).json(Errors.notFound("API Key"));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.put("/api-keys/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { isActive } = req.body as { isActive?: boolean };

    const [updated] = await db.update(apiKeysTable)
      .set({ isActive })
      .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.companyId, cid)))
      .returning({ id: apiKeysTable.id, isActive: apiKeysTable.isActive });

    if (!updated) return void res.status(404).json(Errors.notFound("API Key"));
    res.json({ apiKey: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DESTEKLENEN WEBHOOK OLAYLARI
// ─────────────────────────────────────────────────────────────────────────────
router.get("/live-readiness", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId!;
    const bundle = await buildLiveReadinessBundleV1(cid);
    res.json(bundle);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.get("/catalog", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const [[wh], [keys], [acc], [ec], mpCounts, mpLatest, einvRow, tenantActivityProfile] = await Promise.all([
      db.select({ c: count() }).from(webhooksTable).where(eq(webhooksTable.companyId, cid)),
      db.select({ c: count() }).from(apiKeysTable).where(eq(apiKeysTable.companyId, cid)),
      db.select({ c: count() }).from(accountingIntegrationsTable).where(eq(accountingIntegrationsTable.companyId, cid)),
      db.select({ c: count() }).from(ecommerceIntegrationsTable).where(eq(ecommerceIntegrationsTable.companyId, cid)),
      db.select({
        provider: channelAccountsTable.provider,
        c: sql<number>`count(*)::int`,
      }).from(channelAccountsTable)
        .where(and(eq(channelAccountsTable.companyId, cid), eq(channelAccountsTable.isActive, true)))
        .groupBy(channelAccountsTable.provider),
      db.select({
        provider: channelAccountsTable.provider,
        lastSyncAt: channelAccountsTable.lastSyncAt,
        lastHealthOk: channelAccountsTable.lastHealthOk,
        lastHealthMessage: channelAccountsTable.lastHealthMessage,
      }).from(channelAccountsTable)
        .where(and(
          eq(channelAccountsTable.companyId, cid),
          eq(channelAccountsTable.isActive, true),
          isNotNull(channelAccountsTable.lastHealthOk),
        ))
        .orderBy(desc(channelAccountsTable.lastSyncAt))
        .limit(30),
      db.select({
        provider: einvoiceSettingsTable.provider,
        sandbox: einvoiceSettingsTable.sandbox,
        lastHealthOk: einvoiceSettingsTable.lastHealthOk,
        lastHealthMessage: einvoiceSettingsTable.lastHealthMessage,
        lastHealthCheck: einvoiceSettingsTable.lastHealthCheck,
      }).from(einvoiceSettingsTable).where(eq(einvoiceSettingsTable.companyId, cid)).limit(1),
      loadTenantActivityProfile(cid!),
    ]);
    const tenantCounts = {
      webhooks: Number(wh?.c ?? 0),
      apiKeys: Number(keys?.c ?? 0),
      accounting: Number(acc?.c ?? 0),
      ecommerce: Number(ec?.c ?? 0),
    };
    const connectedByProvider: Record<string, number> = {};
    for (const r of mpCounts as any[]) {
      if (!r?.provider) continue;
      connectedByProvider[String(r.provider)] = Number(r.c ?? 0);
    }
    const statusByEntryId: Record<string, { ok: boolean; message: string; checkedAtIso?: string }> = {};
    for (const r of mpLatest as any[]) {
      const provider = String(r.provider ?? "");
      if (!provider) continue;
      const entryId = provider === "trendyol" ? "ecommerce_trendyol"
        : provider === "hepsiburada" ? "ecommerce_hepsiburada"
          : provider === "n11" ? "ecommerce_n11"
            : null;
      if (!entryId) continue;
      if (statusByEntryId[entryId]) continue; // first wins
      statusByEntryId[entryId] = {
        ok: Boolean(r.lastHealthOk),
        message: String(r.lastHealthMessage ?? (r.lastHealthOk ? "Sağlıklı" : "Sağlıksız")),
        checkedAtIso: r.lastSyncAt ? new Date(r.lastSyncAt).toISOString() : undefined,
      };
    }
    const einv = (einvRow as any[])?.[0];
    if (einv?.provider) {
      const eid = String(einv.provider) === "parasut" ? "einvoice_parasut" : "einvoice_mock";
      if (einv.lastHealthOk != null || einv.lastHealthMessage) {
        statusByEntryId[eid] = {
          ok: Boolean(einv.lastHealthOk),
          message: String(einv.lastHealthMessage ?? (einv.lastHealthOk ? "Sağlıklı" : "Sağlıksız")),
          checkedAtIso: einv.lastHealthCheck ? new Date(einv.lastHealthCheck).toISOString() : undefined,
        };
      }
    }
    res.json(buildIntegrationCatalogResponse(process.env, tenantCounts, {
      connectedByProvider,
      statusByEntryId,
      tenantActivityProfile,
    }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

/** Katalog adapter ping — anahtar yoksa açıklayıcı no-op döner (UI güveni için). */
router.post("/catalog/:entryId/ping", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const entryId = (req.params.entryId ?? "").trim();
    if (!entryId) return void res.status(400).json(Errors.badRequest("entryId gerekli"));
    const result = await pingResolvedAdapter(entryId, { companyId: req.companyId });
    res.json({ entryId, result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.get("/webhook-events", requireAuth, async (_req, res) => {
  res.json({
    events: [
      { event: "*",                 description: "Tüm olaylar" },
      { event: "sale.created",      description: "Yeni satış" },
      { event: "sale.returned",     description: "Satış iadesi" },
      { event: "stock.low",         description: "Düşük stok uyarısı" },
      { event: "stock.updated",     description: "Stok güncellendi" },
      { event: "purchase.created",  description: "Alış faturası oluşturuldu" },
      { event: "expense.created",   description: "Yeni gider kaydı" },
      { event: "customer.created",  description: "Yeni müşteri" },
      { event: "supplier.created",  description: "Yeni tedarikçi" },
      { event: "test.ping",         description: "Test ping" },
    ],
  });
});

export default router;
