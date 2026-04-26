import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, "..", "src", "routes");
const src = fs.readFileSync(path.join(routesDir, "subscriptions.ts"), "utf8");
const lines = src.split("\n");

function sliceLine1Based(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

const outDir = path.join(routesDir, "subscriptions");
fs.mkdirSync(outDir, { recursive: true });

const seedBody = sliceLine1Based(257, 572);
fs.writeFileSync(
  path.join(outDir, "subscriptions-plans-seed.ts"),
  `/**
 * Abonelik plan tanımları + DB seed — \`subscriptions.ts\`'ten ayrıldı.
 */
import { db, subscriptionPlansTable, companySubscriptionsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { invalidateFeaturesCache } from "../../middlewares/features.js";

${seedBody}
`,
);

const helpersBody = `${sliceLine1Based(37, 255)}\n\n${sliceLine1Based(578, 596)}`;
fs.writeFileSync(
  path.join(outDir, "subscriptions-shared-helpers.ts"),
  `/**
 * subscriptions ortak yardımcılar — router'dan ayrıldı.
 */
import {
  db,
  companiesTable,
  subscriptionInvoicesTable,
  collectionReminderActionsTable,
  productFunnelEventsTable,
  usersTable,
  productsTable,
  branchesTable,
  salesTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte } from "drizzle-orm";

${helpersBody}
`,
);

const metricsRoute = sliceLine1Based(1694, 4245);
fs.writeFileSync(
  path.join(outDir, "subscriptions-admin-billing-metrics.ts"),
  `/**
 * Süper-admin GET /subscriptions/admin/billing/metrics — tek dosya.
 */
import type { Router } from "express";
import {
  db,
  subscriptionPlansTable, companySubscriptionsTable,
  subscriptionInvoicesTable, subscriptionUsageTable,
  usersTable, productsTable, branchesTable, salesTable,
  companiesTable,
  contactRequestsTable,
  productFunnelEventsTable,
  paymentsTable,
  collectionReminderActionsTable,
  b2bQuoteRequestsTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte, lte, lt, isNotNull, inArray, gt, isNull, or, count } from "drizzle-orm";
import { requireSuperAdmin } from "../../middlewares/auth.js";
import { invalidateFeaturesCache } from "../../middlewares/features.js";
import { buildMarketplaceWorkerFounderAlertsV1 } from "../../lib/marketplace-worker-observability.js";
import { buildMarketplaceSelfHealFounderAlertsV1 } from "../../services/marketplace/self-heal.js";
import { buildMarketplaceProfitFounderAlertsV1 } from "../../lib/marketplace-profit-automation.js";
import {
  computeFounderOvernightPackV1,
  computeB2bOpsSupplementV1,
  buildFounderIntelligenceV2,
  buildFounderIntelligenceV3,
  buildRevenueEngineBundleV1,
  buildChurnPreventionBundleV1,
  buildB2bOpsBundleV1,
  buildDocsPlaybooksBundleV1,
  buildBillingMetricsPerformanceBundleV1,
} from "../../lib/founder-overnight-pack.js";
import {
  churnReasonDisplay,
  collectionRecoverability01,
  copilotEnrichV1,
  upgradeProbability01,
  mondayPeriodKey,
  reminderActionIdempotencyKey,
  normalizeCancelReasonCode,
  parseCancelReasonLabel,
  appendSubscriptionNote,
  buildCancelNoteLine,
  recordOverdueInvoiceRecovered,
  calcUsage,
} from "./subscriptions-shared-helpers.js";

export function registerSubscriptionsAdminBillingMetrics(router: Router): void {
${metricsRoute}
}
`,
);

console.log("split-subscriptions: wrote 3 files under src/routes/subscriptions/");
