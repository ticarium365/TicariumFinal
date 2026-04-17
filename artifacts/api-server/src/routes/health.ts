import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const startTime = Date.now();
const VERSION = "1.0.0";

// ─── GET /healthz — temel sağlık kontrolü ────────────────────────────────────
router.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ─── GET /healthz/deep — DB bağlantısı dahil sağlık kontrolü (Sprint 27) ─────
router.get("/healthz/deep", async (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  try {
    await db.execute(sql`SELECT 1`);
    res.json({
      status: "ok",
      version: VERSION,
      uptime,
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "error",
      version: VERSION,
      uptime,
      db: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
