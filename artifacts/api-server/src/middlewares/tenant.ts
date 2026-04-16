import { Request, Response, NextFunction } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import type { Company } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      companyId: number;
      company: Company;
    }
  }
}

function extractSubdomain(host: string): string | null {
  const hostWithoutPort = host.split(":")[0]!;
  const parts = hostWithoutPort.split(".");

  if (parts.length < 2) return null;
  if (hostWithoutPort === "localhost") return null;
  if (hostWithoutPort.endsWith(".replit.dev")) return null;
  if (hostWithoutPort.endsWith(".replit.app")) {
    if (parts.length >= 3) return parts[0]!;
    return null;
  }

  if (parts.length >= 3) return parts[0]!;
  return null;
}

async function getDefaultCompany(): Promise<Company | null> {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.isActive, true))
    .orderBy(asc(companiesTable.id))
    .limit(1);
  return company ?? null;
}

// Yollar trial/plan kontrolünden muaf (app.use("/api") altında, /api prefix yok)
const EXEMPT_PATHS = ["/auth/", "/payment/", "/catalog", "/health"];

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((p) => path.startsWith(p));
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const host = req.headers.host ?? "";
    const tenantHeader = req.headers["x-tenant"] as string | undefined;

    let company: Company | null = null;

    if (tenantHeader) {
      const [found] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.subdomain, tenantHeader));
      if (found) company = found;
    }

    if (!company) {
      const subdomain = extractSubdomain(host);
      if (subdomain) {
        const [found] = await db
          .select()
          .from(companiesTable)
          .where(eq(companiesTable.subdomain, subdomain));
        if (found) company = found;
      }
    }

    if (!company) {
      company = await getDefaultCompany();
    }

    if (!company) {
      res.status(503).json({ error: "Service Unavailable", message: "Şirket bulunamadı" });
      return;
    }

    if (!company.isActive) {
      res.status(403).json({ error: "Forbidden", message: "Bu hesap devre dışı bırakılmış" });
      return;
    }

    req.companyId = company.id;
    req.company = company;

    // Trial / plan kontrolü — muaf yollar hariç
    if (!isExempt(req.path)) {
      const now = new Date();
      const trialExpired =
        company.planType === "trial" &&
        company.trialEndsAt !== null &&
        company.trialEndsAt !== undefined &&
        company.trialEndsAt < now;

      const isSuspended = company.planType === "suspended";

      if (trialExpired || isSuspended) {
        res.status(402).json({
          error: "Payment Required",
          message: trialExpired ? "Trial süreniz doldu" : "Hesabınız askıya alındı",
          planType: company.planType,
          trialEndsAt: company.trialEndsAt,
        });
        return;
      }
    }

    next();
  } catch (err) {
    console.error("Tenant middleware error:", err);
    next(err);
  }
}
