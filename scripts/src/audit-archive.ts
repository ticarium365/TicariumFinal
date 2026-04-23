/**
 * Audit log arşivleme: 90 günden eski audit_logs kayıtlarını object storage'a aktarır.
 * R2 (S3 API) veya Replit Object Storage.
 */
import { db, auditLogsTable } from "@workspace/db";
import { lt, asc, inArray } from "drizzle-orm";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { createR2S3Client, r2PutFile } from "./r2-s3.js";
import { scriptsUseR2 } from "./storage-driver.js";

const gzip = promisify(zlib.gzip);

interface Args {
  keepDays: number;
  batch: number;
  dryRun: boolean;
}
function parseArgs(): Args {
  const a: Args = { keepDays: 90, batch: 10000, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--keep-days=")) a.keepDays = Number(arg.split("=")[1]);
    else if (arg.startsWith("--batch=")) a.batch = Number(arg.split("=")[1]);
    else if (arg === "--dry-run") a.dryRun = true;
  }
  return a;
}

function r2BucketKey(objectKey: string): { bucket: string; key: string } {
  const b = process.env.R2_BUCKET!;
  const k = objectKey.startsWith(`${b}/`) ? objectKey.slice(b.length + 1) : objectKey;
  return { bucket: b, key: k };
}

async function main() {
  const { keepDays, batch, dryRun } = parseArgs();
  const cutoff = new Date(Date.now() - keepDays * 86400 * 1000);
  console.log(`[archive] cutoff=${cutoff.toISOString()} keepDays=${keepDays} batch=${batch} dryRun=${dryRun}`);

  const useR2 = scriptsUseR2();
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const baseDir = process.env.PRIVATE_OBJECT_DIR ?? "/private";

  if (!useR2 && !bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID set değil (Replit) veya R2 yapılandırın");
  if (useR2 && !process.env.R2_BUCKET) throw new Error("R2_BUCKET gerekli");

  const client = useR2 ? null : new ObjectStorageClient({ bucketId: bucketId! });
  const r2Client = useR2 ? createR2S3Client() : null;

  const totalRes: any = await db.execute(
    sql`SELECT COUNT(*)::int AS total FROM audit_logs WHERE created_at < ${cutoff}`,
  );
  const total = Number(totalRes?.rows?.[0]?.total ?? totalRes?.[0]?.total ?? 0);
  console.log(`[archive] arşivlenecek toplam: ${total}`);
  if (!total) {
    console.log("[archive] yapılacak iş yok.");
    return;
  }

  let archived = 0;
  let batchNo = 0;
  if (dryRun) {
    const sample = await db
      .select()
      .from(auditLogsTable)
      .where(lt(auditLogsTable.createdAt, cutoff))
      .orderBy(asc(auditLogsTable.createdAt))
      .limit(Math.min(batch, 5));
    if (sample.length) {
      const first = sample[0]!.createdAt!;
      const ym = first.toISOString().slice(0, 7);
      console.log(`[archive] (dry-run) örnek hedef dizin: ${baseDir.replace(/^\//, "")}/audit-archive/${ym}/`);
    }
    console.log(`[archive] (dry-run) silme/yükleme atlandı. toplam: ${total}`);
    return;
  }

  while (true) {
    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(lt(auditLogsTable.createdAt, cutoff))
      .orderBy(asc(auditLogsTable.createdAt))
      .limit(batch);
    if (!rows.length) break;
    batchNo++;
    const first = rows[0]!.createdAt!;
    const last = rows[rows.length - 1]!.createdAt!;
    const ym = first.toISOString().slice(0, 7);
    const stamp = `${first.toISOString().slice(0, 19)}__${last.toISOString().slice(0, 19)}`.replace(/[:T]/g, "-");
    const objectKey = `${baseDir.replace(/^\//, "")}/audit-archive/${ym}/audit-${stamp}-batch${batchNo}.json.gz`.replace(
      /^\/+/,
      "",
    );
    const ids = rows.map(r => r.id);

    const json = JSON.stringify(
      {
        from: first.toISOString(),
        to: last.toISOString(),
        count: rows.length,
        idRange: { min: Math.min(...ids), max: Math.max(...ids) },
        archivedAt: new Date().toISOString(),
        records: rows,
      },
      null,
      0,
    );
    const gz = await gzip(Buffer.from(json, "utf8"));

    const tmp = path.join(os.tmpdir(), `audit-archive-${Date.now()}-${batchNo}.json.gz`);
    await fs.writeFile(tmp, gz);
    try {
      if (useR2 && r2Client) {
        const { bucket, key } = r2BucketKey(objectKey);
        await r2PutFile(r2Client, bucket, key, tmp);
      } else {
        const up = await client!.uploadFromFilename(objectKey, tmp);
        if (!up.ok) throw new Error(up.error?.message ?? "upload failed");
      }
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
    console.log(`[archive] batch ${batchNo}: ${rows.length} kayıt → ${objectKey} (${(gz.length / 1024).toFixed(1)} KB)`);

    const CHUNK = 1000;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.id, slice));
      deleted += slice.length;
    }
    console.log(`[archive] silindi: ${deleted} kayıt (kesin ID listesinden)`);
    archived += rows.length;
    if (rows.length < batch) break;
  }
  console.log(`[archive] tamamlandı. toplam arşivlenen: ${archived}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[archive] HATA:", e);
  process.exit(1);
});
