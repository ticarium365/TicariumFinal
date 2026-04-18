import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import rateLimit from "express-rate-limit";
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
import { initSentry, Sentry } from "./lib/sentry.js";
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

// ─── Güvenlik başlıkları (Sprint 26 + canlı öncesi sıkılaştırma) ─────────────
app.use(helmet({
  // API JSON döndürür; HTML render etmediği için CSP API tarafında devre dışı
  // (frontend kendi CSP'sini Vite üzerinden uygular)
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  // Replit iframe önizlemesi için cross-origin'e izin
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Tarayıcıya HTTPS zorlat (prod'da)
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  // Referrer leak koruması
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // MIME sniff koruması zaten aktif (default)
}));

// Trust proxy (Replit edge proxy için — rate limit IP doğru çalışsın)
app.set("trust proxy", 1);

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

app.use(cors({
  origin: true,
  credentials: true,
}));

// İstek gövdesi boyut sınırı (Sprint 25)
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION,   // prod'da HTTPS zorunlu
    httpOnly: true,           // JS ile erişilemez
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
  },
}));

// Brute-force koruması: login endpoint'i 15 dakikada max 20 deneme (prod only)
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
});

app.use("/api/auth/login", loginRateLimit);

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

// Healthz / readyz — tenant middleware bypass, monitor için
app.use("/api", healthzRouter);
app.use("/api/v1", healthzRouter);

// KVKK consent endpoint'i — anonim kullanıcılar da onay verebilir (cookie consent)
app.use("/api/kvkk", kvkkRouter);
app.use("/api/v1/kvkk", kvkkRouter);

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
    try { Sentry?.captureException?.(err); } catch { /* sentry off */ }
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
