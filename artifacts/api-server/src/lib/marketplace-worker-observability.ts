/**
 * Pazaryeri sync worker gözlemi — kuyruk, gecikme, kümeler, takılı işler.
 * Yeşil durum uydurmaz: sync_logs / sync_jobs gerçeği önceliklidir.
 */
import {
  desc, eq, sql,
} from "drizzle-orm";
import {
  db,
  channelAccountsTable,
  syncJobsTable,
  syncLogsTable,
} from "@workspace/db";

const STUCK_QUEUED_MIN = 25;
const STUCK_RUNNING_MIN = 35;
const STALE_SUCCESS_H = 48;
const RECENT_SUCCESS_H = 24;

export type WorkerObservabilityHealthHonest =
  | "no_channel"
  | "no_success_yet"
  | "healthy_recent"
  | "stale_success"
  | "degraded_queue";

export type MarketplaceWorkerAccountObsV1 = {
  accountId: number;
  name: string;
  provider: string;
  sandbox: boolean;
  isActive: boolean;
  /** Son API health (kanal tablosu) — sync başarısı değildir. */
  lastProviderHealthOk: boolean | null;
  lastProviderHealthMessage: string | null;
  lastSuccessSyncAtIso: string | null;
  lastSuccessOperation: string | null;
  lastSuccessDurationMs: number | null;
  avgSuccessLatencyMs7d: number | null;
  failedJobs7d: number;
  queuedJobsNow: number;
  runningJobsNow: number;
  queuedStuck: boolean;
  runningStuck: boolean;
  healthHonest: WorkerObservabilityHealthHonest;
  slaWarnings: string[];
};

export type MarketplaceWorkerObservabilityV1 = {
  version: 1;
  generatedAtIso: string;
  queueSummary: {
    queued: number;
    running: number;
    retrying: number;
    failed: number;
    completed24h: number;
    skipped: number;
    cancelled: number;
    stuckQueued: number;
    stuckRunning: number;
  };
  avgSuccessLatencyMs7d: number | null;
  p95SuccessLatencyMs7d: number | null;
  retryReasonMix30d: { bucket: string; count: number }[];
  failedJobClusters30d: { jobType: string; errorSample: string; count: number }[];
  perAccount: MarketplaceWorkerAccountObsV1[];
  tenantAlerts: { severity: "critical" | "warning"; code: string; message: string; accountIds?: number[] }[];
};

function honestAccountHealth(args: {
  isActive: boolean;
  lastSuccessAt: Date | null;
  queuedStuck: boolean;
  runningStuck: boolean;
  failed7: number;
  hasAccount: boolean;
}): { health: WorkerObservabilityHealthHonest; warnings: string[] } {
  const warnings: string[] = [];
  if (!args.hasAccount) {
    return { health: "no_channel", warnings: [] };
  }
  if (!args.isActive) {
    warnings.push("Hesap pasif — kuyruk metrikleri yine de geçmiş işlerden gelmiş olabilir.");
  }
  if (args.queuedStuck || args.runningStuck) {
    if (args.queuedStuck) {
      warnings.push(`Kuyrukta takılı iş (>${STUCK_QUEUED_MIN} dk scheduler geçmiş, hâlâ queued).`);
    }
    if (args.runningStuck) {
      warnings.push(`Çalışıyor görünen ama uzun süredir bitmeyen iş (>${STUCK_RUNNING_MIN} dk).`);
    }
    return { health: "degraded_queue", warnings };
  }
  if (args.failed7 >= 5) {
    warnings.push(`Son 7 günde ${args.failed7} başarısız job — sağlayıcı veya veri tarafını inceleyin.`);
    return { health: "degraded_queue", warnings };
  }
  if (!args.lastSuccessAt) {
    return { health: "no_success_yet", warnings: ["Bu hesap için başarılı sync_logs kaydı yok (worker henüz başarılı tamamlamamış olabilir)."] };
  }
  const ageH = (Date.now() - args.lastSuccessAt.getTime()) / 3600000;
  if (ageH <= RECENT_SUCCESS_H) {
    return { health: "healthy_recent", warnings };
  }
  if (ageH <= STALE_SUCCESS_H * 2) {
    warnings.push(`Son başarılı worker sync ${Math.round(ageH)} saat önce — SLA açısından kontrol önerilir.`);
    return { health: "stale_success", warnings };
  }
  warnings.push(`Son başarılı sync ${Math.round(ageH / 24)} gün önce.`);
  return { health: "stale_success", warnings };
}

export async function buildMarketplaceWorkerObservabilityV1(
  companyId: number,
): Promise<MarketplaceWorkerObservabilityV1> {
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 86400000);
  const ago24h = new Date(now.getTime() - 24 * 3600000);
  const ago30d = new Date(now.getTime() - 30 * 86400000);
  const ago7dJobs = new Date(now.getTime() - 7 * 86400000);

  const [
    accounts,
    queueRows,
    avgLatRow,
    p95Row,
    lastSuccessRows,
    avgByAccountRows,
    failed7ByAccount,
    failedClusters,
    retryMix,
    stuckQ,
    stuckR,
    completed24hRow,
  ] = await Promise.all([
    db.select().from(channelAccountsTable)
      .where(eq(channelAccountsTable.companyId, companyId))
      .orderBy(desc(channelAccountsTable.updatedAt)),
    db.execute<{ status: string; c: number }>(sql`
      SELECT status, count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId}
      GROUP BY status
    `),
    db.execute<{ avg_ms: number | null }>(sql`
      SELECT round(avg(duration_ms))::int AS avg_ms FROM sync_logs
      WHERE company_id = ${companyId} AND status = 'success'
        AND duration_ms IS NOT NULL AND created_at >= ${ago7d}
    `),
    db.execute<{ p95: number | null }>(sql`
      SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95
      FROM sync_logs
      WHERE company_id = ${companyId} AND status = 'success'
        AND duration_ms IS NOT NULL AND created_at >= ${ago7d}
    `),
    db.execute<{
      account_id: number;
      last_at: Date;
      last_op: string;
      last_dur: number | null;
    }>(sql`
      SELECT DISTINCT ON (account_id)
        account_id,
        created_at AS last_at,
        operation AS last_op,
        duration_ms AS last_dur
      FROM sync_logs
      WHERE company_id = ${companyId} AND status = 'success' AND account_id IS NOT NULL
      ORDER BY account_id, created_at DESC
    `),
    db.execute<{ account_id: number; avg_ms: number | null }>(sql`
      SELECT account_id, round(avg(duration_ms))::int AS avg_ms
      FROM sync_logs
      WHERE company_id = ${companyId} AND status = 'success'
        AND duration_ms IS NOT NULL AND created_at >= ${ago7d} AND account_id IS NOT NULL
      GROUP BY account_id
    `),
    db.execute<{ account_id: number; c: number }>(sql`
      SELECT account_id, count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'failed'
        AND created_at >= ${ago7dJobs}
      GROUP BY account_id
    `),
    db.execute<{ job_type: string; err_sample: string; c: number }>(sql`
      SELECT job_type,
        left(coalesce(last_error, ''), 120) AS err_sample,
        count(*)::int AS c
      FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'failed' AND created_at >= ${ago30d}
      GROUP BY job_type, left(coalesce(last_error, ''), 120)
      ORDER BY c DESC
      LIMIT 14
    `),
    db.execute<{ bucket: string; c: number }>(sql`
      SELECT
        CASE
          WHEN last_error LIKE '[kalıcı]%' THEN 'kalıcı'
          WHEN last_error LIKE '[rate-limit]%' THEN 'rate-limit'
          WHEN last_error LIKE '[geçici]%' THEN 'geçici'
          ELSE 'etiketsiz'
        END AS bucket,
        count(*)::int AS c
      FROM sync_jobs
      WHERE company_id = ${companyId} AND created_at >= ${ago30d}
        AND (status = 'failed' OR attempt_count > 0)
      GROUP BY 1
      ORDER BY c DESC
    `),
    db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'queued'
        AND scheduled_at < NOW() - (${STUCK_QUEUED_MIN} * INTERVAL '1 minute')
    `),
    db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'running'
        AND started_at IS NOT NULL
        AND started_at < NOW() - (${STUCK_RUNNING_MIN} * INTERVAL '1 minute')
    `),
    db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'completed' AND completed_at >= ${ago24h}
    `),
  ]);

  const statusCounts = new Map<string, number>();
  for (const r of (queueRows as { rows?: { status: string; c: number | string }[] }).rows ?? []) {
    statusCounts.set(String(r.status), Number(r.c ?? 0));
  }
  const pick = (s: string) => statusCounts.get(s) ?? 0;

  const stuckQueued = Number((stuckQ as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);
  const stuckRunning = Number((stuckR as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);

  const lastByAcc = new Map<number, { at: Date; op: string; dur: number | null }>();
  for (const r of (lastSuccessRows as { rows?: any[] }).rows ?? []) {
    const aid = Number(r.account_id);
    if (!Number.isFinite(aid)) continue;
    lastByAcc.set(aid, { at: new Date(r.last_at), op: String(r.last_op ?? ""), dur: r.last_dur != null ? Number(r.last_dur) : null });
  }
  const avgByAcc = new Map<number, number | null>();
  for (const r of (avgByAccountRows as { rows?: any[] }).rows ?? []) {
    avgByAcc.set(Number(r.account_id), r.avg_ms != null ? Number(r.avg_ms) : null);
  }
  const fail7 = new Map<number, number>();
  for (const r of (failed7ByAccount as { rows?: any[] }).rows ?? []) {
    fail7.set(Number(r.account_id), Number(r.c ?? 0));
  }

  const [queuedByAcc, runByAcc, stuckQByAcc, stuckRByAcc] = await Promise.all([
    db.execute<{ account_id: number; c: number }>(sql`
      SELECT account_id, count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'queued'
      GROUP BY account_id
    `),
    db.execute<{ account_id: number; c: number }>(sql`
      SELECT account_id, count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'running'
      GROUP BY account_id
    `),
    db.execute<{ account_id: number; c: number }>(sql`
      SELECT account_id, count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'queued'
        AND scheduled_at < NOW() - (${STUCK_QUEUED_MIN} * INTERVAL '1 minute')
      GROUP BY account_id
    `),
    db.execute<{ account_id: number; c: number }>(sql`
      SELECT account_id, count(*)::int AS c FROM sync_jobs
      WHERE company_id = ${companyId} AND status = 'running'
        AND started_at IS NOT NULL
        AND started_at < NOW() - (${STUCK_RUNNING_MIN} * INTERVAL '1 minute')
      GROUP BY account_id
    `),
  ]);
  const qMap = new Map<number, number>();
  for (const r of (queuedByAcc as { rows?: any[] }).rows ?? []) qMap.set(Number(r.account_id), Number(r.c ?? 0));
  const rMap = new Map<number, number>();
  for (const r of (runByAcc as { rows?: any[] }).rows ?? []) rMap.set(Number(r.account_id), Number(r.c ?? 0));
  const sqMap = new Map<number, number>();
  for (const r of (stuckQByAcc as { rows?: any[] }).rows ?? []) sqMap.set(Number(r.account_id), Number(r.c ?? 0));
  const srMap = new Map<number, number>();
  for (const r of (stuckRByAcc as { rows?: any[] }).rows ?? []) srMap.set(Number(r.account_id), Number(r.c ?? 0));

  const perAccount: MarketplaceWorkerAccountObsV1[] = accounts.map((a) => {
    const last = lastByAcc.get(a.id);
    const qNow = qMap.get(a.id) ?? 0;
    const rNow = rMap.get(a.id) ?? 0;
    const qStuck = (sqMap.get(a.id) ?? 0) > 0;
    const rStuck = (srMap.get(a.id) ?? 0) > 0;
    const f7 = fail7.get(a.id) ?? 0;
    const { health, warnings } = honestAccountHealth({
      isActive: a.isActive,
      lastSuccessAt: last?.at ?? null,
      queuedStuck: qStuck,
      runningStuck: rStuck,
      failed7: f7,
      hasAccount: true,
    });
    return {
      accountId: a.id,
      name: a.name,
      provider: a.provider,
      sandbox: a.sandbox,
      isActive: a.isActive,
      lastProviderHealthOk: a.lastHealthOk ?? null,
      lastProviderHealthMessage: a.lastHealthMessage ?? null,
      lastSuccessSyncAtIso: last?.at ? last.at.toISOString() : null,
      lastSuccessOperation: last?.op ?? null,
      lastSuccessDurationMs: last?.dur ?? null,
      avgSuccessLatencyMs7d: avgByAcc.get(a.id) ?? null,
      failedJobs7d: f7,
      queuedJobsNow: qNow,
      runningJobsNow: rNow,
      queuedStuck: qStuck,
      runningStuck: rStuck,
      healthHonest: health,
      slaWarnings: warnings,
    };
  });

  const avgMs = (avgLatRow as { rows?: { avg_ms: number | null }[] }).rows?.[0]?.avg_ms;
  const p95 = (p95Row as { rows?: { p95: number | null }[] }).rows?.[0]?.p95;

  const retryReasonMix30d = ((retryMix as { rows?: { bucket: string; c: number }[] }).rows ?? []).map((r) => ({
    bucket: r.bucket,
    count: Number(r.c ?? 0),
  }));

  const failedJobClusters30d = ((failedClusters as { rows?: { job_type: string; err_sample: string; c: number }[] }).rows ?? []).map((r) => ({
    jobType: r.job_type,
    errorSample: r.err_sample || "",
    count: Number(r.c ?? 0),
  }));

  const tenantAlerts: MarketplaceWorkerObservabilityV1["tenantAlerts"] = [];
  if (stuckQueued > 0 || stuckRunning > 0) {
    const accIds = [...new Set([
      ...(stuckQByAcc as any).rows?.map((x: any) => Number(x.account_id)) ?? [],
      ...(stuckRByAcc as any).rows?.map((x: any) => Number(x.account_id)) ?? [],
    ])].filter((n) => Number.isFinite(n));
    tenantAlerts.push({
      severity: "critical",
      code: "queue_stuck",
      message:
        `Takılı kuyruk: ${stuckQueued} queued (scheduler gecikmesi), ${stuckRunning} running (timeout). Worker veya DB kilitlenmesi olası.`,
      accountIds: accIds.length ? accIds : undefined,
    });
  }
  const highFail = [...fail7.entries()].filter(([, n]) => n >= 4);
  if (highFail.length) {
    tenantAlerts.push({
      severity: "warning",
      code: "failed_job_spike_account",
      message: `${highFail.length} hesapta 7 günde yüksek başarısız job sayısı.`,
      accountIds: highFail.map(([id]) => id),
    });
  }
  const staleAccounts = perAccount.filter((p) => p.isActive && p.healthHonest === "stale_success");
  if (staleAccounts.length) {
    tenantAlerts.push({
      severity: "warning",
      code: "stale_success_sync",
      message: `${staleAccounts.length} aktif hesapta son başarılı worker sync 24 saatten eski.`,
      accountIds: staleAccounts.map((p) => p.accountId),
    });
  }

  return {
    version: 1,
    generatedAtIso: now.toISOString(),
    queueSummary: {
      queued: pick("queued"),
      running: pick("running"),
      retrying: pick("retrying"),
      failed: pick("failed"),
      completed24h: Number((completed24hRow as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0),
      skipped: pick("skipped"),
      cancelled: pick("cancelled"),
      stuckQueued,
      stuckRunning,
    },
    avgSuccessLatencyMs7d: avgMs != null ? Number(avgMs) : null,
    p95SuccessLatencyMs7d: p95 != null ? Number(p95) : null,
    retryReasonMix30d,
    failedJobClusters30d,
    perAccount,
    tenantAlerts,
  };
}

/** super_admin: kritik kuyruk sinyalleri (kiracı bazlı özet). */
export async function buildMarketplaceWorkerFounderAlertsV1(): Promise<{
  generatedAtIso: string;
  alerts: {
    severity: "critical" | "warning";
    companyId: number;
    companyName: string;
    stuckJobs: number;
    failedJobs24h: number;
  }[];
}> {
  const rows = await db.execute<{
    company_id: number;
    company_name: string;
    stuck_jobs: number;
    failed_24h: number;
  }>(sql`
    WITH stuck AS (
      SELECT company_id, count(*)::int AS n
      FROM sync_jobs
      WHERE (status = 'queued' AND scheduled_at < NOW() - (${STUCK_QUEUED_MIN} * INTERVAL '1 minute'))
         OR (status = 'running' AND started_at IS NOT NULL
             AND started_at < NOW() - (${STUCK_RUNNING_MIN} * INTERVAL '1 minute'))
      GROUP BY company_id
    ),
    f24 AS (
      SELECT company_id, count(*)::int AS n
      FROM sync_jobs
      WHERE status = 'failed' AND completed_at IS NOT NULL AND completed_at >= NOW() - INTERVAL '24 hours'
      GROUP BY company_id
    )
    SELECT c.id AS company_id, c.name AS company_name,
      coalesce(s.n, 0)::int AS stuck_jobs,
      coalesce(f.n, 0)::int AS failed_24h
    FROM companies c
    INNER JOIN stuck s ON s.company_id = c.id
    LEFT JOIN f24 f ON f.company_id = c.id
    ORDER BY stuck_jobs DESC, failed_24h DESC
    LIMIT 40
  `);

  const alerts = ((rows as { rows?: any[] }).rows ?? []).map((r) => ({
    severity: (Number(r.stuck_jobs) >= 3 ? "critical" : "warning") as "critical" | "warning",
    companyId: Number(r.company_id),
    companyName: String(r.company_name ?? ""),
    stuckJobs: Number(r.stuck_jobs ?? 0),
    failedJobs24h: Number(r.failed_24h ?? 0),
  }));

  return { generatedAtIso: new Date().toISOString(), alerts };
}
