// Inbound webhook receiver — pazaryerlerinden gelen event'leri kabul eder.
// HMAC signature doğrulama + replay protection (UNIQUE external_event_id).
// Bu router app.ts'de tenantMiddleware ÖNCE mount edilir.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, inboundWebhooksTable, channelAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function verifyHmacSha256(secret: string, body: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const sigClean = signature.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sigClean, "hex"));
  } catch {
    return false;
  }
}

function extractEventId(provider: string, body: any, headers: any): string {
  if (headers["x-event-id"]) return String(headers["x-event-id"]);
  if (headers["x-webhook-id"]) return String(headers["x-webhook-id"]);
  if (body?.id) return String(body.id);
  if (body?.eventId) return String(body.eventId);
  if (body?.orderNumber) return `${provider}:${body.orderNumber}`;
  return crypto.randomUUID();
}

router.post(
  "/webhooks/:provider/:accountId",
  (req: any, _res, next) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => (raw += c));
    req.on("end", () => {
      req.rawBody = raw;
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const provider = String(req.params.provider || "");
    const accId = Number(req.params.accountId);
    if (!provider || !Number.isFinite(accId) || accId <= 0) {
      res.status(400).json({ error: "bad_request" });
      return;
    }

    const [account] = await db
      .select()
      .from(channelAccountsTable)
      .where(and(eq(channelAccountsTable.id, accId), eq(channelAccountsTable.provider, provider)))
      .limit(1);
    if (!account) {
      logger.warn({ provider, accountId: accId }, "webhook_account_not_found");
      res.status(404).end();
      return;
    }

    const webhookSecret = (account.settings as any)?.webhookSecret as string | undefined;
    const secretOk = typeof webhookSecret === "string" && webhookSecret.length >= 16;

    if (IS_PRODUCTION && !secretOk) {
      logger.error({ provider, accountId: accId }, "webhook_rejected_missing_secret_prod");
      res.status(401).json({ error: "webhook_secret_required", message: "Kanal hesabında webhookSecret tanımlanmalıdır." });
      return;
    }

    let signatureValid: string = "skipped";
    let signatureHeader: string | null = null;

    if (secretOk) {
      const hdr =
        (req.headers["x-hub-signature-256"] ||
          req.headers["x-signature"] ||
          req.headers["x-webhook-signature"] ||
          "") as string | string[];
      signatureHeader = Array.isArray(hdr) ? hdr[0] ?? "" : String(hdr || "");
      if (!signatureHeader) {
        res.status(401).json({ error: "Missing signature header" });
        return;
      }
      const ok = verifyHmacSha256(webhookSecret!, (req as any).rawBody || "", signatureHeader);
      signatureValid = ok ? "valid" : "invalid";
      if (!ok) {
        logger.warn({ provider, accountId: accId }, "webhook_signature_invalid");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    const eventId = extractEventId(provider, req.body, req.headers);
    const eventType = (req.body?.eventType || req.body?.type || req.headers["x-event-type"] || "unknown") as string;

    try {
      await db.insert(inboundWebhooksTable).values({
        provider,
        accountId: accId,
        companyId: account.companyId,
        externalEventId: eventId,
        eventType: String(eventType),
        payload: req.body || {},
        signature: signatureHeader,
        signatureValid,
        status: "received",
      });
    } catch (e: any) {
      if (e.code === "23505") {
        res.status(200).json({ ok: true, replay: true });
        return;
      }
      logger.error({ err: e, provider }, "webhook_persist_failed");
      res.status(500).end();
      return;
    }

    res.status(200).json({ ok: true });
  },
);

export default router;
