import { logger } from "./logger.js";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Prod’da yanlış yapılandırmayı erken ve sade bir dille loglar (process’i düşürmez).
 */
export function logProductionAuthHints(): void {
  if (!IS_PRODUCTION) return;

  const same = (process.env.SESSION_COOKIE_SAMESITE || "lax").trim().toLowerCase();
  const domain = (process.env.SESSION_COOKIE_DOMAIN || "").trim();
  const corsExact = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (same === "none" && !domain) {
    logger.warn(
      "SESSION_COOKIE_SAMESITE=none iken SESSION_COOKIE_DOMAIN boş. " +
        "app.* ve api.* ayrı hostlarda çerez taşımak için genelde SESSION_COOKIE_DOMAIN=.alanadiniz.com gerekir.",
    );
  }

  if (same === "none" && corsExact.length === 0 && !(process.env.CORS_EXTRA_ORIGINS || "").trim()) {
    logger.warn(
      "Cross-site oturum (SameSite=none) kullanılıyor; CORS_ALLOWED_ORIGINS veya CORS_EXTRA_ORIGINS ile " +
        "ön uç kökenlerini (https://app...) açıkça izin listesine eklemeniz önerilir.",
    );
  }

  const tp = (process.env.TRUST_PROXY ?? "").trim();
  if (tp === "false" || tp === "0") {
    logger.warn(
      "TRUST_PROXY kapalı. Cloudflare arkasında req.secure / oturum çerezi HTTPS algısı bozulabilir; prod’da TRUST_PROXY=1 önerilir.",
    );
  }
}
