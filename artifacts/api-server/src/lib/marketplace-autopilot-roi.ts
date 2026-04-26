/**
 * Autopilot ROI — evidence-based, correlational metrics (not causal attribution).
 * Outcomes: windowed `sales` sums for affected product_ids around `applied_at`.
 */
import {
  and, desc, eq, gte, inArray, isNotNull, lt, sql,
} from "drizzle-orm";
import {
  db,
  companiesTable,
  marketplaceAutopilotActionLogsTable,
  marketplaceAutopilotIntentEventsTable,
  productChannelMappingsTable,
  salesTable,
} from "@workspace/db";

const DEFAULT_WINDOW_DAYS = 14;

export type AutopilotOutcomeMetricsV1 = {
  version: 1;
  methodology: "windowed_sales_sum_correlational";
  windowDaysBefore: number;
  windowDaysAfter: number;
  productIds: number[];
  disclaimers: string[];
  before: {
    revenueTry: number;
    units: number;
    profitTry: number;
    windowStartIso: string;
    windowEndIso: string;
  };
  after: {
    revenueTry: number;
    units: number;
    profitTry: number;
    windowStartIso: string;
    windowEndIso: string;
    partialWindow: boolean;
  };
  realizedRevenueDeltaTry: number;
  realizedProfitDeltaTry: number;
  estimatedMonthlyDeltaTryApproxAtApply: number | null;
  rollbackContaminated: boolean;
  notApplicable?: boolean;
  notApplicableReason?: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Geçmiş listesi için outcome özetini düzleştir (UI). */
export function attachRoiOutcomeSummary<T extends {
  outcomeMetrics?: unknown;
  outcomeComputedAt?: Date | null;
}>(row: T): T & {
  roiOutcomeSummary: {
    realizedRevenueDeltaTry: number;
    realizedProfitDeltaTry: number;
    outcomeComputedAt: string | null;
    partialWindow: boolean;
    disclaimers: string[];
  } | null;
} {
  const om = row.outcomeMetrics as Partial<AutopilotOutcomeMetricsV1> | null | undefined;
  if (!om || om.notApplicable) {
    return { ...row, roiOutcomeSummary: null };
  }
  return {
    ...row,
    roiOutcomeSummary: {
      realizedRevenueDeltaTry: om.realizedRevenueDeltaTry ?? 0,
      realizedProfitDeltaTry: om.realizedProfitDeltaTry ?? 0,
      outcomeComputedAt: row.outcomeComputedAt
        ? (row.outcomeComputedAt instanceof Date
          ? row.outcomeComputedAt.toISOString()
          : String(row.outcomeComputedAt))
        : null,
      partialWindow: !!om.after?.partialWindow,
      disclaimers: om.disclaimers ?? [],
    },
  };
}

function median(nums: number[]): number | null {
  const a = nums.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : roundMoney((a[m - 1]! + a[m]!) / 2);
}

export async function checkMarketplaceAutopilotRoiMigration007Ready(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const r = await db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_autopilot_action_logs'
        AND column_name = 'outcome_metrics'
    `);
    const c = Number((r as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);
    if (c < 1) {
      return { ok: false, detail: "outcome_metrics kolonu yok — migration 007 uygulanmalı." };
    }
    const t = await db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'marketplace_autopilot_intent_events'
    `);
    const tc = Number((t as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);
    if (tc < 1) {
      return { ok: false, detail: "marketplace_autopilot_intent_events tablosu yok — migration 007." };
    }
    return { ok: true, detail: "ROI şeması hazır." };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "schema_check_failed" };
  }
}

export async function insertAutopilotIntentEvent(
  companyId: number,
  userId: number | null | undefined,
  intentKind: string,
  scope: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(marketplaceAutopilotIntentEventsTable).values({
      companyId,
      userId: userId ?? null,
      intentKind,
      scopeJson: scope,
    });
  } catch {
    /* migration 007 yoksa sessiz — önizleme yine döner */
  }
}

async function productIdsFromTargets(
  companyId: number,
  actionType: string,
  targets: unknown[],
): Promise<number[]> {
  const ids = new Set<number>();
  const mappingIds: number[] = [];
  for (const t of targets || []) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if (typeof o.productId === "number" && Number.isFinite(o.productId)) ids.add(o.productId);
    if (typeof o.mappingId === "number" && Number.isFinite(o.mappingId)) mappingIds.push(o.mappingId);
  }
  if (mappingIds.length) {
    const rows = await db.select({ productId: productChannelMappingsTable.productId })
      .from(productChannelMappingsTable)
      .where(and(
        eq(productChannelMappingsTable.companyId, companyId),
        inArray(productChannelMappingsTable.id, [...new Set(mappingIds)]),
      ));
    for (const r of rows) ids.add(r.productId);
  }
  if (!ids.size && actionType === "stale_resync_enqueue") {
    for (const t of targets || []) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      if (typeof o.productId === "number") ids.add(o.productId);
    }
  }
  return [...ids];
}

async function aggregateSalesWindow(
  companyId: number,
  productIds: number[],
  start: Date,
  end: Date,
): Promise<{ revenueTry: number; units: number; profitTry: number }> {
  if (!productIds.length) {
    return { revenueTry: 0, units: 0, profitTry: 0 };
  }
  const [row] = await db.select({
    revenue: sql<number>`coalesce(sum(${salesTable.totalPrice}), 0)::float`,
    units: sql<number>`coalesce(sum(${salesTable.quantity}), 0)::int`,
    profit: sql<number>`coalesce(sum(${salesTable.profit}), 0)::float`,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    inArray(salesTable.productId, productIds),
    eq(salesTable.returned, false),
    gte(salesTable.createdAt, start),
    lt(salesTable.createdAt, end),
  ));
  return {
    revenueTry: roundMoney(Number(row?.revenue ?? 0)),
    units: Number(row?.units ?? 0),
    profitTry: roundMoney(Number(row?.profit ?? 0)),
  };
}

export async function computeAutopilotOutcomeMetricsForLog(
  companyId: number,
  log: typeof marketplaceAutopilotActionLogsTable.$inferSelect,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<AutopilotOutcomeMetricsV1> {
  const disclaimers: string[] = [
    "Korelasyonel ölçüm: aynı ürün kümesinde uygulama öncesi/sonrası eşit süreli satış toplamları; kârın tek nedeni autopilot değildir.",
  ];
  const appliedAt = log.appliedAt instanceof Date ? log.appliedAt : new Date(String(log.appliedAt));
  const targets = (log.targets || []) as unknown[];
  const productIds = await productIdsFromTargets(companyId, log.actionType, targets);

  if (!productIds.length) {
    return {
      version: 1,
      methodology: "windowed_sales_sum_correlational",
      windowDaysBefore: windowDays,
      windowDaysAfter: windowDays,
      productIds: [],
      disclaimers: [...disclaimers, "Hedef ürün kümesi çıkarılamadı — sonuç KPI dışı."],
      before: { revenueTry: 0, units: 0, profitTry: 0, windowStartIso: "", windowEndIso: "" },
      after: { revenueTry: 0, units: 0, profitTry: 0, windowStartIso: "", windowEndIso: "", partialWindow: true },
      realizedRevenueDeltaTry: 0,
      realizedProfitDeltaTry: 0,
      estimatedMonthlyDeltaTryApproxAtApply: null,
      rollbackContaminated: false,
      notApplicable: true,
      notApplicableReason: "no_product_scope",
    };
  }

  const beforeStart = new Date(appliedAt.getTime() - windowDays * 86400000);
  const beforeEnd = appliedAt;
  const afterStart = appliedAt;
  const afterEndFull = new Date(appliedAt.getTime() + windowDays * 86400000);
  const now = new Date();
  const afterEnd = afterEndFull > now ? now : afterEndFull;
  const partialWindow = afterEnd < afterEndFull;

  const before = await aggregateSalesWindow(companyId, productIds, beforeStart, beforeEnd);
  const after = await aggregateSalesWindow(companyId, productIds, afterStart, afterEnd);

  const estRaw = (log.estimatedImpact as Record<string, unknown> | null)?.estimatedMonthlyDeltaTryApprox;
  const estimatedMonthlyDeltaTryApproxAtApply = typeof estRaw === "number" && Number.isFinite(estRaw) ? roundMoney(estRaw) : null;

  let rollbackContaminated = false;
  if (log.rolledBackAt) {
    const rb = log.rolledBackAt instanceof Date ? log.rolledBackAt : new Date(String(log.rolledBackAt));
    if (rb <= afterEnd) {
      rollbackContaminated = true;
      disclaimers.push("Geri alma, ölçüm penceresi içinde gerçekleşti — sonrası satışlar snapshot’a göre değişmiş olabilir.");
    }
  }

  if (partialWindow) {
    disclaimers.push("Sonrası penceresi henüz tam dolmadı — kısmi veri.");
  }

  const realizedRevenueDeltaTry = roundMoney(after.revenueTry - before.revenueTry);
  const realizedProfitDeltaTry = roundMoney(after.profitTry - before.profitTry);

  return {
    version: 1,
    methodology: "windowed_sales_sum_correlational",
    windowDaysBefore: windowDays,
    windowDaysAfter: windowDays,
    productIds,
    disclaimers,
    before: {
      ...before,
      windowStartIso: beforeStart.toISOString(),
      windowEndIso: beforeEnd.toISOString(),
    },
    after: {
      ...after,
      windowStartIso: afterStart.toISOString(),
      windowEndIso: afterEnd.toISOString(),
      partialWindow,
    },
    realizedRevenueDeltaTry,
    realizedProfitDeltaTry,
    estimatedMonthlyDeltaTryApproxAtApply,
    rollbackContaminated,
  };
}

export async function persistOutcomeForLog(
  companyId: number,
  logId: number,
  metrics: AutopilotOutcomeMetricsV1,
): Promise<void> {
  await db.update(marketplaceAutopilotActionLogsTable).set({
    outcomeMetrics: metrics as unknown as Record<string, unknown>,
    outcomeComputedAt: new Date(),
  }).where(and(
    eq(marketplaceAutopilotActionLogsTable.id, logId),
    eq(marketplaceAutopilotActionLogsTable.companyId, companyId),
  ));
}

export async function recomputeOutcomesForCompany(
  companyId: number,
  options?: { limit?: number; force?: boolean },
): Promise<{ processed: number; skipped: number; errors: number }> {
  const schema = await checkMarketplaceAutopilotRoiMigration007Ready();
  if (!schema.ok) {
    const e: any = new Error("roi_schema_missing");
    e.code = "ROI_SCHEMA_MISSING";
    throw e;
  }
  const limit = Math.min(200, options?.limit ?? 80);
  const rows = await db.select().from(marketplaceAutopilotActionLogsTable)
    .where(and(
      eq(marketplaceAutopilotActionLogsTable.companyId, companyId),
      eq(marketplaceAutopilotActionLogsTable.status, "applied"),
    ))
    .orderBy(desc(marketplaceAutopilotActionLogsTable.appliedAt))
    .limit(limit);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  for (const row of rows) {
    if (!options?.force && row.outcomeComputedAt) {
      skipped++;
      continue;
    }
    try {
      const m = await computeAutopilotOutcomeMetricsForLog(companyId, row);
      await persistOutcomeForLog(companyId, row.id, m);
      processed++;
    } catch {
      errors++;
    }
  }
  return { processed, skipped, errors };
}

export async function buildTenantAutopilotRoiSummaryV1(companyId: number): Promise<{
  generatedAtIso: string;
  schemaReady: boolean;
  schemaDetail: string;
  windowDays: number;
  acceptance: {
    previews30d: number;
    applies30d: number;
    previewToApplyRatio: number | null;
    note: string;
  };
  rollbackByActionType: { actionType: string; total: number; rolledBack: number; rollbackRate: number }[];
  performanceByActionType: {
    actionType: string;
    logsWithOutcome: number;
    medianRealizedRevenueDeltaTry: number | null;
    medianRealizedProfitDeltaTry: number | null;
    noisy: boolean;
    noisyReason: string | null;
  }[];
  winRate: {
    evaluatedLogs: number;
    winsRevenuePositive: number;
    winRateRevenue: number | null;
    note: string;
  };
  lowValueNoisy: { actionType: string; reason: string }[];
  topPerformers: { actionType: string; score: number; evidence: string }[];
}> {
  const schema = await checkMarketplaceAutopilotRoiMigration007Ready();
  const windowDays = DEFAULT_WINDOW_DAYS;
  if (!schema.ok) {
    return {
      generatedAtIso: new Date().toISOString(),
      schemaReady: false,
      schemaDetail: schema.detail,
      windowDays,
      acceptance: {
        previews30d: 0,
        applies30d: 0,
        previewToApplyRatio: null,
        note: "ROI metrikleri için migration 007 gerekli.",
      },
      rollbackByActionType: [],
      performanceByActionType: [],
      winRate: {
        evaluatedLogs: 0,
        winsRevenuePositive: 0,
        winRateRevenue: null,
        note: schema.detail,
      },
      lowValueNoisy: [],
      topPerformers: [],
    };
  }

  const pvRow = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM marketplace_autopilot_intent_events
    WHERE company_id = ${companyId} AND created_at >= NOW() - INTERVAL '30 days'
  `);
  const pv = Number((pvRow as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);

  const apRow = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM marketplace_autopilot_action_logs
    WHERE company_id = ${companyId} AND status = 'applied' AND applied_at >= NOW() - INTERVAL '30 days'
  `);
  const applies30d = Number((apRow as { rows?: { c: number }[] }).rows?.[0]?.c ?? 0);

  const previewToApplyRatio = pv > 0 ? roundMoney(applies30d / pv) : null;

  const since90 = new Date(Date.now() - 90 * 86400000);
  const rbRaw = await db.execute<{ action_type: string; total: number; rolled: number }>(sql`
    SELECT action_type,
      count(*)::int AS total,
      count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS rolled
    FROM marketplace_autopilot_action_logs
    WHERE company_id = ${companyId} AND applied_at >= ${since90}
    GROUP BY action_type
  `);
  const rollbackByActionType = ((rbRaw as { rows?: any[] }).rows ?? []).map((r) => {
    const total = Number(r.total ?? 0);
    const rolled = Number(r.rolled ?? 0);
    return {
      actionType: String(r.action_type),
      total,
      rolledBack: rolled,
      rollbackRate: total > 0 ? roundMoney(rolled / total) : 0,
    };
  });

  const outcomeSince = new Date(Date.now() - 180 * 86400000);
  const outcomeLogs = await db.select().from(marketplaceAutopilotActionLogsTable).where(and(
    eq(marketplaceAutopilotActionLogsTable.companyId, companyId),
    isNotNull(marketplaceAutopilotActionLogsTable.outcomeComputedAt),
    gte(marketplaceAutopilotActionLogsTable.appliedAt, outcomeSince),
  ));

  const revByType = new Map<string, number[]>();
  const profByType = new Map<string, number[]>();
  let evaluated = 0;
  let wins = 0;
  for (const log of outcomeLogs) {
    if (log.status !== "applied") continue;
    const om = log.outcomeMetrics as AutopilotOutcomeMetricsV1 | null;
    if (!om || om.notApplicable) continue;
    evaluated++;
    if (om.realizedRevenueDeltaTry > 0) wins++;
    const rlist = revByType.get(log.actionType) ?? [];
    rlist.push(om.realizedRevenueDeltaTry);
    revByType.set(log.actionType, rlist);
    const plist = profByType.get(log.actionType) ?? [];
    plist.push(om.realizedProfitDeltaTry);
    profByType.set(log.actionType, plist);
  }

  const performanceByActionType = [...new Set([...revByType.keys(), ...rollbackByActionType.map((x) => x.actionType)])].map((actionType) => {
    const revs = revByType.get(actionType) ?? [];
    const profs = profByType.get(actionType) ?? [];
    const medR = median(revs);
    const medP = median(profs);
    const rbRow = rollbackByActionType.find((x) => x.actionType === actionType);
    const rr = rbRow?.rollbackRate ?? 0;
    const n = revs.length;
    const noisy = n >= 5 && (medR === null || Math.abs(medR) < 1) && rr > 0.35;
    return {
      actionType,
      logsWithOutcome: n,
      medianRealizedRevenueDeltaTry: medR,
      medianRealizedProfitDeltaTry: medP,
      noisy,
      noisyReason: noisy ? "Yüksek geri alma veya düşük mutlak gerçekleşen ciro değişimi" : null,
    };
  });

  const winRateRevenue = evaluated > 0 ? roundMoney(wins / evaluated) : null;

  const lowValueNoisy = performanceByActionType
    .filter((p) => p.noisy)
    .map((p) => ({ actionType: p.actionType, reason: p.noisyReason || "noisy" }));

  const topPerformers = [...performanceByActionType]
    .filter((p) => p.logsWithOutcome >= 3 && p.medianRealizedRevenueDeltaTry != null)
    .map((p) => ({
      actionType: p.actionType,
      score: p.medianRealizedRevenueDeltaTry ?? 0,
      evidence: `n=${p.logsWithOutcome}, medyan Δciro=${p.medianRealizedRevenueDeltaTry} TRY`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    generatedAtIso: new Date().toISOString(),
    schemaReady: schema.ok,
    schemaDetail: schema.detail,
    windowDays,
    acceptance: {
      previews30d: pv,
      applies30d,
      previewToApplyRatio,
      note: pv === 0
        ? "Önizleme intent kaydı yok — oran hesaplanamadı."
        : "Oran = applies30d / previews30d (kaba funnel).",
    },
    rollbackByActionType,
    performanceByActionType,
    winRate: {
      evaluatedLogs: evaluated,
      winsRevenuePositive: wins,
      winRateRevenue,
      note: evaluated < 5
        ? "Kazanma oranı için birkaç hesaplanmış outcome gerekir."
        : "Kazanma: realizedRevenueDeltaTry > 0 (basit eşik).",
    },
    lowValueNoisy,
    topPerformers,
  };
}

export async function buildNextBestAutopilotActionV1(companyId: number): Promise<{
  recommendedActionType: string | null;
  confidence: "low" | "medium" | "high";
  rationale: string;
  historical: { actionType: string; medianRealizedRevenueDeltaTry: number; n: number }[];
}> {
  const summary = await buildTenantAutopilotRoiSummaryV1(companyId);
  const historical = summary.performanceByActionType
    .filter((p) => p.logsWithOutcome >= 3 && p.medianRealizedRevenueDeltaTry != null)
    .map((p) => ({
      actionType: p.actionType,
      medianRealizedRevenueDeltaTry: p.medianRealizedRevenueDeltaTry ?? 0,
      n: p.logsWithOutcome,
    }))
    .sort((a, b) => b.medianRealizedRevenueDeltaTry - a.medianRealizedRevenueDeltaTry);
  const best = historical[0];
  if (!best) {
    return {
      recommendedActionType: null,
      confidence: "low",
      rationale: summary.schemaReady
        ? "Yeterli outcome verisi yok — POST /marketplace/autopilot/roi/recompute çalıştırın."
        : `Şema hazır değil: ${summary.schemaDetail}`,
      historical: [],
    };
  }
  const confidence: "low" | "medium" | "high" = best.n >= 12 ? "high" : best.n >= 6 ? "medium" : "low";
  return {
    recommendedActionType: best.actionType,
    confidence,
    rationale: `Geçmiş outcome’larda en yüksek medyan Δciro: ${best.actionType} (${best.medianRealizedRevenueDeltaTry} TRY, n=${best.n}).`,
    historical,
  };
}

export async function buildMarketplaceAutopilotFounderRoiDashboardV1(): Promise<{
  generatedAtIso: string;
  schemaReady: boolean;
  schemaDetail?: string;
  rows: {
    companyId: number;
    companyName: string;
    applies90d: number;
    rollbacks90d: number;
    rollbackRate: number;
    medianRealizedRevenueDeltaTry: number | null;
    previews30d: number;
    applies30d: number;
  }[];
}> {
  const schema = await checkMarketplaceAutopilotRoiMigration007Ready();
  if (!schema.ok) {
    return { generatedAtIso: new Date().toISOString(), schemaReady: false, schemaDetail: schema.detail, rows: [] };
  }
  const since90 = new Date(Date.now() - 90 * 86400000);
  const since30 = new Date(Date.now() - 30 * 86400000);

  const logRows = await db.select().from(marketplaceAutopilotActionLogsTable)
    .where(gte(marketplaceAutopilotActionLogsTable.appliedAt, since90));

  const intentRows = await db.select().from(marketplaceAutopilotIntentEventsTable)
    .where(gte(marketplaceAutopilotIntentEventsTable.createdAt, since30));

  const applies30All = await db.select().from(marketplaceAutopilotActionLogsTable).where(and(
    eq(marketplaceAutopilotActionLogsTable.status, "applied"),
    gte(marketplaceAutopilotActionLogsTable.appliedAt, since30),
  ));

  const byCompany = new Map<number, {
    applies90: number;
    rb90: number;
    deltas: number[];
    previews30: number;
    applies30: number;
  }>();

  for (const l of logRows) {
    const e = byCompany.get(l.companyId) ?? { applies90: 0, rb90: 0, deltas: [], previews30: 0, applies30: 0 };
    e.applies90++;
    if (l.rolledBackAt) e.rb90++;
    const om = l.outcomeMetrics as AutopilotOutcomeMetricsV1 | null;
    if (l.outcomeComputedAt && om && !om.notApplicable) {
      e.deltas.push(om.realizedRevenueDeltaTry);
    }
    byCompany.set(l.companyId, e);
  }
  for (const i of intentRows) {
    const e = byCompany.get(i.companyId) ?? { applies90: 0, rb90: 0, deltas: [], previews30: 0, applies30: 0 };
    e.previews30++;
    byCompany.set(i.companyId, e);
  }
  for (const l of applies30All) {
    const e = byCompany.get(l.companyId) ?? { applies90: 0, rb90: 0, deltas: [], previews30: 0, applies30: 0 };
    e.applies30++;
    byCompany.set(l.companyId, e);
  }

  const ids = [...byCompany.keys()].filter((id) => (byCompany.get(id)?.applies90 ?? 0) > 0);
  if (!ids.length) {
    return { generatedAtIso: new Date().toISOString(), schemaReady: true, rows: [] };
  }
  const names = await db.select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable).where(inArray(companiesTable.id, ids));

  const rows = ids.map((companyId) => {
    const e = byCompany.get(companyId)!;
    const nm = names.find((n) => n.id === companyId);
    return {
      companyId,
      companyName: nm?.name ?? `#${companyId}`,
      applies90d: e.applies90,
      rollbacks90d: e.rb90,
      rollbackRate: e.applies90 > 0 ? roundMoney(e.rb90 / e.applies90) : 0,
      medianRealizedRevenueDeltaTry: median(e.deltas),
      previews30d: e.previews30,
      applies30d: e.applies30,
    };
  }).sort((a, b) => (b.medianRealizedRevenueDeltaTry ?? -1e9) - (a.medianRealizedRevenueDeltaTry ?? -1e9));

  return { generatedAtIso: new Date().toISOString(), schemaReady: true, rows };
}
