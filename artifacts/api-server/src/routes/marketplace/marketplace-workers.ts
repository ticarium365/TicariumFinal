import type { Router, RequestHandler } from "express";
import {
  db,
  channelAccountsTable,
  syncJobsTable,
  syncLogsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

// Sprint C: response'a errorCategory + nextRetryAt + retryAvailable türetilmiş
// alanları eklenir. lastError formatı worker.ts tarafında `[kalıcı|rate-limit|geçici] msg`
// olarak yazıldığından prefix'ten kategori parse edilir; scheduledAt gelecekteyse
// retry countdown için frontend tarafından kullanılır.
function parseJobMeta(row: any): {
  errorCategory: "rate-limit" | "permanent" | "transient" | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  retryAvailable: boolean;
} {
  let category: "rate-limit" | "permanent" | "transient" | null = null;
  let message: string | null = null;
  if (typeof row.lastError === "string" && row.lastError.length > 0) {
    const m = row.lastError.match(/^\[(kalıcı|rate-limit|geçici)\]\s*(.*)$/);
    if (m) {
      category = m[1] === "kalıcı" ? "permanent" : m[1] === "rate-limit" ? "rate-limit" : "transient";
      message = m[2] || null;
    } else {
      message = row.lastError;
    }
  }
  const now = Date.now();
  const sched = row.scheduledAt ? new Date(row.scheduledAt).getTime() : null;
  // Retry pencerelendi: status 'failed' ya da 'queued', deneme limiti aşılmadı, scheduledAt gelecekte
  const attempts = Number(row.attemptCount || 0);
  const max = Number(row.maxAttempts || 3);
  const inFuture = sched != null && sched > now;
  const retryAvailable = inFuture && attempts < max && category !== "permanent" && row.status !== "completed";
  return {
    errorCategory: category,
    errorMessage: message,
    nextRetryAt: retryAvailable ? new Date(sched!).toISOString() : null,
    retryAvailable,
  };
}

export function registerMarketplaceWorkerRoutes(router: Router, opts: { requireWriter: RequestHandler }): void {
  const requireWriter = opts.requireWriter;

  router.get("/jobs", async (req, res) => {
    const rows = await db.select().from(syncJobsTable)
      .where(eq(syncJobsTable.companyId, req.companyId!))
      .orderBy(desc(syncJobsTable.createdAt)).limit(100);
    res.json(rows.map((r) => ({ ...r, ...parseJobMeta(r) })));
  });

  router.post("/jobs", requireWriter, async (req, res) => {
    const companyId = req.companyId!;
    const userId = req.session.user!.id;
    const { accountId, jobType, payload, priority } = req.body || {};
    if (!accountId || !jobType) return res.status(400).json({ error: "accountId ve jobType zorunlu" });
    // Ownership: hesap bu firmaya mı ait?
    const [own] = await db.select({ id: channelAccountsTable.id }).from(channelAccountsTable).where(and(
      eq(channelAccountsTable.id, Number(accountId)),
      eq(channelAccountsTable.companyId, companyId),
    )).limit(1);
    if (!own) return res.status(404).json({ error: "account_not_found" });
    const [row] = await db.insert(syncJobsTable).values({
      companyId, accountId, jobType, payload: payload || {}, priority: priority ?? 100, createdBy: userId,
    }).returning();
    res.status(201).json(row);
  });

  router.get("/logs", async (req, res) => {
    const rows = await db.select().from(syncLogsTable)
      .where(eq(syncLogsTable.companyId, req.companyId!))
      .orderBy(desc(syncLogsTable.createdAt)).limit(100);
    res.json(rows);
  });

  router.get("/stats", async (req, res) => {
    const companyId = req.companyId!;
    const accounts = await db.execute(sql`SELECT COUNT(*)::int AS count FROM channel_accounts WHERE company_id = ${companyId} AND is_active = true`);
    const jobs = await db.execute(sql`SELECT status, COUNT(*)::int AS count FROM sync_jobs WHERE company_id = ${companyId} GROUP BY status`);
    const mappings = await db.execute(sql`SELECT COUNT(*)::int AS count FROM product_channel_mappings WHERE company_id = ${companyId} AND is_published = true`);
    const orders = await db.execute(sql`SELECT status, COUNT(*)::int AS count FROM marketplace_orders WHERE company_id = ${companyId} GROUP BY status`);
    res.json({ accounts: accounts.rows, jobs: jobs.rows, publishedMappings: mappings.rows, orders: orders.rows });
  });
}

