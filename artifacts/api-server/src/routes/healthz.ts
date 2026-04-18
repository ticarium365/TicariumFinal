import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      version: process.env.RELEASE_VERSION || "dev",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: "degraded",
      error: err?.message || "db_check_failed",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/readyz", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

export default router;
