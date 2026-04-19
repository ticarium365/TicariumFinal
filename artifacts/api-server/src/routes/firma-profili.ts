import { Router, type Request, type Response } from "express";
import { db, companySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import {
  calcPayroll, calcGrossFromNet, DEFAULT_SGK_CONFIG_2026,
  serializeSgkConfig,
  type SgkConfig,
} from "../lib/sgk-calc.js";

/**
 * Gelen sgkConfig'i doğrular & temizler.
 * - Sayısal olmayan oranlar/tutarlar reddedilir.
 * - Bracket'lar normalize edilir (üst dilim için `upTo: null` zorunlu).
 * - Negatif veya 100%'ten büyük oranlar reddedilir.
 */
function validateAndCleanSgkConfig(input: unknown): SgkConfig {
  if (!input || typeof input !== "object") {
    throw new Error("sgkConfig nesne olmalı");
  }
  const c = input as Partial<SgkConfig>;
  const numField = (v: unknown, name: string, min = 0, max = 1): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`${name} geçersiz (${min}-${max} arası bir sayı olmalı)`);
    }
    return n;
  };
  const moneyField = (v: unknown, name: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      throw new Error(`${name} geçersiz`);
    }
    return n;
  };

  if (!Array.isArray(c.brackets) || c.brackets.length === 0) {
    throw new Error("En az bir vergi dilimi gerekli");
  }
  const brackets = c.brackets.map((b: any, i: number) => {
    const u = b?.upTo;
    const upTo: number | null =
      u === null || u === undefined || u === "" ? null
        : Number.isFinite(Number(u)) ? Number(u)
        : null;
    if (upTo !== null && upTo < 0) {
      throw new Error(`Dilim ${i + 1}: upTo negatif olamaz`);
    }
    const rate = numField(b?.rate, `Dilim ${i + 1} oranı`);
    return { upTo, rate };
  });
  // Sırala — null en sona
  brackets.sort((a, b) =>
    a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo,
  );
  // Son dilim sınırsız olmalı
  if (brackets[brackets.length - 1].upTo !== null) {
    brackets[brackets.length - 1] = {
      ...brackets[brackets.length - 1],
      upTo: null,
    };
  }

  return {
    minWageGross: moneyField(c.minWageGross, "Brüt asgari ücret"),
    incomeTaxExemption: moneyField(c.incomeTaxExemption, "Gelir vergisi istisnası"),
    stampDutyExemption: moneyField(c.stampDutyExemption, "Damga vergisi istisnası"),
    brackets,
    sgkEmployeeRate: numField(c.sgkEmployeeRate, "SGK işçi oranı"),
    unemploymentEmployeeRate: numField(c.unemploymentEmployeeRate, "İşsizlik işçi oranı"),
    sgkEmployerRate: numField(c.sgkEmployerRate, "SGK işveren oranı"),
    unemploymentEmployerRate: numField(c.unemploymentEmployerRate, "İşsizlik işveren oranı"),
    shortTermInsuranceRate: numField(c.shortTermInsuranceRate, "Kısa vade sigorta oranı"),
    stampDutyRate: numField(c.stampDutyRate, "Damga vergisi oranı"),
  };
}

const router = Router();

async function getOrCreate(cid: number, companyName: string) {
  let [s] = await db
    .select()
    .from(companySettingsTable)
    .where(eq(companySettingsTable.companyId, cid));
  if (!s) {
    [s] = await db
      .insert(companySettingsTable)
      .values({ companyId: cid, companyName })
      .returning();
  }
  return s;
}

function computeMonthlyTotals(s: any) {
  const rent = Number(s.monthlyRent) || 0;
  const utilities = Number(s.monthlyUtilities) || 0;
  const meal = Number(s.monthlyMealExpense) || 0;
  const payroll = Number(s.payrollEmployerCostTotal) || 0;
  const misc = Array.isArray(s.monthlyMiscExpenses)
    ? s.monthlyMiscExpenses.reduce(
        (a: number, x: any) => a + (Number(x?.amount) || 0),
        0,
      )
    : 0;

  const totalMonthlyFixedCost = rent + utilities + meal + payroll + misc;
  const annualFixedCost = totalMonthlyFixedCost * 12;
  const workDays = (Number(s.workingDaysPerWeek) || 6) * 4.345;
  const dailyFixedCost =
    workDays > 0 ? totalMonthlyFixedCost / workDays : 0;

  const margin = Number(s.targetGrossMargin) || 0;
  // Hedef ciro = sabit gider / brüt kâr marjı
  const breakEvenMonthlyRevenue =
    margin > 0 ? totalMonthlyFixedCost / (margin / 100) : 0;
  const breakEvenDailyRevenue =
    breakEvenMonthlyRevenue && workDays > 0
      ? breakEvenMonthlyRevenue / workDays
      : 0;

  return {
    rent,
    utilities,
    meal,
    payroll,
    misc,
    totalMonthlyFixedCost: round2(totalMonthlyFixedCost),
    annualFixedCost: round2(annualFixedCost),
    dailyFixedCost: round2(dailyFixedCost),
    breakEvenMonthlyRevenue: round2(breakEvenMonthlyRevenue),
    breakEvenDailyRevenue: round2(breakEvenDailyRevenue),
    workingDaysPerMonth: round2(workDays),
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// GET /api/firma-profili — tüm profil + hesaplama özetleri
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreate(req.companyId, req.company.name);
    const sgkCfg = serializeSgkConfig(
      (s.sgkConfig as SgkConfig | null) ?? DEFAULT_SGK_CONFIG_2026,
    );
    const totals = computeMonthlyTotals(s);
    res.json({ profile: s, sgkConfig: sgkCfg, totals });
  } catch (err) {
    req.log?.error({ err }, "firma-profili GET error");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null },
    });
  }
});

// PUT /api/firma-profili — profil güncelle
router.put("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const allowed = [
      "companyName", "iban", "bankName", "accountHolder", "phone", "email",
      "address", "website", "taxNumber", "taxOffice", "legalForm", "sector",
      "yearFounded", "vatRegime", "primaryColor", "currency", "taxRate",
      "employeeCountTotal", "employeeCountFulltime", "employeeCountParttime",
      "branchCount", "workingDaysPerWeek",
      "propertyType", "monthlyRent", "rentDeposit", "rentEscalationMonth",
      "monthlyUtilities", "monthlyMealExpense", "monthlyMiscExpenses",
      "payrollLines", "payrollEmployerCostTotal",
      "monthlyAvgRevenue", "targetGrossMargin", "sgkConfig",
    ];

    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }

    // sgkConfig: doğrula & temizle (Infinity → null sentinel garantilenir)
    if (update.sgkConfig !== undefined && update.sgkConfig !== null) {
      try {
        update.sgkConfig = validateAndCleanSgkConfig(update.sgkConfig);
      } catch (e: any) {
        res.status(400).json({
          error: {
            code: "INVALID_SGK_CONFIG",
            message: e?.message ?? "SGK ayarları geçersiz",
            details: null,
          },
        });
        return;
      }
    }

    let [s] = await db
      .select()
      .from(companySettingsTable)
      .where(eq(companySettingsTable.companyId, cid));
    if (!s) {
      [s] = await db
        .insert(companySettingsTable)
        .values({
          companyId: cid,
          companyName: (update.companyName as string) ?? req.company.name,
          ...update,
        })
        .returning();
    } else {
      [s] = await db
        .update(companySettingsTable)
        .set(update)
        .where(eq(companySettingsTable.id, s.id))
        .returning();
    }

    const sgkCfg = serializeSgkConfig(
      (s.sgkConfig as SgkConfig | null) ?? DEFAULT_SGK_CONFIG_2026,
    );
    const totals = computeMonthlyTotals(s);
    res.json({ profile: s, sgkConfig: sgkCfg, totals });
  } catch (err) {
    req.log?.error({ err }, "firma-profili PUT error");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null },
    });
  }
});

// POST /api/firma-profili/sgk-hesapla
//   body: { mode: 'gross-to-net' | 'net-to-gross', amount, cumulativeBase?, config? }
router.post("/sgk-hesapla", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      mode = "gross-to-net",
      amount,
      cumulativeBase = 0,
      config,
    } = req.body ?? {};

    const cleanAmount = Number(amount);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Geçerli bir tutar giriniz", details: null },
      });
      return;
    }

    // Tenant'ın kendi sgkConfig'i varsa onu kullan, yoksa default
    let cfg: Partial<SgkConfig> | undefined = config;
    if (!cfg) {
      const [s] = await db
        .select()
        .from(companySettingsTable)
        .where(eq(companySettingsTable.companyId, req.companyId));
      if (s?.sgkConfig) cfg = s.sgkConfig as SgkConfig;
    }

    const result =
      mode === "net-to-gross"
        ? calcGrossFromNet(cleanAmount, Number(cumulativeBase) || 0, cfg)
        : calcPayroll({
            gross: cleanAmount,
            cumulativeBaseBeforeThisMonth: Number(cumulativeBase) || 0,
            config: cfg,
          });

    res.json({ mode, input: cleanAmount, result });
  } catch (err) {
    req.log?.error({ err }, "sgk-hesapla error");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null },
    });
  }
});

// GET /api/firma-profili/aylik-toplam-gider — diğer modüller için pratik özet
router.get(
  "/aylik-toplam-gider",
  requireAuth,
  async (req: Request, res: Response) => {
    const s = await getOrCreate(req.companyId, req.company.name);
    res.json(computeMonthlyTotals(s));
  },
);

export default router;
