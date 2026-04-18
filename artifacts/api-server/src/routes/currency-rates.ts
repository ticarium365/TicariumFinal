import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { db, tcmbRatesTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { fetchAndStoreTcmbRates, getLatestRate } from "../services/currency/tcmb-fetcher.js";

const router: IRouter = Router();

// Temsili kurlar — TCMB API entegre olana / DB boş olduğunda kullanılır
const FALLBACK_RATES: Record<string, { buy: number; sell: number }> = {
  USD: { buy: 38.45, sell: 38.52 },
  EUR: { buy: 41.20, sell: 41.30 },
  GBP: { buy: 48.75, sell: 48.90 },
  JPY: { buy: 0.255, sell: 0.258 },
  CHF: { buy: 43.10, sell: 43.25 },
};

router.get("/rates/latest", requireAuth, async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const out: Record<string, { buy: number; sell: number; date: string; source: string }> = {};
  for (const c of ["USD", "EUR", "GBP", "JPY"]) {
    const live = await getLatestRate(c);
    if (live) {
      out[c] = { ...live, source: "tcmb" };
    } else {
      out[c] = { ...FALLBACK_RATES[c]!, date: today, source: "temsili" };
    }
  }
  res.json({ rates: out, base: "TRY", fetchedAt: new Date().toISOString() });
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
