/**
 * Audit log arşivleme: 90 günden eski audit_logs kayıtlarını
 *   /private/audit-archive/YYYY-MM/audit-<from>_<to>.json.gz
 * dosyasına aktarır ve DB'den siler.
 *
 * Komut: pnpm --filter @workspace/scripts run audit:archive
 *   --keep-days=90  (varsayılan)
 *   --batch=10000   (her seferinde işlenecek satır)
 *   --dry-run       (silmeden sadece raporla)
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

const gzip = promisify(zlib.gzip);

interface Args { keepDays: number; batch: number; dryRun: boolean; }
function parseArgs(): Args {
  const a: Args = { keepDays: 90, batch: 10000, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--keep-days=")) a.keepDays = Number(arg.split("=")[1]);
    else if (arg.startsWith("--batch=")) a.batch = Number(arg.split("=")[1]);
    else if (arg === "--dry-run") a.dryRun = true;
  }
  return a;
}

async function main() {
  const { keepDays, batch, dryRun } = parseArgs();
  const cutoff = new Date(Date.now() - keepDays * 86400 * 1000);
  console.log(`[archive] cutoff=${cutoff.toISOString()} keepDays=${keepDays} batch=${batch} dryRun=${dryRun}`);

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const baseDir = process.env.PRIVATE_OBJECT_DIR ?? "/private";
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID set değil");

  const client = new ObjectStorageClient({ bucketId });

  const totalRes: any = await db.execute(
    sql`SELECT COUNT(*)::int AS total FROM audit_logs WHERE created_at < ${cutoff}`
  );
  const total = Number(totalRes?.rows?.[0]?.total ?? totalRes?.[0]?.total ?? 0);
  console.log(`[archive] arşivlenecek toplam: ${total}`);
  if (!total) { console.log("[archive] yapılacak iş yok."); return; }

  let archived = 0;
  let batchNo = 0;
  // Dry-run: yan etki olmasın → sadece sayım ve örnek dosya adları
  if (dryRun) {
    const sample = await db.select().from(auditLogsTable)
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
    const rows = await db.select().from(auditLogsTable)
      .where(lt(auditLogsTable.createdAt, cutoff))
      .orderBy(asc(auditLogsTable.createdAt))
      .limit(batch);
    if (!rows.length) break;
    batchNo++;
    const first = rows[0]!.createdAt!;
    const last = rows[rows.length - 1]!.createdAt!;
    const ym = first.toISOString().slice(0, 7);
    const stamp = `${first.toISOString().slice(0, 19)}__${last.toISOString().slice(0, 19)}`.replace(/[:T]/g, "-");
    const objectKey = `${baseDir.replace(/^\//, "")}/audit-archive/${ym}/audit-${stamp}-batch${batchNo}.json.gz`.replace(/^\/+/, "");
    const ids = rows.map(r => r.id);

    const json = JSON.stringify({
      from: first.toISOString(),
      to: last.toISOString(),
      count: rows.length,
      idRange: { min: Math.min(...ids), max: Math.max(...ids) },
      archivedAt: new Date().toISOString(),
      records: rows,
    }, null, 0);
    const gz = await gzip(Buffer.from(json, "utf8"));

    const tmp = path.join(os.tmpdir(), `audit-archive-${Date.now()}-${batchNo}.json.gz`);
    await fs.writeFile(tmp, gz);
    try {
      const up = await client.uploadFromFilename(objectKey, tmp);
      if (!up.ok) throw new Error(up.error?.message ?? "upload failed");
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
    console.log(`[archive] batch ${batchNo}: ${rows.length} kayıt → ${objectKey} (${(gz.length / 1024).toFixed(1)} KB)`);

    // Sadece bu batch'te export edilen kesin ID'leri sil. ID-aralığı kullanma!
    // 10000'lik chunk'lara böl (parametreli sorgu limiti güvenli sınırı için).
    const CHUNK = 1000;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const r = await db.delete(auditLogsTable).where(inArray(auditLogsTable.id, slice));
      deleted += slice.length;
    }
    console.log(`[archive] silindi: ${deleted} kayıt (kesin ID listesinden)`);
    archived += rows.length;
    if (rows.length < batch) break;
  }
  console.log(`[archive] tamamlandı. toplam arşivlenen: ${archived}`);
  process.exit(0);
}

main().catch((e) => { console.error("[archive] HATA:", e); process.exit(1); });
