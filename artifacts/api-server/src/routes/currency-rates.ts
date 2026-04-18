import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { db, tcmbRatesTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { fetchAndStoreTcmbRates, getLatestRate } from "../services/currency/tcmb-fetcher.js";

const router: IRouter = Router();

router.get("/rates/latest", requireAuth, async (_req, res) => {
  const out: Record<string, { buy: number; sell: number; date: string } | null> = {};
  for (const c of ["USD", "EUR", "GBP", "CHF"]) {
    out[c] = await getLatestRate(c);
  }
  res.json({ rates: out, base: "TRY" });
});

router.get("/rates/history", requireAuth, async (req: Request, res: Response) => {
  const currency = String(req.query.currency || "USD").toUpperCase();
  const days = Math.min(365, Number(req.query.days || 30));
  const rows = await db.select().from(tcmbRatesTable)
    .where(and(eq(tcmbRatesTable.currency, currency), eq(tcmbRatesTable.source, "tcmb")))
    .orderBy(desc(tcmbRatesTable.rateDate))
    .limit(days);
  res.json({ currency, history: rows });
});

router.post("/rates/sync", requireAuth, async (_req, res) => {
  const result = await fetchAndStoreTcmbRates();
  res.json(result);
});

export default router;
