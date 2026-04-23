import type { SessionOptions } from "express-session";
import type { Express } from "express";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Express `trust proxy` — Cloudflare tek atlama için genelde `1`.
 * `false` / `0`: doğrudan Node'a gelen trafik (yerel geliştirme).
 * Pozitif tam sayı: güvenilen proxy hop sayısı.
 */
export function resolveTrustProxySetting(): number | boolean {
  const raw = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : false;
  }
  if (raw === "true") return true;
  if (raw !== "") return true;
  return IS_PRODUCTION ? 1 : false;
}

export function applyTrustProxy(app: Express): void {
  app.set("trust proxy", resolveTrustProxySetting());
}

function sessionTrustsForwardedProto(): boolean {
  if (process.env.SESSION_BEHIND_PROXY === "0") return false;
  if (process.env.SESSION_BEHIND_PROXY === "1") return true;
  const t = resolveTrustProxySetting();
  return t !== false && t !== 0;
}

function parseSameSite(): "strict" | "lax" | "none" {
  const v = (process.env.SESSION_COOKIE_SAMESITE || "lax").trim().toLowerCase();
  if (v === "strict" || v === "lax" || v === "none") return v;
  return "lax";
}

function parseMaxAgeMs(): number {
  const raw = (process.env.SESSION_MAX_AGE_MS || "").trim();
  if (!raw) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 7 * 24 * 60 * 60 * 1000;
}

/**
 * Cloudflare / TLS sonlandırıcı arkasında güvenli oturum çerezi.
 * - `proxy: true` → X-Forwarded-Proto üzerinden HTTPS algılanır (express-session).
 * - `secure: "auto"` → gerçek TLS ise Secure çerez.
 * - `SESSION_COOKIE_SAMESITE=none` + `SESSION_COOKIE_DOMAIN=.örnek.com` → app. / api. ayrımı.
 */
export function buildSessionOptions(sessionSecret: string): SessionOptions {
  const trustFwd = sessionTrustsForwardedProto();
  const sameSite = parseSameSite();
  const domainRaw = (process.env.SESSION_COOKIE_DOMAIN || "").trim();
  const domain = domainRaw.length > 0 ? domainRaw : undefined;
  const pathRaw = (process.env.SESSION_COOKIE_PATH || "/").trim();
  const cookiePath = pathRaw.length > 0 ? pathRaw : "/";

  if (sameSite === "none" && !trustFwd) {
    throw new Error(
      "SESSION_COOKIE_SAMESITE=none için proxy güveni gerekir: TRUST_PROXY=1 veya SESSION_BEHIND_PROXY=1 (Cloudflare).",
    );
  }

  const cookieSecure: boolean | "auto" = trustFwd ? "auto" : IS_PRODUCTION;

  return {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: trustFwd,
    cookie: {
      secure: cookieSecure,
      httpOnly: true,
      maxAge: parseMaxAgeMs(),
      sameSite,
      domain,
      path: cookiePath,
    },
  };
}
