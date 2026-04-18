/**
 * PostgreSQL veritabanı yedekleme — pg_dump ile sıkıştırılmış custom format,
 * Replit Object Storage'a yükler ve `--keep-days` ile retention uygular.
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run db:backup
 *   pnpm --filter @workspace/scripts run db:backup -- --keep-days=14 --dry-run
 *
 * Argümanlar:
 *   --keep-days=N   N günden eski yedekleri siler (varsayılan 14)
 *   --dry-run       sadece hangi adımların atılacağını raporlar (yan etki yok)
 *   --prefix=path   object storage prefix (varsayılan: <PRIVATE_OBJECT_DIR>/db-backups)
 */
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const keepDays = parseInt(args.keepDays || args["keep-days"] || "14", 10);
const dryRun = args.dryRun === "true" || args["dry-run"] === "true";
const baseDir = (process.env.PRIVATE_OBJECT_DIR || "/private").replace(/\/$/, "");
const prefix = (args.prefix || `${baseDir.replace(/^\//, "")}/db-backups`).replace(/^\/+/, "");
const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const databaseUrl = process.env.DATABASE_URL;

async function dumpDatabase(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Custom format (-Fc) zaten sıkıştırır + selective restore destekler
    const proc = spawn("pg_dump", ["-Fc", "-Z", "9", "--no-owner", "--no-acl", "-f", targetPath, databaseUrl!], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    proc.on("error", reject);
    proc.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exit ${code}`)));
  });
}

async function main() {
  if (!databaseUrl) throw new Error("DATABASE_URL gerekli");
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID gerekli");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ym = stamp.slice(0, 7);
  const objectKey = `${prefix}/${ym}/db-${stamp}.dump`;
  const tmpPath = path.join(os.tmpdir(), `db-backup-${stamp}.dump`);

  console.log(`[backup] hedef: ${objectKey}  retention=${keepDays}d  dryRun=${dryRun}`);

  const client = new ObjectStorageClient({ bucketId });

  if (dryRun) {
    console.log("[backup] (dry-run) pg_dump atlandı, yükleme atlandı, retention atlandı.");
    // Yine de mevcut yedek sayısı raporlansın
    const list = await client.list({ prefix: prefix + "/" });
    if (list.ok) {
      console.log(`[backup] (dry-run) mevcut yedek sayısı: ${list.value.length}`);
    }
    return;
  }

  // 1) DB dump
  const t0 = Date.now();
  await dumpDatabase(tmpPath);
  const stat = await fs.stat(tmpPath);
  console.log(`[backup] pg_dump tamam: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${Date.now() - t0}ms)`);

  // 2) Yükle
  try {
    const up = await client.uploadFromFilename(objectKey, tmpPath);
    if (!up.ok) throw new Error(up.error?.message ?? "upload failed");
    console.log(`[backup] yüklendi → ${objectKey}`);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }

  // 3) Retention
  const cutoffMs = Date.now() - keepDays * 86400_000;
  const list = await client.list({ prefix: prefix + "/" });
  if (!list.ok) {
    console.warn("[backup] retention list başarısız:", list.error?.message);
    return;
  }
  let deleted = 0;
  for (const obj of list.value) {
    // Dosya adı: db-YYYY-MM-DDTHH-MM-SS.dump
    const m = obj.name.match(/db-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.dump$/);
    if (!m) continue;
    const iso = m[1].replace(/-(\d{2})-(\d{2})$/, ":$1:$2").replace(/T(\d{2})-/, "T$1:");
    const ts = Date.parse(iso + "Z");
    if (Number.isFinite(ts) && ts < cutoffMs) {
      const del = await client.delete(obj.name);
      if (del.ok) { deleted++; console.log(`[backup] eski silindi: ${obj.name}`); }
    }
  }
  console.log(`[backup] retention: ${deleted} eski yedek silindi (>${keepDays}g)`);
  process.exit(0);
}

main().catch((e) => { console.error("[backup] HATA:", e); process.exit(1); });
