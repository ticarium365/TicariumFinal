// Generic outbox worker — domain_events tablosundan pending event'leri dispatch eder.
// pg-boss veya cron tabanlı çalışabilir. İlk faz: in-process setInterval.
// Trafik artınca pg-boss'a taşınacak.
import { db, domainEventsTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

type Handler = (event: { id: number; companyId: number; aggregateType: string; aggregateId: string; eventType: string; payload: any }) => Promise<void>;

const handlers = new Map<string, Handler>();

export function registerOutboxHandler(eventType: string, handler: Handler) {
  handlers.set(eventType, handler);
}

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 7;

let workerRunning = false;
let stopRequested = false;

export async function publishEvent(opts: {
  companyId: number;
  aggregateType: string;
  aggregateId: string | number;
  eventType: string;
  payload?: any;
}) {
  await db.insert(domainEventsTable).values({
    companyId: opts.companyId,
    aggregateType: opts.aggregateType,
    aggregateId: String(opts.aggregateId),
    eventType: opts.eventType,
    payload: opts.payload ?? {},
  });
}

async function processOnce(): Promise<number> {
  const now = new Date();
  const events = await db.execute<{
    id: number; company_id: number; aggregate_type: string; aggregate_id: string;
    event_type: string; payload: any; attempts: number;
  }>(sql`
    UPDATE domain_events SET status = 'processing'
    WHERE id IN (
      SELECT id FROM domain_events
      WHERE status = 'pending' AND next_retry_at <= ${now}
      ORDER BY id ASC LIMIT ${MAX_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, company_id, aggregate_type, aggregate_id, event_type, payload, attempts
  `);

  const rows = (events as any).rows ?? events;
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  for (const ev of rows) {
    const handler = handlers.get(ev.event_type);
    try {
      if (!handler) {
        await db.update(domainEventsTable)
          .set({ status: "published", publishedAt: new Date(), lastError: "no_handler" })
          .where(eq(domainEventsTable.id, ev.id));
        continue;
      }
      await handler({
        id: ev.id, companyId: ev.company_id, aggregateType: ev.aggregate_type,
        aggregateId: ev.aggregate_id, eventType: ev.event_type, payload: ev.payload,
      });
      await db.update(domainEventsTable)
        .set({ status: "published", publishedAt: new Date(), lastError: null, attempts: ev.attempts + 1 })
        .where(eq(domainEventsTable.id, ev.id));
    } catch (err: any) {
      const attempts = ev.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db.update(domainEventsTable)
          .set({ status: "dead_letter", attempts, lastError: err?.message || String(err) })
          .where(eq(domainEventsTable.id, ev.id));
        logger.error({ id: ev.id, eventType: ev.event_type, err }, "outbox_dead_letter");
      } else {
        const backoffMin = Math.pow(2, attempts);
        const nextRetry = new Date(Date.now() + backoffMin * 60_000);
        await db.update(domainEventsTable)
          .set({ status: "pending", attempts, lastError: err?.message || String(err), nextRetryAt: nextRetry })
          .where(eq(domainEventsTable.id, ev.id));
        logger.warn({ id: ev.id, attempts, nextRetry }, "outbox_retry_scheduled");
      }
    }
  }
  return rows.length;
}

export function startOutboxWorker(intervalMs = 5000) {
  if (workerRunning) return;
  workerRunning = true;
  stopRequested = false;
  logger.info("outbox_worker_started");
  const tick = async () => {
    if (stopRequested) return;
    try {
      const n = await processOnce();
      if (n > 0) logger.debug({ processed: n }, "outbox_batch_processed");
    } catch (err) {
      logger.error({ err }, "outbox_worker_error");
    } finally {
      if (!stopRequested) setTimeout(tick, intervalMs);
    }
  };
  setTimeout(tick, intervalMs);
}

export function stopOutboxWorker() {
  stopRequested = true;
  workerRunning = false;
}
