import { Request, Response, NextFunction } from "express";
import { db, idempotencyKeysTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY_RE = /^[A-Za-z0-9._-]{8,128}$/;

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const key = req.header("Idempotency-Key");
  if (!key) return next();
  if (!KEY_RE.test(key)) {
    return res.status(400).json({ error: "Bad Request", message: "Idempotency-Key formatı geçersiz (8-128 alfanumerik)." });
  }
  const cid = req.companyId;
  if (!cid) return next();

  try {
    // ATOMIC RESERVATION: aynı anda gelen iki request'ten yalnız biri INSERT'i kazanır.
    // Diğeri unique violation alır → mevcut kaydı okur, replay/conflict döner.
    const now = new Date();
    const reserved = await db
      .insert(idempotencyKeysTable)
      .values({
        key,
        companyId: cid,
        method: req.method,
        path: req.path,
        statusCode: 0, // 0 = işlem devam ediyor
        responseBody: {},
        expiresAt: new Date(now.getTime() + TTL_MS),
      })
      .onConflictDoNothing({ target: [idempotencyKeysTable.key, idempotencyKeysTable.companyId] })
      .returning();

    if (reserved.length === 0) {
      // Anahtar zaten var — mevcut durumu oku
      const [existing] = await db.select().from(idempotencyKeysTable)
        .where(and(eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.companyId, cid)))
        .limit(1);

      if (!existing) return next(); // race ile silindi, devam

      // Süresi geçmişse temizle ve devam (yeni reservation için recursion yerine basit retry)
      if (existing.expiresAt < now) {
        await db.delete(idempotencyKeysTable).where(and(
          eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.companyId, cid)
        ));
        return idempotencyMiddleware(req, res, next);
      }

      if (existing.method !== req.method || existing.path !== req.path) {
        return res.status(409).json({ error: "Conflict", message: "Idempotency-Key farklı bir istek için kullanılıyor." });
      }

      if (existing.statusCode === 0) {
        // Eşzamanlı işlem devam ediyor — duplicate yan etki çıkmasın
        return res.status(409).json({ error: "Conflict", message: "Aynı Idempotency-Key ile işlem hâlâ devam ediyor. Birkaç saniye sonra tekrar deneyin." });
      }

      res.setHeader("Idempotent-Replayed", "true");
      return res.status(existing.statusCode).json(existing.responseBody);
    }

    // Reservation kazanıldı — handler çalıştır, sonra kaydı tamamla
    const origJson = res.json.bind(res);
    res.json = (body: any) => {
      const status = res.statusCode || 200;
      if (status < 500) {
        db.update(idempotencyKeysTable)
          .set({ statusCode: status, responseBody: body ?? {} })
          .where(and(eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.companyId, cid)))
          .catch((e) => logger.warn({ err: e }, "idempotency_save_failed"));
      } else {
        // 5xx — reservation'ı sil ki client retry edebilsin
        db.delete(idempotencyKeysTable).where(and(
          eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.companyId, cid)
        )).catch((e) => logger.warn({ err: e }, "idempotency_cleanup_failed"));
      }
      return origJson(body);
    };
    next();
  } catch (err) {
    logger.warn({ err }, "idempotency_middleware_error");
    next();
  }
}

let cleanupRunning = false;
export async function cleanupExpiredIdempotencyKeys() {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    await db.delete(idempotencyKeysTable).where(lt(idempotencyKeysTable.expiresAt, new Date()));
  } finally {
    cleanupRunning = false;
  }
}
