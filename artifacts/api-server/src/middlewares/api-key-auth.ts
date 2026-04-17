import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db, apiKeysTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "API anahtarı gereklidir (Bearer token)" });
    return;
  }

  const token = auth.slice(7).trim();
  if (token.length < 8) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Geçersiz API anahtarı" });
    return;
  }

  const prefix = token.slice(0, 12);

  try {
    // Prefix ile aday kayıtları bul
    const candidates = await db.select().from(apiKeysTable)
      .where(and(eq(apiKeysTable.keyPrefix, prefix), eq(apiKeysTable.isActive, true)));

    let matched = null;
    for (const candidate of candidates) {
      const ok = await bcrypt.compare(token, candidate.keyHash);
      if (ok) { matched = candidate; break; }
    }

    if (!matched) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Geçersiz veya süresi dolmuş API anahtarı" });
      return;
    }

    // Sona erme kontrolü
    if (matched.expiresAt && matched.expiresAt < new Date()) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "API anahtarının süresi dolmuş" });
      return;
    }

    // Şirketi al
    const [company] = await db.select().from(companiesTable)
      .where(eq(companiesTable.id, matched.companyId));
    if (!company || !company.isActive) {
      res.status(403).json({ error: "FORBIDDEN", message: "Şirket bulunamadı veya pasif" });
      return;
    }

    // Son kullanım zamanını güncelle (fire and forget)
    db.update(apiKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeysTable.id, matched.id))
      .catch(() => {});

    // req'e context ekle
    (req as any).companyId = company.id;
    (req as any).company = company;
    (req as any).apiKeyId = matched.id;
    (req as any).apiKeyScopes = matched.scopes;

    next();
  } catch (err) {
    console.error("API key auth error", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
}

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const scopes: string = (req as any).apiKeyScopes ?? "read";
    if (scope === "read") { next(); return; }
    if (scope === "write" && (scopes === "write" || scopes === "admin")) { next(); return; }
    if (scope === "admin" && scopes === "admin") { next(); return; }
    res.status(403).json({ error: "FORBIDDEN", message: `Bu işlem için '${scope}' yetkisi gereklidir` });
  };
}
