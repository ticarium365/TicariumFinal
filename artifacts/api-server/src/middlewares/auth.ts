import { Request, Response, NextFunction } from "express";

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  role: "admin" | "staff" | "viewer" | "super_admin";
  isActive: boolean;
  companyId: number;
  /** Sprint D + I: companies.accountType (seller|buyer|both|purchasing). */
  accountType?: "seller" | "buyer" | "both" | "purchasing";
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

function err(status: number, code: string, message: string) {
  return { status, body: { error: { code, message, details: null } } };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    const e = err(401, "UNAUTHORIZED", "Giriş yapmanız gerekiyor");
    res.status(e.status).json(e.body);
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    const e = err(401, "UNAUTHORIZED", "Giriş yapmanız gerekiyor");
    res.status(e.status).json(e.body);
    return;
  }
  if (req.session.user.role !== "admin" && req.session.user.role !== "super_admin") {
    const e = err(403, "FORBIDDEN", "Bu işlem için admin yetkisi gerekiyor");
    res.status(e.status).json(e.body);
    return;
  }
  next();
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      const e = err(401, "UNAUTHORIZED", "Giriş yapmanız gerekiyor");
      res.status(e.status).json(e.body);
      return;
    }
    if (!roles.includes(req.session.user.role)) {
      const e = err(403, "FORBIDDEN", "Bu işlem için yetkiniz yok");
      res.status(e.status).json(e.body);
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    const e = err(401, "UNAUTHORIZED", "Giriş yapmanız gerekiyor");
    res.status(e.status).json(e.body);
    return;
  }
  if (req.session.user.role !== "super_admin") {
    const e = err(403, "FORBIDDEN", "Bu işlem için süper admin yetkisi gerekiyor");
    res.status(e.status).json(e.body);
    return;
  }
  next();
}
