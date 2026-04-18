import { Request, Response, NextFunction } from "express";
import {
  db, companiesTable, companySubscriptionsTable, subscriptionPlansTable,
} from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";

const cache = new Map<number, { features: string[]; planSlug: string | null; status: string; expires: number }>();
const TTL_MS = 60_000;

export function invalidateFeaturesCache(companyId?: number) {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

export interface FeatureContext {
  features: string[];
  planSlug: string | null;
  status: "trial" | "active" | "grace" | "expired" | "none";
  trialEndsAt?: Date | null;
}

export async function getCompanyFeatureContext(companyId: number): Promise<FeatureContext> {
  const cached = cache.get(companyId);
  if (cached && cached.expires > Date.now()) {
    return { features: cached.features, planSlug: cached.planSlug, status: cached.status as any };
  }

  const [company] = await db.select({
    planType: companiesTable.planType,
    trialEndsAt: companiesTable.trialEndsAt,
  }).from(companiesTable).where(eq(companiesTable.id, companyId));

  let features: string[] = [];
  let planSlug: string | null = null;
  let status: FeatureContext["status"] = "none";
  let trialEndsAt: Date | null | undefined = company?.trialEndsAt;

  if (company?.planType === "trial" && company.trialEndsAt && company.trialEndsAt > new Date()) {
    features = ["*"];
    status = "trial";
    planSlug = "trial";
  } else {
    const [sub] = await db.select({
      planFeatures: subscriptionPlansTable.features,
      planSlug: subscriptionPlansTable.slug,
      subStatus: companySubscriptionsTable.status,
      gracePeriodEndsAt: companySubscriptionsTable.gracePeriodEndsAt,
    })
      .from(companySubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(and(
        eq(companySubscriptionsTable.companyId, companyId),
        inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
      ))
      .orderBy(desc(companySubscriptionsTable.createdAt))
      .limit(1);

    if (sub) {
      try { features = JSON.parse(sub.planFeatures); } catch { features = []; }
      planSlug = sub.planSlug;
      if (sub.subStatus === "grace_period") {
        if (sub.gracePeriodEndsAt && sub.gracePeriodEndsAt < new Date()) {
          status = "expired";
          features = [];
        } else {
          status = "grace";
        }
      } else {
        status = "active";
      }
    } else if (company?.planType === "trial") {
      // Trial expired, no subscription → readonly
      status = "expired";
      planSlug = "expired";
      features = [];
    }
  }

  cache.set(companyId, {
    features, planSlug, status,
    expires: Date.now() + TTL_MS,
  });
  return { features, planSlug, status, trialEndsAt };
}

export async function hasFeature(companyId: number, code: string): Promise<boolean> {
  const ctx = await getCompanyFeatureContext(companyId);
  return ctx.features.includes("*") || ctx.features.includes(code);
}

/**
 * Modülü plana göre kilitler. Auth'tan sonra çalışır.
 * 403 + upgrade payload döner.
 */
export function requireFeature(code: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cid = req.companyId;
    if (!cid) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Giriş yapmanız gerekiyor" } });
    }
    const ctx = await getCompanyFeatureContext(cid);
    if (ctx.features.includes("*") || ctx.features.includes(code)) return next();
    return res.status(403).json({
      error: {
        code: "FEATURE_LOCKED",
        message: `Bu özellik mevcut paketinizde yer almıyor. Lütfen yükseltin.`,
        requiredFeature: code,
        currentPlan: ctx.planSlug,
        status: ctx.status,
        upgradeUrl: "/pricing",
      },
    });
  };
}

/**
 * READ-only veya yazma işlemi olmayan endpoint'lere açık;
 * yazma işlemini engellemek için. Trial/active/grace = ok, expired = 403.
 */
export function requireWriteAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cid = req.companyId;
    if (!cid) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Giriş yapmanız gerekiyor" } });
    const ctx = await getCompanyFeatureContext(cid);
    if (ctx.status === "expired" || ctx.status === "none") {
      return res.status(403).json({
        error: {
          code: "SUBSCRIPTION_EXPIRED",
          message: "Aboneliğiniz dolmuş. Yazma işlemleri devre dışı, lütfen plan seçin.",
          status: ctx.status,
          upgradeUrl: "/pricing",
        },
      });
    }
    next();
  };
}
