// Sprint 80 — RLS context middleware (OPT-IN)
// PostgreSQL Row-Level Security'nin çalışması için her request'in transaction
// içinde `SET LOCAL app.current_company_id = <int>` çağırması gerekir.
//
// Bu middleware şu anda KULLANILMIYOR — RLS aktivasyonu için önce:
// 1) `pnpm --filter @workspace/api-server tsx src/scripts/apply-rls.ts` çalıştırılır
// 2) Ardından app.ts'de `app.use("/api", rlsContextMiddleware)` eklenir
// 3) Tüm db.* çağrıları transaction wrapper kullanmaya geçer
//
// Mevcut app-level tenant filter (companyId WHERE) yeterli savunma katmanı sağlıyor;
// RLS ikincil savunma hattı olarak hazır.
import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function rlsContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const cid = (req as any).companyId;
  if (!cid) return next();
  try {
    // SET LOCAL transaction-scope; pool connection paylaşıldığında diğer request'leri etkilemez
    // ANCAK drizzle pg pool connection bazlı SET LOCAL transaction olmadan kalıcı olur.
    // Bu yüzden production'da db.transaction wrapper'ı içinde çağırılmalı:
    //   await db.transaction(async (tx) => {
    //     await tx.execute(sql`SET LOCAL app.current_company_id = ${cid}`);
    //     // ... iş mantığı tx kullanarak
    //   });
    // Şimdilik no-op; aktivasyon sırasında her route handler'ı tx ile sarmalanacak.
    next();
  } catch (err) {
    next(err);
  }
}

// RLS bypass için super-admin/sistem işlemleri (örn. cron, migration)
// fn'e tx geçilir — global db kullanılırsa farklı connection olur ve bypass etkisiz kalır.
export async function withRlsBypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.bypass_rls = 'true'`);
    return fn(tx);
  });
}

// Tenant-scoped transaction helper
export async function withTenantContext<T>(companyId: number, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_company_id = ${companyId}`);
    return fn(tx);
  });
}
