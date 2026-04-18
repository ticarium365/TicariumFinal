// ─────────────────────────────────────────────────────────────────────────────
// Sync queue worker — periyodik olarak `sync_jobs` kuyruğunu işler.
// Tek-örnek: status="queued" işleri atomik olarak "running"a alır, çalıştırır,
// completed/failed olarak kapatır. Retriable hatalarda backoff ile yeniden kuyruğa.
// ─────────────────────────────────────────────────────────────────────────────

import { db, syncJobsTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { getProviderForAccount, logSync } from "./factory.js";

const POLL_INTERVAL_MS = 5000;
const MAX_PARALLEL = 3;
let running = false;
let timer: NodeJS.Timeout | null = null;
let inFlight = 0;

async function processOne(): Promise<boolean> {
  // Atomik claim: en eski queued işi running'e al
  const [job] = await db.update(syncJobsTable).set({
    status: "running", startedAt: new Date(),
    attemptCount: sql`${syncJobsTable.attemptCount} + 1`,
  }).where(and(
    eq(syncJobsTable.status, "queued"),
    lte(syncJobsTable.scheduledAt, new Date()),
    sql`${syncJobsTable.id} = (
      SELECT id FROM sync_jobs
      WHERE status = 'queued' AND scheduled_at <= NOW()
      ORDER BY priority ASC, scheduled_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )`,
  )).returning();

  if (!job) return false;

  const start = Date.now();
  try {
    const { provider, account } = await getProviderForAccount(job.companyId, job.accountId);
    let result: any = null;
    let processed = 0;

    switch (job.jobType) {
      case "health_check": result = await provider.healthCheck(); break;
      case "push_product": {
        const items = (job.payload?.items || []) as any[];
        const out: any[] = [];
        for (const it of items) {
          const r = await provider.pushProduct(it);
          out.push(r); if (r.success) processed++;
        }
        result = { count: items.length, results: out };
        break;
      }
      case "push_stock": {
        const items = (job.payload?.items || []) as any[];
        const out: any[] = [];
        for (const it of items) {
          const r = await provider.pushStock(it);
          out.push(r); if (r.success) processed++;
        }
        result = { count: items.length, results: out };
        break;
      }
      case "push_price": {
        const items = (job.payload?.items || []) as any[];
        const out: any[] = [];
        for (const it of items) {
          const r = await provider.pushPrice(it);
          out.push(r); if (r.success) processed++;
        }
        result = { count: items.length, results: out };
        break;
      }
      case "pull_orders": {
        const since = job.payload?.since ? new Date(job.payload.since) : new Date(Date.now() - 86400000);
        const orders = await provider.pullOrders({ since, limit: 200 });
        processed = orders.length;
        result = { count: orders.length, orders };
        break;
      }
      default: throw new Error(`Unknown jobType: ${job.jobType}`);
    }

    await db.update(syncJobsTable).set({
      status: "completed", completedAt: new Date(), result,
    }).where(eq(syncJobsTable.id, job.id));

    await logSync({
      companyId: job.companyId, accountId: account.id, jobId: job.id,
      operation: job.jobType, status: "success",
      durationMs: Date.now() - start, itemsProcessed: processed,
      message: `Job #${job.id} (${job.jobType}) tamamlandı`,
      payload: result,
    });
  } catch (e: any) {
    const canRetry = (job.attemptCount || 0) < (job.maxAttempts || 3);
    await db.update(syncJobsTable).set({
      status: canRetry ? "queued" : "failed",
      completedAt: canRetry ? null : new Date(),
      lastError: e?.message || String(e),
      // Exponential backoff: attempt^2 dakika
      scheduledAt: canRetry ? new Date(Date.now() + (job.attemptCount || 1) ** 2 * 60_000) : new Date(),
    }).where(eq(syncJobsTable.id, job.id));

    await logSync({
      companyId: job.companyId, accountId: job.accountId, jobId: job.id,
      operation: job.jobType, status: "failed", level: "error",
      durationMs: Date.now() - start, itemsFailed: 1,
      message: `Job #${job.id} hata: ${e?.message}`,
      errorPayload: { stack: e?.stack, message: e?.message },
    });
  }
  return true;
}

async function tick() {
  while (inFlight < MAX_PARALLEL) {
    // Hızlı kontrol: kuyrukta uygun iş var mı?
    const r = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM sync_jobs WHERE status = 'queued' AND scheduled_at <= NOW()`,
    );
    const cnt = Number((r.rows[0] as any)?.count || 0);
    if (!cnt) break;
    inFlight++;
    processOne().catch((e) => console.error("[marketplace/worker] error", e)).finally(() => { inFlight--; });
    await new Promise((r) => setTimeout(r, 50));
  }
}

export function startMarketplaceWorker() {
  if (running) return;
  running = true;
  console.log("[marketplace/worker] started, poll every", POLL_INTERVAL_MS, "ms");
  timer = setInterval(() => { tick().catch(console.error); }, POLL_INTERVAL_MS);
}

export function stopMarketplaceWorker() {
  running = false;
  if (timer) { clearInterval(timer); timer = null; }
}
