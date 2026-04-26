/**
 * Marketplace Autopilot — safety, validation, audit metadata (no writes).
 * Route permission matrix is the single source of truth for operator / security review.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db, marketplaceAutopilotActionLogsTable } from "@workspace/db";
import {
  previewMarginRecoveryActions,
  previewRepricingActions,
  previewStaleResyncActions,
} from "./marketplace-autopilot-actions.js";

/** Route-level permission audit (method + path suffix → roles). Path prefix: /api/marketplace/autopilot */
export const AUTOPILOT_ROUTE_MATRIX = [
  { method: "GET", path: "/safety-status", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Migration 006 + permission matrix + dry-run helpers (read-only)." },
  { method: "POST", path: "/preview/repricing", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Dry-run; no DB mutations." },
  { method: "POST", path: "/apply/repricing", roles: ["admin", "super_admin"], writes: true, notes: "Requires JSON body.confirm === true (boolean)." },
  { method: "POST", path: "/apply/profit-repricing-bulk", roles: ["admin", "super_admin"], writes: true, notes: "Requires strict confirm." },
  { method: "POST", path: "/preview/margin-recovery", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Dry-run." },
  { method: "POST", path: "/apply/margin-recovery", roles: ["admin", "super_admin"], writes: true, notes: "Requires strict confirm." },
  { method: "GET", path: "/preview/low-stock", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Dry-run." },
  { method: "POST", path: "/apply/low-stock", roles: ["admin", "super_admin"], writes: true, notes: "Requires strict confirm." },
  { method: "POST", path: "/preview/stale-resync", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Dry-run." },
  { method: "POST", path: "/apply/stale-resync", roles: ["admin", "super_admin"], writes: true, notes: "Requires strict confirm." },
  { method: "POST", path: "/preview/pause-high-return", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Dry-run." },
  { method: "POST", path: "/apply/pause-high-return", roles: ["admin", "super_admin"], writes: true, notes: "Requires strict confirm." },
  { method: "GET", path: "/history", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Tenant-scoped audit list." },
  { method: "POST", path: "/rollback", roles: ["admin", "super_admin"], writes: true, notes: "Requires strict confirm; mapping snapshot only." },
  { method: "POST", path: "/safety/verify-preview-determinism", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Runs preview twice; detects drift / race signal." },
  { method: "POST", path: "/safety/verify-stale-preview-apply", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Counts preview vs would-enqueue targets." },
  { method: "GET", path: "/founder-roi-summary", roles: ["super_admin"], writes: false, notes: "Cross-tenant; admin/staff must never receive 200." },
  { method: "GET", path: "/roi/tenant-summary", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Outcome, rollback, acceptance, win-rate (evidence-based)." },
  { method: "GET", path: "/roi/next-best-action", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Tarihsel medyan payoff ile öneri." },
  { method: "POST", path: "/roi/recompute", roles: ["admin", "super_admin"], writes: true, notes: "Outcome metriklerini sales penceresinden yeniden hesaplar." },
  { method: "GET", path: "/roi/founder-dashboard", roles: ["super_admin"], writes: false, notes: "Cross-tenant autopilot ROI dashboard." },
  { method: "GET", path: "/closed-loop/bundle", roles: ["admin", "staff", "super_admin"], writes: false, notes: "ROI+tenant davranışı ile sıralı öneriler; otomatik apply yok." },
  { method: "GET", path: "/closed-loop/preferences", roles: ["admin", "staff", "super_admin"], writes: false, notes: "Promote/suppress action type tercihleri (salt okunur)." },
  { method: "POST", path: "/closed-loop/preferences", roles: ["admin", "super_admin"], writes: true, notes: "Tercih jsonb güncelleme; strict confirm; sıralama etkisi, apply değil." },
] as const;

const MIGRATION_006_TABLE = "marketplace_autopilot_action_logs";

/** `true` only if body is an object and confirm is boolean true (not "true", not 1). */
export function readStrictConfirm(body: unknown): boolean {
  return body !== null && typeof body === "object" && (body as { confirm?: unknown }).confirm === true;
}

export async function checkMarketplaceAutopilotMigration006Ready(): Promise<{
  ok: boolean;
  table: string;
  detail: string;
}> {
  try {
    const r = await db.execute<{ reg: string | null }>(sql`
      SELECT to_regclass('public.marketplace_autopilot_action_logs')::text AS reg
    `);
    const row = (r as { rows?: { reg: string | null }[] }).rows?.[0];
    const reg = row?.reg ?? null;
    if (!reg) {
      return { ok: false, table: MIGRATION_006_TABLE, detail: "Tablo yok — migration 006 uygulanmalı." };
    }
    return { ok: true, table: MIGRATION_006_TABLE, detail: "Tablo mevcut." };
  } catch (e: any) {
    return { ok: false, table: MIGRATION_006_TABLE, detail: e?.message || "check_failed" };
  }
}

export type RollbackSupportInfo = {
  actionType: string;
  rollbackable: boolean;
  reason: string;
  restoresFields: string[];
};

/** Documents rollback semantics per action_type (operator + QA). */
export function describeRollbackSupportForActionType(actionType: string): RollbackSupportInfo {
  switch (actionType) {
    case "repricing_apply":
    case "margin_recovery_apply":
      return {
        actionType,
        rollbackable: true,
        reason: "beforeSnapshot.mappings içinde priceOverride (+ yardımcı alanlar) geri yüklenir.",
        restoresFields: ["priceOverride", "stockOverride", "isActive", "updatedAt (snapshot’ta varsa)"],
      };
    case "low_stock_override_apply":
      return {
        actionType,
        rollbackable: true,
        reason: "Kanal stock_override ve priceOverride snapshot’tan geri yüklenir.",
        restoresFields: ["stockOverride", "priceOverride"],
      };
    case "pause_high_return_listing":
      return {
        actionType,
        rollbackable: true,
        reason: "is_active / is_published snapshot öncesi değerlere döner.",
        restoresFields: ["isActive", "isPublished"],
      };
    case "stale_resync_enqueue":
      return {
        actionType,
        rollbackable: false,
        reason: "Yalnızca kuyruk (push_price) eklendi; mapping snapshot yok — geri al ile DB fiyatı geri dönmez.",
        restoresFields: [],
      };
    default:
      return {
        actionType,
        rollbackable: false,
        reason: "Bilinmeyen veya desteklenmeyen action_type.",
        restoresFields: [],
      };
  }
}

/** Row-level rollback eligibility (snapshot + status), without DB writes. */
export function validateRollbackEligibilityForLog(row: {
  actionType: string;
  status: string;
  rolledBackAt: Date | null;
  beforeSnapshot: unknown;
}): RollbackSupportInfo & { eligible: boolean } {
  const meta = describeRollbackSupportForActionType(row.actionType);
  if (!meta.rollbackable) {
    return { ...meta, eligible: false, reason: meta.reason };
  }
  if (row.status !== "applied") {
    return { ...meta, eligible: false, reason: `Durum ${row.status} — yalnızca applied geri alınır.` };
  }
  if (row.rolledBackAt) {
    return { ...meta, eligible: false, reason: "Zaten geri alınmış." };
  }
  const snap = (row.beforeSnapshot as { mappings?: Record<string, unknown> } | null)?.mappings;
  if (!snap || Object.keys(snap).length === 0) {
    return { ...meta, eligible: false, reason: "beforeSnapshot.mappings eksik veya boş." };
  }
  return { ...meta, eligible: true, reason: "Geri alınabilir." };
}

/** Audit row completeness for mapping-mutating actions (post-apply QA). */
export function verifyAutopilotAuditRowCompleteness(row: {
  companyId: number;
  userId: number | null;
  actionType: string;
  status: string;
    targets: unknown;
    beforeSnapshot: unknown;
    afterSnapshot: unknown;
    appliedAt: Date | null;
    estimatedImpact: unknown;
}): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!row.userId) missing.push("userId");
  if (!row.actionType) missing.push("actionType");
  if (!row.status) missing.push("status");
  if (!Array.isArray(row.targets)) missing.push("targets[]");
  if (!row.appliedAt) missing.push("appliedAt");
  const t = row.actionType;
  if (t === "repricing_apply" || t === "margin_recovery_apply" || t === "low_stock_override_apply" || t === "pause_high_return_listing") {
    const m = (row.beforeSnapshot as { mappings?: unknown } | null)?.mappings;
    if (!m || typeof m !== "object" || !Object.keys(m as object).length) missing.push("beforeSnapshot.mappings");
    const a = (row.afterSnapshot as { mappings?: unknown } | null)?.mappings;
    if (!a || typeof a !== "object" || !Object.keys(a as object).length) missing.push("afterSnapshot.mappings");
  }
  if (t === "stale_resync_enqueue") {
    if (!row.beforeSnapshot || typeof row.beforeSnapshot !== "object") missing.push("beforeSnapshot");
    const after = row.afterSnapshot as { jobsEnqueued?: unknown } | null;
    if (!after || typeof after !== "object" || typeof after.jobsEnqueued !== "number") {
      missing.push("afterSnapshot.jobsEnqueued");
    }
  }
  if (row.estimatedImpact == null && t !== "low_stock_override_apply") {
    missing.push("estimatedImpact");
  }
  return { complete: missing.length === 0, missing };
}

function stablePreviewFingerprint(lines: { mappingId: number; suggestedPrice: number }[]): string {
  const sorted = [...lines].sort((a, b) => a.mappingId - b.mappingId);
  return JSON.stringify(sorted.map((l) => [l.mappingId, l.suggestedPrice]));
}

/** Same preview twice — should match if no concurrent edits (read-only). */
export async function verifyRepricingPreviewDeterminism(
  companyId: number,
  mappingIds: number[],
): Promise<{ ok: boolean; match: boolean; detail: string }> {
  const a = await previewRepricingActions(companyId, mappingIds);
  const b = await previewRepricingActions(companyId, mappingIds);
  const fa = stablePreviewFingerprint(a.lines.map((l) => ({ mappingId: l.mappingId, suggestedPrice: l.suggestedPrice })));
  const fb = stablePreviewFingerprint(b.lines.map((l) => ({ mappingId: l.mappingId, suggestedPrice: l.suggestedPrice })));
  const match = fa === fb && a.lines.length === b.lines.length
    && a.totalEstimatedMonthlyDeltaTryApprox === b.totalEstimatedMonthlyDeltaTryApprox;
  return {
    ok: true,
    match,
    detail: match
      ? "İki önizleme özdeş — uygulama anında yine previewRepricingActions ile hesaplanır."
      : "Önizlemeler farklı — eşzamanlı değişiklik veya veri drift; uygulamadan önce yeniden önizleyin.",
  };
}

export async function verifyMarginPreviewDeterminism(
  companyId: number,
  mappingIds: number[],
  targetMarginPct: number,
): Promise<{ ok: boolean; match: boolean; detail: string }> {
  const a = await previewMarginRecoveryActions(companyId, mappingIds, targetMarginPct);
  const b = await previewMarginRecoveryActions(companyId, mappingIds, targetMarginPct);
  const fa = stablePreviewFingerprint(a.lines.map((l) => ({ mappingId: l.mappingId, suggestedPrice: l.suggestedPrice })));
  const fb = stablePreviewFingerprint(b.lines.map((l) => ({ mappingId: l.mappingId, suggestedPrice: l.suggestedPrice })));
  const match = fa === fb && a.lines.length === b.lines.length;
  return {
    ok: true,
    match,
    detail: match ? "Marj önizlemesi deterministik." : "Marj önizlemesi farklı — yeniden önizleyin.",
  };
}

/** Stale: preview line count vs rows that would enqueue (external_product_id). */
export async function verifyStaleResyncPreviewApplyConsistency(
  companyId: number,
  mappingIds: number[],
): Promise<{
  ok: boolean;
  previewLineCount: number;
  wouldEnqueueMappingCount: number;
  consistent: boolean;
  detail: string;
}> {
  const prev = await previewStaleResyncActions(companyId, mappingIds);
  const wouldEnqueue = prev.lines.filter((l) => l.jobQueued).length;
  const inconsistent = prev.lines.some((l) => l.jobQueued !== !!l.note?.includes("push_price"));
  return {
    ok: true,
    previewLineCount: prev.lines.length,
    wouldEnqueueMappingCount: wouldEnqueue,
    consistent: !inconsistent,
    detail: inconsistent
      ? "jobQueued / note tutarsızlığı — kod drift kontrolü başarısız."
      : "jobQueued=true satırlar apply ile aynı external_product_id filtresine denk gelir.",
  };
}

export type AutopilotSafetyStatusV1 = {
  version: 1;
  generatedAtIso: string;
  migration006: Awaited<ReturnType<typeof checkMarketplaceAutopilotMigration006Ready>>;
  routeMatrix: typeof AUTOPILOT_ROUTE_MATRIX;
  rollbackByActionType: Record<string, Omit<RollbackSupportInfo, "actionType"> & { actionType: string }>;
  recentAuditScan?: { scanned: number; incomplete: { logId: number; missing: string[] }[] };
};

export async function scanRecentAutopilotAuditCompleteness(
  companyId: number,
  limit = 25,
): Promise<{ scanned: number; incomplete: { logId: number; missing: string[] }[] }> {
  const rows = await db.select().from(marketplaceAutopilotActionLogsTable)
    .where(eq(marketplaceAutopilotActionLogsTable.companyId, companyId))
    .orderBy(desc(marketplaceAutopilotActionLogsTable.appliedAt))
    .limit(Math.min(50, limit));
  const incomplete: { logId: number; missing: string[] }[] = [];
  for (const row of rows) {
    const v = verifyAutopilotAuditRowCompleteness(row as any);
    if (!v.complete) incomplete.push({ logId: row.id, missing: v.missing });
  }
  return { scanned: rows.length, incomplete };
}

export async function buildAutopilotSafetyStatusBundle(
  companyId: number,
  options?: { includeAuditScan?: boolean },
): Promise<AutopilotSafetyStatusV1> {
  const migration006 = await checkMarketplaceAutopilotMigration006Ready();
  const types = [
    "repricing_apply",
    "margin_recovery_apply",
    "low_stock_override_apply",
    "pause_high_return_listing",
    "stale_resync_enqueue",
  ] as const;
  const rollbackByActionType: AutopilotSafetyStatusV1["rollbackByActionType"] = {} as any;
  for (const t of types) {
    rollbackByActionType[t] = describeRollbackSupportForActionType(t);
  }
  const out: AutopilotSafetyStatusV1 = {
    version: 1,
    generatedAtIso: new Date().toISOString(),
    migration006,
    routeMatrix: AUTOPILOT_ROUTE_MATRIX,
    rollbackByActionType,
  };
  if (options?.includeAuditScan) {
    out.recentAuditScan = await scanRecentAutopilotAuditCompleteness(companyId, 25);
  }
  return out;
}
