import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { tenantMiddleware } from "./middlewares/tenant.js";

const app: Express = express();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Tenant middleware — tüm /api route'larından önce çalışır
app.use("/api", tenantMiddleware);
app.use("/api", router);

export default app;
