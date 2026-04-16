import { Request, Response, NextFunction } from "express";

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  role: "admin" | "staff" | "viewer";
  isActive: boolean;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    res.status(401).json({ error: "Unauthorized", message: "Giriş yapmanız gerekiyor" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    res.status(401).json({ error: "Unauthorized", message: "Giriş yapmanız gerekiyor" });
    return;
  }
  if (req.session.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Bu işlem için admin yetkisi gerekiyor" });
    return;
  }
  next();
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      res.status(401).json({ error: "Unauthorized", message: "Giriş yapmanız gerekiyor" });
      return;
    }
    if (!roles.includes(req.session.user.role)) {
      res.status(403).json({ error: "Forbidden", message: "Bu işlem için yetkiniz yok" });
      return;
    }
    next();
  };
}
