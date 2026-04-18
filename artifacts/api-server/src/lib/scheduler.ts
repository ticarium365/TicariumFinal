/**
 * Dahili zamanlayıcı (node-cron). Yalnızca ENABLE_SCHEDULER=true ise başlar.
 * Çoklu instance'da SADECE BİR sürecin çalıştırması için
 * advisory lock (pg_try_advisory_lock) ile yarış engellenir.
 */
import cron from "node-cron";
import { spawn } from "node:child_process";
import path from "node:path";
import { logger } from "./logger.js";
import { pool } from "@workspace/db";

const ROOT = path.resolve(process.cwd(), "..", "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts", "src");

// Sabit lock id (audit-archive için): rasgele ama deterministik
const LOCK_AUDIT_ARCHIVE = 7136421;
const LOCK_DB_BACKUP = 7136422;

/**
 * Postgres advisory lock'lar bağlantı (session) kapsamlıdır. Pooled drizzle
 * `db.execute` farklı bağlantılar kullanabileceği için lock güvenli olmaz —
 * dedicated bir client almak ve aynı client üzerinde unlock etmek zorunludur.
 */
async function withAdvisoryLock<T>(lockId: number, fn: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  let locked = false;
  try {
    const r = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [lockId]);
    locked = r.rows[0]?.locked === true;
    if (!locked) {
      logger.info({ lockId }, "scheduler: another instance holds the lock, skipping");
      return null;
    }
    return await fn();
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
      } catch (e: any) {
        logger.warn({ lockId, err: e?.message }, "scheduler: advisory unlock failed");
      }
    }
    client.release();
  }
}

function runTsx(scriptRelPath: string, args: string[] = []): Promise<number> {
  return new Promise((resolve) => {
    const script = path.join(SCRIPTS_DIR, scriptRelPath);
    const proc = spawn("pnpm", ["exec", "tsx", script, ...args], {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env,
    });
    proc.on("exit", (code) => resolve(code ?? -1));
    proc.on("error", (err) => { logger.error({ err: err.message }, "scheduler: spawn failed"); resolve(-1); });
  });
}

export function startScheduler(): void {
  if (process.env.ENABLE_SCHEDULER !== "true") {
    logger.info("scheduler disabled (set ENABLE_SCHEDULER=true to enable)");
    return;
  }

  const tz = process.env.SCHEDULER_TZ || "Europe/Istanbul";

  // Nightly DB yedek — 03:15
  cron.schedule("15 3 * * *", async () => {
    logger.info("scheduler: db-backup başlıyor");
    const r = await withAdvisoryLock(LOCK_DB_BACKUP, () => runTsx("db-backup.ts", [`--keep-days=${process.env.BACKUP_KEEP_DAYS || "14"}`]));
    if (r !== null) logger.info({ exit: r }, "scheduler: db-backup tamam");
  }, { timezone: tz });

  // Nightly audit archive — 03:45
  cron.schedule("45 3 * * *", async () => {
    logger.info("scheduler: audit-archive başlıyor");
    const r = await withAdvisoryLock(LOCK_AUDIT_ARCHIVE, () => runTsx("audit-archive.ts", [`--keep-days=${process.env.AUDIT_KEEP_DAYS || "90"}`]));
    if (r !== null) logger.info({ exit: r }, "scheduler: audit-archive tamam");
  }, { timezone: tz });

  logger.info({ tz }, "scheduler started: db-backup 03:15, audit-archive 03:45");
}
