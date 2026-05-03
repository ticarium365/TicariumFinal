import * as Sentry from "@sentry/react";

let sentryInitialized = false;

/** Call once at bootstrap when `VITE_SENTRY_DSN` is set. Safe no-op without DSN. */
export function initSentry(): void {
  if (sentryInitialized || typeof window === "undefined") return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
  });
  sentryInitialized = true;
}

/**
 * Set user context in Sentry after login
 */
export function setSentryUser(user: { id: number; username?: string; role: string }): void {
  Sentry.setUser({
    id: String(user.id),
    username: user.username,
    role: user.role,
  });
}

/**
 * Clear user context on logout
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/** Fallback when Sentry is off or before init — existing client error beacon. */
function reportClientErrorBeacon(error: Error, extras?: Record<string, unknown>): void {
  try {
    const payload = {
      message: error.message ?? String(error),
      stack: error.stack,
      extras,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      severity: "error",
    };
    const url = `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"}api/client-errors`;
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/** Report an Error to Sentry (when configured) and always beacon to `/api/client-errors`. */
export function captureException(error: Error, extras?: Record<string, unknown>): void {
  try {
    initSentry();
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: extras });
    }
  } catch {
    /* Sentry optional at runtime */
  }
  reportClientErrorBeacon(error, extras);
}
