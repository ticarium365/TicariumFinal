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
import contactRouter from "./routes/contact.js";
import { logger } from "./lib/logger.js";
import { tenantMiddleware } from "./middlewares/tenant.js";

const app: Express = express();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── Güvenlik başlıkları (Sprint 26) ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

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

// Public API — tenant middleware olmadan, API key ile kimlik doğrulama
// /api/public/v1/* rotaları tenant middleware'i bypass eder
// Public storefront — auth/api-key gerektirmez (sırası önemli: requireApiKey'den önce)
app.use("/api", publicStorefrontRouter);
app.use("/api", aggregatorPublicRouter);
app.use("/api", publicApiRouter);

// Tenant middleware — session tabanlı rotalar için
app.use("/api", tenantMiddleware);
app.use("/api", router);

export default app;
