// ─────────────────────────────────────────────────────────────────────────────
// Sync queue worker — periyodik olarak `sync_jobs` kuyruğunu işler.
// Tek-örnek: status="queued" işleri atomik olarak "running"a alır, çalıştırır,
// completed/failed olarak kapatır. Retriable hatalarda backoff ile yeniden kuyruğa.
// ─────────────────────────────────────────────────────────────────────────────

import { db, syncJobsTable, marketplaceOrdersTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { getProviderForAccount, logSync } from "./factory.js";
import {
  RateLimitError, PermanentProviderError, type IncomingOrder,
} from "./types.js";

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

    // ─── Capability gate ───
    // Provider'ın desteklemediği işlerde retry yapma, "skipped" işaretle.
    // Sözleşmeyi tek tek tip eşliyoruz ki yeni jobType eklendiğinde unutulmasın.
    const cap = provider.capabilities;
    const requiredCap: Partial<Record<string, keyof typeof cap>> = {
      push_product: "pushProduct",
      push_stock: "pushStock",
      push_price: "pushPrice",
      pull_orders: "pullOrders",
      pull_products: "pullProducts",
    };
    const need = requiredCap[job.jobType];
    if (need && !cap[need]) {
      await db.update(syncJobsTable).set({
        status: "skipped", completedAt: new Date(),
        result: { skipped: true, reason: `Provider ${provider.displayName} ${job.jobType} desteklemiyor` },
      }).where(eq(syncJobsTable.id, job.id));
      await logSync({
        companyId: job.companyId, accountId: account.id, jobId: job.id,
        operation: job.jobType, status: "partial", level: "warn",
        durationMs: Date.now() - start,
        message: `Job #${job.id} atlandı: ${provider.displayName} ${job.jobType} desteklemiyor`,
      });
      return true;
    }

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
        // İdempotent ingest: aynı (companyId, accountId, externalOrderId) için tekrar pull → upsert
        let inserted = 0, updated = 0;
        for (const o of orders as IncomingOrder[]) {
          const extId = String((o as any).externalOrderId ?? (o as any).orderId ?? "").trim();
          if (!extId) continue;
          const row = {
            companyId: job.companyId,
            accountId: account.id,
            channelKey: account.provider,
            externalOrderId: extId,
            externalOrderNumber: (o as any).orderNumber ?? null,
            status: ((o as any).status as string) || "new",
            customerName: (o as any).customerName ?? null,
            customerEmail: (o as any).customerEmail ?? null,
            customerPhone: (o as any).customerPhone ?? null,
            shippingAddress: (o as any).shippingAddress ?? null,
            totalAmount: Number((o as any).totalAmount ?? 0),
            currency: (o as any).currency || "TRY",
            itemsJson: (o as any).items || [],
            rawPayload: o as any,
            orderedAt: (o as any).orderedAt ? new Date((o as any).orderedAt) : null,
            updatedAt: new Date(),
          };
          // Deterministic insert vs update: xmax=0 means new row was inserted (no prior tuple version).
          // Bu PG MVCC tekniğidir; ON CONFLICT DO UPDATE içinde insert-vs-update'i ayırt etmenin
          // kanonik (zaman penceresine bağlı olmayan) yöntemidir.
          const ret = await db.execute<{ id: number; was_inserted: boolean }>(sql`
            INSERT INTO marketplace_orders
              (company_id, account_id, channel_key, external_order_id, external_order_number,
               status, customer_name, customer_email, customer_phone, shipping_address,
               total_amount, currency, items_json, raw_payload, ordered_at, updated_at)
            VALUES
              (${row.companyId}, ${row.accountId}, ${row.channelKey}, ${row.externalOrderId},
               ${row.externalOrderNumber}, ${row.status}, ${row.customerName}, ${row.customerEmail},
               ${row.customerPhone}, ${JSON.stringify(row.shippingAddress)}::jsonb,
               ${row.totalAmount}, ${row.currency}, ${JSON.stringify(row.itemsJson)}::jsonb,
               ${JSON.stringify(row.rawPayload)}::jsonb, ${row.orderedAt}, NOW())
            ON CONFLICT (company_id, account_id, external_order_id) DO UPDATE SET
              status = EXCLUDED.status,
              total_amount = EXCLUDED.total_amount,
              items_json = EXCLUDED.items_json,
              raw_payload = EXCLUDED.raw_payload,
              customer_name = EXCLUDED.customer_name,
              customer_email = EXCLUDED.customer_email,
              customer_phone = EXCLUDED.customer_phone,
              shipping_address = EXCLUDED.shipping_address,
              external_order_number = EXCLUDED.external_order_number,
              updated_at = NOW()
            RETURNING id, (xmax = 0) AS was_inserted
          `);
          const out = (ret as any).rows?.[0];
          if (out) {
            if (out.was_inserted) inserted++; else updated++;
          }
        }
        processed = orders.length;
        result = { count: orders.length, inserted, updated, orders };
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
    // Hata sınıfı tanı: Permanent → retry yok; RateLimit → retryAfterMs penceresi;
    // diğer (Transient veya bilinmeyen) → exponential backoff (attempt^2 dakika).
    const isPermanent = e?.isPermanent === true || e instanceof PermanentProviderError;
    const isRateLimit = e?.isRateLimit === true || e instanceof RateLimitError;
    const canRetry = !isPermanent && (job.attemptCount || 0) < (job.maxAttempts || 3);

    let nextDelayMs: number;
    if (isRateLimit) {
      // Provider'ın söylediği bekleme süresine en az 1 sn ekle (jitter)
      nextDelayMs = Math.max(1000, Number(e?.retryAfterMs || 60_000)) + 1000;
    } else {
      nextDelayMs = (job.attemptCount || 1) ** 2 * 60_000;
    }

    const failureLabel = isPermanent ? "kalıcı" : isRateLimit ? "rate-limit" : "geçici";

    await db.update(syncJobsTable).set({
      status: canRetry ? "queued" : "failed",
      completedAt: canRetry ? null : new Date(),
      lastError: `[${failureLabel}] ${e?.message || String(e)}`,
      scheduledAt: canRetry ? new Date(Date.now() + nextDelayMs) : new Date(),
    }).where(eq(syncJobsTable.id, job.id));

    await logSync({
      companyId: job.companyId, accountId: job.accountId, jobId: job.id,
      operation: job.jobType, status: "failed", level: "error",
      durationMs: Date.now() - start, itemsFailed: 1,
      message: `Job #${job.id} hata (${failureLabel}): ${e?.message}`,
      errorPayload: {
        stack: e?.stack, message: e?.message,
        category: failureLabel, nextDelayMs: canRetry ? nextDelayMs : null,
      },
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
