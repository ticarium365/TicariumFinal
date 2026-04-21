/**
 * Dalga 20 — Trial otomasyonu.
 * Saatlik tarama: trial abonelikler için 7g/3g/1g uyarı + 0g'de status transition.
 *
 * Idempotent + multi-instance güvenli:
 *   - Tick'in tamamı `pg_try_advisory_lock(7136423)` altında çalışır → birden fazla replica
 *     senaryosunda yalnızca tek instance taramayı yürütür, kalanlar sessizce skip eder.
 *     Bu, read-then-insert dedupe race'ini ortadan kaldırır.
 *   - Status transition `WHERE status='trial' AND trial_ends_at <= NOW()` → idempotent atomik;
 *     UPDATE 0 row dönerse skip.
 *   - Bildirim insert öncesi natural-key (entity_type='trial_warning', entity_id=subId, type)
 *     ile SELECT dedupe; advisory lock altında tek-instance çalıştığı için race yok.
 *   - Features cache her geçişte invalidate edilir (in-process; çoklu instance'da TTL=60s ile
 *     eventual consistency kabul edildi — billing-grade için Redis pub/sub ileride eklenebilir).
 *
 * Bağımsız test için: `runTrialWatcherTick()` yalın çağrı; süper admin için
 * `/api/admin/trial-watcher/run` endpoint'i (auth.ts içinde).
 */
import { db, companySubscriptionsTable, subscriptionPlansTable, notificationsTable, usersTable, companiesTable } from "@workspace/db";
import { and, eq, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { invalidateFeaturesCache } from "../middlewares/features";

const WARN_THRESHOLDS_DAYS = [7, 3, 1] as const;
type WarnDays = typeof WARN_THRESHOLDS_DAYS[number];

export interface TrialWatcherTickReport {
  scannedTrials: number;
  warningsSent: Record<WarnDays, number>;
  expired: number;
  errors: number;
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

async function notifyTrialWarning(companyId: number, subId: number, daysLeft: WarnDays, planName: string): Promise<boolean> {
  const type = `trial_warning_${daysLeft}d`;
  // Dedupe: aynı sub için bu warning zaten basıldı mı?
  const [exists] = await db.select({ id: notificationsTable.id }).from(notificationsTable)
    .where(and(
      eq(notificationsTable.companyId, companyId),
      eq(notificationsTable.type, type),
      eq(notificationsTable.entityType, "trial_warning"),
      eq(notificationsTable.entityId, subId),
    )).limit(1);
  if (exists) return false;
  const titleMap: Record<WarnDays, string> = {
    7: "Deneme süreniz 1 hafta sonra bitiyor",
    3: "Deneme süreniz 3 gün sonra bitiyor",
    1: "Deneme süreniz yarın bitiyor",
  };
  await db.insert(notificationsTable).values({
    companyId,
    userId: null, // tüm adminlere
    type,
    title: titleMap[daysLeft],
    message: `${planName} planındaki ücretsiz deneme süreniz ${daysLeft} gün sonra sona erecek. Kesintisiz devam için bir paket seçmenizi öneririz.`,
    entityType: "trial_warning",
    entityId: subId,
  });
  return true;
}

async function notifyTrialExpired(companyId: number, subId: number, planName: string): Promise<void> {
  // Dedupe edilmiş: bu sub için trial_expired daha önce yazıldıysa atla
  const [exists] = await db.select({ id: notificationsTable.id }).from(notificationsTable)
    .where(and(
      eq(notificationsTable.companyId, companyId),
      eq(notificationsTable.type, "trial_expired"),
      eq(notificationsTable.entityType, "trial_warning"),
      eq(notificationsTable.entityId, subId),
    )).limit(1);
  if (exists) return;
  await db.insert(notificationsTable).values({
    companyId,
    userId: null,
    type: "trial_expired",
    title: "Deneme süreniz sona erdi",
    message: `${planName} ücretsiz deneme süreniz tamamlandı. Yazma işlemleri devre dışı kaldı; devam etmek için bir paket seçin.`,
    entityType: "trial_warning",
    entityId: subId,
  });
}

const LOCK_TRIAL_WATCHER = 7136423;

export async function runTrialWatcherTick(): Promise<TrialWatcherTickReport> {
  const report: TrialWatcherTickReport = {
    scannedTrials: 0,
    warningsSent: { 7: 0, 3: 0, 1: 0 },
    expired: 0,
    errors: 0,
  };

  // 0) Multi-instance koruması: yalnızca tek replica çalıştırsın.
  //    Manual endpoint'ten çağrı için de güvenli — eşzamanlı tetik denenirse skip.
  const lockRow = await db.execute(sql`SELECT pg_try_advisory_lock(${LOCK_TRIAL_WATCHER}) AS locked`);
  const acquired = (lockRow as any).rows?.[0]?.locked === true;
  if (!acquired) {
    logger.info("trial_watcher_tick_skipped_lock_busy");
    return report;
  }

  try {
    // 1) Tüm aktif trial abonelikler — hatalardan kurtarılması için tüm akış try/finally içinde
  const trials = await db
    .select({
      id: companySubscriptionsTable.id,
      companyId: companySubscriptionsTable.companyId,
      trialEndsAt: companySubscriptionsTable.trialEndsAt,
      planName: subscriptionPlansTable.name,
    })
    .from(companySubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(companySubscriptionsTable.status, "trial"));
  report.scannedTrials = trials.length;

  for (const t of trials) {
    try {
      const left = daysUntil(t.trialEndsAt);
      if (left === null) continue;

      if (left <= 0) {
        // 2) Atomik transition: trial → expired (sadece hala trial ise)
        const updated = await db.update(companySubscriptionsTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(and(
            eq(companySubscriptionsTable.id, t.id),
            eq(companySubscriptionsTable.status, "trial"),
            sql`${companySubscriptionsTable.trialEndsAt} <= NOW()`,
          ))
          .returning({ id: companySubscriptionsTable.id });
        if (updated.length > 0) {
          invalidateFeaturesCache(t.companyId);
          await notifyTrialExpired(t.companyId, t.id, t.planName);
          report.expired++;
        }
        continue;
      }

      // 3) Uyarı eşikleri: tam 7/3/1 gün kala (idempotent)
      if (WARN_THRESHOLDS_DAYS.includes(left as WarnDays)) {
        const sent = await notifyTrialWarning(t.companyId, t.id, left as WarnDays, t.planName);
        if (sent) report.warningsSent[left as WarnDays]++;
      }
    } catch (err) {
      report.errors++;
      logger.warn({ err, subId: t.id }, "trial_watcher_row_failed");
    }
  }
    return report;
  } finally {
    try {
      await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_TRIAL_WATCHER})`);
    } catch (err) {
      logger.warn({ err }, "trial_watcher_unlock_failed");
    }
  }
}

let intervalRef: NodeJS.Timeout | null = null;

/**
 * Saatlik tick (boot'ta da bir kez çalışır). Multi-instance'da advisory lock
 * (LOCK_TRIAL_WATCHER) ile yalnızca tek instance taramayı yürütür; geri kalanlar
 * lock-busy görüp hızlıca skip eder.
 */
export function startTrialWatcher(): void {
  if (intervalRef) return; // çift başlatma koruması
  if (process.env.DISABLE_TRIAL_WATCHER === "true") {
    logger.info("trial_watcher disabled (DISABLE_TRIAL_WATCHER=true)");
    return;
  }
  // İlk tick boot'tan 30 sn sonra (seed'lerle çakışmasın)
  setTimeout(() => {
    runTrialWatcherTick()
      .then((r) => logger.info(r, "trial_watcher_tick_boot"))
      .catch((err) => logger.warn({ err }, "trial_watcher_boot_failed"));
  }, 30_000);
  // Saatte bir
  intervalRef = setInterval(() => {
    runTrialWatcherTick()
      .then((r) => {
        if (r.expired > 0 || r.warningsSent[7] + r.warningsSent[3] + r.warningsSent[1] > 0) {
          logger.info(r, "trial_watcher_tick");
        }
      })
      .catch((err) => logger.warn({ err }, "trial_watcher_tick_failed"));
  }, 60 * 60 * 1000);
  logger.info("trial_watcher started (1h interval, +30s boot kick)");
}
