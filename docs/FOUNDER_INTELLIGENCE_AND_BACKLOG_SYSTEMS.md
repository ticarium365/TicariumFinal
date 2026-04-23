# Founder intelligence & backlog systems

Internal reference for revenue/cash/retention/B2B executive surfaces built on Ticarium365. **Heuristics and SQL aggregations are not ML models** unless stated otherwise.

## Primary endpoint

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/subscriptions/admin/billing/metrics` | Super admin session | MRR/ARR, plan breakdown, layered `founderSignals*` payloads, attribution, copilot, expansion, overnight pack |

**UI:** `artifacts/prosan/src/pages/super-admin/index.tsx` (billing metrics query `staleTime: 180_000`).

## Response payload (key blocks)

| Key | Role |
|-----|------|
| `founderSignals` … `founderSignalsV8` | Earlier waves: trials, churn, collections, B2B stuck quotes, execution digest |
| `founderSignalsV9` | Plan upgrade counts, B2B SLA medians, `todayRecommendedActions` |
| `founderSignalsV10` | CEO briefing, weekly digest, risk/growth lines, `recommendationsV2`, recoverability preview, upgrade source 30d |
| `founderSignalsV11` | v10 + Copilot line, weekly board summary, **risk / growth / cash radars**, top 3 moves with why/ROI/ignore, conditional **playbook** steps |
| `founderCopilotV1` | Rule-based enrichments: `whyNow`, `expectedRoiBand`, `ifIgnored`, fastest win / growth bet / biggest risk |
| `expansionEngineV1` | Upgrade probability heuristic, warm call list, plan mismatch hints, timing line |
| `revenueAttributionV2` | Signup→first paid median, trial/grace cohort %, checkout→paid %, plan upgrade momentum |
| `revenueAttributionV3` | v2 + UTM + `props.source` on paid, grace views by source, time-to-paid by **current** plan slug, trial by calendar month, pricing_view→7d paid count, upsell triggers |
| `founderOvernightPackV1` | Batched “executive backlog” board (see below) |
| `founderIntelligenceV2` | **Compound layer** on top of overnight pack + Copilot + v6 MRR risk: daily priorities, money due soon, hidden risks, easiest wins, top opportunities, watchlist, recommended actions (pure assembly, no extra SQL). |
| `founderIntelligenceV3` | **Daily action scoring**: Copilot aksiyonları + yürütme arama listesi + v2 öncelikleri birleştirilir; kural tabanlı 0–100 skor ve sürücü kırılımı (ML değil). |
| `revenueEngineBundleV1` | **Revenue cluster**: upgrade probability leaders, expansion candidates, pricing path winners (v3 pages + pricing_view→7d paid), comeback/grace lines, lost revenue map, 30d/90d forecast echo + narrative. |
| `churnPreventionBundleV1` | **Churn cluster**: sessiz churn listesi (overnight dormant + v6 zayıf etkileşim), iptal nedeni 30g, rescue hunisi (v7 + v5 operating), save tetikleyicileri, mini playbook. |
| `b2bOpsBundleV1` | **B2B cluster**: overnight `b2bOpsBoardV1` + `sellerQuoteAcceptance` (v6) + `computeB2bOpsSupplementV1` tekrar alıcı çiftleri (90g, ≥2 kabul); koçluk ipuçları. |
| `billingMetricsPerformanceBundleV1` | Handler süresi (ms), paralel SQL slot sayıları, istemci `staleTime` önerisi, kısa sağlık notları. |
| `docsPlaybooksBundleV1` | `docs/playbooks/*.md` indeksi + `founderSignalsV11.recommendedPlaybook` aynası (tek response’ta operasyon bağlantısı). |

## Module: `founderOvernightPack` (`artifacts/api-server/src/lib/founder-overnight-pack.ts`)

**What it does:** One `Promise.all` of SQL reads + in-process joins, returning a single object that covers many backlog themes without N separate round-trips from the client.

**Why it exists:** Maps the 100-item backlog to **measurable** building blocks: upgrade ROI from real `plan_upgraded` JSON (`prev_plan_slug`, `new_plan_slug`, `source`), cash ladders, churn reasons, B2B aging, funnel deltas, call list merge.

**Inputs (from metrics route):**

- `accountsToCallSeed`: merged from `founderSignalsV5.collectionPriority` and `expansionEngineV1.warmAccountsToContact`.

**Sub-blocks:**

1. **`planUpgradeRoiBoardV1`** — Last 30d `plan_upgraded` rows; MRR delta = `price_monthly(new)` − `price_monthly(prev)` via `subscription_plans`. Breakdowns: destination plan, `source`, company size band (product count buckets).
2. **`revenueForecastsV1`** — Naive MRR 30d/90d from baseline + upgrade momentum (not a forecast engine).
3. **`collectionsBoardV2`** — Pending invoice sums: due in 7d, due in 30d, overdue total; median days overdue before pay (90d paid-overdue); top debtors; `overdue_invoice_recovered_after_reminder` 30d count; digest string.
4. **`retentionChurnBoardV1`** — `cancel_reason` histogram (30d cancelled subs); estimated MRR lost heuristic; dormant actives (no sales 30d); hint strings.
5. **`b2bOpsBoardV1`** — Pending quote aging buckets; bottom close-rate sellers (90d, min 3 decided); digest line.
6. **`funnelHygieneV1`** — Month: checkout vs paid vs `billing_return_error`; 48h funnel delta for selected keys.
7. **`executiveAttentionV1`** — Deduped top-10 call list, risk bullets, “what changed” lines, single `founderAttentionLine`.

**Business impact:** Founder/super-admin sees cash timing, upgrade ROI proof, churn/dormant signals, and B2B operational drag in one scrollable card.

**Pure builders (same module):** `buildFounderIntelligenceV2`, `buildFounderIntelligenceV3`, `buildRevenueEngineBundleV1`, `buildChurnPreventionBundleV1`, `buildB2bOpsBundleV1`, `buildDocsPlaybooksBundleV1`, `buildBillingMetricsPerformanceBundleV1` — consume pack + signals from the metrics handler; **one round-trip** for the client.

**Extra read (parallel to pack):** `computeB2bOpsSupplementV1` — single SQL batch for repeat buyer–seller pairs; failures are isolated via `Promise.allSettled` so the overnight pack can still return.

**Future extensions:** Store daily snapshots for true “vs yesterday”; wire CTA copy IDs into `product_funnel_events`; trained pay-probability; seller-level materialized views if quote volume grows.

## Persisted product funnel events

**Route:** `POST /api/product-analytics/track` (`artifacts/api-server/src/routes/product-analytics.ts`) — subset persisted in `product_funnel_events` (`PERSIST_TO_DB`).

**Notable keys:** `plan_upgraded` (billing webhook + admin set-plan), `billing_return_success` / `billing_return_error`, `billing_checkout_started`, trial/grace/collection events.

**Schema:** `lib/db/src/schema/product_funnel_events.ts` — indexes on `(company_id, created_at)`, `(event_key, created_at)`.

## Related migrations / indexes (existing)

- Pending quote index e.g. `lib/db/migrations/005_b2b_pending_status_created_idx.sql` (B2B scale).

## 100-item backlog — coverage note

The overnight pack and prior v10/v11/copilot/attribution layers **intentionally bundle** many backlog lines into fewer shipped systems. Items not yet first-class (e.g. full pricing section click map, A/B hooks, trained churn model, operator notes DB) remain **extension** work documented above.

## Build / quality

- `pnpm run build` in `artifacts/api-server` and `artifacts/prosan` after changes.
- Avoid destructive migrations without review; new indexes only with measured need.
