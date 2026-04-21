import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db, apiKeysTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { assertWithinUsageLimit, incrementUsageSafe } from "../services/usage.js";

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

    // Dalga 23 — Public API kontör gating + increment (fail-closed)
    try {
      await assertWithinUsageLimit(company.id, "api_calls", 1);
    } catch (err: any) {
      if (err?.code === "QUOTA_EXCEEDED") {
        res.status(402).json({
          error: { code: "QUOTA_EXCEEDED", message: "API çağrı kontörünüz bitti. Ek kontör satın alın.", metric: "api_calls", limit: err.limit, current: err.currentCount },
        });
        return;
      }
      // Quota dışı hata (DB/servis) → fail-closed 503: enforcement bypass yok
      console.error("[api-key-auth] usage assert error (fail-closed):", err?.message);
      res.status(503).json({ error: { code: "USAGE_CHECK_UNAVAILABLE", message: "Kullanım denetimi geçici olarak kullanılamıyor, lütfen tekrar deneyin" } });
      return;
    }
    incrementUsageSafe(company.id, "api_calls", 1);

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
