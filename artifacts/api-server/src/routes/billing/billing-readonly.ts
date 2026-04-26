/**
 * Billing read-only endpoints — extracted from routes/billing.ts.
 *
 * Preserves route contracts and response shapes.
 */
import type { Router, Request, Response } from "express";
import { db, paymentsTable } from "@workspace/db";
import { and, eq, desc, sql, gte } from "drizzle-orm";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { CREDIT_PACKS } from "../../services/billing/credit-packs";
import { logger } from "../../lib/logger";

export function registerBillingReadonlyRoutes(router: Router): void {
  /* -------------------- GET /credit-packs (catalog) -------------------- */
  router.get("/credit-packs", requireAuth, (_req: Request, res: Response) => {
    res.json({ packs: CREDIT_PACKS });
  });

  /* -------------------- GET /payments -------------------- */
  router.get("/payments", requireAuth, async (req: Request, res: Response) => {
    const companyId = req.session.user!.companyId;
    const rows = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.companyId, companyId))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(50);
    res.json({ payments: rows });
  });

  /** Son kontör satın almaları + basit tekrar / tutar özeti (tenant). */
  router.get("/topup-summary", requireAuth, requireRole(["admin", "super_admin"]), async (req: Request, res: Response) => {
    try {
      const companyId = req.session.user!.companyId;
      const ago90 = new Date(Date.now() - 90 * 86400000);
      const recent = await db.select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        status: paymentsTable.status,
        paidAt: paymentsTable.paidAt,
        createdAt: paymentsTable.createdAt,
        rawRequest: paymentsTable.rawRequest,
        errorCode: paymentsTable.errorCode,
      })
        .from(paymentsTable)
        .where(and(eq(paymentsTable.companyId, companyId), eq(paymentsTable.billingCycle, "topup")))
        .orderBy(desc(paymentsTable.createdAt))
        .limit(12);

      const succeeded90d = await db.select({ c: sql<number>`count(*)::int` })
        .from(paymentsTable)
        .where(and(
          eq(paymentsTable.companyId, companyId),
          eq(paymentsTable.billingCycle, "topup"),
          eq(paymentsTable.status, "succeeded"),
          gte(paymentsTable.paidAt, ago90),
        ));

      const sumTryRow = await db.select({
        s: sql<number>`coalesce(sum((${paymentsTable.amount})::numeric) filter (where ${paymentsTable.status} = 'succeeded'), 0)`,
      })
        .from(paymentsTable)
        .where(and(
          eq(paymentsTable.companyId, companyId),
          eq(paymentsTable.billingCycle, "topup"),
          gte(paymentsTable.paidAt, ago90),
        ));

      const recentOut = recent.map((r) => {
        const rq = (r.rawRequest ?? {}) as { packCode?: string; label?: string; metric?: string };
        return {
          id: r.id,
          status: r.status,
          amountTry: Number(r.amount ?? 0),
          paidAt: r.paidAt,
          createdAt: r.createdAt,
          packCode: rq.packCode ?? "",
          label: rq.label ?? rq.packCode ?? "",
          metric: rq.metric ?? "",
          errorCode: r.errorCode,
        };
      });

      const succN = Number(succeeded90d[0]?.c ?? 0);
      const avgTry = succN > 0 ? Math.round(Number(sumTryRow[0]?.s ?? 0) / succN) : 0;

      res.json({
        recent: recentOut,
        stats90d: {
          succeededCount: succN,
          totalTry: Math.round(Number(sumTryRow[0]?.s ?? 0)),
          avgTry,
          isRepeater: succN >= 2,
        },
      });
    } catch (err) {
      logger.warn({ err }, "billing_topup_summary_failed");
      res.status(500).json({ error: { code: "INTERNAL", message: "topup_summary_failed" } });
    }
  });
}

