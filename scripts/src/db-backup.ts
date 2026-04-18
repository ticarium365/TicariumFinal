/**
 * DB Backup Script — Replit Object Storage'a günlük yedek
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run backup
 *
 * Cron için (Replit Deployment Scheduled): Her gece 03:00 TSI çalıştırılabilir.
 *
 * pg_dump → gzip → Object Storage (DEFAULT_OBJECT_STORAGE_BUCKET_ID)
 * Path: <PRIVATE_OBJECT_DIR>/backups/YYYY-MM-DD/db-HH-mm.sql.gz
 *
 * Eski yedekleri temizleme: 30 günden eski olanlar otomatik silinir.
 */

import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client as ObjStorageClient } from "@replit/object-storage";

const RETENTION_DAYS = 30;

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function dateKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function timeKey(d = new Date()) {
  return `${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
}

async function runBackup(): Promise<{ key: string; bytes: number }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL eksik");
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR eksik");

  const now = new Date();
  const objectKey = `${privateDir}/backups/${dateKey(now)}/db-${timeKey(now)}.sql.gz`;
  const tmpFile = path.join(tmpdir(), `db-backup-${Date.now()}.sql.gz`);

  console.log(`[backup] pg_dump başlatılıyor → ${objectKey}`);

  // shell pipeline tmp file'a yaz (stream pipe'da deadlock yaşanabiliyor)
  const child = spawn("sh", ["-c", `pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists | gzip -9 > "${tmpFile}"`], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  const exitCode: number = await new Promise((res) => child.on("close", res));
  if (exitCode !== 0) {
    await fsp.unlink(tmpFile).catch(() => {});
    throw new Error(`pg_dump|gzip exit ${exitCode}`);
  }

  const buf = await fsp.readFile(tmpFile);
  await fsp.unlink(tmpFile).catch(() => {});

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID eksik");
  const client = new ObjStorageClient({ bucketId });
  const result = await client.uploadFromBytes(objectKey, buf);
  if (!result.ok) throw new Error(`Object Storage upload hatası: ${JSON.stringify(result.error)}`);

  console.log(`[backup] OK → ${objectKey} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  return { key: objectKey, bytes: buf.length };
}

async function pruneOld(): Promise<number> {
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!privateDir || !bucketId) return 0;
  const client = new ObjStorageClient({ bucketId });
  const list = await client.list({ prefix: `${privateDir}/backups/` });
  if (!list.ok) {
    console.warn("[backup] list başarısız:", list.error);
    return 0;
  }
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
  let removed = 0;
  for (const obj of list.value) {
    // /backups/YYYY-MM-DD/...
    const m = obj.name.match(/\/backups\/(\d{4})-(\d{2})-(\d{2})\//);
    if (!m) continue;
    const dt = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
    if (dt < cutoff) {
      const del = await client.delete(obj.name);
      if (del.ok) removed++;
    }
  }
  if (removed > 0) console.log(`[backup] ${removed} eski yedek silindi (>${RETENTION_DAYS} gün)`);
  return removed;
}

async function main() {
  const t0 = Date.now();
  try {
    const { key, bytes } = await runBackup();
    const removed = await pruneOld();
    const ms = Date.now() - t0;
    console.log(JSON.stringify({ status: "ok", key, bytes, removed, durationMs: ms }));
    process.exit(0);
  } catch (err: any) {
    console.error("[backup] HATA:", err?.message || err);
    process.exit(1);
  }
}

main();
