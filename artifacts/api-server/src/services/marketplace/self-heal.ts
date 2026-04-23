/**
 * Pazaryeri kuyruk self-healing — gözlemi tamamlayan güvenli kurtarma.
 * Yıkıcı işlem yok: hesap silme, job iptali, sipariş silme, credential sıfırlama yok.
 * Her otomatik adım sync_logs üzerinden denetlenebilir audit trail.
 */
import { db, channelAccountsTable, syncJobsTable, syncLogsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { logSync } from "./factory.js";

export const STUCK_QUEUED_MIN = 25;
export const STUCK_RUNNING_MIN = 35;
const BATCH = 30;
const MAX_TRANSIENT_AUTO = 2;
const MAX_RATE_LIMIT_AUTO = 2;
const RATE_LIMIT_COOLDOWN_MS = 120_000;

function selfHealEnabled(): boolean {
  return process.env.MARKETPLACE_SELF_HEAL !== "false";
}

function readSelfHeal(result: unknown): Record<string, unknown> {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const sh = r.selfHeal;
  return sh && typeof sh === "object" ? (sh as Record<string, unknown>) : {};
}

function mergeSelfHeal(
  result: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = result && typeof result === "object" ? { ...(result as Record<string, unknown>) } : {};
  const prev = readSelfHeal(base);
  return { ...base, selfHeal: { ...prev, ...patch } };
}

async function logAction(opts: {
  companyId: number;
  accountId: number | null;
  jobId: number | null;
  operation: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  await logSync({
    companyId: opts.companyId,
    accountId: opts.accountId,
    jobId: opts.jobId,
    operation: opts.operation,
    status: "success",
    level: "info",
    message: opts.message,
    payload: { source: "marketplace_self_heal", ...opts.payload },
  });
}

/** Takılı queued: scheduler zamanı geçmiş ama hâlâ queued — scheduled_at şimdiye çekilir (iş içeriği değişmez). */
async function recoverStuckQueued(): Promise<number> {
  const rows = await db
    .select()
    .from(syncJobsTable)
    .where(
      and(
        eq(syncJobsTable.status, "queued"),
        sql`${syncJobsTable.scheduledAt} < NOW() - (${STUCK_QUEUED_MIN} * INTERVAL '1 minute')`,
      ),
    )
    .orderBy(syncJobsTable.scheduledAt)
    .limit(BATCH);

  let n = 0;
  for (const job of rows) {
    await db
      .update(syncJobsTable)
      .set({
        scheduledAt: new Date(),
        result: mergeSelfHeal(job.result, {
          lastStuckQueuedNudgeAt: new Date().toISOString(),
        }) as unknown as Record<string, unknown>,
      })
      .where(eq(syncJobsTable.id, job.id));
    await logAction({
      companyId: job.companyId,
      accountId: job.accountId,
      jobId: job.id,
      operation: "self_heal_stuck_queued_nudge",
      message: `Kuyrukta gecikmiş iş yeniden zamanlandı (job #${job.id}, ${job.jobType}).`,
      payload: {
        jobType: job.jobType,
        priorScheduledAt: job.scheduledAt?.toISOString?.() ?? String(job.scheduledAt),
      },
    });
    n++;
  }
  return n;
}

/** Takılı running: worker kilidi / uzun süre — queued'a döndürülür, attempt sayacı artırılmaz. */
async function recoverStuckRunning(): Promise<number> {
  const rows = await db
    .select()
    .from(syncJobsTable)
    .where(
      and(
        eq(syncJobsTable.status, "running"),
        sql`${syncJobsTable.startedAt} IS NOT NULL`,
        sql`${syncJobsTable.startedAt} < NOW() - (${STUCK_RUNNING_MIN} * INTERVAL '1 minute')`,
      ),
    )
    .orderBy(syncJobsTable.startedAt)
    .limit(BATCH);

  let n = 0;
  for (const job of rows) {
    await db
      .update(syncJobsTable)
      .set({
        status: "queued",
        startedAt: null,
        scheduledAt: new Date(),
        result: mergeSelfHeal(job.result, {
          awaitingWorkerRetry: true,
          unstuckRunningAt: new Date().toISOString(),
        }) as unknown as Record<string, unknown>,
      })
      .where(eq(syncJobsTable.id, job.id));
    await logAction({
      companyId: job.companyId,
      accountId: job.accountId,
      jobId: job.id,
      operation: "self_heal_stuck_running_reset",
      message: `Uzun süren "running" iş güvenli şekilde kuyruğa alındı (job #${job.id}).`,
      payload: { jobType: job.jobType, lastError: job.lastError ?? null },
    });
    n++;
  }
  return n;
}

async function requeueFailedTransient(): Promise<number> {
  const rows = await db
    .select()
    .from(syncJobsTable)
    .where(
      and(
        eq(syncJobsTable.status, "failed"),
        sql`${syncJobsTable.lastError} LIKE '[geçici]%'`,
        sql`coalesce((${syncJobsTable.result}->'selfHeal'->>'transientRetries')::int, 0) < ${MAX_TRANSIENT_AUTO}`,
      ),
    )
    .orderBy(desc(syncJobsTable.completedAt))
    .limit(BATCH);

  let n = 0;
  for (const job of rows) {
    const sh = readSelfHeal(job.result);
    const prev = Number(sh.transientRetries ?? 0);
    const jitterMs = 5_000 + Math.floor(Math.random() * 25_000);
    await db
      .update(syncJobsTable)
      .set({
        status: "queued",
        completedAt: null,
        scheduledAt: new Date(Date.now() + jitterMs),
        result: mergeSelfHeal(job.result, {
          transientRetries: prev + 1,
          lastTransientAutoRequeueAt: new Date().toISOString(),
        }) as unknown as Record<string, unknown>,
      })
      .where(eq(syncJobsTable.id, job.id));
    await logAction({
      companyId: job.companyId,
      accountId: job.accountId,
      jobId: job.id,
      operation: "self_heal_transient_failed_requeue",
      message: `[geçici] hata sonrası güvenli otomatik yeniden kuyruk (job #${job.id}, deneme ${prev + 1}/${MAX_TRANSIENT_AUTO}).`,
      payload: { jobType: job.jobType, lastError: job.lastError ?? null, jitterMs },
    });
    n++;
  }
  return n;
}

async function requeueFailedRateLimit(): Promise<number> {
  const rows = await db
    .select()
    .from(syncJobsTable)
    .where(
      and(
        eq(syncJobsTable.status, "failed"),
        sql`${syncJobsTable.lastError} LIKE '[rate-limit]%'`,
        sql`coalesce((${syncJobsTable.result}->'selfHeal'->>'rateLimitRetries')::int, 0) < ${MAX_RATE_LIMIT_AUTO}`,
      ),
    )
    .orderBy(desc(syncJobsTable.completedAt))
    .limit(BATCH);

  let n = 0;
  for (const job of rows) {
    const sh = readSelfHeal(job.result);
    const prev = Number(sh.rateLimitRetries ?? 0);
    await db
      .update(syncJobsTable)
      .set({
        status: "queued",
        completedAt: null,
        scheduledAt: new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS),
        result: mergeSelfHeal(job.result, {
          rateLimitRetries: prev + 1,
          lastRateLimitCooldownAt: new Date().toISOString(),
        }) as unknown as Record<string, unknown>,
      })
      .where(eq(syncJobsTable.id, job.id));
    await logAction({
      companyId: job.companyId,
      accountId: job.accountId,
      jobId: job.id,
      operation: "self_heal_rate_limit_failed_requeue",
      message: `[rate-limit] sonrası soğuma ile yeniden kuyruk (job #${job.id}, ${RATE_LIMIT_COOLDOWN_MS / 1000}s).`,
      payload: { jobType: job.jobType, lastError: job.lastError ?? null, cooldownMs: RATE_LIMIT_COOLDOWN_MS },
    });
    n++;
  }
  return n;
}

const CRED_RE =
  /(401|403|unauthorized|invalid\s*token|credential|api\s*key|expired|yetki|token|forbidden)/i;

/** Credential / yetki sinyali — otomatik sıfırlama yok; öneri sync_logs + API. */
async function emitCredentialRecommendations(): Promise<number> {
  const raw = await db.execute<{
    company_id: number;
    account_id: number;
    account_name: string;
    provider: string;
    last_health_message: string | null;
    last_error: string | null;
  }>(sql`
    SELECT ca.company_id, ca.id AS account_id, ca.name AS account_name, ca.provider,
      ca.last_health_message,
      (SELECT sj.last_error FROM sync_jobs sj
       WHERE sj.account_id = ca.id AND sj.status = 'failed'
       ORDER BY sj.completed_at DESC NULLS LAST, sj.id DESC LIMIT 1) AS last_error
    FROM channel_accounts ca
    WHERE ca.is_active = true
    LIMIT 200
  `);

  const rows = ((raw as { rows?: any[] }).rows ?? []).filter((r) => {
    const blob = `${r.last_error ?? ""} ${r.last_health_message ?? ""}`;
    return CRED_RE.test(blob);
  }).slice(0, 40);

  let n = 0;
  for (const r of rows) {
    const companyId = Number(r.company_id);
    const accountId = Number(r.account_id);
    const [dup] = await db
      .select({ id: syncLogsTable.id })
      .from(syncLogsTable)
      .where(
        and(
          eq(syncLogsTable.companyId, companyId),
          eq(syncLogsTable.accountId, accountId),
          eq(syncLogsTable.operation, "self_heal_credential_recommendation"),
          sql`${syncLogsTable.createdAt} >= NOW() - INTERVAL '24 hours'`,
        ),
      )
      .limit(1);
    if (dup) continue;

    const le = String(r.last_error ?? "").toLowerCase();
    const lh = String(r.last_health_message ?? "").toLowerCase();
    let hint = "credential_review";
    if (/429|rate[\s_-]?limit|throttle/.test(le)) hint = "rate_limit_or_throttle";
    else if (/403|forbidden|yetki/.test(le) || /403|forbidden|yetki/.test(lh)) hint = "credential_scope";
    else if (/401|unauthorized/.test(le) || /401|unauthorized/.test(lh)) hint = "credential_invalid";
    else if (/401|403|unauthorized/.test(lh)) hint = "health_auth";

    const msg =
      hint === "credential_invalid"
        ? "Sağlayıcı 401/Yetkisiz — API anahtarlarını pazaryeri panelinde yenileyin (otomatik sıfırlama yapılmadı)."
        : hint === "credential_scope"
          ? "403 kapsamı — entegrasyon izinlerini ve IP kısıtlarını kontrol edin."
          : hint === "rate_limit_or_throttle"
            ? "İstek sınırı — yoğunluğu azaltın veya soğuma süresini bekleyin."
            : hint === "health_auth"
              ? "Son sağlık taraması kimlik hatası gösteriyor — anahtarları doğrulayın."
              : "Kimlik / anahtar tarafını manuel gözden geçirin.";
    await logSync({
      companyId,
      accountId,
      jobId: null,
      operation: "self_heal_credential_recommendation",
      status: "partial",
      level: "warn",
      message: msg,
      payload: {
        source: "marketplace_self_heal",
        hint,
        provider: String(r.provider ?? ""),
        accountName: String(r.account_name ?? ""),
      },
    });
    n++;
  }
  return n;
}

export type SelfHealTickResult = {
  generatedAtIso: string;
  stuckQueuedNudged: number;
  stuckRunningReset: number;
  transientFailedRequeued: number;
  rateLimitFailedRequeued: number;
  credentialRecommendations: number;
  skipped: boolean;
};

export async function runMarketplaceSelfHealOnce(): Promise<SelfHealTickResult> {
  const generatedAtIso = new Date().toISOString();
  if (!selfHealEnabled()) {
    return {
      generatedAtIso,
      stuckQueuedNudged: 0,
      stuckRunningReset: 0,
      transientFailedRequeued: 0,
      rateLimitFailedRequeued: 0,
      credentialRecommendations: 0,
      skipped: true,
    };
  }

  const stuckQueuedNudged = await recoverStuckQueued();
  const stuckRunningReset = await recoverStuckRunning();
  const transientFailedRequeued = await requeueFailedTransient();
  const rateLimitFailedRequeued = await requeueFailedRateLimit();
  const credentialRecommendations = await emitCredentialRecommendations();

  return {
    generatedAtIso,
    stuckQueuedNudged,
    stuckRunningReset,
    transientFailedRequeued,
    rateLimitFailedRequeued,
    credentialRecommendations,
    skipped: false,
  };
}

export type SelfHealRecommendationV1 = {
  accountId: number;
  name: string;
  provider: string;
  priority: "high" | "medium";
  code: string;
  message: string;
};

export type SelfHealRecentActionV1 = {
  id: number;
  createdAtIso: string;
  operation: string;
  accountId: number | null;
  jobId: number | null;
  message: string | null;
  payload: unknown;
};

export async function buildMarketplaceSelfHealingBundleV1(
  companyId: number,
): Promise<{
  version: 1;
  generatedAtIso: string;
  recommendations: SelfHealRecommendationV1[];
  recentAutoActions: SelfHealRecentActionV1[];
  retrySuccess24h: number;
}> {
  const now = new Date();
  const rows = await db
    .select()
    .from(syncLogsTable)
    .where(
      and(
        eq(syncLogsTable.companyId, companyId),
        sql`${syncLogsTable.operation} LIKE 'self_heal%'`,
      ),
    )
    .orderBy(desc(syncLogsTable.createdAt))
    .limit(60);

  const recentAutoActions: SelfHealRecentActionV1[] = rows.map((r) => ({
    id: r.id,
    createdAtIso: r.createdAt.toISOString(),
    operation: r.operation,
    accountId: r.accountId ?? null,
    jobId: r.jobId ?? null,
    message: r.message ?? null,
    payload: r.payload ?? null,
  }));

  const retryRow = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM sync_logs
    WHERE company_id = ${companyId}
      AND operation = 'self_heal_retry_succeeded'
      AND created_at >= NOW() - INTERVAL '24 hours'
  `);
  const retrySuccess24h = Number((retryRow as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);

  const accounts = await db
    .select()
    .from(channelAccountsTable)
    .where(eq(channelAccountsTable.companyId, companyId));

  const recommendations: SelfHealRecommendationV1[] = [];

  for (const a of accounts) {
    const le = (a.lastHealthMessage || "").toLowerCase();
    const healthBad = a.lastHealthOk === false;
    if (healthBad && /401|403|unauthorized|invalid|expired|yetki|token|credential/.test(le)) {
      recommendations.push({
        accountId: a.id,
        name: a.name,
        provider: a.provider,
        priority: "high",
        code: "health_auth",
        message:
          "Son API ping kimlik/anahtar sorunu gösteriyor. Anahtarları yenileyin; otomatik sıfırlama yapılmaz.",
      });
      continue;
    }
    const [fj] = await db
      .select({ lastError: syncJobsTable.lastError })
      .from(syncJobsTable)
      .where(
        and(
          eq(syncJobsTable.accountId, a.id),
          eq(syncJobsTable.companyId, companyId),
          eq(syncJobsTable.status, "failed"),
        ),
      )
      .orderBy(desc(syncJobsTable.completedAt), desc(syncJobsTable.id))
      .limit(1);
    const err = (fj?.lastError || "").toLowerCase();
    if (fj?.lastError?.startsWith("[kalıcı]")) {
      recommendations.push({
        accountId: a.id,
        name: a.name,
        provider: a.provider,
        priority: "high",
        code: "permanent_job_failure",
        message:
          "Kalıcı job hatası — veri veya sağlayıcı sözleşmesi düzeltilmeden otomatik yeniden deneme yapılmaz.",
      });
    } else if (/401|403|unauthorized|invalid|expired|credential|api\s*key/.test(err)) {
      recommendations.push({
        accountId: a.id,
        name: a.name,
        provider: a.provider,
        priority: "high",
        code: "credential_from_job",
        message: "Son başarısız job kimlik/anahtar ile uyumlu görünüyor — anahtarları kontrol edin.",
      });
    } else if (a.isActive && healthBad) {
      recommendations.push({
        accountId: a.id,
        name: a.name,
        provider: a.provider,
        priority: "medium",
        code: "health_degraded",
        message: "API sağlığı zayıf — bağlantı veya uç nokta tarafını inceleyin.",
      });
    }
  }

  return {
    version: 1,
    generatedAtIso: now.toISOString(),
    recommendations,
    recentAutoActions,
    retrySuccess24h,
  };
}

/** super_admin: yoğun self-heal veya hâlâ ağır takılı kuyruk. */
export async function buildMarketplaceSelfHealFounderAlertsV1(): Promise<{
  generatedAtIso: string;
  alerts: { severity: "critical" | "warning"; code: string; message: string; companyId?: number; companyName?: string }[];
}> {
  const healChurn = await db.execute<{ company_id: number; company_name: string; n: number }>(sql`
    SELECT sl.company_id, c.name AS company_name, count(*)::int AS n
    FROM sync_logs sl
    INNER JOIN companies c ON c.id = sl.company_id
    WHERE sl.operation LIKE 'self_heal%'
      AND sl.created_at >= NOW() - INTERVAL '1 hour'
    GROUP BY sl.company_id, c.name
    HAVING count(*) >= 18
    ORDER BY n DESC
    LIMIT 20
  `);

  const stillHeavy = await db.execute<{
    company_id: number;
    company_name: string;
    stuck: number;
  }>(sql`
    SELECT c.id AS company_id, c.name AS company_name, count(*)::int AS stuck
    FROM sync_jobs sj
    INNER JOIN companies c ON c.id = sj.company_id
    WHERE sj.status = 'running'
      AND sj.started_at IS NOT NULL
      AND sj.started_at < NOW() - (50 * INTERVAL '1 minute')
    GROUP BY c.id, c.name
    HAVING count(*) >= 2
    ORDER BY stuck DESC
    LIMIT 20
  `);

  const alerts: { severity: "critical" | "warning"; code: string; message: string; companyId?: number; companyName?: string }[] = [];

  for (const r of (stillHeavy as { rows?: any[] }).rows ?? []) {
    alerts.push({
      severity: "critical",
      code: "heal_resistant_running_stuck",
      message: `${String(r.company_name)} (#${r.company_id}): ${r.stuck} iş 50dk+ running — worker/DB incelemesi gerekir.`,
      companyId: Number(r.company_id),
      companyName: String(r.company_name ?? ""),
    });
  }
  for (const r of (healChurn as { rows?: any[] }).rows ?? []) {
    alerts.push({
      severity: "warning",
      code: "self_heal_churn",
      message: `${String(r.company_name)} (#${r.company_id}): son 1 saatte ${r.n} otomatik kurtarma kaydı — kuyruk instabil olabilir.`,
      companyId: Number(r.company_id),
      companyName: String(r.company_name ?? ""),
    });
  }

  return { generatedAtIso: new Date().toISOString(), alerts };
}

let healTimer: NodeJS.Timeout | null = null;

export function startMarketplaceSelfHealScheduler(): void {
  if (healTimer) return;
  if (!selfHealEnabled()) {
    console.log("[marketplace/self-heal] disabled (MARKETPLACE_SELF_HEAL=false)");
    return;
  }
  console.log("[marketplace/self-heal] scheduler every 60s");
  healTimer = setInterval(() => {
    runMarketplaceSelfHealOnce().catch((e) => console.error("[marketplace/self-heal]", e));
  }, 60_000);
}

export function stopMarketplaceSelfHealScheduler(): void {
  if (healTimer) {
    clearInterval(healTimer);
    healTimer = null;
  }
}
