/**
 * Founder / revenue / cash / retention / B2B “overnight backlog” özeti.
 * Heuristikler ve agregasyonlar — tahmin modelleri değildir.
 */
import {
  db,
  subscriptionPlansTable,
  subscriptionInvoicesTable,
  productFunnelEventsTable,
  companySubscriptionsTable,
  companiesTable,
  b2bQuoteRequestsTable,
} from "@workspace/db";
import { and, eq, sql, gte, lte, lt, isNotNull, desc, inArray } from "drizzle-orm";

export type FounderOvernightPackV1 = {
  planUpgradeRoiBoardV1: {
    windowDays: number;
    eventsInWindow: number;
    estimatedMrrDeltaTryFromUpgrades: number;
    byDestinationPlan: { planSlug: string; count: number; estimatedMrrDeltaTry: number }[];
    bySource: { source: string; count: number; estimatedMrrDeltaTry: number }[];
    byCompanySizeBand: { band: string; count: number }[];
  };
  revenueForecastsV1: {
    mrrBaselineTry: number;
    mrrForecast30dTry: number;
    mrrForecast90dTry: number;
    narrative: string;
  };
  collectionsBoardV2: {
    cashDueNext7dTry: number;
    cashDueNext30dTry: number;
    overduePendingTotalTry: number;
    medianDaysOverdueBeforePay90d: number | null;
    topDebtors: { companyId: number; name: string; overdueTry: number; invoiceCount: number }[];
    recoveryAfterReminder30dEvents: number;
    weeklyCollectionDigestLine: string;
  };
  retentionChurnBoardV1: {
    cancelReasons30d: { reason: string; count: number }[];
    estimatedMrrLostToChurn30dTry: number;
    dormantPayingActiveLowSales30d: { companyId: number; name: string; planSlug: string; sales30d: number }[];
    churnRiskHints: string[];
  };
  b2bOpsBoardV1: {
    pendingQuoteAgingBuckets: { bucket: string; count: number }[];
    sellerCloseRatesSample: { sellerCompanyId: number; sellerName: string; decided: number; accepted: number; closeRatePct: number }[];
    monthlyOpsDigestLine: string;
  };
  funnelHygieneV1: {
    checkoutStartedThisMonth: number;
    billingPaidThisMonth: number;
    billingErrorThisMonth: number;
    checkoutDropOffPct: number;
    funnelDelta24h: { eventKey: string; last24h: number; prev24h: number; delta: number }[];
  };
    executiveAttentionV1: {
      top10AccountsToCall: { companyId: number; name: string; tag: string; score: number }[];
      topRisksToday: string[];
      whatChangedSinceYesterday: string[];
      founderAttentionLine: string;
    };
};

/** Üst yönetim özet katmanı — tek payload’dan türetilir. */
export type FounderIntelligenceV2 = {
  dailyPriorities: string[];
  moneyDueSoonLine: string;
  moneyDueSoonTry7d: number;
  moneyDueSoonTry30d: number;
  hiddenRisks: string[];
  easiestWins: string[];
  topOpportunities: string[];
  watchlistAccounts: { companyId: number; name: string; reason: string; score0to100: number }[];
  recommendedActions: string[];
};

export type RevenueEngineBundleV1 = {
  upgradeProbabilityLeaders: {
    companyId: number;
    name: string;
    planSlug: string;
    probability0to100: number;
  }[];
  expansionCandidates: { companyId: number; name: string; reasonTag: string; priority0to100: number }[];
  pricingPathWinners: { pageOrLabel: string; paidSuccessCount30d: number; note: string }[];
  comebackWinners: { headline: string; detail: string }[];
  lostRevenueMap: { bucket: string; approxTry: number; note: string }[];
  forecast30dTry: number;
  forecast90dTry: number;
  bundleNarrative: string;
};

export type CopilotForIntelligenceV2 = {
  fastestWinToday: string;
  bestGrowthBetThisWeek: string;
  biggestRiskToday: string;
  actions: { headline: string; kind: string; roiScore: number }[];
};

export type RevenueV3ForBundle = {
  billingPaidSuccessByPage30d?: { page: string; count: number }[];
  pricingViewToPaidWithin7dCompanies30d?: number;
  graceRescueViewsBySource30d?: { source: string; count: number }[];
  graceComebackConversionPct?: number;
  trialCohortByMonth?: { monthKey: string; conversionPct: number }[];
};

export type ExpansionForBundle = {
  upgradeProbabilityTop: {
    companyId: number;
    name: string;
    planSlug: string;
    upgradeProbability0to100: number;
    upsellScore: number;
  }[];
  warmAccountsToContact: { companyId: number; name: string; reasonTag: string; priority0to100: number }[];
  planMismatchHints: string[];
};

/** Paralel okuma slot sayısı — `computeFounderOvernightPackV1` içindeki Promise.all ile uyumlu. */
export const FOUNDER_OVERNIGHT_PACK_PARALLEL_SLOTS = 14;

/** `computeB2bOpsSupplementV1` tek batch. */
export const B2B_OPS_SUPPLEMENT_QUERY_SLOTS = 1;

export type ChurnPreventionBundleV1 = {
  bundleHeadline: string;
  churnRiskMrrTry: number;
  estimatedMrrLostToChurn30dTry: number;
  cancelReasons30d: { reason: string; count: number }[];
  silentChurnWatchlist: {
    companyId: number;
    name: string;
    reason: string;
    sales30d: number;
    planSlug?: string;
  }[];
  rescueFunnelSignals: {
    recoveredAfterReminder30d: number;
    comebackPricingViews30d: number;
    comebackOfferClicks30d: number;
    churnGraceSavesThisMonth: number;
    cancelRescueViews30d: number;
    cancelConfirmed30d: number;
  };
  saveTriggers: string[];
  consolidatedPlaybook: string[];
};

export type B2bOpsSupplementV1 = {
  repeatBuyerRelationships: {
    buyerCompanyId: number;
    buyerName: string;
    sellerCompanyId: number;
    sellerName: string;
    acceptedQuotesInWindow: number;
  }[];
};

export type B2bOpsBundleV1 = {
  digestLine: string;
  pendingQuoteAgingBuckets: FounderOvernightPackV1["b2bOpsBoardV1"]["pendingQuoteAgingBuckets"];
  sellerCloseRatesSample: FounderOvernightPackV1["b2bOpsBoardV1"]["sellerCloseRatesSample"];
  sellerQuoteAcceptanceLeaders: {
    sellerCompanyId: number;
    sellerName: string;
    acceptanceRate: number;
    decidedCount: number;
    acceptedCount: number;
  }[];
  repeatBuyerRelationships: B2bOpsSupplementV1["repeatBuyerRelationships"];
  coachingHints: string[];
};

export type FounderIntelligenceV3 = {
  generatedAtIso: string;
  scoringNote: string;
  rollupLine: string;
  rankedDailyActions: {
    id: string;
    headline: string;
    kind: string;
    source: "copilot" | "exec" | "v2";
    totalScore0to100: number;
    drivers: { label: string; points: number }[];
  }[];
};

export type BillingMetricsPerformanceBundleV1 = {
  serverDurationMs: number;
  parallelSqlSlotsFounderPack: number;
  supplementalSqlSlotsB2b: number;
  clientStaleTimeSuggestionSeconds: number;
  healthNotes: string[];
};

export type DocsPlaybooksBundleV1 = {
  docIndex: { path: string; title: string; oneLiner: string }[];
  mirroredBoardPlaybooks: { title: string; steps: string[] }[];
};

export function buildFounderIntelligenceV2(input: {
  pack: FounderOvernightPackV1;
  churnRiskMrrTry: number;
  copilot: CopilotForIntelligenceV2 | null | undefined;
}): FounderIntelligenceV2 {
  const c = input.pack.collectionsBoardV2;
  const ex = input.pack.executiveAttentionV1;
  const ret = input.pack.retentionChurnBoardV1;
  const fh = input.pack.funnelHygieneV1;

  const moneyDueSoonLine =
    `Önümüzdeki 7 gün içinde vadesi gelen bekleyen faturalar ~${c.cashDueNext7dTry} TRY; `
    + `30 günlük pencerede ~${c.cashDueNext30dTry} TRY.`;

  const dailyPriorities = new Set<string>();
  if (input.copilot?.fastestWinToday) dailyPriorities.add(input.copilot.fastestWinToday);
  for (const a of ex.top10AccountsToCall.slice(0, 3)) {
    dailyPriorities.add(`Öncelikli ara: ${a.name} (${a.tag}, skor ${a.score})`);
  }
  if (c.overduePendingTotalTry > 10_000) {
    dailyPriorities.add(`Tahsilat: vadesi geçmiş toplam ~${c.overduePendingTotalTry} TRY — ilk 3 borçluyu netleştirin.`);
  }
  if (input.copilot?.bestGrowthBetThisWeek) dailyPriorities.add(input.copilot.bestGrowthBetThisWeek);

  const hiddenRisks = [
    ...ret.churnRiskHints,
    ...ex.topRisksToday,
    ...(input.churnRiskMrrTry > 12_000
      ? [`Grace / iptal hattı MRR sinyali yüksek (~${Math.round(input.churnRiskMrrTry)} TRY/ay).`]
      : []),
    ...(fh.checkoutDropOffPct >= 35 && fh.checkoutStartedThisMonth >= 4
      ? [`Checkout→ödeme düşüşü %${fh.checkoutDropOffPct} (bu ay).`]
      : []),
  ].filter(Boolean);

  const easiestWins: string[] = [];
  if (input.copilot?.fastestWinToday) easiestWins.push(input.copilot.fastestWinToday);
  if (c.recoveryAfterReminder30dEvents >= 1) {
    easiestWins.push(`Hatırlatma sonrası tahsil kanıtı: son 30g ${c.recoveryAfterReminder30dEvents} olay — benzer akışı tekrarlayın.`);
  }
  if (input.pack.planUpgradeRoiBoardV1.bySource[0]) {
    const s = input.pack.planUpgradeRoiBoardV1.bySource[0];
    easiestWins.push(`Yükseltme kaynağı lideri: ${s.source} (${s.count} olay).`);
  }

  const topOpportunities: string[] = [];
  for (const p of input.pack.planUpgradeRoiBoardV1.byDestinationPlan.slice(0, 3)) {
    if (p.estimatedMrrDeltaTry > 0) {
      topOpportunities.push(`${p.planSlug}: ~${p.estimatedMrrDeltaTry} TRY/ay tahmini MRR artışı (${p.count} yükseltme).`);
    }
  }

  const watchlistAccounts: { companyId: number; name: string; reason: string; score0to100: number }[] = [];
  const seen = new Set<number>();
  for (const d of ret.dormantPayingActiveLowSales30d.slice(0, 6)) {
    if (seen.has(d.companyId)) continue;
    seen.add(d.companyId);
    watchlistAccounts.push({
      companyId: d.companyId,
      name: d.name,
      reason: "Ödüyor, 30g satış yok (sessiz churn)",
      score0to100: 52,
    });
  }
  for (const t of c.topDebtors.slice(0, 6)) {
    if (seen.has(t.companyId)) continue;
    seen.add(t.companyId);
    const score0to100 = Math.min(100, Math.round(40 + Math.min(55, t.overdueTry / 5000)));
    watchlistAccounts.push({
      companyId: t.companyId,
      name: t.name,
      reason: "Vadesi geçmiş abonelik bakiyesi",
      score0to100,
    });
  }
  watchlistAccounts.sort((a, b) => b.score0to100 - a.score0to100);

  const recommendedActions = (input.copilot?.actions ?? [])
    .slice(0, 8)
    .map((a) => a.headline);

  return {
    dailyPriorities: [...dailyPriorities].slice(0, 7),
    moneyDueSoonLine,
    moneyDueSoonTry7d: c.cashDueNext7dTry,
    moneyDueSoonTry30d: c.cashDueNext30dTry,
    hiddenRisks: hiddenRisks.slice(0, 12),
    easiestWins: easiestWins.slice(0, 6),
    topOpportunities: topOpportunities.slice(0, 6),
    watchlistAccounts: watchlistAccounts.slice(0, 12),
    recommendedActions,
  };
}

export function buildRevenueEngineBundleV1(input: {
  pack: FounderOvernightPackV1;
  revenueV3: RevenueV3ForBundle | null | undefined;
  expansion: ExpansionForBundle | null | undefined;
}): RevenueEngineBundleV1 {
  const rf = input.pack.revenueForecastsV1;
  const roi = input.pack.planUpgradeRoiBoardV1;
  const ret = input.pack.retentionChurnBoardV1;
  const col = input.pack.collectionsBoardV2;
  const rv = input.revenueV3 ?? {};
  const ex = input.expansion;

  const upgradeProbabilityLeaders = (ex?.upgradeProbabilityTop ?? []).slice(0, 10).map((u) => ({
    companyId: u.companyId,
    name: u.name,
    planSlug: u.planSlug,
    probability0to100: u.upgradeProbability0to100,
  }));

  const expansionCandidates = ex?.warmAccountsToContact ?? [];

  const pricingPathWinners = (rv.billingPaidSuccessByPage30d ?? [])
    .slice(0, 8)
    .map((p) => ({
      pageOrLabel: p.page,
      paidSuccessCount30d: p.count,
      note: "billing_return_success (30g, props.page)",
    }));
  if ((rv.pricingViewToPaidWithin7dCompanies30d ?? 0) > 0) {
    pricingPathWinners.unshift({
      pageOrLabel: "pricing_view → 7g ödeme",
      paidSuccessCount30d: rv.pricingViewToPaidWithin7dCompanies30d ?? 0,
      note: "Aynı kiracıda pricing_view sonrası 7 gün içinde ödeme",
    });
  }

  const comebackWinners: { headline: string; detail: string }[] = [];
  if ((rv.graceComebackConversionPct ?? 0) > 0) {
    comebackWinners.push({
      headline: "Grace kurtarma dönüşümü",
      detail: `%${rv.graceComebackConversionPct} (30g, firma bazlı üst üste bindirme).`,
    });
  }
  const gsrc = rv.graceRescueViewsBySource30d?.[0];
  if (gsrc) {
    comebackWinners.push({
      headline: "Grace görüntü kaynağı lideri",
      detail: `${gsrc.source}: ${gsrc.count} görüntü`,
    });
  }
  const trialMo = rv.trialCohortByMonth?.[0];
  if (trialMo) {
    comebackWinners.push({
      headline: `Trial kohortu ${trialMo.monthKey}`,
      detail: `Aynı ay ödeme dönüşümü %${trialMo.conversionPct}.`,
    });
  }

  const lostRevenueMap: { bucket: string; approxTry: number; note: string }[] = [
    {
      bucket: "Tahmini iptal MRR (30g)",
      approxTry: ret.estimatedMrrLostToChurn30dTry,
      note: "İptal sayısı × ortalama kiracı MRR heuristiği",
    },
    {
      bucket: "Vadesi geçmiş bekleyen abonelik faturaları",
      approxTry: col.overduePendingTotalTry,
      note: "Tahsil edilmemiş, vadesi geçmiş",
    },
  ];

  const bundleNarrative =
    `MRR baseline ${rf.mrrBaselineTry} TRY; 30g/90g hedef ${rf.mrrForecast30dTry}/${rf.mrrForecast90dTry} TRY. `
    + `Yükseltme olaylarından tahmini aylık artış +${roi.estimatedMrrDeltaTryFromUpgrades} TRY. `
    + `Genişleme adayları ve sayfa kazananları aşağıda birleşik görünür.`;

  return {
    upgradeProbabilityLeaders,
    expansionCandidates,
    pricingPathWinners,
    comebackWinners,
    lostRevenueMap,
    forecast30dTry: rf.mrrForecast30dTry,
    forecast90dTry: rf.mrrForecast90dTry,
    bundleNarrative,
  };
}

export async function computeB2bOpsSupplementV1(opts: { ago90: Date }): Promise<B2bOpsSupplementV1> {
  const raw = await db.execute(sql`
    SELECT
      qr.from_company_id AS buyer_company_id,
      cb.name AS buyer_name,
      qr.to_company_id AS seller_company_id,
      cs.name AS seller_name,
      COUNT(*)::int AS n
    FROM b2b_quote_requests qr
    INNER JOIN companies cb ON cb.id = qr.from_company_id
    INNER JOIN companies cs ON cs.id = qr.to_company_id
    WHERE qr.status = 'accepted'
      AND qr.decided_at >= ${opts.ago90}
    GROUP BY qr.from_company_id, cb.name, qr.to_company_id, cs.name
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
    LIMIT 15
  `);
  const repeatBuyerRelationships = ((raw.rows ?? []) as {
    buyer_company_id: number | string;
    buyer_name: string;
    seller_company_id: number | string;
    seller_name: string;
    n: number | string;
  }[]).map((r) => ({
    buyerCompanyId: Number(r.buyer_company_id ?? 0),
    buyerName: r.buyer_name,
    sellerCompanyId: Number(r.seller_company_id ?? 0),
    sellerName: r.seller_name,
    acceptedQuotesInWindow: Number(r.n ?? 0),
  }));
  return { repeatBuyerRelationships };
}

export function buildChurnPreventionBundleV1(input: {
  pack: FounderOvernightPackV1;
  v6: {
    churnRiskMrrTry: number;
    weakEngagementTenants: { companyId: number; name: string; salesLast30d: number }[];
    reminderSignalQueue: {
      companyId: number;
      name: string;
      overdueTry: number;
      oldestDueDays: number;
      reminderLevel: string;
      pendingInvoiceCount: number;
    }[];
  };
  v7: {
    recoveredAfterReminder30d: number;
    comebackPricingViews30d: number;
    comebackOfferClicks30d: number;
    churnGraceSavesThisMonth: number;
  };
  v5Operating: {
    cancelRescueViews30d: number;
    cancelConfirmed30d: number;
  };
}): ChurnPreventionBundleV1 {
  const ret = input.pack.retentionChurnBoardV1;
  const silentMap = new Map<number, { companyId: number; name: string; reason: string; sales30d: number; planSlug?: string }>();

  for (const d of ret.dormantPayingActiveLowSales30d) {
    silentMap.set(d.companyId, {
      companyId: d.companyId,
      name: d.name,
      reason: "Ödüyor, 30g satış yok (sessiz churn)",
      sales30d: d.sales30d,
      planSlug: d.planSlug,
    });
  }
  for (const w of input.v6.weakEngagementTenants) {
    if (silentMap.has(w.companyId)) continue;
    silentMap.set(w.companyId, {
      companyId: w.companyId,
      name: w.name,
      reason: "Düşük etkileşim (30g satış)",
      sales30d: w.salesLast30d,
    });
  }

  const saveTriggers: string[] = [];
  if (ret.estimatedMrrLostToChurn30dTry >= 5_000) {
    saveTriggers.push(`Son 30g tahmini iptal MRR kaybı ~${Math.round(ret.estimatedMrrLostToChurn30dTry)} TRY — çıkış görüşmesi özetlerini tarayın.`);
  }
  if (input.v6.churnRiskMrrTry >= 8_000) {
    saveTriggers.push(`Grace / risk hattı MRR sinyali ~${Math.round(input.v6.churnRiskMrrTry)} TRY/ay — kurtarma tekliflerini hizalayın.`);
  }
  if (input.v7.comebackPricingViews30d >= 3 && input.v7.comebackOfferClicks30d === 0) {
    saveTriggers.push("İptal sonrası fiyat sayfası görüntüsü var ama rescue tıklaması yok — CTA ve kopyayı sadeleştirin.");
  }
  if (input.v7.recoveredAfterReminder30d >= 2) {
    saveTriggers.push(`Hatırlatma sonrası tahsil kanıtı (${input.v7.recoveredAfterReminder30d} olay, 30g) — benzer segmente tekrarlayın.`);
  }
  for (const q of input.v6.reminderSignalQueue.slice(0, 3)) {
    if (q.reminderLevel === "urgent" && q.overdueTry >= 8_000) {
      saveTriggers.push(`Acil hatırlatma segmenti: ${q.name} (~${Math.round(q.overdueTry)} TRY gecikmiş).`);
    }
  }

  const consolidatedPlaybook = [
    "Sessiz churn listesindeki her hesap için: son giriş, son satış, destek talebi var mı?",
    "İptal nedeni histogramına göre ürün / fiyat / SLA aksiyonu seçin; tek owner atayın.",
    "Rescue hunisi: görüntü → tıklama → ödeme adımlarında günlük sayım; düşük adımda ince ayar.",
  ];

  const headlineParts: string[] = [];
  if (silentMap.size >= 4) headlineParts.push("sessiz churn baskısı");
  if (ret.cancelReasons30d.reduce((a, b) => a + b.count, 0) >= 4) headlineParts.push("iptal nedeni çeşitliliği");
  if (input.v5Operating.cancelRescueViews30d >= 5) headlineParts.push("iptal kurtarma trafiği");
  const bundleHeadline = headlineParts.length
    ? `Churn önleme odağı: ${headlineParts.join(", ")}.`
    : "Churn önleme: risk seviyesi nötr; izleme ve önleyici ritim yeterli.";

  return {
    bundleHeadline,
    churnRiskMrrTry: input.v6.churnRiskMrrTry,
    estimatedMrrLostToChurn30dTry: ret.estimatedMrrLostToChurn30dTry,
    cancelReasons30d: ret.cancelReasons30d,
    silentChurnWatchlist: [...silentMap.values()].slice(0, 14),
    rescueFunnelSignals: {
      recoveredAfterReminder30d: input.v7.recoveredAfterReminder30d,
      comebackPricingViews30d: input.v7.comebackPricingViews30d,
      comebackOfferClicks30d: input.v7.comebackOfferClicks30d,
      churnGraceSavesThisMonth: input.v7.churnGraceSavesThisMonth,
      cancelRescueViews30d: input.v5Operating.cancelRescueViews30d,
      cancelConfirmed30d: input.v5Operating.cancelConfirmed30d,
    },
    saveTriggers: saveTriggers.slice(0, 8),
    consolidatedPlaybook,
  };
}

export function buildB2bOpsBundleV1(input: {
  pack: FounderOvernightPackV1;
  supplement: B2bOpsSupplementV1;
  sellerQuoteAcceptance: {
    sellerCompanyId: number;
    sellerName: string;
    acceptedCount: number;
    decidedCount: number;
    acceptanceRate: number;
  }[];
}): B2bOpsBundleV1 {
  const b = input.pack.b2bOpsBoardV1;
  const coachingHints: string[] = [];
  const stuck7 = b.pendingQuoteAgingBuckets.find((x) => x.bucket === "7g+")?.count ?? 0;
  if (stuck7 >= 4) {
    coachingHints.push("7g+ bekleyen teklif birikimi: satıcı başına günlük SLA ve eskalasyon kuralı netleştirin.");
  }
  for (const s of input.sellerQuoteAcceptance) {
    if (s.decidedCount >= 5 && s.acceptanceRate < 32) {
      coachingHints.push(`Düşük kapanış: ${s.sellerName} (%${s.acceptanceRate}, ${s.decidedCount} karar) — şablon ve fiyat şeffaflığı gözden geçirilsin.`);
    }
  }
  if (input.supplement.repeatBuyerRelationships.length >= 2) {
    coachingHints.push("Tekrar alan alıcı ilişkileri: hacim anlaşması / sabit SLA ile NPS ve tekrar siparişi kilitleyin.");
  }
  if (!coachingHints.length) {
    coachingHints.push("B2B operasyon ritmi dengeli görünüyor; haftalık satıcı başına 1 kalite görüşmesi yeterli.");
  }

  const leaders = [...input.sellerQuoteAcceptance]
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
    .slice(0, 8);

  return {
    digestLine: b.monthlyOpsDigestLine,
    pendingQuoteAgingBuckets: b.pendingQuoteAgingBuckets,
    sellerCloseRatesSample: b.sellerCloseRatesSample,
    sellerQuoteAcceptanceLeaders: leaders,
    repeatBuyerRelationships: input.supplement.repeatBuyerRelationships,
    coachingHints: coachingHints.slice(0, 6),
  };
}

type ActionCandidate = {
  headline: string;
  kind: string;
  roiScore?: number;
  execScore?: number;
  source: "copilot" | "exec" | "v2";
};

function scoreDailyAction(c: ActionCandidate): { total: number; drivers: { label: string; points: number }[] } {
  const drivers: { label: string; points: number }[] = [];
  let total = 20;
  if (c.source === "copilot" && c.roiScore != null) {
    const pts = Math.round(Math.min(40, c.roiScore * 2.35));
    drivers.push({ label: "Copilot ROI skoru", points: pts });
    total += pts;
  }
  if (c.source === "exec" && c.execScore != null) {
    const pts = Math.round(Math.min(30, c.execScore * 0.32));
    drivers.push({ label: "Yürütme arama skoru", points: pts });
    total += pts;
  }
  const cashish = /tahsil|vade|fatura|nakit|borç/i.test(c.headline) || c.kind === "cash" || c.kind === "collection";
  if (cashish) {
    drivers.push({ label: "Nakit etkisi (heuristik)", points: 14 });
    total += 14;
  }
  const growish = /yükselt|paket|limit|genişle|b2b|teklif/i.test(c.headline) || c.kind === "expansion";
  if (growish) {
    drivers.push({ label: "Büyüme / genişleme", points: 10 });
    total += 10;
  }
  if (c.source === "v2") {
    drivers.push({ label: "Günlük öncelik listesi", points: 6 });
    total += 6;
  }
  total = Math.min(100, Math.round(total));
  return { total, drivers };
}

export function buildFounderIntelligenceV3(input: {
  v2: FounderIntelligenceV2;
  pack: FounderOvernightPackV1;
  copilot: CopilotForIntelligenceV2 | null | undefined;
}): FounderIntelligenceV3 {
  const candidates: ActionCandidate[] = [];
  for (const a of input.copilot?.actions ?? []) {
    candidates.push({
      headline: a.headline,
      kind: a.kind,
      roiScore: a.roiScore,
      source: "copilot",
    });
  }
  for (const x of input.pack.executiveAttentionV1.top10AccountsToCall.slice(0, 5)) {
    candidates.push({
      headline: `Önce ara: ${x.name} (${x.tag})`,
      kind: "exec_call",
      execScore: x.score,
      source: "exec",
    });
  }
  for (const p of input.v2.dailyPriorities.slice(0, 4)) {
    candidates.push({ headline: p, kind: "priority", source: "v2" });
  }

  const seen = new Set<string>();
  const deduped: ActionCandidate[] = [];
  for (const c of candidates) {
    const k = c.headline.trim().toLowerCase().slice(0, 120);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }

  const ranked = deduped.map((c, idx) => {
    const { total, drivers } = scoreDailyAction(c);
    return {
      id: `${c.source}-${idx}-${c.headline.length}`,
      headline: c.headline,
      kind: c.kind,
      source: c.source,
      totalScore0to100: total,
      drivers,
    };
  }).sort((a, b) => b.totalScore0to100 - a.totalScore0to100).slice(0, 8);

  const top = ranked[0];
  const rollupLine = top
    ? `En yüksek günlük aksiyon skoru: “${top.headline.slice(0, 120)}${top.headline.length > 120 ? "…" : ""}” (${top.totalScore0to100}/100).`
    : "Skorlanacak günlük aksiyon bulunamadı; cockpit veri akışını kontrol edin.";

  return {
    generatedAtIso: new Date().toISOString(),
    scoringNote: "Skorlar kural tabanlıdır; makine öğrenmesi veya ödeme olasılığı modeli değildir.",
    rollupLine,
    rankedDailyActions: ranked,
  };
}

export function buildDocsPlaybooksBundleV1(input: {
  mirroredBoardPlaybooks: { title: string; steps: string[] }[];
}): DocsPlaybooksBundleV1 {
  return {
    docIndex: [
      { path: "docs/playbooks/CHURN_PREVENTION.md", title: "Churn önleme", oneLiner: "Sessiz churn, iptal nedeni ve rescue hunisi ritmi." },
      { path: "docs/playbooks/B2B_OPS.md", title: "B2B operasyon", oneLiner: "SLA, tekrar alıcı ve satıcı koçluğu." },
      { path: "docs/playbooks/BILLING_METRICS.md", title: "Faturalama metrikleri", oneLiner: "Super-admin endpoint ve önbellek önerisi." },
    ],
    mirroredBoardPlaybooks: input.mirroredBoardPlaybooks.slice(0, 8),
  };
}

export function buildBillingMetricsPerformanceBundleV1(input: {
  durationMs: number;
  founderPackOk: boolean;
  b2bSupplementOk: boolean;
}): BillingMetricsPerformanceBundleV1 {
  const healthNotes: string[] = [];
  if (input.durationMs >= 7500) {
    healthNotes.push("Yanıt süresi yüksek: yoğun saatlerde DB veya N+1 sorguları gözden geçirin.");
  } else if (input.durationMs >= 3500) {
    healthNotes.push("Yanıt süresi orta: founder pack + metrik yükü birleşik; istemci önbelleğini koruyun.");
  } else {
    healthNotes.push("Yanıt süresi tipik aralıkta; tek seferde zengin payload alınıyor.");
  }
  if (!input.founderPackOk) healthNotes.push("Overnight pack üretilemedi; churn/B2B birleşik kartları kısmi olabilir.");
  if (!input.b2bSupplementOk) healthNotes.push("B2B tekrar alıcı tamamlayıcı sorgusu atlandı veya hata verdi.");

  return {
    serverDurationMs: input.durationMs,
    parallelSqlSlotsFounderPack: FOUNDER_OVERNIGHT_PACK_PARALLEL_SLOTS,
    supplementalSqlSlotsB2b: input.b2bSupplementOk ? B2B_OPS_SUPPLEMENT_QUERY_SLOTS : 0,
    clientStaleTimeSuggestionSeconds: 180,
    healthNotes,
  };
}

function safeJsonProps(raw: string | null | undefined): Record<string, unknown> {
  const s = (raw ?? "").trim();
  if (!s) return {};
  try {
    const o = JSON.parse(s) as unknown;
    return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function computeFounderOvernightPackV1(opts: {
  now: Date;
  monthStart: Date;
  ago30: Date;
  ago90: Date;
  baseMrrTry: number;
  activeTenantCount: number;
  /** Tahsilat + expansion sıralarından gelen birleşik arama listesi (caller doldurur). */
  accountsToCallSeed: { companyId: number; name: string; tag: string; score: number }[];
}): Promise<FounderOvernightPackV1> {
  const in7 = new Date(opts.now.getTime() + 7 * 86400000);
  const in30 = new Date(opts.now.getTime() + 30 * 86400000);
  const h24 = new Date(opts.now.getTime() - 24 * 3600000);
  const h48 = new Date(opts.now.getTime() - 48 * 3600000);

  const planRows = await db.select({
    slug: subscriptionPlansTable.slug,
    priceMonthly: subscriptionPlansTable.priceMonthly,
  }).from(subscriptionPlansTable);
  const planMonthly = new Map<string, number>();
  for (const p of planRows) {
    planMonthly.set(p.slug, Number(p.priceMonthly));
  }

  const [
    upgradeRows,
    sizeBandSql,
    cash7Row,
    cash30Row,
    overdueTotRow,
    medianOverduePayRow,
    debtorRows,
    recoveredRem30Row,
    cancelSql,
    dormantSql,
    bucketSql,
    sellerSql,
    funnelMoSql,
    deltaSql,
  ] = await Promise.all([
    db.select({
      props: productFunnelEventsTable.props,
      createdAt: productFunnelEventsTable.createdAt,
    })
      .from(productFunnelEventsTable)
      .where(and(
        eq(productFunnelEventsTable.eventKey, "plan_upgraded"),
        gte(productFunnelEventsTable.createdAt, opts.ago30),
      ))
      .orderBy(desc(productFunnelEventsTable.createdAt))
      .limit(600),
    db.execute(sql`
      SELECT
        CASE
          WHEN (SELECT COUNT(*)::int FROM products pr WHERE pr.company_id = pfe.company_id) >= 150 THEN '150+ ürün'
          WHEN (SELECT COUNT(*)::int FROM products pr WHERE pr.company_id = pfe.company_id) >= 40 THEN '40–149 ürün'
          WHEN (SELECT COUNT(*)::int FROM products pr WHERE pr.company_id = pfe.company_id) >= 10 THEN '10–39 ürün'
          ELSE '0–9 ürün'
        END AS band,
        count(*)::int AS c
      FROM product_funnel_events pfe
      WHERE pfe.event_key = 'plan_upgraded' AND pfe.created_at >= ${opts.ago30}
      GROUP BY 1
    `),
    db.select({
      s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
    })
      .from(subscriptionInvoicesTable)
      .where(and(
        eq(subscriptionInvoicesTable.status, "pending"),
        isNotNull(subscriptionInvoicesTable.dueDate),
        gte(subscriptionInvoicesTable.dueDate, opts.now),
        lte(subscriptionInvoicesTable.dueDate, in7),
      )),
    db.select({
      s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
    })
      .from(subscriptionInvoicesTable)
      .where(and(
        eq(subscriptionInvoicesTable.status, "pending"),
        isNotNull(subscriptionInvoicesTable.dueDate),
        gte(subscriptionInvoicesTable.dueDate, opts.now),
        lte(subscriptionInvoicesTable.dueDate, in30),
      )),
    db.select({
      s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
    })
      .from(subscriptionInvoicesTable)
      .where(and(
        eq(subscriptionInvoicesTable.status, "pending"),
        isNotNull(subscriptionInvoicesTable.dueDate),
        lt(subscriptionInvoicesTable.dueDate, opts.now),
      )),
    db.execute(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (paid_at - due_date)) / 86400.0
      )::float AS med_d
      FROM subscription_invoices
      WHERE status = 'paid'
        AND paid_at IS NOT NULL
        AND due_date IS NOT NULL
        AND due_date < paid_at
        AND paid_at >= ${opts.ago90}
    `),
    db
      .select({
        companyId: subscriptionInvoicesTable.companyId,
        overdueAmount: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
        invoiceCount: sql<number>`count(*)::int`,
      })
      .from(subscriptionInvoicesTable)
      .where(and(
        eq(subscriptionInvoicesTable.status, "pending"),
        isNotNull(subscriptionInvoicesTable.dueDate),
        lte(subscriptionInvoicesTable.dueDate, opts.now),
      ))
      .groupBy(subscriptionInvoicesTable.companyId)
      .orderBy(desc(sql`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`))
      .limit(10),
    db.select({ c: sql<number>`count(*)::int` }).from(productFunnelEventsTable).where(and(
      eq(productFunnelEventsTable.eventKey, "overdue_invoice_recovered_after_reminder"),
      gte(productFunnelEventsTable.createdAt, opts.ago30),
    )),
    db.execute(sql`
      SELECT coalesce(nullif(trim(cancel_reason), ''), 'unknown') AS reason, count(*)::int AS c
      FROM company_subscriptions
      WHERE status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancelled_at >= ${opts.ago30}
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 12
    `),
    db.execute(sql`
      SELECT c.id AS company_id, c.name, sp.slug AS plan_slug,
        (SELECT COUNT(*)::int FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${opts.ago30}) AS sales_30d
      FROM companies c
      INNER JOIN company_subscriptions cs ON cs.company_id = c.id AND cs.status = 'active'
      INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
      WHERE c.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${opts.ago30}
        )
      ORDER BY c.id DESC
      LIMIT 12
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE created_at >= ${opts.now}::timestamptz - interval '1 day')::int AS b0_1,
        count(*) FILTER (WHERE created_at < ${opts.now}::timestamptz - interval '1 day'
          AND created_at >= ${opts.now}::timestamptz - interval '3 days')::int AS b1_3,
        count(*) FILTER (WHERE created_at < ${opts.now}::timestamptz - interval '3 days'
          AND created_at >= ${opts.now}::timestamptz - interval '7 days')::int AS b3_7,
        count(*) FILTER (WHERE created_at < ${opts.now}::timestamptz - interval '7 days')::int AS b7p
      FROM b2b_quote_requests
      WHERE status = 'pending'
    `),
    db.execute(sql`
      SELECT qr.to_company_id AS seller_company_id, c.name AS seller_name,
        count(*)::int AS decided_n,
        count(*) FILTER (WHERE qr.status = 'accepted')::int AS accepted_n
      FROM b2b_quote_requests qr
      INNER JOIN companies c ON c.id = qr.to_company_id
      WHERE qr.decided_at >= ${opts.ago90}
        AND qr.status IN ('accepted', 'rejected')
      GROUP BY qr.to_company_id, c.name
      HAVING count(*) >= 3
      ORDER BY (count(*) FILTER (WHERE qr.status = 'accepted'))::float / nullif(count(*)::float, 0) ASC NULLS LAST
      LIMIT 8
    `),
    db.execute(sql`
      SELECT event_key, count(*)::int AS c
      FROM product_funnel_events
      WHERE created_at >= ${opts.monthStart}
        AND event_key IN ('billing_checkout_started', 'billing_return_success', 'billing_return_error')
      GROUP BY event_key
    `),
    db.execute(sql`
      SELECT event_key,
        count(*) FILTER (WHERE created_at >= ${h24})::int AS last24,
        count(*) FILTER (WHERE created_at >= ${h48} AND created_at < ${h24})::int AS prev24
      FROM product_funnel_events
      WHERE created_at >= ${h48}
        AND event_key IN (
          'plan_upgraded',
          'billing_return_success',
          'billing_checkout_started',
          'grace_period_reactivate_success',
          'subscription_cancel_confirmed'
        )
      GROUP BY event_key
    `),
  ]);

  const byDest = new Map<string, { count: number; mrr: number }>();
  const bySrc = new Map<string, { count: number; mrr: number }>();
  let mrrDeltaSum = 0;
  for (const row of upgradeRows) {
    const p = safeJsonProps(row.props);
    const newSlug = String(p.new_plan_slug ?? "unknown");
    const prevSlug = p.prev_plan_slug != null && String(p.prev_plan_slug).trim() !== ""
      ? String(p.prev_plan_slug)
      : "";
    const newM = planMonthly.get(newSlug) ?? 0;
    const oldM = prevSlug ? (planMonthly.get(prevSlug) ?? 0) : 0;
    const d = Math.max(0, newM - oldM);
    mrrDeltaSum += d;
    const de = byDest.get(newSlug) ?? { count: 0, mrr: 0 };
    de.count++;
    de.mrr += d;
    byDest.set(newSlug, de);
    const src = String(p.source ?? "unknown");
    const se = bySrc.get(src) ?? { count: 0, mrr: 0 };
    se.count++;
    se.mrr += d;
    bySrc.set(src, se);
  }

  const byDestinationPlan = [...byDest.entries()]
    .map(([planSlug, v]) => ({ planSlug, count: v.count, estimatedMrrDeltaTry: Math.round(v.mrr) }))
    .sort((a, b) => b.estimatedMrrDeltaTry - a.estimatedMrrDeltaTry)
    .slice(0, 10);

  const bySource = [...bySrc.entries()]
    .map(([source, v]) => ({ source, count: v.count, estimatedMrrDeltaTry: Math.round(v.mrr) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const sizeRows = (sizeBandSql.rows ?? []) as { band: string; c: number | string }[];
  const byCompanySizeBand = sizeRows.map((r) => ({
    band: r.band || "?",
    count: Number(r.c ?? 0),
  }));

  const trendBoost = mrrDeltaSum > 0 ? Math.min(0.08, mrrDeltaSum / Math.max(1, opts.baseMrrTry) * 0.25) : 0;
  const mrrForecast30dTry = Math.round(opts.baseMrrTry * (1 + trendBoost));
  const mrrForecast90dTry = Math.round(opts.baseMrrTry * (1 + Math.min(0.2, trendBoost * 3)));

  const medRow = (medianOverduePayRow.rows?.[0] ?? {}) as { med_d?: number | string | null };
  const medianDaysOverdueBeforePay90d = medRow.med_d != null && Number.isFinite(Number(medRow.med_d))
    ? Math.round(Number(medRow.med_d) * 10) / 10
    : null;

  const debtorIds = debtorRows.map((r) => r.companyId);
  const debtorNames = debtorIds.length
    ? await db.select({ id: companiesTable.id, name: companiesTable.name })
      .from(companiesTable)
      .where(inArray(companiesTable.id, debtorIds))
    : [];
  const nameById = new Map(debtorNames.map((r) => [r.id, r.name]));
  const topDebtors = debtorRows.map((r) => ({
    companyId: r.companyId,
    name: nameById.get(r.companyId) ?? `#${r.companyId}`,
    overdueTry: Math.round(Number(r.overdueAmount ?? 0)),
    invoiceCount: Number(r.invoiceCount ?? 0),
  }));

  const cashDueNext7dTry = Math.round(Number(cash7Row[0]?.s ?? 0));
  const cashDueNext30dTry = Math.round(Number(cash30Row[0]?.s ?? 0));
  const overduePendingTotalTry = Math.round(Number(overdueTotRow[0]?.s ?? 0));
  const recoveryAfterReminder30dEvents = Number(recoveredRem30Row[0]?.c ?? 0);

  const weeklyCollectionDigestLine =
    `Vadesi geçmiş bekleyen toplam ~${overduePendingTotalTry} TRY; önümüzdeki 7g vadesi gelen ~${cashDueNext7dTry} TRY; `
    + `30g hatırlatma sonrası tahsil olayı: ${recoveryAfterReminder30dEvents}. `
    + (medianDaysOverdueBeforePay90d != null
      ? `Ödendiğinde vade üstü bekleme medyanı (90g): ${medianDaysOverdueBeforePay90d} gün.`
      : "");

  const cancelRows = (cancelSql.rows ?? []) as { reason: string; c: number | string }[];
  const cancelReasons30d = cancelRows.map((r) => ({
    reason: r.reason || "unknown",
    count: Number(r.c ?? 0),
  }));
  const churnN = cancelReasons30d.reduce((a, x) => a + x.count, 0);
  const avgMrrPerActive = opts.baseMrrTry / Math.max(1, opts.activeTenantCount);
  const estimatedMrrLostToChurn30dTry = Math.round(churnN * avgMrrPerActive * 0.55);

  const dormRows = (dormantSql.rows ?? []) as {
    company_id: number;
    name: string;
    plan_slug: string;
    sales_30d: number | string;
  }[];
  const dormantPayingActiveLowSales30d = dormRows.map((r) => ({
    companyId: Number(r.company_id),
    name: r.name,
    planSlug: r.plan_slug,
    sales30d: Number(r.sales_30d ?? 0),
  }));

  const churnRiskHints: string[] = [];
  if (dormantPayingActiveLowSales30d.length >= 4) {
    churnRiskHints.push("Ödüyor ama 30g satış yapmayan kiracı sayısı yükseldi; sessiz churn riski.");
  }
  if (churnN >= 5) churnRiskHints.push("Son 30g iptal sayısı gözle görülür; çıkış görüşmesi özetlerini tarayın.");

  const br = (bucketSql.rows?.[0] ?? {}) as Record<string, number | string | undefined>;
  const pendingQuoteAgingBuckets = [
    { bucket: "0–1g", count: Number(br.b0_1 ?? 0) },
    { bucket: "1–3g", count: Number(br.b1_3 ?? 0) },
    { bucket: "3–7g", count: Number(br.b3_7 ?? 0) },
    { bucket: "7g+", count: Number(br.b7p ?? 0) },
  ];

  const sRows = (sellerSql.rows ?? []) as {
    seller_company_id: number;
    seller_name: string;
    decided_n: number | string;
    accepted_n: number | string;
  }[];
  const sellerCloseRatesSample = sRows.map((r) => {
    const decided = Number(r.decided_n ?? 0);
    const accepted = Number(r.accepted_n ?? 0);
    const closeRatePct = decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0;
    return {
      sellerCompanyId: Number(r.seller_company_id),
      sellerName: r.seller_name,
      decided,
      accepted,
      closeRatePct,
    };
  });

  const pendingTotal = pendingQuoteAgingBuckets.reduce((a, b) => a + b.count, 0);
  const monthlyOpsDigestLine =
    `Bekleyen B2B teklif: ${pendingTotal} adet; 7g+ bekleyen kova: ${pendingQuoteAgingBuckets[3]?.count ?? 0}. `
    + `Düşük kapanış örnekli satıcı sayısı (90g, örnek): ${sellerCloseRatesSample.length}.`;

  const fm = new Map<string, number>();
  for (const row of (funnelMoSql.rows ?? []) as { event_key: string; c: number | string }[]) {
    fm.set(row.event_key, Number(row.c ?? 0));
  }
  const checkoutStartedThisMonth = fm.get("billing_checkout_started") ?? 0;
  const billingPaidThisMonth = fm.get("billing_return_success") ?? 0;
  const billingErrorThisMonth = fm.get("billing_return_error") ?? 0;
  const checkoutDropOffPct = checkoutStartedThisMonth > 0
    ? Math.round((1 - billingPaidThisMonth / checkoutStartedThisMonth) * 1000) / 10
    : 0;

  const funnelDelta24h = ((deltaSql.rows ?? []) as { event_key: string; last24: number | string; prev24: number | string }[])
    .map((r) => {
      const last24h = Number(r.last24 ?? 0);
      const prev24h = Number(r.prev24 ?? 0);
      return {
        eventKey: r.event_key,
        last24h,
        prev24h,
        delta: last24h - prev24h,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const callMap = new Map<number, { companyId: number; name: string; tag: string; score: number }>();
  for (const x of opts.accountsToCallSeed) {
    const prev = callMap.get(x.companyId);
    if (!prev || x.score > prev.score) callMap.set(x.companyId, x);
  }
  const top10AccountsToCall = [...callMap.values()].sort((a, b) => b.score - a.score).slice(0, 10);

  const topRisksToday: string[] = [];
  if (overduePendingTotalTry > 50_000) topRisksToday.push(`Yüksek vadesi geçmiş abonelik bakiyesi (~${overduePendingTotalTry} TRY)`);
  if (pendingQuoteAgingBuckets[3]?.count >= 5) topRisksToday.push("7g+ bekleyen B2B teklif birikimi");
  if (billingErrorThisMonth >= Math.max(3, checkoutStartedThisMonth * 0.15)) {
    topRisksToday.push("Ödeme dönüş hatası oranı yüksek (checkout hunisi)");
  }

  const whatChangedSinceYesterday: string[] = [];
  for (const d of funnelDelta24h.slice(0, 5)) {
    if (d.delta === 0) continue;
    whatChangedSinceYesterday.push(`${d.eventKey}: son 24s ${d.last24h}, önceki 24s ${d.prev24h} (${d.delta >= 0 ? "+" : ""}${d.delta})`);
  }
  if (!whatChangedSinceYesterday.length) {
    whatChangedSinceYesterday.push("Son 24 saatte öne çıkan huni değişimi yok (seçili olaylar).");
  }

  const founderAttentionLine = [
    top10AccountsToCall[0] ? `Önce ara: ${top10AccountsToCall[0].name} (${top10AccountsToCall[0].tag})` : "",
    topRisksToday[0] ?? "",
    mrrDeltaSum > 0 ? `Yükseltmelerden tahmini MRR artışı (30g olayları): +${Math.round(mrrDeltaSum)} TRY/ay (heuristik).` : "",
  ].filter(Boolean).join(" · ");

  return {
    planUpgradeRoiBoardV1: {
      windowDays: 30,
      eventsInWindow: upgradeRows.length,
      estimatedMrrDeltaTryFromUpgrades: Math.round(mrrDeltaSum),
      byDestinationPlan,
      bySource,
      byCompanySizeBand,
    },
    revenueForecastsV1: {
      mrrBaselineTry: Math.round(opts.baseMrrTry),
      mrrForecast30dTry,
      mrrForecast90dTry,
      narrative:
        `Baseline MRR ${Math.round(opts.baseMrrTry)} TRY; 30g/90g projeksiyonlar yükseltme ivmesine göre basit ölçek (gerçek tahmin değil).`,
    },
    collectionsBoardV2: {
      cashDueNext7dTry,
      cashDueNext30dTry,
      overduePendingTotalTry,
      medianDaysOverdueBeforePay90d,
      topDebtors,
      recoveryAfterReminder30dEvents,
      weeklyCollectionDigestLine,
    },
    retentionChurnBoardV1: {
      cancelReasons30d,
      estimatedMrrLostToChurn30dTry,
      dormantPayingActiveLowSales30d,
      churnRiskHints,
    },
    b2bOpsBoardV1: {
      pendingQuoteAgingBuckets,
      sellerCloseRatesSample,
      monthlyOpsDigestLine,
    },
    funnelHygieneV1: {
      checkoutStartedThisMonth,
      billingPaidThisMonth,
      billingErrorThisMonth,
      checkoutDropOffPct,
      funnelDelta24h,
    },
    executiveAttentionV1: {
      top10AccountsToCall,
      topRisksToday,
      whatChangedSinceYesterday,
      founderAttentionLine: founderAttentionLine || "Veri nötr; cockpit önerilerini izleyin.",
    },
  };
}
