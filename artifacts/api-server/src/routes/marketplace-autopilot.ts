/**
 * Pazaryeri Autopilot HTTP yüzeyi — güvenlik özeti (Sprint: Safety harness):
 * - Okuma: requireReader = admin | staff | super_admin
 * - Yazma (apply/*, rollback): requireApprover = admin | super_admin (staff asla)
 * - Founder ROI: yalnız super_admin (cross-tenant)
 * - confirm: readStrictConfirm(req.body) → yalnız JSON boolean true; lib'e her zaman literal true geçilir
 * Tam matris: GET /safety-status → routeMatrix veya `AUTOPILOT_ROUTE_MATRIX` (marketplace-autopilot-safety.ts)
 */
import { Router, type Request, type Response } from "express";
import { requireRole } from "../middlewares/auth.js";
import {
  applyLowStockOverrides,
  applyMarginRecoveryActions,
  applyPauseHighReturn,
  applyRepricingActions,
  applyStaleResync,
  bulkApplyFromProfitRecommendations,
  buildMarketplaceAutopilotFounderRoiSummaryV1,
  enrichAutopilotLogRow,
  listAutopilotHistory,
  previewLowStockActions,
  previewMarginRecoveryActions,
  previewPauseHighReturnActions,
  previewRepricingActions,
  previewStaleResyncActions,
  resolveActiveMappingIdsForProducts,
  rollbackAutopilotAction,
} from "../lib/marketplace-autopilot-actions.js";
import {
  buildAutopilotSafetyStatusBundle,
  readStrictConfirm,
  verifyMarginPreviewDeterminism,
  verifyRepricingPreviewDeterminism,
  verifyStaleResyncPreviewApplyConsistency,
} from "../lib/marketplace-autopilot-safety.js";
import {
  attachRoiOutcomeSummary,
  buildMarketplaceAutopilotFounderRoiDashboardV1,
  buildNextBestAutopilotActionV1,
  buildTenantAutopilotRoiSummaryV1,
  insertAutopilotIntentEvent,
  recomputeOutcomesForCompany,
} from "../lib/marketplace-autopilot-roi.js";
import {
  buildMarketplaceAutopilotClosedLoopBundleV1,
  loadAutopilotClosedLoopPreferences,
  saveAutopilotClosedLoopPreferences,
} from "../lib/marketplace-autopilot-closed-loop.js";

const router = Router();
const requireReader = requireRole(["admin", "staff", "super_admin"]);
const requireApprover = requireRole(["admin", "super_admin"]);

function parseIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
}

function autopilotErr(res: Response, e: any) {
  if (e?.code === "CONFIRM") {
    return res.status(400).json({ error: "confirm_required", message: "Bu işlem için body.confirm: true zorunludur." });
  }
  if (e?.code === "ROLLBACK_UNSUPPORTED") {
    return res.status(400).json({
      error: "rollback_unsupported_for_action",
      message: "Bu aksiyon türü mapping snapshot ile geri alınamaz (ör. yalnızca kuyruk).",
    });
  }
  const msg = String(e?.message || "autopilot_failed");
  if (msg === "nothing_to_apply") return res.status(400).json({ error: "nothing_to_apply", message: "Uygulanacak satır yok." });
  if (msg === "log_not_found") return res.status(404).json({ error: "log_not_found" });
  if (msg === "not_rollbackable") return res.status(400).json({ error: "not_rollbackable" });
  if (msg === "already_rolled_back") return res.status(400).json({ error: "already_rolled_back" });
  if (msg === "no_snapshot") return res.status(400).json({ error: "no_snapshot" });
  if (e?.code === "ROI_SCHEMA_MISSING" || msg === "roi_schema_missing") {
    return res.status(503).json({ error: "roi_schema_missing", message: "Migration 007 (outcome_metrics + intent_events) uygulanmalı." });
  }
  if (e?.code === "CLOSED_LOOP_SCHEMA_MISSING" || msg === "closed_loop_prefs_schema_missing") {
    return res.status(503).json({
      error: "closed_loop_prefs_schema_missing",
      message: "Migration 008 (company_settings.autopilot_closed_loop) uygulanmalı.",
    });
  }
  return res.status(500).json({ error: "autopilot_failed", message: msg });
}

/**
 * GET /safety-status — migration 006 hazırlığı, route matrisi, rollback semantiği;
 * `?includeAuditScan=1` ile son N autopilot logunda audit alan tamlığı (salt okunur).
 */
router.get("/safety-status", requireReader, async (req: Request, res: Response) => {
  try {
    const includeAuditScan = String(req.query.includeAuditScan || "") === "1";
    const bundle = await buildAutopilotSafetyStatusBundle(req.companyId!, { includeAuditScan });
    return res.json(bundle);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

/** Tahmini etki + satır detayı (yazma yok) */
router.post("/preview/repricing", requireReader, async (req: Request, res: Response) => {
  try {
    const mappingIds = parseIds((req.body as any)?.mappingIds);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    const preview = await previewRepricingActions(req.companyId!, mappingIds);
    void insertAutopilotIntentEvent(req.companyId!, req.session.user?.id, "preview_repricing", {
      mappingCount: mappingIds.length,
    }).catch(() => {});
    return res.json(preview);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/apply/repricing", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { mappingIds?: unknown[]; confirm?: boolean };
    const mappingIds = parseIds(body?.mappingIds);
    const userId = req.session.user!.id;
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({
        error: "confirm_required",
        message: "Uygulama için body.confirm tam olarak JSON boolean true olmalıdır (string \"true\" kabul edilmez).",
      });
    }
    const r = await applyRepricingActions(req.companyId!, userId, mappingIds, true);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

/** Kâr motorundaki repricing mappingId'leri ile toplu uygula */
router.post("/apply/profit-repricing-bulk", requireApprover, async (req: Request, res: Response) => {
  try {
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({
        error: "confirm_required",
        message: "body.confirm tam olarak JSON boolean true olmalıdır.",
      });
    }
    const r = await bulkApplyFromProfitRecommendations(req.companyId!, req.session.user!.id, true);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/preview/margin-recovery", requireReader, async (req: Request, res: Response) => {
  try {
    const body = req.body as { mappingIds?: unknown[]; targetMarginPct?: number };
    const mappingIds = parseIds(body?.mappingIds);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    const pct = Number(body?.targetMarginPct);
    const preview = await previewMarginRecoveryActions(
      req.companyId!,
      mappingIds,
      Number.isFinite(pct) && pct > 0 && pct < 80 ? pct : 14,
    );
    void insertAutopilotIntentEvent(req.companyId!, req.session.user?.id, "preview_margin_recovery", {
      mappingCount: mappingIds.length,
    }).catch(() => {});
    return res.json(preview);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/apply/margin-recovery", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { mappingIds?: unknown[]; targetMarginPct?: number; confirm?: boolean };
    const mappingIds = parseIds(body?.mappingIds);
    const pct = Number(body?.targetMarginPct);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({ error: "confirm_required", message: "body.confirm strict boolean true olmalıdır." });
    }
    const r = await applyMarginRecoveryActions(
      req.companyId!,
      req.session.user!.id,
      mappingIds,
      Number.isFinite(pct) && pct > 0 && pct < 80 ? pct : 14,
      true,
    );
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.get("/preview/low-stock", requireReader, async (req: Request, res: Response) => {
  try {
    const preview = await previewLowStockActions(req.companyId!);
    void insertAutopilotIntentEvent(req.companyId!, req.session.user?.id, "preview_low_stock", {
      suggestionCount: preview.suggestions?.length ?? 0,
    }).catch(() => {});
    return res.json(preview);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/apply/low-stock", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { updates?: { mappingId: number; stockOverride: number }[]; confirm?: boolean };
    const updates = Array.isArray(body?.updates) ? body!.updates! : [];
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({ error: "confirm_required", message: "body.confirm strict boolean true olmalıdır." });
    }
    const r = await applyLowStockOverrides(req.companyId!, req.session.user!.id, updates, true);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/preview/stale-resync", requireReader, async (req: Request, res: Response) => {
  try {
    const mappingIds = parseIds((req.body as any)?.mappingIds);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    const preview = await previewStaleResyncActions(req.companyId!, mappingIds);
    void insertAutopilotIntentEvent(req.companyId!, req.session.user?.id, "preview_stale_resync", {
      mappingCount: mappingIds.length,
    }).catch(() => {});
    return res.json(preview);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/apply/stale-resync", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { mappingIds?: unknown[]; confirm?: boolean };
    const mappingIds = parseIds(body?.mappingIds);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({ error: "confirm_required", message: "body.confirm strict boolean true olmalıdır." });
    }
    const r = await applyStaleResync(req.companyId!, req.session.user!.id, mappingIds, true);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/preview/pause-high-return", requireReader, async (req: Request, res: Response) => {
  try {
    const body = req.body as { mappingIds?: unknown[]; productIds?: unknown[] };
    const fromBody = parseIds(body?.mappingIds);
    const fromProducts = await resolveActiveMappingIdsForProducts(req.companyId!, parseIds(body?.productIds));
    const mappingIds = [...new Set([...fromBody, ...fromProducts])];
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_or_product_ids_required" });
    const preview = await previewPauseHighReturnActions(req.companyId!, mappingIds);
    void insertAutopilotIntentEvent(req.companyId!, req.session.user?.id, "preview_pause_high_return", {
      mappingCount: mappingIds.length,
    }).catch(() => {});
    return res.json({ ...preview, mappingIdsUsed: mappingIds });
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/apply/pause-high-return", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { mappingIds?: unknown[]; productIds?: unknown[]; confirm?: boolean };
    const fromBody = parseIds(body?.mappingIds);
    const fromProducts = await resolveActiveMappingIdsForProducts(req.companyId!, parseIds(body?.productIds));
    const mappingIds = [...new Set([...fromBody, ...fromProducts])];
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_or_product_ids_required" });
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({ error: "confirm_required", message: "body.confirm strict boolean true olmalıdır." });
    }
    const r = await applyPauseHighReturn(req.companyId!, req.session.user!.id, mappingIds, true);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.get("/history", requireReader, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 40);
    const rows = await listAutopilotHistory(req.companyId!, limit);
    return res.json(rows.map((row) => attachRoiOutcomeSummary(enrichAutopilotLogRow(row as any))));
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.get("/roi/tenant-summary", requireReader, async (req: Request, res: Response) => {
  try {
    const bundle = await buildTenantAutopilotRoiSummaryV1(req.companyId!);
    return res.json(bundle);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.get("/roi/next-best-action", requireReader, async (req: Request, res: Response) => {
  try {
    const bundle = await buildNextBestAutopilotActionV1(req.companyId!);
    return res.json(bundle);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

/** Closed-loop: ROI + davranış ile sıralı öneriler; yazma yok */
router.get("/closed-loop/bundle", requireReader, async (req: Request, res: Response) => {
  try {
    const bundle = await buildMarketplaceAutopilotClosedLoopBundleV1(req.companyId!);
    return res.json(bundle);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.get("/closed-loop/preferences", requireReader, async (req: Request, res: Response) => {
  try {
    const p = await loadAutopilotClosedLoopPreferences(req.companyId!);
    return res.json(p);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

/** Tercih listeleri — sıralama boost/suppress; otomatik apply yok */
router.post("/closed-loop/preferences", requireApprover, async (req: Request, res: Response) => {
  try {
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({
        error: "confirm_required",
        message: "body.confirm strict JSON boolean true olmalıdır.",
      });
    }
    const body = req.body as {
      promotedActionTypes?: unknown[];
      suppressedActionTypes?: unknown[];
    };
    const promotedActionTypes = Array.isArray(body?.promotedActionTypes)
      ? body.promotedActionTypes!.map((x) => String(x))
      : undefined;
    const suppressedActionTypes = Array.isArray(body?.suppressedActionTypes)
      ? body.suppressedActionTypes!.map((x) => String(x))
      : undefined;
    const saved = await saveAutopilotClosedLoopPreferences(req.companyId!, req.session.user!.id, {
      promotedActionTypes,
      suppressedActionTypes,
    });
    return res.json({ ok: true, preferences: saved });
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/roi/recompute", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { limit?: number; force?: boolean };
    const r = await recomputeOutcomesForCompany(req.companyId!, {
      limit: body?.limit,
      force: body?.force === true,
    });
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.get("/roi/founder-dashboard", requireRole(["super_admin"]), async (_req: Request, res: Response) => {
  try {
    const bundle = await buildMarketplaceAutopilotFounderRoiDashboardV1();
    return res.json(bundle);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/rollback", requireApprover, async (req: Request, res: Response) => {
  try {
    const body = req.body as { logId?: number; confirm?: boolean };
    const logId = Number(body?.logId);
    if (!Number.isFinite(logId) || logId <= 0) return res.status(400).json({ error: "log_id_required" });
    if (!readStrictConfirm(req.body)) {
      return res.status(400).json({ error: "confirm_required", message: "body.confirm strict boolean true olmalıdır." });
    }
    const r = await rollbackAutopilotAction(req.companyId!, req.session.user!.id, logId, true);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

/** Aynı preview iki kez — drift / yarış sinyali (salt okunur). */
router.post("/safety/verify-preview-determinism", requireReader, async (req: Request, res: Response) => {
  try {
    const mappingIds = parseIds((req.body as any)?.mappingIds);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    const kind = String((req.body as any)?.kind || "repricing").toLowerCase();
    if (kind === "margin") {
      const pct = Number((req.body as any)?.targetMarginPct);
      const r = await verifyMarginPreviewDeterminism(
        req.companyId!,
        mappingIds,
        Number.isFinite(pct) && pct > 0 && pct < 80 ? pct : 14,
      );
      return res.json({ kind: "margin", ...r });
    }
    const r = await verifyRepricingPreviewDeterminism(req.companyId!, mappingIds);
    return res.json({ kind: "repricing", ...r });
  } catch (e) {
    return autopilotErr(res, e);
  }
});

router.post("/safety/verify-stale-preview-apply", requireReader, async (req: Request, res: Response) => {
  try {
    const mappingIds = parseIds((req.body as any)?.mappingIds);
    if (!mappingIds.length) return res.status(400).json({ error: "mapping_ids_required" });
    const r = await verifyStaleResyncPreviewApplyConsistency(req.companyId!, mappingIds);
    return res.json(r);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

/** Cross-tenant — yalnız süper admin */
router.get("/founder-roi-summary", requireRole(["super_admin"]), async (_req: Request, res: Response) => {
  try {
    const bundle = await buildMarketplaceAutopilotFounderRoiSummaryV1();
    return res.json(bundle);
  } catch (e) {
    return autopilotErr(res, e);
  }
});

export default router;
