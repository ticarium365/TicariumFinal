// Çoklu Para Birimi: USD, EUR vb. → TRY kuru yönetimi
import { Router, type Request, type Response } from "express";
import { db, currencyRatesTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

const SUPPORTED = ["USD", "EUR", "GBP", "CHF", "JPY"];

// En son kurları getir (her currency için en yenisi)
router.get("/rates", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const rows = await db.select().from(currencyRatesTable)
    .where(eq(currencyRatesTable.companyId, cid))
    .orderBy(desc(currencyRatesTable.asOf))
    .limit(500);
  // Group by currency keep first (newest)
  const latest: Record<string, any> = {};
  for (const r of rows) if (!latest[r.currency]) latest[r.currency] = r;
  res.json({ supported: SUPPORTED, latest, history: rows });
});

router.post("/rates", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const { currency, rate, source } = req.body || {};
  if (!currency || !rate) return res.status(400).json({ error: "currency & rate zorunlu" });
  const cu = String(currency).toUpperCase();
  if (!SUPPORTED.includes(cu)) return res.status(400).json({ error: `desteklenmeyen para birimi: ${cu}` });
  const r = Number(rate);
  if (!isFinite(r) || r <= 0) return res.status(400).json({ error: "rate > 0 olmalı" });
  const [created] = await db.insert(currencyRatesTable).values({
    companyId: cid, currency: cu, rate: r,
    source: source || "manual",
    createdBy: req.session.user!.id,
  }).returning();
  res.status(201).json(created);
});

// TRY ↔ döviz çevirici (frontend için pratik endpoint)
router.get("/convert", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const amount = Number(req.query.amount);
  const from = String(req.query.from || "TRY").toUpperCase();
  const to = String(req.query.to || "TRY").toUpperCase();
  if (!isFinite(amount)) return res.status(400).json({ error: "amount sayı olmalı" });
  if (from === to) return res.json({ amount, from, to, result: amount, rate: 1 });

  async function getRate(cu: string): Promise<number> {
    if (cu === "TRY") return 1;
    const [row] = await db.select().from(currencyRatesTable)
      .where(and(eq(currencyRatesTable.companyId, cid), eq(currencyRatesTable.currency, cu)))
      .orderBy(desc(currencyRatesTable.asOf)).limit(1);
    if (!row) throw new Error(`rate_not_found:${cu}`);
    return row.rate;
  }
  try {
    const fromRate = await getRate(from);
    const toRate = await getRate(to);
    // amount in TRY = amount * fromRate. Then divide by toRate.
    const tryAmount = amount * fromRate;
    const result = tryAmount / toRate;
    res.json({ amount, from, to, result, rate: fromRate / toRate });
  } catch (e: any) {
    res.status(404).json({ error: String(e.message) });
  }
});

export default router;
