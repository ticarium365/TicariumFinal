// ─────────────────────────────────────────────────────────────────────────────
// SMS yönetimi: tenant ayarları, sağlık taraması, test gönderim, geçmiş, send.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type IRouter, type Request, type Response } from "express";
import { db, smsSettingsTable, smsMessagesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { encryptSecrets, isSensitiveKey } from "../lib/secret-crypto.js";
import {
  SMS_META, SMS_REGISTRY, getSmsProviderForCompany, sendSms,
} from "../services/sms/factory.js";

const router: IRouter = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

// ─── Yardımcı: hassas kimlikleri maskele ───────────────────────────────────
function maskCreds(creds: Record<string, any> | null | undefined) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(creds || {})) {
    if (typeof v === "string" && (isSensitiveKey(k) || v.startsWith("enc:v1:"))) {
      out[k] = v ? "********" : "";
    } else {
      out[k] = v;
    }
  }
  return out;
}
function sanitize(row: any) {
  if (!row) return null;
  return { ...row, credentials: maskCreds(row.credentials) };
}

// ─── Provider katalog ───────────────────────────────────────────────────────
router.get("/providers", (_req, res) => {
  res.json(SMS_META.map((m) => ({ ...m, implemented: ["mock", "netgsm"].includes(m.key) })));
});

// ─── Mevcut ayarlar ─────────────────────────────────────────────────────────
router.get("/settings", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const [row] = await db.select().from(smsSettingsTable)
    .where(eq(smsSettingsTable.companyId, companyId)).limit(1);
  if (!row) {
    return res.json({
      companyId, provider: "netgsm", sandbox: false, senderHeader: null,
      credentials: {}, isActive: true,
      lastHealthOk: null, lastHealthMessage: null, lastCheckedAt: null,
      _empty: true,
    });
  }
  res.json(sanitize(row));
});

// ─── Ayarları yaz/güncelle ──────────────────────────────────────────────────
router.put("/settings", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { provider, sandbox, senderHeader, credentials, isActive } = req.body || {};
  if (provider && !SMS_REGISTRY[provider]) {
    return res.status(400).json({ error: "Bilinmeyen provider", provider });
  }
  const [existing] = await db.select().from(smsSettingsTable)
    .where(eq(smsSettingsTable.companyId, companyId)).limit(1);

  // Mevcut credentials ile gelen credentials'ı birleştir (****** olanları yazma)
  const existingCreds = (existing?.credentials as Record<string, any>) || {};
  const merged: Record<string, any> = { ...existingCreds };
  if (credentials && typeof credentials === "object") {
    for (const [k, v] of Object.entries(credentials)) {
      if (typeof v === "string" && v === "********") continue;
      merged[k] = v;
    }
  }

  const patch: any = {
    credentials: encryptSecrets(merged),
    updatedAt: new Date(),
  };
  if (provider !== undefined) patch.provider = provider;
  if (sandbox !== undefined) patch.sandbox = !!sandbox;
  if (senderHeader !== undefined) patch.senderHeader = senderHeader || null;
  if (isActive !== undefined) patch.isActive = !!isActive;

  let row;
  if (existing) {
    [row] = await db.update(smsSettingsTable).set(patch)
      .where(eq(smsSettingsTable.companyId, companyId)).returning();
  } else {
    [row] = await db.insert(smsSettingsTable).values({ companyId, ...patch }).returning();
  }
  res.json(sanitize(row));
});

// ─── Sağlık taraması ────────────────────────────────────────────────────────
router.post("/health-check", requireWriter, async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  try {
    const { provider, resolvedKey, source } = await getSmsProviderForCompany(companyId);
    const result = await provider.healthCheck();
    // DB satırı yoksa yazma — env/mock fallback'in kalıcı kaydı olmasın
    if (source === "db") {
      await db.update(smsSettingsTable).set({
        lastHealthOk: result.ok,
        lastHealthMessage: result.message,
        lastCheckedAt: result.checkedAt,
      }).where(eq(smsSettingsTable.companyId, companyId));
    }
    res.json({ ...result, provider: resolvedKey, source });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message || "health_check_failed" });
  }
});

// ─── Test gönderim (üretim öncesi doğrulama) ────────────────────────────────
router.post("/test-send", requireWriter, async (req: Request, res: Response) => {
  const { toPhone, body } = req.body || {};
  if (!toPhone) return res.status(400).json({ error: "toPhone zorunlu" });
  const text = body?.trim() || `Ticarium365 test mesajı — ${new Date().toLocaleString("tr-TR")}`;
  if (text.length > 1000) return res.status(400).json({ error: "Mesaj çok uzun (max 1000 karakter)" });
  const result = await sendSms({ companyId: req.companyId!, toPhone, body: text });
  res.json(result);
});

// ─── Tenant SMS gönderim (uygulamadan tetik) ────────────────────────────────
// Viewer rolü maliyet/güvenlik nedeniyle gönderim tetikleyemez.
router.post("/send", requireWriter, async (req: Request, res: Response) => {
  const { toPhone, body } = req.body || {};
  if (!toPhone || !body) return res.status(400).json({ error: "toPhone ve body zorunlu" });
  if (body.length > 1000) return res.status(400).json({ error: "Mesaj çok uzun (max 1000 karakter)" });
  const result = await sendSms({ companyId: req.companyId!, toPhone, body });
  res.json(result);
});

// ─── Mesaj geçmişi ──────────────────────────────────────────────────────────
router.get("/messages", async (req: Request, res: Response) => {
  const companyId = req.companyId!;
  const { status, limit = "100" } = req.query as any;
  const conds = [eq(smsMessagesTable.companyId, companyId)];
  if (status) conds.push(eq(smsMessagesTable.status, String(status)));
  const rows = await db.select().from(smsMessagesTable).where(and(...conds))
    .orderBy(desc(smsMessagesTable.createdAt)).limit(Math.min(Number(limit) || 100, 500));
  res.json(rows);
});

export default router;
