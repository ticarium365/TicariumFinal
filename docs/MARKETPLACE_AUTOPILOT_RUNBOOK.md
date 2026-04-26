# Marketplace Autopilot — Operator Runbook

This document covers **manually approved** marketplace actions (pricing, channel stock override, listing pause, queue-only resync) and how to operate them safely. There are **no automatic destructive writes** in this lane; every mutation requires an authenticated user and, for writes, **`confirm: true` as a JSON boolean** (not the string `"true"`).

## 1. Preconditions

Deploy öncesi genel adımlar: `docs/DEPLOYMENT_RUNBOOK.md` ve `pnpm run ci:gate` (şema doğrulaması için `DATABASE_URL`).

1. **Database:** Migration `006_marketplace_autopilot_action_logs.sql` must be applied so table `marketplace_autopilot_action_logs` exists.
2. **Database (ROI):** Migration `007_marketplace_autopilot_roi.sql` adds `outcome_metrics` / `outcome_computed_at` on logs and `marketplace_autopilot_intent_events` for preview funnel metrics.
3. **Database (closed-loop prefs):** Migration `008_company_settings_autopilot_closed_loop.sql` adds `company_settings.autopilot_closed_loop` (JSON: promote/suppress action types for ranking only — **no auto-apply**).
4. **API check:** `GET /api/marketplace/autopilot/safety-status`  
   - `migration006.ok` must be `true` before relying on history/rollback.
5. **Roles:**
   - **Read** (previews, history, safety checks): `admin`, `staff`, `super_admin`.
   - **Apply & rollback:** `admin`, `super_admin` only — **staff must never receive 200** on apply/rollback routes.

## 2. Route map (audit reference)

Authoritative matrix is returned in `safety-status` as `routeMatrix` and is defined in code as `AUTOPILOT_ROUTE_MATRIX` (`marketplace-autopilot-safety.ts`). Summary:

| Method | Path | Writes | Roles |
|--------|------|--------|--------|
| GET | `/marketplace/autopilot/safety-status` | No | admin, staff, super_admin |
| GET | `/marketplace/autopilot/preview/low-stock` | No | admin, staff, super_admin |
| POST | `/marketplace/autopilot/preview/*` | No | admin, staff, super_admin |
| GET | `/marketplace/autopilot/history` | No | admin, staff, super_admin |
| POST | `/marketplace/autopilot/apply/*` | Yes | **admin, super_admin** |
| POST | `/marketplace/autopilot/rollback` | Yes | **admin, super_admin** |
| GET | `/marketplace/autopilot/founder-roi-summary` | No | **super_admin only** (cross-tenant) |
| GET | `/marketplace/autopilot/roi/tenant-summary` | No | admin, staff, super_admin |
| GET | `/marketplace/autopilot/roi/next-best-action` | No | admin, staff, super_admin |
| POST | `/marketplace/autopilot/roi/recompute` | Yes | admin, super_admin |
| GET | `/marketplace/autopilot/roi/founder-dashboard` | No | **super_admin only** |
| GET | `/marketplace/autopilot/closed-loop/bundle` | No | admin, staff, super_admin |
| GET | `/marketplace/autopilot/closed-loop/preferences` | No | admin, staff, super_admin |
| POST | `/marketplace/autopilot/closed-loop/preferences` | Yes | **admin, super_admin** (ranking prefs only) |

All `/apply/*` and `/rollback` bodies must include **`"confirm": true`** (boolean).  
`POST /closed-loop/preferences` also requires **`"confirm": true`**; it only updates ranking preferences JSON, not catalog prices.

## 3. Standard operating procedure

1. Call the relevant **preview** (or `GET preview/low-stock`).
2. Review **estimated impact** (where provided); it is a model, not realized P&L.
3. Run optional checks:
   - `POST /marketplace/autopilot/safety/verify-preview-determinism` with `mappingIds` (and `kind: "margin"` + `targetMarginPct` for margin).
   - `POST /marketplace/autopilot/safety/verify-stale-preview-apply` for stale resync mapping sets.
4. Apply with **`confirm: true`** only after human approval.
5. Confirm outcome in **`GET /history`** and marketplace **sync logs** (`/marketplace/logs`).

## 4. Rollback semantics by `action_type`

| `action_type` | Rollback via API? | What is restored |
|----------------|-------------------|------------------|
| `repricing_apply` | Yes | `priceOverride` (+ snapshot fields present: `stockOverride`, `isActive`, …) on affected mappings. |
| `margin_recovery_apply` | Yes | Same as repricing for mapping snapshot. |
| `low_stock_override_apply` | Yes | `stockOverride` / `priceOverride` from snapshot. |
| `pause_high_return_listing` | Yes | `isActive`, `isPublished` from snapshot. |
| `stale_resync_enqueue` | **No** | Only `push_price` jobs were enqueued; **no mapping snapshot** — rollback endpoint returns `rollback_unsupported_for_action`. Mitigation: enqueue compensating jobs manually if needed. |

Rollback also requires **`confirm: true`**. Already rolled-back logs cannot be rolled back again.

## 5. Audit trail

Each apply should create a row in `marketplace_autopilot_action_logs` with `userId`, `actionType`, `targets`, `beforeSnapshot`, `afterSnapshot`, `estimatedImpact` (where applicable), and `sync_logs` entries (`autopilot_*` operations).

Optional completeness scan (read-only):  
`GET /api/marketplace/autopilot/safety-status?includeAuditScan=1`  
Review `recentAuditScan.incomplete` if non-empty.

## 6. Cross-tenant founder ROI

`GET /api/marketplace/autopilot/founder-roi-summary` aggregates across companies. **Only `super_admin`** may call it. Tenant admins must receive **403** — if not, treat as a security defect.

## 7. Troubleshooting

| Symptom | Check |
|--------|--------|
| `confirm_required` (400) | Body must be JSON with boolean `true`, not `"true"` or `1`. |
| `migration006.ok: false` | Run migration 006 on the database. |
| `nothing_to_apply` | No eligible rows (e.g. all mapping IDs invalid, or no external product id for stale). |
| `rollback_unsupported_for_action` | Log type is queue-only (`stale_resync_enqueue`). |
| Preview vs apply mismatch | Re-run preview; run determinism endpoint; check concurrent edits. |
| `closed_loop_prefs_schema_missing` (503) | Apply migration `008_company_settings_autopilot_closed_loop.sql`. |

## 8. Automated safety tests

Run (against a running API, default `http://localhost:8080/api`):

```bash
cd artifacts/api-server
node --test tests/integration.test.mjs --test-name-pattern="Marketplace Autopilot"
```

Çalışan API: varsayılan `http://localhost:8080/api` (`integration.test.mjs` içindeki `BASE`).

The suite asserts staff cannot apply/rollback, tenant admin cannot access founder ROI, strict `confirm` is enforced, and `safety-status` responds successfully for an admin session.

## 9. ROI engine (evidence-based)

**What is measured:** For each applied log, optional **outcome** = sum of non-returned `sales.total_price` (and profit) for affected **product_ids** in a **14-day window before** `applied_at` vs **14 days after** (after window truncated to “now” if not elapsed). This is **correlational**, not proof that autopilot caused the delta.

**Endpoints:**

- `GET /api/marketplace/autopilot/roi/tenant-summary` — rollback rate by `action_type`, win rate (Δciro > 0 on still-applied logs), preview/apply funnel ratio, top performer categories, “noisy” low-value flags, `schemaReady` from migration 007.
- `GET /api/marketplace/autopilot/roi/next-best-action` — ranks `action_type` by historical median realized revenue delta (requires ≥3 outcome rows).
- `POST /api/marketplace/autopilot/roi/recompute` — body `{ "limit": 80, "force": false }` (admin) — fills `outcome_metrics` for recent logs.
- `GET /api/marketplace/autopilot/roi/founder-dashboard` — super_admin cross-tenant table (90d action volume, rollback %, median realized Δciro, 30d preview vs apply counts).

**Previews** write lightweight rows to `marketplace_autopilot_intent_events` (intent_kind + counts) for acceptance metrics — no catalog writes.

**Honesty:** `outcome_metrics.disclaimers[]` is stored per log; UI shows `roiOutcomeSummary` on `GET /history`. If migration 007 is missing, `schemaReady` is false and recompute is disabled until SQL is applied.
