import { Request, Response, NextFunction } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  // localhost, 127.0.0.1, *.replit.dev gibi geliştirme ortamları
  if (parts.length < 2) return null;
  if (hostWithoutPort === "localhost") return null;
  if (hostWithoutPort.endsWith(".replit.dev")) return null;
  if (hostWithoutPort.endsWith(".replit.app")) {
    // deployed.replit.app → no subdomain, or prosan.something.replit.app
    if (parts.length >= 3) return parts[0]!;
    return null;
  }

  // Gerçek production: prosan.smsystem.com → ["prosan", "smsystem", "com"]
  if (parts.length >= 3) return parts[0]!;
  return null;
}

let _defaultCompany: Company | null = null;

async function getDefaultCompany(): Promise<Company | null> {
  if (_defaultCompany) return _defaultCompany;
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.isActive, true))
    .limit(1);
  if (company) _defaultCompany = company;
  return company ?? null;
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const host = req.headers.host ?? "";
    const tenantHeader = req.headers["x-tenant"] as string | undefined;

    let company: Company | null = null;

    // 1. Önce X-Tenant header'ına bak (geliştirme ortamı)
    if (tenantHeader) {
      const [found] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.subdomain, tenantHeader));
      if (found) company = found;
    }

    // 2. Subdomain'den resolve et
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

    // 3. Fallback: ilk aktif şirket (dev ortamı)
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
    next();
  } catch (err) {
    console.error("Tenant middleware error:", err);
    next(err);
  }
}
