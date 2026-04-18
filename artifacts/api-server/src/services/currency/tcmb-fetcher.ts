import { db, tcmbRatesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const TCMB_TODAY_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

const TRACKED = ["USD", "EUR", "GBP", "CHF", "JPY"];

interface TcmbRate { code: string; buy: number; sell: number; }

async function fetchTcmbXml(): Promise<TcmbRate[]> {
  const r = await fetch(TCMB_TODAY_URL, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`TCMB HTTP ${r.status}`);
  const xml = await r.text();
  const result: TcmbRate[] = [];
  for (const code of TRACKED) {
    const re = new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?<ForexBuying>([\\d.]+)</ForexBuying>[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>`);
    const m = xml.match(re);
    if (m) {
      const buy = parseFloat(m[1]);
      const sell = parseFloat(m[2]);
      if (!isNaN(buy) && !isNaN(sell)) result.push({ code, buy, sell });
    }
  }
  return result;
}

export async function fetchAndStoreTcmbRates(): Promise<{ ok: boolean; saved: number; error?: string }> {
  try {
    const rates = await fetchTcmbXml();
    if (rates.length === 0) return { ok: false, saved: 0, error: "no_rates_parsed" };
    const today = new Date().toISOString().slice(0, 10);
    let saved = 0;
    for (const r of rates) {
      try {
        await db.insert(tcmbRatesTable).values({
          rateDate: today,
          currency: r.code,
          buyRate: r.buy.toFixed(6),
          sellRate: r.sell.toFixed(6),
          source: "tcmb",
        }).onConflictDoUpdate({
          target: [tcmbRatesTable.rateDate, tcmbRatesTable.currency, tcmbRatesTable.source],
          set: { buyRate: r.buy.toFixed(6), sellRate: r.sell.toFixed(6), fetchedAt: new Date() },
        });
        saved++;
      } catch (e) {
        logger.warn({ err: e, code: r.code }, "tcmb_rate_save_failed");
      }
    }
    logger.info({ saved }, "tcmb_rates_synced");
    return { ok: true, saved };
  } catch (err: any) {
    logger.error({ err }, "tcmb_fetch_failed");
    return { ok: false, saved: 0, error: err?.message || "fetch_failed" };
  }
}

export async function getLatestRate(currency: string): Promise<{ buy: number; sell: number; date: string } | null> {
  if (currency === "TRY") return { buy: 1, sell: 1, date: new Date().toISOString().slice(0, 10) };
  const [row] = await db.select().from(tcmbRatesTable)
    .where(and(eq(tcmbRatesTable.currency, currency), eq(tcmbRatesTable.source, "tcmb")))
    .orderBy(desc(tcmbRatesTable.rateDate))
    .limit(1);
  if (!row) return null;
  return { buy: Number(row.buyRate), sell: Number(row.sellRate), date: row.rateDate };
}
