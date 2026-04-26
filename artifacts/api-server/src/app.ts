import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import compression from "compression";
import router from "./routes/index.js";
import publicApiRouter from "./routes/public-api.js";
import publicStorefrontRouter from "./routes/public-storefront.js";
import { aggregatorPublicRouter } from "./routes/aggregator.js";
import clientErrorsRouter from "./routes/client-errors.js";
import contactRouter from "./routes/contact.js";
import healthzRouter from "./routes/healthz.js";
import kvkkRouter from "./routes/kvkk.js";
import featureFlagsRuntimeRouter from "./routes/feature-flags-runtime.js";
import webhookReceiversRouter from "./routes/webhook-receivers.js";
import { logger } from "./lib/logger.js";
import { tenantMiddleware } from "./middlewares/tenant.js";
import { enforceTenantSessionAlignment } from "./middlewares/tenant-boundary.js";
import { initSentry, Sentry } from "./lib/sentry.js";
import { applyTrustProxy, buildSessionOptions } from "./lib/session-config.js";
import crypto from "node:crypto";

void initSentry();

const app: Express = express();

// ─── Request ID korelasyonu ──────────────────────────────────────────────────
// Gelen X-Request-Id varsa onu kullan; yoksa üret. Yanıta da yansıt.
app.use((req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = (incoming && /^[A-Za-z0-9._-]{6,128}$/.test(incoming))
    ? incoming
    : crypto.randomUUID();
  (req as any).id = id;
  res.setHeader("X-Request-Id", id);
  next();
});
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── Güvenlik başlıkları (canlı öncesi sıkılaştırma — Cloudflare + Sentry + Resend uyumlu) ─
// CSP prod'da aktif; dev'de Vite HMR ve Replit iframe'i kırmamak için kapalı.
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  // API JSON döndürür ama Sentry, Cloudflare Insights gibi script'ler enjekte edilebilir.
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",            // shadcn/ui inline event handler'ları
    "https://browser.sentry-cdn.com",
    "https://js.sentry-cdn.com",
    "https://static.cloudflareinsights.com",
  ],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: [
    "'self'", "data:", "blob:",
    "https://*.ticarium365.com",
    "https://storage.googleapis.com",     // object storage CDN
    "https://*.replit.dev",               // dev önizleme
  ],
  fontSrc: ["'self'", "data:"],
  connectSrc: [
    "'self'",
    "https://*.ticarium365.com",
    "https://*.ingest.sentry.io",         // org-prefixed DSN (oXXX.ingest.sentry.io)
    "https://*.ingest.us.sentry.io",      // US region
    "https://*.ingest.de.sentry.io",      // EU region
    "https://ingest.sentry.io",           // apex fallback
    "https://api.resend.com",             // mail (frontend'den çağrılmaz ama whitelist)
    "wss://*.ticarium365.com",            // gerçek zamanlı bildirimler (gelecekte)
  ],
  // Prod'da clickjacking yüzeyini kıs: yalnızca kendi domain'lerimiz iframe edebilir.
  // Replit dev önizleme yalnız non-prod'da gerekli (CSP zaten dev'de kapalı).
  frameAncestors: ["'self'", "https://*.ticarium365.com"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
} as any;

app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION ? { directives: CSP_DIRECTIVES } : false,
  crossOriginEmbedderPolicy: false,
  // Replit iframe önizlemesi + Cloudflare resource fetch için cross-origin'e izin
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Tarayıcıya HTTPS zorlat (prod'da)
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  // Referrer leak koruması
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// Cloudflare / TLS sonlandırıcı — X-Forwarded-For / X-Forwarded-Proto (trust proxy: session-config)
applyTrustProxy(app);

// ─── Yanıt sıkıştırma (Sprint 25) ────────────────────────────────────────────
app.use(compression());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ─── CORS allowlist (canlı öncesi sıkılaştırma) ──────────────────────────────
// Prod: sadece *.ticarium365.com + apex. Dev: localhost + replit.dev + tüm (preview iframe).
// Same-origin istekler (Origin header'ı yok) her zaman geçer.
const CORS_PROD_ALLOW = [
  /^https:\/\/ticarium365\.com$/,
  /^https:\/\/[a-z0-9-]+\.ticarium365\.com$/,    // wildcard tenant
  /^https:\/\/[a-z0-9-]+\.replit\.app$/,         // Replit deployment domain (production fallback)
];
const CORS_DEV_ALLOW = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.replit\.dev$/,
  /^https:\/\/.+\.replit\.app$/,
  /^https:\/\/.+\.kirk\.replit\.dev$/,
];
const CORS_EXTRA = (process.env.CORS_EXTRA_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean)
  .map(s => new RegExp("^" + s.replace(/[.*+?^${}()|[\]\\]/g, r => r === "*" ? ".*" : "\\" + r) + "$"));

/** Virgülle tam köken eşleşmesi: https://app.alanadiniz.com (Cloudflare app/api ayrımı) */
const CORS_EXACT_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / curl / mobil app
    if (CORS_EXACT_ORIGINS.has(origin)) return cb(null, true);
    const allow = IS_PRODUCTION ? CORS_PROD_ALLOW : [...CORS_PROD_ALLOW, ...CORS_DEV_ALLOW];
    const all = [...allow, ...CORS_EXTRA];
    if (all.some(rx => rx.test(origin))) return cb(null, true);
    logger.warn({ origin }, "cors_origin_rejected");
    return cb(new Error(`CORS: ${origin} izinli değil`));
  },
  credentials: true,
  maxAge: 600,
}));

// Liveness/readiness — session, tenant ve JSON body'den önce (monitörler; oturum yazılmaz)
app.use("/api", healthzRouter);
app.use("/api/v1", healthzRouter);

// İstek gövdesi boyut sınırı (Sprint 25)
app.use(express.json({
  limit: "5mb",
  verify: (req: any, _res, buf) => {
    // Dalga 22 — webhook signature verification için ham body byte'larını sakla.
    // Iyzico HMAC-SHA256 imzası orijinal byte sırasını gerektirir; JSON.stringify(req.body)
    // anahtar sırasını koruyamayabilir.
    if (buf && buf.length) req.rawBody = buf.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ─── Session — prod kontrolü sıkılaştırılmış ─────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}
if (IS_PRODUCTION) {
  // Prod'da yetersiz secret = derhal crash. Sızdırılmış/dev secret'la canlıya çıkmayı engeller.
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET prod'da en az 32 karakter olmalı (önerilen 64+).");
  }
  // Tam eşleşme denylist — substring kontrolü false-positive üretiyordu (random 64-char
  // secret tesadüfen "test" içerebilir). Bilinen default/örnek değerlerin tam eşleşmesi yeter.
  const WEAK_EXACT = new Set([
    "dev", "development", "test", "secret", "changeme", "example",
    "password", "admin", "default", "12345678901234567890123456789012",
    "your-secret-here", "supersecret", "mysecret",
  ]);
  if (WEAK_EXACT.has(sessionSecret.toLowerCase().trim())) {
    throw new Error("SESSION_SECRET prod'da bilinen zayıf/default değer olamaz.");
  }
  // Tek karakterli/tekrarlı düşük entropi tespiti (örn. "aaaa...aaaa")
  const uniqueChars = new Set(sessionSecret).size;
  if (uniqueChars < 10) {
    throw new Error(`SESSION_SECRET düşük entropili görünüyor (yalnızca ${uniqueChars} farklı karakter). Rastgele üretin.`);
  }
}

app.use(session(buildSessionOptions(sessionSecret)));

// Brute-force koruması: login endpoint'i 15 dakikada max 20 deneme (prod only).
// T017 (Phase A): Sadece IP yerine `IP + username` key — ofis NAT senaryolarında
// farklı kullanıcıların denemelerinin birbirini "yemesini" engeller. Aynı IP'den
// 20 farklı kullanıcı denenebilir; tek bir kullanıcı içinse 20 deneme/15dk sınırı korur.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.",
  },
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV !== "production",
  // express-rate-limit v8: IPv6 adresleri için resmi `ipKeyGenerator` helper'ı
  // kullanılmalı, aksi halde aynı /64 prefix'inden farklı IP'ler ayrı bucket'a düşer.
  keyGenerator: (req, res) => {
    const ipKey = ipKeyGenerator(req.ip ?? "");
    const username = (req.body?.username ?? "")
      .toString()
      .toLowerCase()
      .slice(0, 64);
    return `${ipKey}:${username}`;
  },
});

app.use("/api/auth/login", loginRateLimit);

// Şifre sıfırlama: 15 dakikada IP başına 10 talep — SMS spam koruması
const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Çok fazla şifre sıfırlama talebi. 15 dakika sonra tekrar deneyin.",
  },
  skip: () => process.env.NODE_ENV !== "production",
});
app.use("/api/auth/forgot-password", passwordResetRateLimit);
app.use("/api/auth/verify-reset-code", passwordResetRateLimit);
app.use("/api/auth/reset-password", passwordResetRateLimit);
// Aynı limitler v1 prefix'i için de geçerli — bypass'ı engelle
app.use("/api/v1/auth/login", loginRateLimit);
app.use("/api/v1/auth/forgot-password", passwordResetRateLimit);
app.use("/api/v1/auth/verify-reset-code", passwordResetRateLimit);
app.use("/api/v1/auth/reset-password", passwordResetRateLimit);

// Anonim "Sizi arayalım" formu için spam koruması: 10 dakikada IP başına 5 talep
const contactRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Çok fazla iletişim talebi. Lütfen daha sonra tekrar deneyin.",
  },
  skip: () => process.env.NODE_ENV !== "production",
});
app.use("/api/contact", contactRateLimit);

// Contact router — anonim form POST + super-admin yönetim, tenant middleware'i bypass eder
app.use("/api/contact", contactRouter);

// KVKK consent endpoint'i — anonim kullanıcılar da onay verebilir (cookie consent)
app.use("/api/kvkk", kvkkRouter);
app.use("/api/v1/kvkk", kvkkRouter);

// Iyzico billing uçları — imza/HMAC ile doğrulanır; IP flood katmanı (ana router + tenant’tan önce)
const billingWebhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Çok fazla webhook isteği." },
  skip: () => !IS_PRODUCTION,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
});
const billingReturnRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Çok fazla ödeme dönüş isteği." },
  skip: () => !IS_PRODUCTION,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
});
app.use("/api/billing/webhook", billingWebhookRateLimit);
app.use("/api/billing/return", billingReturnRateLimit);
app.use("/api/v1/billing/webhook", billingWebhookRateLimit);
app.use("/api/v1/billing/return", billingReturnRateLimit);

// Inbound marketplace webhooks — HMAC zorunlu (prod); handler’dan önce IP üst sınırı
const inboundWebhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Çok fazla webhook isteği." },
  skip: () => !IS_PRODUCTION,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
});
app.use("/api/webhooks", inboundWebhookRateLimit);
app.use("/api/v1/webhooks", inboundWebhookRateLimit);

// Inbound webhook receiver — tenant middleware ÖNCE mount edilir, raw body parsing ister
app.use("/api", webhookReceiversRouter);
app.use("/api/v1", webhookReceiversRouter);

// Public pazar (cross-tenant aggregator) — IP başına dakikada 60 istek (browse koruması)
const pazarRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Çok fazla istek. Lütfen yavaşlayın." },
  skip: () => process.env.NODE_ENV !== "production",
});
app.use("/api/public/v1/pazar", pazarRateLimit);

// Public storefront sipariş — IP başına 10 dakikada 10 sipariş (spam siparişe karşı)
const storefrontOrderRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Çok fazla sipariş denemesi. Lütfen daha sonra tekrar deneyin." },
  skip: (req) => process.env.NODE_ENV !== "production" || req.method !== "POST",
});
app.use("/api/public/v1/storefronts", storefrontOrderRateLimit);

// Genel public API — IP başına dakikada 120 istek (DDoS koruma katmanı)
const publicApiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Çok fazla istek." },
  skip: () => process.env.NODE_ENV !== "production",
});
app.use("/api/public", publicApiRateLimit);

// Public API — tenant middleware olmadan, API key ile kimlik doğrulama
// /api/public/v1/* rotaları tenant middleware'i bypass eder
// Public storefront — auth/api-key gerektirmez (sırası önemli: requireApiKey'den önce)
app.use("/api", clientErrorsRouter);
app.use("/api", publicStorefrontRouter);
app.use("/api", aggregatorPublicRouter);
app.use("/api", publicApiRouter);

// Tenant middleware — session tabanlı rotalar için
app.use("/api", tenantMiddleware);
app.use("/api/v1", tenantMiddleware);
// P0 — Oturumdaki companyId ile Host kiracısı hizalaması (PSP webhook'ları hariç)
app.use("/api", enforceTenantSessionAlignment);
app.use("/api/v1", enforceTenantSessionAlignment);
app.use("/api", router);
app.use("/api/v1", router);

// Admin runtime feature flags — tenant middleware'den sonra mount: requireAuth + requireRole
// içeride session ve req.companyId'ye ihtiyaç duyar.
app.use("/api/admin", featureFlagsRuntimeRouter);
app.use("/api/v1/admin", featureFlagsRuntimeRouter);

// ─── Global hata yakalayıcı (canlı öncesi) ───────────────────────────────────
// Bilinmeyen hatalar burada yakalanır; stack trace prod'da loglanır, kullanıcıya gönderilmez.
import type { NextFunction, Request, Response } from "express";
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err?.statusCode ?? err?.status ?? 500;
  const message = typeof err?.message === "string" ? err.message : "Sunucu hatası";

  logger.error({
    err: { message, stack: err?.stack, code: err?.code },
    req: { method: req.method, url: req.url?.split("?")[0], id: (req as any).id },
    status,
  }, "unhandled_error");

  if (status >= 500) {
    try {
      Sentry?.captureException?.(err, {
        companyId: (req as any).companyId,
        requestId: (req as any).id,
        path: req.url?.split("?")[0],
      });
    } catch { /* sentry off */ }
  }

  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : "Request Error",
    message: IS_PRODUCTION && status >= 500 ? "Sunucu hatası oluştu, ekibimiz bilgilendirildi." : message,
  });
});

// Yakalanmamış async hatalar — process'i çökertmeden logla
process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "unhandled_rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err: { message: err.message, stack: err.stack } }, "uncaught_exception");
});

export default app;
