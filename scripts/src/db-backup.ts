/**
 * PostgreSQL veritabanı yedekleme — pg_dump ile custom format,
 * R2 (S3 API) veya Replit Object Storage'a yükler.
 */
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createR2S3Client, r2DeleteObject, r2ListKeysWithPrefix, r2PutFile } from "./r2-s3.js";
import { scriptsUseR2 } from "./storage-driver.js";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const keepDays = parseInt(args.keepDays || args["keep-days"] || "14", 10);
const dryRun = args.dryRun === "true" || args["dry-run"] === "true";
const baseDir = (process.env.PRIVATE_OBJECT_DIR || "/private").replace(/\/$/, "");
const prefix = (args.prefix || `${baseDir.replace(/^\//, "")}/db-backups`).replace(/^\/+/, "");
const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const databaseUrl = process.env.DATABASE_URL;
const r2Bucket = process.env.R2_BUCKET;

function r2BucketKey(objectKey: string): { bucket: string; key: string } {
  const b = r2Bucket!;
  const k = objectKey.startsWith(`${b}/`) ? objectKey.slice(b.length + 1) : objectKey;
  return { bucket: b, key: k };
}

async function dumpDatabase(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pg_dump", ["-Fc", "-Z", "9", "--no-owner", "--no-acl", "-f", targetPath, databaseUrl!], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    proc.on("error", reject);
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exit ${code}`))));
  });
}

async function main() {
  if (!databaseUrl) throw new Error("DATABASE_URL gerekli");

  const useR2 = scriptsUseR2();
  if (!useR2 && !bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID gerekli (Replit) veya R2 ortamı + STORAGE_DRIVER=r2");
  if (useR2 && !r2Bucket) throw new Error("R2_BUCKET gerekli");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ym = stamp.slice(0, 7);
  const objectKey = `${prefix}/${ym}/db-${stamp}.dump`;
  const tmpPath = path.join(os.tmpdir(), `db-backup-${stamp}.dump`);

  console.log(`[backup] hedef: ${objectKey}  retention=${keepDays}d  dryRun=${dryRun}  driver=${useR2 ? "r2" : "replit"}`);

  if (useR2) {
    const client = createR2S3Client();
    const { bucket, key } = r2BucketKey(objectKey);

    if (dryRun) {
      console.log("[backup] (dry-run) pg_dump atlandı, yükleme atlandı.");
      const keys = await r2ListKeysWithPrefix(client, bucket, r2BucketKey(`${prefix}/`).key);
      console.log(`[backup] (dry-run) mevcut yedek sayısı: ${keys.length}`);
      return;
    }

    const t0 = Date.now();
    await dumpDatabase(tmpPath);
    const stat = await fs.stat(tmpPath);
    console.log(`[backup] pg_dump tamam: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${Date.now() - t0}ms)`);

    try {
      await r2PutFile(client, bucket, key, tmpPath);
      console.log(`[backup] yüklendi → ${bucket}/${key}`);
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }

    const cutoffMs = Date.now() - keepDays * 86400_000;
    const listPrefix = r2BucketKey(`${prefix}/`).key;
    const keys = await r2ListKeysWithPrefix(client, bucket, listPrefix);
    let deleted = 0;
    for (const k of keys) {
      const m = k.match(/db-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.dump$/);
      if (!m) continue;
      const iso = m[1].replace(/-(\d{2})-(\d{2})$/, ":$1:$2").replace(/T(\d{2})-/, "T$1:");
      const ts = Date.parse(iso + "Z");
      if (Number.isFinite(ts) && ts < cutoffMs) {
        await r2DeleteObject(client, bucket, k);
        deleted++;
        console.log(`[backup] eski silindi: ${k}`);
      }
    }
    console.log(`[backup] retention: ${deleted} eski yedek silindi (>${keepDays}g)`);
    process.exit(0);
    return;
  }

  const client = new ObjectStorageClient({ bucketId: bucketId! });

  if (dryRun) {
    console.log("[backup] (dry-run) pg_dump atlandı, yükleme atlandı, retention atlandı.");
    const list = await client.list({ prefix: prefix + "/" });
    if (list.ok) {
      console.log(`[backup] (dry-run) mevcut yedek sayısı: ${list.value.length}`);
    }
    return;
  }

  const t0 = Date.now();
  await dumpDatabase(tmpPath);
  const stat = await fs.stat(tmpPath);
  console.log(`[backup] pg_dump tamam: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${Date.now() - t0}ms)`);

  try {
    const up = await client.uploadFromFilename(objectKey, tmpPath);
    if (!up.ok) throw new Error(up.error?.message ?? "upload failed");
    console.log(`[backup] yüklendi → ${objectKey}`);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }

  const cutoffMs = Date.now() - keepDays * 86400_000;
  const list = await client.list({ prefix: prefix + "/" });
  if (!list.ok) {
    console.warn("[backup] retention list başarısız:", list.error?.message);
    return;
  }
  let deleted = 0;
  for (const obj of list.value) {
    const m = obj.name.match(/db-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.dump$/);
    if (!m) continue;
    const iso = m[1].replace(/-(\d{2})-(\d{2})$/, ":$1:$2").replace(/T(\d{2})-/, "T$1:");
    const ts = Date.parse(iso + "Z");
    if (Number.isFinite(ts) && ts < cutoffMs) {
      const del = await client.delete(obj.name);
      if (del.ok) {
        deleted++;
        console.log(`[backup] eski silindi: ${obj.name}`);
      }
    }
  }
  console.log(`[backup] retention: ${deleted} eski yedek silindi (>${keepDays}g)`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[backup] HATA:", e);
  process.exit(1);
});
