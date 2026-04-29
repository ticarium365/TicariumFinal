import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import nodemailer from "nodemailer";
import { resolveStorageDriver } from "../lib/storage/driver.js";
import { probeR2Storage, r2EnvSummary } from "../lib/storage/r2.js";
import { getMailProviderKind, isMailEnabled } from "../lib/email.js";

const router: IRouter = Router();
const startTime = Date.now();
const VERSION = "1.0.0";

type CheckStatus = "ok" | "degraded" | "down" | "disabled";
interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

async function checkDb(): Promise<CheckResult> {
  const t = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", latencyMs: Date.now() - t };
  } catch (e: any) {
    return { status: "down", detail: e?.message ?? "DB hatası" };
  }
}

async function checkObjectStorage(): Promise<CheckResult> {
  const driver = resolveStorageDriver();

  if (driver === "r2") {
    const env = r2EnvSummary();
    if (!env.ok) {
      return {
        status: "disabled",
        detail: `R2 yapılandırması eksik (${env.missing.join(", ")}). .env.example içindeki R2_* değişkenlerini doldurun.`,
      };
    }
    const r = await probeR2Storage();
    if (!r.ok) {
      return {
        status: "down",
        detail: r.message,
        latencyMs: r.latencyMs,
      };
    }
    return {
      status: "ok",
      latencyMs: r.latencyMs,
      detail: r.detail,
    };
  }

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    return {
      status: "disabled",
      detail: "Replit object storage (DEFAULT_OBJECT_STORAGE_BUCKET_ID) tanımlı değil — STORAGE_DRIVER=replit veya R2_* ile R2 kullanın.",
    };
  }
  const t = Date.now();
  try {
    const client = new ObjectStorageClient({ bucketId });
    const list = await client.list({ prefix: "healthz/", maxResults: 1 });
    if (!list.ok) {
      return { status: "degraded", detail: list.error?.message ?? "list başarısız" };
    }
    return {
      status: "ok",
      latencyMs: Date.now() - t,
      detail: "Replit Object Storage listesi OK",
    };
  } catch (e: any) {
    return { status: "down", detail: e?.message ?? "Storage hatası" };
  }
}

async function checkOutboundMail(): Promise<CheckResult> {
  const kind = getMailProviderKind();
  if (kind === "none") {
    return {
      status: "disabled",
      detail: "Giden posta yok — RESEND_API_KEY veya SMTP_HOST+SMTP_USER+SMTP_PASS ekleyin (graceful).",
    };
  }
  if (kind === "resend") {
    if (!isMailEnabled()) {
      return {
        status: "degraded",
        detail: "RESEND_API_KEY var; gönderen adres eksik — RESEND_FROM veya MAIL_FROM tanımlayın.",
      };
    }
    return { status: "ok", detail: "Resend API anahtarı ve gönderen adres yapılandırıldı" };
  }
  const host = process.env.SMTP_HOST;
  const t = Date.now();
  try {
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
    });
    await transport.verify();
    return { status: "ok", latencyMs: Date.now() - t };
  } catch (e: any) {
    return { status: "degraded", detail: e?.message ?? "SMTP doğrulama başarısız" };
  }
}

router.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

router.get("/healthz/deep", async (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const [dbR, storageR, smtpR] = await Promise.all([checkDb(), checkObjectStorage(), checkOutboundMail()]);
  const checks = {
    db: { status: dbR.status },
    objectStorage: { status: storageR.status },
    smtp: { status: smtpR.status },
  };
  const downCount = Object.values(checks).filter(c => c.status === "down").length;
  const degradedCount = Object.values(checks).filter(c => c.status === "degraded").length;
  const overall: CheckStatus = downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "ok";
  const httpCode = overall === "down" ? 503 : 200;
  res.status(httpCode).json({
    status: overall,
    version: VERSION,
    uptime,
    checks,
    timestamp: new Date().toISOString(),
  });
});

router.get("/healthz/internal", async (req: Request, res: Response) => {
  const role = (req.session as any)?.user?.role;
  if (role !== "super_admin") {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Yalnızca süper admin" } });
  }
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const [dbR, storageR, smtpR] = await Promise.all([checkDb(), checkObjectStorage(), checkOutboundMail()]);
  const checks = { db: dbR, objectStorage: storageR, smtp: smtpR };
  const downCount = Object.values(checks).filter(c => c.status === "down").length;
  const degradedCount = Object.values(checks).filter(c => c.status === "degraded").length;
  const overall: CheckStatus = downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "ok";
  res.json({
    status: overall,
    version: VERSION,
    uptime,
    checks,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
});

export default router;
