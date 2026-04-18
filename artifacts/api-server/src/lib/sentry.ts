// Sentry — opsiyonel bağımlılık. SENTRY_DSN yoksa hiç yüklenmez.
// @sentry/node + @opentelemetry runtime peer'leri eksikse de güvenlidir.
import { logger } from "./logger.js";

let SentryNs: any = null;
let initialized = false;

export async function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("Sentry DSN ayarlanmadı — error monitoring devre dışı");
    return;
  }
  if (initialized) return;
  try {
    SentryNs = await import("@sentry/node");
    SentryNs.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
      release: process.env.RELEASE_VERSION,
    });
    initialized = true;
    logger.info("Sentry başlatıldı");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Sentry yüklenemedi (peer deps eksik olabilir)");
  }
}

export function captureException(err: any, ctx?: Record<string, any>) {
  if (!initialized || !SentryNs) return;
  try {
    SentryNs.withScope((scope: any) => {
      if (ctx) for (const [k, v] of Object.entries(ctx)) scope.setExtra(k, v);
      SentryNs.captureException(err);
    });
  } catch { /* swallow */ }
}

export const Sentry = { captureException };
