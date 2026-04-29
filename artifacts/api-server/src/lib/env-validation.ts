import { logger } from "./logger.js";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function requireEnv(key: string, errors: string[]): string {
  const value = (process.env[key] || "").trim();
  if (!value) errors.push(`${key} boş`);
  return value;
}

/**
 * Prod’da yanlış yapılandırmayı erken yakalar. Kritik launch güvenlik/env hatalarında
 * process'i başlatmayarak yarım güvenli deploy'u engeller.
 */
export function logProductionAuthHints(): void {
  if (!IS_PRODUCTION) return;

  const errors: string[] = [];
  const required = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "TRUST_PROXY",
    "SESSION_BEHIND_PROXY",
    "CORS_ALLOWED_ORIGINS",
    "IYZICO_API_KEY",
    "IYZICO_SECRET_KEY",
    "SENTRY_DSN",
    "RELEASE_VERSION",
  ];
  for (const key of required) requireEnv(key, errors);

  const same = (process.env.SESSION_COOKIE_SAMESITE || "lax").trim().toLowerCase();
  const domain = (process.env.SESSION_COOKIE_DOMAIN || "").trim();
  const corsExact = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const sessionSecret = process.env.SESSION_SECRET || "";
  if (sessionSecret && sessionSecret.length < 32) {
    errors.push("SESSION_SECRET en az 32 karakter olmalı");
  }

  if (process.env.SKIP_SCHEMA_VERIFY === "1") {
    errors.push("SKIP_SCHEMA_VERIFY=1 production'da yasaktır");
  }
  if (process.env.BILLING_ALLOW_MOCK_IN_PRODUCTION === "true") {
    errors.push("BILLING_ALLOW_MOCK_IN_PRODUCTION=true normal production launch için yasaktır");
  }
  if (process.env.IYZICO_MODE?.toLowerCase() === "mock") {
    errors.push("IYZICO_MODE=mock production'da yasaktır");
  }
  if ((process.env.CORS_ALLOWED_ORIGINS || "").includes("*") || (process.env.CORS_ALLOWED_ORIGINS || "").includes("localhost")) {
    errors.push("CORS_ALLOWED_ORIGINS production'da wildcard veya localhost içermemeli");
  }
  const release = (process.env.RELEASE_VERSION || "").toLowerCase();
  if (["dev", "development", "local", "latest"].includes(release)) {
    errors.push("RELEASE_VERSION immutable production release etiketi olmalı");
  }

  if (same === "none" && !domain) {
    errors.push("SESSION_COOKIE_SAMESITE=none iken SESSION_COOKIE_DOMAIN boş; app/api ayrı hostlarda cookie taşınmaz");
  }

  if (same === "none" && corsExact.length === 0 && !(process.env.CORS_EXTRA_ORIGINS || "").trim()) {
    errors.push("SameSite=none kullanılırken CORS_ALLOWED_ORIGINS veya CORS_EXTRA_ORIGINS açıkça tanımlanmalı");
  }

  const tp = (process.env.TRUST_PROXY ?? "").trim();
  if (tp === "false" || tp === "0") {
    errors.push("TRUST_PROXY kapalı; Cloudflare arkasında TRUST_PROXY=1 olmalı");
  }

  if (errors.length > 0) {
    logger.fatal({ errors }, "Production env validation failed");
    throw new Error(`Production env validation failed: ${errors.join("; ")}`);
  }

  logger.info({
    release: process.env.RELEASE_VERSION,
    corsOrigins: corsExact.length,
    sameSite: same,
    cookieDomainConfigured: Boolean(domain),
  }, "Production env validation OK");

  if (process.env.FOUNDER_BOOTSTRAP === "1") {
    logger.warn(
      "FOUNDER_BOOTSTRAP=1 aktif — ilk başarılı kurucu oluşturma sonrası env'den kaldırın (dokümantasyon/FOUNDER_ACCESS.md)",
    );
  }
}
