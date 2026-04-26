/**
 * P0 — Kiracı sınırı: oturumdaki companyId ile Host'tan çözülen req.companyId aynı olmalı.
 * Aksi, paylaşımlı oturum çerezi veya yanlış subdomain ile çapraz kiracı riskidir.
 *
 * super_admin: oturumdaki companyId, çözümlenen kiracıya otomatik hizalanır (yönetim paneli
 * subdomain modeli). İstek sonunda express-session kaydeder.
 */
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

function requestPath(req: Request): string {
  const u = req.originalUrl || req.url || "";
  return u.split("?")[0] || "";
}

/** Kimlik doğrulaması yok veya PSP dışı imzalı uçlar — oturum hizalaması uygulanmaz */
function shouldSkipTenantAlignment(path: string): boolean {
  if (path.includes("/billing/webhook")) return true;
  if (path.includes("/webhooks/")) return true;
  return false;
}

export function enforceTenantSessionAlignment(req: Request, res: Response, next: NextFunction): void {
  const path = requestPath(req);
  if (shouldSkipTenantAlignment(path)) {
    next();
    return;
  }
  const uid = (req as any).id;
  if (!req.session?.user) {
    next();
    return;
  }
  const sessionCid = req.session.user.companyId;
  const reqCid = req.companyId;
  if (sessionCid == null || reqCid == null) {
    next();
    return;
  }
  if (sessionCid === reqCid) {
    next();
    return;
  }
  if (req.session.user.role === "super_admin") {
    req.session.user.companyId = reqCid;
    logger.info(
      { reqId: uid, alignedCompanyId: reqCid, previousSessionCompanyId: sessionCid },
      "super_admin_tenant_session_aligned",
    );
    next();
    return;
  }
  logger.warn(
    { reqId: uid, sessionCompanyId: sessionCid, hostCompanyId: reqCid, path },
    "tenant_session_mismatch_blocked",
  );
  res.status(403).json({
    error: {
      code: "TENANT_SESSION_MISMATCH",
      message: "Oturum kiracısı ile erişilen host uyuşmuyor. Çıkış yapıp doğru subdomain üzerinden giriş yapın.",
      details: null,
    },
  });
}
