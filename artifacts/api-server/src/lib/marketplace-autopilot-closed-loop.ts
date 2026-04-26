/**
 * Marketplace closed-loop autopilot — ranking & learning signals only (no auto-apply).
 * Korelasyonel ROI + tenant davranışı; sıralama ve açıklamalar; tercihler geri alınabilir.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  companySettingsTable,
  db,
  marketplaceAutopilotActionLogsTable,
  productChannelMappingsTable,
} from "@workspace/db";
import { buildMarketplaceProfitAutomationV1 } from "./marketplace-profit-automation.js";
import {
  buildNextBestAutopilotActionV1,
  buildTenantAutopilotRoiSummaryV1,
} from "./marketplace-autopilot-roi.js";

const PREFS_VERSION = 1;
const ALLOWED_ACTION_TYPES = new Set([
  "repricing_apply",
  "margin_recovery_apply",
  "low_stock_override_apply",
  "stale_resync_enqueue",
  "pause_high_return_listing",
]);

export type AutopilotClosedLoopPrefsV1 = {
  version: typeof PREFS_VERSION;
  promotedActionTypes: string[];
  suppressedActionTypes: string[];
  updatedAtIso?: string;
  updatedByUserId?: number;
};

export type ClosedLoopFatigueLevel = "none" | "moderate" | "high";

export type RankedClosedLoopRecommendationV1 = {
  rank: number;
  actionType: string;
  mappingId: number | null;
  productId: number | null;
  productName: string;
  accountLabel: string;
  /** 0–1; düşük = daha az kanıt veya yorgunluk / gürültü */
  confidenceScore: number;
  confidenceNote: string;
  /** Operatör için kısa gerekçe */
  whySuggestedNow: string;
  /** İç sıralama skoru (şeffaflık); birim yok */
  rankingScore: number;
  roiBoostNote: string | null;
  fatigue: { level: ClosedLoopFatigueLevel; applies14d: number; note: string };
  suppressedByNoisyPolicy: boolean;
  userSuppressed: boolean;
  /** Önizleme → uygula ipuçları (API seviyesinde) */
  previewApplyHint: string | null;
  profitHint: string | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export async function checkMarketplaceAutopilotClosedLoopMigration008Ready(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const r = await db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'company_settings'
        AND column_name = 'autopilot_closed_loop'
    `);
    const c = Number((r as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);
    if (c < 1) {
      return { ok: false, detail: "autopilot_closed_loop kolonu yok — migration 008 uygulanmalı." };
    }
    return { ok: true, detail: "Closed-loop tercih kolonu hazır." };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "schema_check_failed" };
  }
}

function parsePrefs(raw: Record<string, unknown> | null | undefined): AutopilotClosedLoopPrefsV1 {
  const promoted = Array.isArray(raw?.promotedActionTypes)
    ? (raw!.promotedActionTypes as unknown[]).map((x) => String(x)).filter((x) => ALLOWED_ACTION_TYPES.has(x))
    : [];
  const suppressed = Array.isArray(raw?.suppressedActionTypes)
    ? (raw!.suppressedActionTypes as unknown[]).map((x) => String(x)).filter((x) => ALLOWED_ACTION_TYPES.has(x))
    : [];
  return {
    version: PREFS_VERSION,
    promotedActionTypes: [...new Set(promoted)],
    suppressedActionTypes: [...new Set(suppressed)],
    updatedAtIso: typeof raw?.updatedAtIso === "string" ? raw.updatedAtIso : undefined,
    updatedByUserId: typeof raw?.updatedByUserId === "number" && Number.isFinite(raw.updatedByUserId)
      ? raw.updatedByUserId
      : undefined,
  };
}

async function getOrCreateCompanySettingsRow(companyId: number): Promise<typeof companySettingsTable.$inferSelect> {
  let [s] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, companyId));
  if (!s) {
    [s] = await db.insert(companySettingsTable).values({ companyId, companyName: "" }).returning();
  }
  return s!;
}

export async function loadAutopilotClosedLoopPreferences(
  companyId: number,
): Promise<{ prefs: AutopilotClosedLoopPrefsV1; migration008Ready: boolean }> {
  const mig = await checkMarketplaceAutopilotClosedLoopMigration008Ready();
  if (!mig.ok) {
    return { prefs: parsePrefs({}), migration008Ready: false };
  }
  const [row] = await db
    .select({ autopilotClosedLoop: companySettingsTable.autopilotClosedLoop })
    .from(companySettingsTable)
    .where(eq(companySettingsTable.companyId, companyId));
  return {
    prefs: parsePrefs((row?.autopilotClosedLoop as Record<string, unknown>) ?? {}),
    migration008Ready: true,
  };
}

export async function saveAutopilotClosedLoopPreferences(
  companyId: number,
  userId: number,
  next: { promotedActionTypes?: string[]; suppressedActionTypes?: string[] },
): Promise<AutopilotClosedLoopPrefsV1> {
  const mig = await checkMarketplaceAutopilotClosedLoopMigration008Ready();
  if (!mig.ok) {
    const e: any = new Error("closed_loop_prefs_schema_missing");
    e.code = "CLOSED_LOOP_SCHEMA_MISSING";
    throw e;
  }
  const row = await getOrCreateCompanySettingsRow(companyId);
  const cur = parsePrefs((row.autopilotClosedLoop as Record<string, unknown>) ?? {});
  const promoted = (next.promotedActionTypes ?? cur.promotedActionTypes)
    .map((x) => String(x))
    .filter((x) => ALLOWED_ACTION_TYPES.has(x));
  const suppressed = (next.suppressedActionTypes ?? cur.suppressedActionTypes)
    .map((x) => String(x))
    .filter((x) => ALLOWED_ACTION_TYPES.has(x));
  const merged: AutopilotClosedLoopPrefsV1 = {
    version: PREFS_VERSION,
    promotedActionTypes: [...new Set(promoted)],
    suppressedActionTypes: [...new Set(suppressed)],
    updatedAtIso: new Date().toISOString(),
    updatedByUserId: userId,
  };
  await db.update(companySettingsTable).set({
    autopilotClosedLoop: merged as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  }).where(eq(companySettingsTable.id, row.id));
  return merged;
}

type Applies14Row = { action_type: string; c: number };
type Wins90Row = { action_type: string; wins: number; evaluated: number };

async function loadApplies14dByType(companyId: number): Promise<Map<string, number>> {
  const raw = await db.execute<Applies14Row>(sql`
    SELECT action_type, count(*)::int AS c
    FROM marketplace_autopilot_action_logs
    WHERE company_id = ${companyId}
      AND status = 'applied'
      AND applied_at >= NOW() - INTERVAL '14 days'
    GROUP BY action_type
  `);
  const m = new Map<string, number>();
  for (const r of (raw as { rows?: Applies14Row[] }).rows ?? []) {
    m.set(String(r.action_type), Number(r.c ?? 0));
  }
  return m;
}

async function loadWins90dByType(companyId: number): Promise<Map<string, { wins: number; evaluated: number }>> {
  const raw = await db.execute<Wins90Row>(sql`
    SELECT action_type,
      count(*)::int AS evaluated,
      count(*) FILTER (
        WHERE coalesce((outcome_metrics->>'realizedRevenueDeltaTry')::numeric, 0) > 0
      )::int AS wins
    FROM marketplace_autopilot_action_logs
    WHERE company_id = ${companyId}
      AND status = 'applied'
      AND applied_at >= NOW() - INTERVAL '90 days'
      AND outcome_metrics IS NOT NULL
      AND coalesce((outcome_metrics->>'notApplicable')::text, 'false') <> 'true'
    GROUP BY action_type
  `);
  const m = new Map<string, { wins: number; evaluated: number }>();
  for (const r of (raw as { rows?: Wins90Row[] }).rows ?? []) {
    m.set(String(r.action_type), { wins: Number(r.wins ?? 0), evaluated: Number(r.evaluated ?? 0) });
  }
  return m;
}

function fatigueFor(applies14d: number): { level: ClosedLoopFatigueLevel; note: string } {
  if (applies14d >= 10) {
    return { level: "high", note: "Son 14 günde bu türde çok uygulama — etki ölçümü ve kullanıcı yükü için ara verin." };
  }
  if (applies14d >= 6) {
    return { level: "moderate", note: "Bu aksiyon türü sık kullanılıyor; öncelik ve güven skoru düşürüldü." };
  }
  return { level: "none", note: "Yorgunluk sinyali düşük." };
}

function tenantBehaviorSegment(args: {
  previews30d: number;
  applies30d: number;
  previewToApplyRatio: number | null;
  avgRollbackRate: number;
}): { key: string; label: string; note: string } {
  const { previews30d, applies30d, previewToApplyRatio, avgRollbackRate } = args;
  if (previews30d < 6 && applies30d < 3) {
    return { key: "cold", label: "Soğuk başlangıç", note: "Az önizleme/az uygulama — küçük paketlerle başlamak öğrenmeyi hızlandırır." };
  }
  if (avgRollbackRate >= 0.28 && applies30d >= 2) {
    return {
      key: "rollback_cautious",
      label: "Geri alma yüksek",
      note: "Geri alma oranı dikkat çekiyor; önce önizleme deterministik kontrolleri önerilir.",
    };
  }
  if (previewToApplyRatio != null && previewToApplyRatio < 0.07 && previews30d >= 12) {
    return {
      key: "browse_heavy",
      label: "Ağırlıklı önizleme",
      note: "Önizleme çok, uygulama az — tek net aksiyonla funnel kapatılabilir.",
    };
  }
  if (previewToApplyRatio != null && previewToApplyRatio > 0.32 && applies30d >= 4) {
    return {
      key: "commit_prone",
      label: "Uygulamaya eğilimli",
      note: "Önizleme sonrası uygulama oranı yüksek; kanıtlı türlere güven skoru yükseltildi.",
    };
  }
  return { key: "balanced", label: "Dengeli", note: "Önizleme ve uygulama dengeli seyrediyor." };
}

function confidenceFor(args: {
  schemaReady: boolean;
  logsWithOutcome: number;
  fatigue: ClosedLoopFatigueLevel;
  noisy: boolean;
  userPromoted: boolean;
  rollbackRate: number;
}): { score: number; note: string } {
  let s = 0.52;
  const parts: string[] = [];
  if (!args.schemaReady) {
    s -= 0.12;
    parts.push("ROI şeması veya outcome eksik");
  }
  if (args.logsWithOutcome >= 8) {
    s += 0.14;
    parts.push("yeterli outcome örneği");
  } else if (args.logsWithOutcome >= 3) {
    s += 0.06;
    parts.push("sınırlı outcome örneği");
  } else {
    s -= 0.06;
    parts.push("az outcome verisi");
  }
  if (args.fatigue === "high") {
    s -= 0.22;
    parts.push("aksiyon yorgunluğu (yüksek sıklık)");
  } else if (args.fatigue === "moderate") {
    s -= 0.1;
    parts.push("orta düzey yorgunluk");
  }
  if (args.noisy && !args.userPromoted) {
    s -= 0.12;
    parts.push("ROI motoru bu türü gürültülü işaretledi");
  }
  if (args.userPromoted) {
    s += 0.08;
    parts.push("tenant tercihiyle öne alındı");
  }
  if (args.rollbackRate > 0.32) {
    s -= 0.1;
    parts.push("yüksek geri alma oranı");
  }
  s = clamp(round2(s), 0.06, 0.94);
  return { score: s, note: parts.join("; ") || "varsayılan güven bandı" };
}

async function resolveMappingsForProducts(
  companyId: number,
  productIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = [...new Set(productIds.filter((x) => Number.isFinite(x) && x > 0))];
  if (!ids.length) return map;
  const rows = await db
    .select({
      productId: productChannelMappingsTable.productId,
      id: productChannelMappingsTable.id,
    })
    .from(productChannelMappingsTable)
    .where(and(
      eq(productChannelMappingsTable.companyId, companyId),
      inArray(productChannelMappingsTable.productId, ids),
      eq(productChannelMappingsTable.isActive, true),
    ))
    .orderBy(asc(productChannelMappingsTable.productId), asc(productChannelMappingsTable.id));
  for (const r of rows) {
    if (!map.has(r.productId)) map.set(r.productId, r.id);
  }
  return map;
}

async function resolveMappingForProductAccount(
  companyId: number,
  productId: number,
  accountId: number,
): Promise<number | null> {
  const [r] = await db
    .select({ id: productChannelMappingsTable.id })
    .from(productChannelMappingsTable)
    .where(and(
      eq(productChannelMappingsTable.companyId, companyId),
      eq(productChannelMappingsTable.productId, productId),
      eq(productChannelMappingsTable.accountId, accountId),
      eq(productChannelMappingsTable.isActive, true),
    ))
    .orderBy(asc(productChannelMappingsTable.id))
    .limit(1);
  return r?.id ?? null;
}

type RawRec = {
  actionType: string;
  mappingId: number | null;
  productId: number | null;
  productName: string;
  accountLabel: string;
  profitHint: string | null;
  urgencyScore: number;
};

export async function buildMarketplaceAutopilotClosedLoopBundleV1(companyId: number): Promise<{
  version: 1;
  generatedAtIso: string;
  disclaimers: string[];
  schema: { roi007Ready: boolean; closedLoopPrefs008Ready: boolean; closedLoopPrefsDetail: string };
  tenantSegment: { key: string; label: string; note: string };
  repeatedWinsByActionType90d: { actionType: string; wins: number; evaluated: number; winRate: number | null }[];
  conversionPrompts: string[];
  autoPromotionProposal: null | {
    actionType: string;
    evidence: string;
    reversibilityNote: string;
  };
  preferences: AutopilotClosedLoopPrefsV1;
  ranked: RankedClosedLoopRecommendationV1[];
  deferredNoisy: RankedClosedLoopRecommendationV1[];
  nextBestAligned: boolean | null;
}> {
  const disclaimers = [
    "Sıralama korelasyonel ROI ve tenant davranışına dayanır; nedensellik iddiası yoktur.",
    "Otomatik uygulama yoktur; tüm yazmalar mevcut autopilot onay uçlarından yapılır.",
  ];

  const [
    profit,
    roiSummary,
    nextBest,
    prefsWrap,
    applies14d,
    wins90,
    mig008,
  ] = await Promise.all([
    buildMarketplaceProfitAutomationV1(companyId),
    buildTenantAutopilotRoiSummaryV1(companyId),
    buildNextBestAutopilotActionV1(companyId),
    loadAutopilotClosedLoopPreferences(companyId),
    loadApplies14dByType(companyId),
    loadWins90dByType(companyId),
    checkMarketplaceAutopilotClosedLoopMigration008Ready(),
  ]);

  const prefs = prefsWrap.prefs;
  const noisyTypes = new Set(roiSummary.lowValueNoisy.map((x) => x.actionType));
  const perfByType = new Map(roiSummary.performanceByActionType.map((p) => [p.actionType, p]));
  const rollbackByType = new Map(roiSummary.rollbackByActionType.map((r) => [r.actionType, r]));

  const rbRates = roiSummary.rollbackByActionType.map((r) => r.rollbackRate).filter((x) => Number.isFinite(x));
  const avgRb = rbRates.length ? rbRates.reduce((a, b) => a + b, 0) / rbRates.length : 0;

  const segment = tenantBehaviorSegment({
    previews30d: roiSummary.acceptance.previews30d,
    applies30d: roiSummary.acceptance.applies30d,
    previewToApplyRatio: roiSummary.acceptance.previewToApplyRatio,
    avgRollbackRate: avgRb,
  });

  const repeatedWinsByActionType90d = [...wins90.entries()]
    .map(([actionType, { wins, evaluated }]) => ({
      actionType,
      wins,
      evaluated,
      winRate: evaluated > 0 ? round2(wins / evaluated) : null,
    }))
    .sort((a, b) => b.wins - a.wins);

  const conversionPrompts: string[] = [];
  if (roiSummary.acceptance.previewToApplyRatio != null && roiSummary.acceptance.previewToApplyRatio < 0.08
    && roiSummary.acceptance.previews30d >= 10) {
    conversionPrompts.push(
      "Önizleme sayısı yüksek; tek bir kanıtlı aksiyonu (en yüksek güven skoru) seçip uygulayarak öğrenme döngüsünü kapatabilirsiniz.",
    );
  }
  if (roiSummary.winRate.evaluatedLogs < 5) {
    conversionPrompts.push(
      "Outcome örneklemesi az — admin ile «Outcome yeniden hesapla» çalıştırıldığında sıralama güvenilirleşir.",
    );
  }
  if (segment.key === "commit_prone") {
    conversionPrompts.push("Tenant uygulamaya eğilimli: kanıtlı türlerde toplu önizleme sonrası tek seferde uygulama verimli olabilir.");
  }
  if (segment.key === "rollback_cautious") {
    conversionPrompts.push("Geri alma oranı yüksek: önce küçük mapping seti ile önizleme, ardından uygulama önerilir.");
  }

  const topPerformerTypes = new Set(roiSummary.topPerformers.slice(0, 3).map((t) => t.actionType));
  const promotedSet = new Set(prefs.promotedActionTypes);
  const suppressedUser = new Set(prefs.suppressedActionTypes);

  const marginProductIds = profit.lowMarginProducts.slice(0, 14).map((p) => p.productId);
  const pauseProductIds = profit.highReturnSkus.slice(0, 8).map((p) => p.productId);
  const marginMap = await resolveMappingsForProducts(companyId, marginProductIds);
  const pauseMap = await resolveMappingsForProducts(companyId, pauseProductIds);

  const raw: RawRec[] = [];

  for (const r of profit.repricingRecommendations.slice(0, 28)) {
    const gap = r.currentChannelPrice > 0
      ? Math.abs(r.suggestedPrice - r.currentChannelPrice) / r.currentChannelPrice
      : 0;
    raw.push({
      actionType: "repricing_apply",
      mappingId: r.mappingId,
      productId: r.productId,
      productName: r.productName,
      accountLabel: `${r.accountName} (${r.provider})`,
      profitHint: r.rationale,
      urgencyScore: clamp(gap * 120, 0, 80),
    });
  }

  for (const s of profit.staleListings.slice(0, 18)) {
    raw.push({
      actionType: "stale_resync_enqueue",
      mappingId: s.mappingId,
      productId: s.productId,
      productName: s.productName,
      accountLabel: `${s.accountName} (${s.provider})`,
      profitHint: s.message,
      urgencyScore: 22,
    });
  }

  for (const ls of profit.lowStockSalesRisk.slice(0, 16)) {
    const mid = await resolveMappingForProductAccount(companyId, ls.productId, ls.accountId);
    raw.push({
      actionType: "low_stock_override_apply",
      mappingId: mid,
      productId: ls.productId,
      productName: ls.name,
      accountLabel: ls.accountName,
      profitHint: ls.message,
      urgencyScore: ls.severity === "critical" ? 55 : 38,
    });
  }

  for (const m of profit.lowMarginProducts.slice(0, 12)) {
    const mid = marginMap.get(m.productId) ?? null;
    raw.push({
      actionType: "margin_recovery_apply",
      mappingId: mid,
      productId: m.productId,
      productName: m.name,
      accountLabel: "—",
      profitHint: m.message,
      urgencyScore: m.marginPct != null ? clamp(40 - m.marginPct, 10, 55) : 28,
    });
  }

  for (const h of profit.highReturnSkus.slice(0, 6)) {
    const mid = pauseMap.get(h.productId) ?? null;
    raw.push({
      actionType: "pause_high_return_listing",
      mappingId: mid,
      productId: h.productId,
      productName: h.productName,
      accountLabel: "—",
      profitHint: h.message,
      urgencyScore: clamp(h.returnRatio * 70, 15, 60),
    });
  }

  const rankedDraft: RankedClosedLoopRecommendationV1[] = [];
  for (const row of raw) {
    if (suppressedUser.has(row.actionType)) continue;

    const applies14 = applies14d.get(row.actionType) ?? 0;
    const { level: fatigueLevel, note: fatigueNote } = fatigueFor(applies14);
    const perf = perfByType.get(row.actionType);
    const medRev = perf?.medianRealizedRevenueDeltaTry;
    const nOut = perf?.logsWithOutcome ?? 0;
    const noisyFlag = !!perf?.noisy || noisyTypes.has(row.actionType);
    const userPromoted = promotedSet.has(row.actionType);
    const rbRow = rollbackByType.get(row.actionType);
    const rollbackRate = rbRow && rbRow.total > 0 ? rbRow.rolledBack / rbRow.total : 0;

    const roiBoost = medRev != null && Number.isFinite(medRev)
      ? clamp(medRev * 0.08, -35, 45)
      : 0;
    const topBoost = topPerformerTypes.has(row.actionType) ? 28 : 0;
    const promoteBoost = userPromoted ? 32 : 0;
    const segmentBoost = segment.key === "commit_prone" && nOut >= 3 ? 6
      : segment.key === "browse_heavy" ? -4
        : 0;
    const fatiguePenalty = fatigueLevel === "high" ? 38 : fatigueLevel === "moderate" ? 18 : 0;
    const mappingPenalty = row.mappingId == null ? 25 : 0;

    let rankingScore = row.urgencyScore + roiBoost + topBoost + promoteBoost + segmentBoost
      - fatiguePenalty - mappingPenalty;

    const { score: confidenceScore, note: confidenceNote } = confidenceFor({
      schemaReady: roiSummary.schemaReady,
      logsWithOutcome: nOut,
      fatigue: fatigueLevel,
      noisy: noisyFlag,
      userPromoted,
      rollbackRate,
    });

    const whyParts: string[] = [];
    whyParts.push(`Segment: ${segment.label}.`);
    if (medRev != null && nOut >= 2) {
      whyParts.push(`Bu türde medyan Δciro ${round2(medRev)} TRY (n=${nOut}).`);
    } else {
      whyParts.push("Bu aksiyon türü için henüz yeterli outcome yok — kâr sinyali öne alındı.");
    }
    if (topPerformerTypes.has(row.actionType)) {
      whyParts.push("Geçmişte en iyi performans grubunda.");
    }
    if (nextBest.recommendedActionType === row.actionType) {
      whyParts.push("ROI «sonraki en iyi tür» ile hizalı.");
    }
    if (fatigueLevel !== "none") {
      whyParts.push(fatigueNote);
    }
    if (row.mappingId == null) {
      whyParts.push("Kanal eşlemesi net değil — önizlemede mapping seçimi gerekebilir.");
    }

    const previewApplyHint = segment.key === "browse_heavy"
      ? "Bu satır için önizleme sonrası tek seferde uygulama, funnel verisini güçlendirir."
      : fatigueLevel === "high"
        ? "Aynı türde çok uygulama yapıldı; farklı tür veya küçük kümeyle devam etmek ölçümü iyileştirir."
        : roiSummary.schemaReady && nOut < 3
          ? "Outcome biriktikçe bu satırın güven skoru otomatik güncellenir."
          : null;

    const suppressedByNoisyPolicy = noisyFlag && !userPromoted;

    const item: RankedClosedLoopRecommendationV1 = {
      rank: 0,
      actionType: row.actionType,
      mappingId: row.mappingId,
      productId: row.productId,
      productName: row.productName,
      accountLabel: row.accountLabel,
      confidenceScore,
      confidenceNote,
      whySuggestedNow: whyParts.join(" "),
      rankingScore: round2(rankingScore),
      roiBoostNote: medRev != null ? `ROI medyan Δciro: ${round2(medRev)} TRY` : null,
      fatigue: { level: fatigueLevel, applies14d: applies14, note: fatigueNote },
      suppressedByNoisyPolicy,
      userSuppressed: false,
      previewApplyHint,
      profitHint: row.profitHint,
    };
    rankedDraft.push(item);
  }

  const active = rankedDraft.filter((x) => !x.suppressedByNoisyPolicy);
  const deferred = rankedDraft.filter((x) => x.suppressedByNoisyPolicy);

  active.sort((a, b) => b.rankingScore - a.rankingScore);
  deferred.sort((a, b) => b.confidenceScore - a.confidenceScore);

  let rnk = 0;
  for (const x of active) {
    rnk++;
    x.rank = rnk;
  }
  for (const x of deferred) {
    x.rank = 0;
  }

  const top = roiSummary.topPerformers[0];
  const autoPromotionProposal = top && top.score > 0 && !promotedSet.has(top.actionType) && perfByType.get(top.actionType)?.logsWithOutcome
    && (perfByType.get(top.actionType)!.logsWithOutcome >= 5)
    ? {
        actionType: top.actionType,
        evidence: top.evidence,
        reversibilityNote:
          "Kalıcı öncelik için POST /closed-loop/preferences ile promotedActionTypes güncellenir; aynı uçtan kaldırılarak tamamen geri alınır.",
      }
    : null;

  const nextBestAligned = nextBest.recommendedActionType
    ? active.some((x) => x.actionType === nextBest.recommendedActionType)
    : null;

  return {
    version: 1,
    generatedAtIso: new Date().toISOString(),
    disclaimers,
    schema: {
      roi007Ready: roiSummary.schemaReady,
      closedLoopPrefs008Ready: mig008.ok,
      closedLoopPrefsDetail: mig008.detail,
    },
    tenantSegment: segment,
    repeatedWinsByActionType90d,
    conversionPrompts,
    autoPromotionProposal,
    preferences: prefs,
    ranked: active,
    deferredNoisy: deferred,
    nextBestAligned,
  };
}
