/**
 * 2026 Türkiye SGK & gelir vergisi hesaplayıcı.
 *
 * Brüt → Net (forward) ve Net → Brüt (reverse, ikili arama).
 * Yıllık kümülatif matrah desteği — yıl içinde dilim atlama hesaba katılır.
 *
 * Kullanıcı formülü (referans):
 *   SGK İşçi Payı       = Brüt × 0.14
 *   İşsizlik İşçi Payı  = Brüt × 0.01
 *   Gelir Matrahı       = Brüt − (SGK + İşsizlik)
 *   Gelir Vergisi       = (Matrah × Dilim%) − Asgari Ücret Vergi İstisnası
 *   Damga Vergisi       = (Brüt × 0.00759) − Asgari Ücret Damga İstisnası
 *   Net                 = Brüt − SGK − İşsizlik − Gelir Vergisi − Damga
 *
 * İşveren maliyeti ek olarak:
 *   SGK İşveren         = Brüt × 0.155 (5 puan teşvikli; ham %20.5)
 *   İşsizlik İşveren    = Brüt × 0.02
 *   Kısa Vade Sigortası = Brüt × 0.0225 (sektörel ortalama)
 */

export type SgkBracket = { upTo: number | null; rate: number };
export type SgkConfig = {
  minWageGross: number;
  incomeTaxExemption: number;
  stampDutyExemption: number;
  /**
   * Yıllık kümülatif gelir vergisi dilimleri.
   * Son dilimin `upTo` değeri `null` olmalıdır (üst sınır yok).
   * Hesap motoru `null`'u +∞ olarak değerlendirir.
   * (JSON `Infinity`'yi `null` olarak serialize ettiği için sentinel
   * değer olarak `null` kullanıyoruz — aksi takdirde DB'ye yazıldığında
   * üst dilim sessizce kaybolur.)
   */
  brackets: SgkBracket[];
  sgkEmployeeRate: number;
  unemploymentEmployeeRate: number;
  sgkEmployerRate: number;
  unemploymentEmployerRate: number;
  shortTermInsuranceRate: number;
  stampDutyRate: number;
};

// 2026 varsayılanları (Aralık 2025 itibariyle açıklanan değerler).
// Asgari ücret ve istisnalar resmi açıklama ile güncellendiğinde
// Genel Ayarlar > Hesaplama Parametreleri sekmesinden değiştirilir.
export const DEFAULT_SGK_CONFIG_2026: SgkConfig = {
  minWageGross: 26005.50,            // tahmini 2026 brüt asgari ücret (override edilebilir)
  incomeTaxExemption: 3315.70,       // aylık asgari ücret gelir vergisi istisnası
  stampDutyExemption: 197.38,        // aylık asgari ücret damga vergisi istisnası
  brackets: [
    { upTo: 158000,  rate: 0.15 },   // YILLIK kümülatif matrah dilimleri
    { upTo: 330000,  rate: 0.20 },
    { upTo: 1200000, rate: 0.27 },
    { upTo: 4300000, rate: 0.35 },
    { upTo: null,    rate: 0.40 },   // null = +∞ (üst dilim)
  ],
  sgkEmployeeRate: 0.14,
  unemploymentEmployeeRate: 0.01,
  sgkEmployerRate: 0.155,            // 5 puan indirimli (genel teşvik)
  unemploymentEmployerRate: 0.02,
  shortTermInsuranceRate: 0.0225,
  stampDutyRate: 0.00759,
};

export type PayrollCalcInput = {
  gross: number;                       // aylık brüt
  cumulativeBaseBeforeThisMonth?: number; // o ay öncesi yıllık kümülatif matrah
  config?: Partial<SgkConfig>;
};

export type PayrollCalcResult = {
  gross: number;
  sgkEmployee: number;
  unemploymentEmployee: number;
  incomeTaxBase: number;
  incomeTaxGross: number;            // istisna düşülmeden önce
  incomeTaxExemption: number;
  incomeTax: number;                 // ödenecek (istisna sonrası, ≥0)
  stampDutyGross: number;
  stampDutyExemption: number;
  stampDuty: number;                 // ≥0
  net: number;
  // İşveren tarafı
  sgkEmployer: number;
  unemploymentEmployer: number;
  shortTermInsurance: number;
  employerCost: number;              // brüt + işveren payları
  // Diagnostic
  bracketBreakdown: { from: number; to: number; rate: number; tax: number }[];
};

/**
 * Persisted/incoming bracket'leri matematik için normalize eder:
 *   - `null`, `undefined`, `Infinity`, NaN, < 0 değerleri +∞ olarak yorumlar.
 *   - Sıralar (artan upTo).
 *   - Son dilim üst sınırsız değilse otomatik +∞ ekler.
 */
function normalizeBracketsForMath(
  raw: SgkBracket[] | undefined,
): { upTo: number; rate: number }[] {
  const src = Array.isArray(raw) && raw.length > 0
    ? raw
    : DEFAULT_SGK_CONFIG_2026.brackets;
  const cleaned = src.map((b) => {
    const u = b?.upTo;
    const upTo =
      u === null || u === undefined || !Number.isFinite(Number(u))
        ? Number.POSITIVE_INFINITY
        : Number(u);
    const rate = Math.max(0, Number(b?.rate) || 0);
    return { upTo, rate };
  });
  // upTo'ya göre sırala (Infinity en sonda kalsın)
  cleaned.sort((a, b) => a.upTo - b.upTo);
  // Son dilim sonsuz değilse, son rate ile sonsuz dilim ekle
  if (cleaned.length === 0 || Number.isFinite(cleaned[cleaned.length - 1].upTo)) {
    cleaned.push({
      upTo: Number.POSITIVE_INFINITY,
      rate: cleaned[cleaned.length - 1]?.rate ?? 0.4,
    });
  }
  return cleaned;
}

/**
 * Math/normalized brackets'ı API'den dönerken JSON-güvenli forma çevirir
 * (Infinity → null).
 */
export function serializeSgkConfig(cfg: SgkConfig): SgkConfig {
  return {
    ...cfg,
    brackets: normalizeBracketsForMath(cfg.brackets).map((b) => ({
      upTo: Number.isFinite(b.upTo) ? b.upTo : null,
      rate: b.rate,
    })),
  };
}

function mergeConfig(c?: Partial<SgkConfig>): SgkConfig {
  const merged = { ...DEFAULT_SGK_CONFIG_2026, ...(c ?? {}) };
  // Normalize brackets ama tip uyumu için cast
  merged.brackets = normalizeBracketsForMath(merged.brackets) as unknown as SgkBracket[];
  return merged;
}

/**
 * Yıllık kümülatif matrah üzerinden bu ayın gelir vergisini hesaplar.
 * Dilim sınırları kümülatif olduğu için yıl içinde otomatik dilim atlama
 * sağlanır.
 */
function calcIncomeTaxOnBracket(
  monthlyBase: number,
  cumBefore: number,
  brackets: SgkConfig["brackets"],
): { tax: number; breakdown: PayrollCalcResult["bracketBreakdown"] } {
  let remaining = monthlyBase;
  let cum = cumBefore;
  let tax = 0;
  const breakdown: PayrollCalcResult["bracketBreakdown"] = [];

  for (const b of brackets) {
    if (remaining <= 0) break;
    const room = Math.max(0, b.upTo - cum);
    if (room <= 0) continue;
    const take = Math.min(remaining, room);
    const t = take * b.rate;
    breakdown.push({ from: cum, to: cum + take, rate: b.rate, tax: t });
    tax += t;
    cum += take;
    remaining -= take;
  }
  return { tax, breakdown };
}

export function calcPayroll(input: PayrollCalcInput): PayrollCalcResult {
  const cfg = mergeConfig(input.config);
  const gross = Math.max(0, Number(input.gross) || 0);
  const cumBefore = Math.max(0, Number(input.cumulativeBaseBeforeThisMonth) || 0);

  const sgkEmployee = round2(gross * cfg.sgkEmployeeRate);
  const unemploymentEmployee = round2(gross * cfg.unemploymentEmployeeRate);
  const incomeTaxBase = round2(gross - sgkEmployee - unemploymentEmployee);

  const { tax: incomeTaxGross, breakdown } = calcIncomeTaxOnBracket(
    incomeTaxBase, cumBefore, cfg.brackets,
  );
  const incomeTax = Math.max(0, round2(incomeTaxGross - cfg.incomeTaxExemption));

  const stampDutyGross = round2(gross * cfg.stampDutyRate);
  const stampDuty = Math.max(0, round2(stampDutyGross - cfg.stampDutyExemption));

  const net = round2(gross - sgkEmployee - unemploymentEmployee - incomeTax - stampDuty);

  const sgkEmployer = round2(gross * cfg.sgkEmployerRate);
  const unemploymentEmployer = round2(gross * cfg.unemploymentEmployerRate);
  const shortTermInsurance = round2(gross * cfg.shortTermInsuranceRate);
  const employerCost = round2(gross + sgkEmployer + unemploymentEmployer + shortTermInsurance);

  return {
    gross,
    sgkEmployee, unemploymentEmployee,
    incomeTaxBase,
    incomeTaxGross: round2(incomeTaxGross),
    incomeTaxExemption: cfg.incomeTaxExemption,
    incomeTax,
    stampDutyGross,
    stampDutyExemption: cfg.stampDutyExemption,
    stampDuty,
    net,
    sgkEmployer, unemploymentEmployer, shortTermInsurance,
    employerCost,
    bracketBreakdown: breakdown,
  };
}

/**
 * Net → Brüt ters hesap. İkili arama ile (1 kuruş hassasiyetinde).
 * 2026 vergi sistemi non-linear olduğu için (dilim atlama + istisnalar)
 * kapalı form yerine numerik çözüm kullanılır.
 */
export function calcGrossFromNet(
  targetNet: number,
  cumulativeBaseBeforeThisMonth = 0,
  config?: Partial<SgkConfig>,
): PayrollCalcResult {
  const cfg = mergeConfig(config);
  let lo = targetNet;
  let hi = targetNet * 2.5 + 50000;
  let best: PayrollCalcResult | null = null;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = calcPayroll({ gross: mid, cumulativeBaseBeforeThisMonth, config: cfg });
    if (Math.abs(r.net - targetNet) < 0.01) {
      best = r;
      break;
    }
    if (r.net < targetNet) lo = mid;
    else hi = mid;
    best = r;
  }
  return best!;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
