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
    const [existing] = await db
      .select()
      .from(idempotencyKeysTable)
      .where(and(eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.companyId, cid)))
      .limit(1);

    if (existing) {
      if (existing.expiresAt < new Date()) {
        await db.delete(idempotencyKeysTable).where(and(
          eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.companyId, cid)
        ));
      } else {
        if (existing.method !== req.method || existing.path !== req.path) {
          return res.status(409).json({ error: "Conflict", message: "Idempotency-Key farklı bir istek için kullanılıyor." });
        }
        res.setHeader("Idempotent-Replayed", "true");
        return res.status(existing.statusCode).json(existing.responseBody);
      }
    }

    const origJson = res.json.bind(res);
    res.json = (body: any) => {
      const status = res.statusCode || 200;
      if (status < 500) {
        db.insert(idempotencyKeysTable).values({
          key,
          companyId: cid,
          method: req.method,
          path: req.path,
          statusCode: status,
          responseBody: body ?? {},
          expiresAt: new Date(Date.now() + TTL_MS),
        }).catch((e) => logger.warn({ err: e }, "idempotency_save_failed"));
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
