import rateLimit, { type Options } from "express-rate-limit";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Önceden tanımlı kademeler (gelecekte rotalara bağlamak için).
 * **Üretimdeki tüm sınırların kaynak listesi** `docs/PRODUCTION_READINESS_CHECKLIST.md` ve
 * `artifacts/api-server/src/app.ts` (satır içi `rateLimit` + auth/contact/public) içinde tutulur;
 * yeni uç eklendiğinde bu tablolar güncellenmelidir.
 */
export type RateLimitTier = "public" | "auth" | "internal" | "write";

const TIER_DEFAULTS: Record<RateLimitTier, { windowMs: number; max: number }> = {
  public:   { windowMs: 60_000,  max: 120 },
  auth:     { windowMs: 15 * 60_000, max: 20 },
  internal: { windowMs: 60_000,  max: 600 },
  write:    { windowMs: 60_000,  max: 60 },
};

export function createRateLimit(tier: RateLimitTier, override: Partial<Options> = {}) {
  const def = TIER_DEFAULTS[tier];
  return rateLimit({
    windowMs: def.windowMs,
    max: def.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !IS_PRODUCTION,
    message: { error: "Too Many Requests", message: "Çok fazla istek. Lütfen bekleyin." },
    ...override,
  });
}
