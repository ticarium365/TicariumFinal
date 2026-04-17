import { db, webhooksTable, webhookDeliveriesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";

export interface WebhookPayload {
  event: string;
  companyId: number;
  timestamp: string;
  data: unknown;
}

/**
 * Şirkete kayıtlı ve aktif webhook'lara olayı fire-and-forget ile gönderir.
 * Ana iş akışını bloklamaz.
 */
export async function dispatchWebhook(payload: WebhookPayload): Promise<void> {
  // Async çalıştır, hataları yakala ama throw etme
  dispatchInternal(payload).catch(err => {
    console.error("[webhook-dispatcher] Unhandled error:", err);
  });
}

async function dispatchInternal(payload: WebhookPayload): Promise<void> {
  const { event, companyId } = payload;

  // Bu şirketin aktif webhook'larını bul
  const allWebhooks = await db.select().from(webhooksTable)
    .where(and(eq(webhooksTable.companyId, companyId), eq(webhooksTable.isActive, true)));

  // İlgili event'ları filtrele
  const matching = allWebhooks.filter(wh => {
    try {
      const events: string[] = JSON.parse(wh.events);
      return events.includes("*") || events.includes(event);
    } catch {
      return false;
    }
  });

  if (matching.length === 0) return;

  const bodyStr = JSON.stringify(payload);

  await Promise.allSettled(
    matching.map(async (wh) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-SMS-Event": event,
        "X-SMS-Timestamp": payload.timestamp,
        "X-SMS-Delivery-ID": crypto.randomUUID(),
      };

      // HMAC imzası
      if (wh.secret) {
        const sig = crypto.createHmac("sha256", wh.secret).update(bodyStr).digest("hex");
        headers["X-SMS-Signature"] = `sha256=${sig}`;
      }

      let statusCode: number | null = null;
      let responseText: string | null = null;
      let success = false;
      let errorMessage: string | null = null;

      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 10_000); // 10s timeout
        const res = await fetch(wh.url, {
          method: "POST",
          headers,
          body: bodyStr,
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        statusCode = res.status;
        responseText = (await res.text()).slice(0, 500);
        success = res.ok;
      } catch (err: unknown) {
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      // Delivery log
      await db.insert(webhookDeliveriesTable).values({
        webhookId: wh.id,
        companyId,
        event,
        payload: bodyStr.slice(0, 8000),
        statusCode: statusCode ?? undefined,
        response: responseText ?? undefined,
        success,
        errorMessage: errorMessage ?? undefined,
        attempt: 1,
      });
    })
  );
}
