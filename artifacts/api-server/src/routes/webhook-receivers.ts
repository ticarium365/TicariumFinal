// Inbound webhook receiver — pazaryerlerinden gelen event'leri kabul eder.
// HMAC signature doğrulama + replay protection (UNIQUE external_event_id).
// Bu router app.ts'de tenantMiddleware ÖNCESİNDE mount edilir.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, inboundWebhooksTable, channelAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function verifyHmacSha256(secret: string, body: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const sigClean = signature.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sigClean, "hex"));
  } catch { return false; }
}

function extractEventId(provider: string, body: any, headers: any): string {
  if (headers["x-event-id"]) return String(headers["x-event-id"]);
  if (headers["x-webhook-id"]) return String(headers["x-webhook-id"]);
  if (body?.id) return String(body.id);
  if (body?.eventId) return String(body.eventId);
  if (body?.orderNumber) return `${provider}:${body.orderNumber}`;
  return crypto.randomUUID();
}

router.post("/webhooks/:provider/:accountId",
  (req: any, _res, next) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => raw += c);
    req.on("end", () => { req.rawBody = raw; try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; } next(); });
  },
  async (req: Request, res: Response) => {
    const { provider, accountId } = req.params;
    const accId = Number(accountId);
    if (!provider || !accId) return res.status(400).end();

    const [account] = await db.select().from(channelAccountsTable)
      .where(and(eq(channelAccountsTable.id, accId), eq(channelAccountsTable.provider, provider))).limit(1);
    if (!account) {
      logger.warn({ provider, accountId }, "webhook_account_not_found");
      return res.status(404).end();
    }

    const webhookSecret = (account.settings as any)?.webhookSecret as string | undefined;
    let signatureValid = "skipped";
    let signatureHeader: string | null = null;

    if (webhookSecret) {
      signatureHeader = (req.headers["x-hub-signature-256"] || req.headers["x-signature"] || req.headers["x-webhook-signature"] || "") as string;
      if (!signatureHeader) {
        return res.status(401).json({ error: "Missing signature header" });
      }
      const ok = verifyHmacSha256(webhookSecret, (req as any).rawBody || "", signatureHeader);
      signatureValid = ok ? "valid" : "invalid";
      if (!ok) {
        logger.warn({ provider, accountId: accId }, "webhook_signature_invalid");
        return res.status(401).json({ error: "Invalid signature" });
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
        eventType,
        payload: req.body || {},
        signature: signatureHeader,
        signatureValid,
        status: "received",
      });
    } catch (e: any) {
      if (e.code === "23505") {
        return res.status(200).json({ ok: true, replay: true });
      }
      logger.error({ err: e, provider }, "webhook_persist_failed");
      return res.status(500).end();
    }

    res.status(200).json({ ok: true });
  }
);

export default router;
