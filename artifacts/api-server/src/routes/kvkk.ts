import { Router, type IRouter, type Request, type Response } from "express";
import { db, kvkkConsentsTable, dataExportRequestsTable, dataErasureRequestsTable, usersTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const KVKK_CONSENT_VERSION = "v1.2026.04";

router.post("/consent", async (req: Request, res: Response) => {
  const { consentType, email, accepted } = req.body || {};
  if (!consentType || typeof accepted !== "boolean") {
    return res.status(400).json({ error: "consentType ve accepted zorunlu" });
  }
  // Güvenlik: userId asla body'den alınmaz — yalnız oturumdan
  const sessionUserId = (req as any).session?.user?.id ?? (req as any).user?.id ?? null;
  const cid = (req as any).companyId ?? null;
  await db.insert(kvkkConsentsTable).values({
    consentType,
    version: KVKK_CONSENT_VERSION,
    email: email ?? null,
    userId: sessionUserId,
    companyId: cid,
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null,
    userAgent: req.headers["user-agent"] || null,
    withdrawnAt: accepted ? null : new Date(),
  });
  if (sessionUserId && consentType === "kvkk_acceptance" && accepted) {
    await db.update(usersTable)
      .set({ kvkkConsentAt: new Date(), kvkkConsentVersion: KVKK_CONSENT_VERSION })
      .where(eq(usersTable.id, sessionUserId));
  }
  if (sessionUserId && consentType === "marketing" && accepted) {
    await db.update(usersTable)
      .set({ marketingConsentAt: new Date() })
      .where(eq(usersTable.id, sessionUserId));
  }
  res.status(201).json({ ok: true, version: KVKK_CONSENT_VERSION });
});

router.get("/consent/version", (_req, res) => {
  res.json({ version: KVKK_CONSENT_VERSION });
});

router.post("/data-export", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const cid = req.companyId;
  if (!userId || !cid) return res.status(401).json({ error: "Unauthorized" });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [request] = await db.insert(dataExportRequestsTable).values({
    companyId: cid, userId, status: "pending", expiresAt,
  }).returning();

  setImmediate(() => {
    db.update(dataExportRequestsTable)
      .set({ status: "queued" })
      .where(eq(dataExportRequestsTable.id, request.id))
      .catch((e) => logger.error({ err: e }, "data_export_queue_failed"));
  });

  res.status(202).json({ id: request.id, status: "pending", expiresAt, message: "Veri dışa aktarma isteğiniz alındı. Tamamlandığında e-posta ile bildirim göndereceğiz." });
});

router.get("/data-export", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db.select().from(dataExportRequestsTable)
    .where(eq(dataExportRequestsTable.userId, userId))
    .orderBy(desc(dataExportRequestsTable.requestedAt))
    .limit(20);
  res.json({ requests: rows });
});

router.post("/data-erasure", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const cid = req.companyId;
  if (!userId || !cid) return res.status(401).json({ error: "Unauthorized" });
  const { reason } = req.body || {};

  const scheduledHardDeleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [request] = await db.insert(dataErasureRequestsTable).values({
    companyId: cid, userId, reason: reason ?? null, status: "scheduled", scheduledHardDeleteAt,
  }).returning();

  await db.update(usersTable)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(usersTable.id, userId));

  res.status(202).json({
    id: request.id,
    status: "scheduled",
    scheduledHardDeleteAt,
    message: "Hesabınız silinmek üzere işaretlendi. 30 gün içinde iptal edebilirsiniz; sonra tüm veriler kalıcı silinecek.",
  });
});

router.delete("/data-erasure/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const id = Number(req.params.id);
  if (!userId || !id) return res.status(400).json({ error: "Bad Request" });
  const [updated] = await db.update(dataErasureRequestsTable)
    .set({ cancelledAt: new Date(), cancelledBy: userId, status: "cancelled" })
    .where(and(eq(dataErasureRequestsTable.id, id), eq(dataErasureRequestsTable.userId, userId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not Found" });
  await db.update(usersTable).set({ deletedAt: null, isActive: true }).where(eq(usersTable.id, userId));
  res.json({ ok: true, message: "Silme isteği iptal edildi." });
});

export default router;
