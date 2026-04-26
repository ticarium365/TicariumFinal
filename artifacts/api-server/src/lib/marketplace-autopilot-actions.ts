/**
 * Pazaryeri autopilot — yalnızca açık onay (confirm: true) ile yazma.
 * Rollback için snapshot; tahmini etki salt örnek (komisyon varsayımı).
 */
import {
  and, desc, eq, inArray, sql,
} from "drizzle-orm";
import {
  db,
  channelAccountsTable,
  marketplaceAutopilotActionLogsTable,
  productChannelMappingsTable,
  productsTable,
  salesTable,
  syncJobsTable,
} from "@workspace/db";
import { buildMarketplaceProfitAutomationV1 } from "./marketplace-profit-automation.js";
import { logSync } from "../services/marketplace/factory.js";

const PRICE_GAP_WARN_PCT = 12;
const COMMISSION_FACTOR = 0.85;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function signalFromPrices(master: number, channel: number): "overpriced_vs_master" | "underpriced_vs_master" | "ok" {
  if (master <= 0) return "ok";
  if (channel > master * (1 + PRICE_GAP_WARN_PCT / 100)) return "overpriced_vs_master";
  if (channel < master * (1 - PRICE_GAP_WARN_PCT / 100)) return "underpriced_vs_master";
  return "ok";
}

function suggestedReprice(master: number, purchase: number, channel: number): { signal: ReturnType<typeof signalFromPrices>; suggested: number } {
  const sig = signalFromPrices(master, channel);
  if (sig === "overpriced_vs_master") {
    return { signal: sig, suggested: roundMoney(master * 1.05) };
  }
  if (sig === "underpriced_vs_master") {
    const cost = purchase;
    return { signal: sig, suggested: roundMoney(Math.max(master * 0.97, cost > 0 ? cost * 1.02 : master * 0.95)) };
  }
  return { signal: "ok", suggested: roundMoney(channel) };
}

function suggestedMarginRecoveryPrice(purchase: number, master: number, channel: number, targetMarginPct = 14): number {
  const floor = purchase > 0 ? purchase * (1 + targetMarginPct / 100) : master * 0.98;
  const bump = Math.max(floor, channel * 1.02, master * 1.02);
  return roundMoney(Math.min(bump, channel * 1.25));
}

type MappingRow = typeof productChannelMappingsTable.$inferSelect;
type ProductRow = typeof productsTable.$inferSelect;

async function loadMappingsWithProducts(
  companyId: number,
  mappingIds: number[],
): Promise<{ mapping: MappingRow; product: ProductRow }[]> {
  if (!mappingIds.length) return [];
  const rows = await db
    .select()
    .from(productChannelMappingsTable)
    .innerJoin(productsTable, eq(productChannelMappingsTable.productId, productsTable.id))
    .where(and(
      eq(productChannelMappingsTable.companyId, companyId),
      inArray(productChannelMappingsTable.id, mappingIds),
    ));
  return rows.map((r) => ({ mapping: r.product_channel_mappings, product: r.products }));
}

async function salesVelocity30d(companyId: number, productIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!productIds.length) return map;
  const rows = await db
    .select({
      productId: salesTable.productId,
      u: sql<number>`coalesce(sum(${salesTable.quantity}), 0)::int`,
    })
    .from(salesTable)
    .where(and(
      eq(salesTable.companyId, companyId),
      sql`${salesTable.createdAt} >= NOW() - INTERVAL '30 days'`,
      sql`coalesce(${salesTable.returned}, false) = false`,
      inArray(salesTable.productId, productIds),
    ))
    .groupBy(salesTable.productId);
  for (const r of rows) map.set(r.productId, Number(r.u ?? 0));
  return map;
}

export type AutopilotPreviewLine = {
  mappingId: number;
  productId: number;
  productName: string;
  accountId: number;
  accountName: string;
  provider: string;
  currentChannelPrice: number;
  suggestedPrice: number;
  signal: string;
  unitsSold30d: number;
  estimatedMonthlyDeltaTryApprox: number;
  rationale: string;
};

export async function previewRepricingActions(
  companyId: number,
  mappingIds: number[],
): Promise<{ lines: AutopilotPreviewLine[]; totalEstimatedMonthlyDeltaTryApprox: number }> {
  const pairs = await loadMappingsWithProducts(companyId, mappingIds);
  const accNames = new Map<number, string>();
  const accProv = new Map<number, string>();
  const aids = [...new Set(pairs.map((p) => p.mapping.accountId))];
  if (aids.length) {
    const accs = await db.select().from(channelAccountsTable)
      .where(and(eq(channelAccountsTable.companyId, companyId), inArray(channelAccountsTable.id, aids)));
    for (const a of accs) {
      accNames.set(a.id, a.name);
      accProv.set(a.id, a.provider);
    }
  }
  const pids = [...new Set(pairs.map((p) => p.product.id))];
  const vel = await salesVelocity30d(companyId, pids);
  const lines: AutopilotPreviewLine[] = [];
  let total = 0;
  for (const { mapping, product } of pairs) {
    const master = Number(product.salePrice ?? 0);
    const purchase = Number(product.purchasePrice ?? 0);
    const channel = Number(mapping.priceOverride ?? master);
    const { signal, suggested } = suggestedReprice(master, purchase, channel);
    if (signal === "ok") continue;
    const units = vel.get(product.id) ?? 0;
    const deltaUnit = (suggested - channel) * COMMISSION_FACTOR;
    const monthly = roundMoney(deltaUnit * units);
    total += monthly;
    lines.push({
      mappingId: mapping.id,
      productId: product.id,
      productName: product.name,
      accountId: mapping.accountId,
      accountName: accNames.get(mapping.accountId) ?? "",
      provider: accProv.get(mapping.accountId) ?? "",
      currentChannelPrice: roundMoney(channel),
      suggestedPrice: suggested,
      signal,
      unitsSold30d: units,
      estimatedMonthlyDeltaTryApprox: monthly,
      rationale: "Komisyon ~%15 varsayımı ile birim fark × 30g satılan adet (yaklaşık aylık).",
    });
  }
  return { lines, totalEstimatedMonthlyDeltaTryApprox: roundMoney(total) };
}

export async function previewMarginRecoveryActions(
  companyId: number,
  mappingIds: number[],
  targetMarginPct = 14,
): Promise<{ lines: AutopilotPreviewLine[]; totalEstimatedMonthlyDeltaTryApprox: number }> {
  const pairs = await loadMappingsWithProducts(companyId, mappingIds);
  const accNames = new Map<number, string>();
  const accProv = new Map<number, string>();
  const aids = [...new Set(pairs.map((p) => p.mapping.accountId))];
  if (aids.length) {
    const accs = await db.select().from(channelAccountsTable)
      .where(and(eq(channelAccountsTable.companyId, companyId), inArray(channelAccountsTable.id, aids)));
    for (const a of accs) {
      accNames.set(a.id, a.name);
      accProv.set(a.id, a.provider);
    }
  }
  const pids = [...new Set(pairs.map((p) => p.product.id))];
  const vel = await salesVelocity30d(companyId, pids);
  const lines: AutopilotPreviewLine[] = [];
  let total = 0;
  for (const { mapping, product } of pairs) {
    const master = Number(product.salePrice ?? 0);
    const purchase = Number(product.purchasePrice ?? 0);
    const channel = Number(mapping.priceOverride ?? master);
    const suggested = suggestedMarginRecoveryPrice(purchase, master, channel, targetMarginPct);
    if (suggested <= channel + 0.009) continue;
    const units = vel.get(product.id) ?? 0;
    const monthly = roundMoney((suggested - channel) * COMMISSION_FACTOR * units);
    total += monthly;
    lines.push({
      mappingId: mapping.id,
      productId: product.id,
      productName: product.name,
      accountId: mapping.accountId,
      accountName: accNames.get(mapping.accountId) ?? "",
      provider: accProv.get(mapping.accountId) ?? "",
      currentChannelPrice: roundMoney(channel),
      suggestedPrice: suggested,
      signal: "margin_recovery",
      unitsSold30d: units,
      estimatedMonthlyDeltaTryApprox: monthly,
      rationale: `Hedef brüt marj ~%${targetMarginPct} + güvenli tavan; uygulama manuel onaylı.`,
    });
  }
  return { lines, totalEstimatedMonthlyDeltaTryApprox: roundMoney(total) };
}

export async function previewLowStockActions(companyId: number): Promise<{
  suggestions: {
    mappingId: number;
    productId: number;
    productName: string;
    accountName: string;
    productStock: number;
    minStock: number;
    currentStockOverride: number | null;
    suggestedStockOverride: number;
    rationale: string;
  }[];
}> {
  const rows = await db.execute<{
    mapping_id: number;
    product_id: number;
    product_name: string;
    account_name: string;
    stock: number;
    min_stock: number;
    stock_override: number | null;
  }>(sql`
    SELECT pcm.id AS mapping_id, p.id AS product_id, p.name AS product_name, ca.name AS account_name,
      p.stock, p.min_stock, pcm.stock_override
    FROM product_channel_mappings pcm
    INNER JOIN products p ON p.id = pcm.product_id AND p.company_id = ${companyId}
    INNER JOIN channel_accounts ca ON ca.id = pcm.account_id AND ca.company_id = ${companyId}
    WHERE pcm.company_id = ${companyId}
      AND pcm.is_published = true AND pcm.is_active = true AND p.is_active = true
      AND p.stock <= p.min_stock + 3
      AND EXISTS (
        SELECT 1 FROM sales s WHERE s.company_id = ${companyId} AND s.product_id = p.id
          AND s.created_at >= NOW() - INTERVAL '30 days' AND COALESCE(s.returned, false) = false
      )
    ORDER BY p.stock ASC
    LIMIT 40
  `);
  const suggestions = ((rows as { rows?: any[] }).rows ?? []).map((r) => {
    const st = Number(r.stock ?? 0);
    const min = Number(r.min_stock ?? 0);
    const curOv = r.stock_override != null ? Number(r.stock_override) : null;
    const suggested = Math.max(min + 5, st + Math.max(3, Math.ceil(min * 0.2)));
    return {
      mappingId: Number(r.mapping_id),
      productId: Number(r.product_id),
      productName: String(r.product_name ?? ""),
      accountName: String(r.account_name ?? ""),
      productStock: st,
      minStock: min,
      currentStockOverride: curOv,
      suggestedStockOverride: suggested,
      rationale: "Kanal stok override ile görünür stoğu yükseltmeyi düşünün; ERP stoğu değişmez.",
    };
  });
  return { suggestions };
}

export async function previewStaleResyncActions(
  companyId: number,
  mappingIds: number[],
): Promise<{ lines: { mappingId: number; accountId: number; productId: number; jobQueued: boolean; note: string }[] }> {
  const pairs = await loadMappingsWithProducts(companyId, mappingIds);
  const lines: { mappingId: number; accountId: number; productId: number; jobQueued: boolean; note: string }[] = [];
  for (const { mapping } of pairs) {
    const ok = !!mapping.externalProductId;
    lines.push({
      mappingId: mapping.id,
      accountId: mapping.accountId,
      productId: mapping.productId,
      jobQueued: ok,
      note: ok
        ? "Onay sonrası push_price kuyruğa alınır (harici fiyat güncellemesi)."
        : "external_product_id yok — önce ürün eşlemesini tamamlayın.",
    });
  }
  return { lines };
}

export async function previewPauseHighReturnActions(
  companyId: number,
  mappingIds: number[],
): Promise<{ lines: { mappingId: number; productName: string; accountName: string; note: string }[] }> {
  const pairs = await loadMappingsWithProducts(companyId, mappingIds);
  const accNames = new Map<number, string>();
  const aids = [...new Set(pairs.map((p) => p.mapping.accountId))];
  if (aids.length) {
    const accs = await db.select().from(channelAccountsTable)
      .where(and(eq(channelAccountsTable.companyId, companyId), inArray(channelAccountsTable.id, aids)));
    for (const a of accs) accNames.set(a.id, a.name);
  }
  return {
    lines: pairs.map(({ mapping, product }) => ({
      mappingId: mapping.id,
      productName: product.name,
      accountName: accNames.get(mapping.accountId) ?? "",
      note: "Yayın duraklatma: mapping.is_active=false (manuel onay).",
    })),
  };
}

export async function resolveActiveMappingIdsForProducts(
  companyId: number,
  productIds: number[],
): Promise<number[]> {
  if (!productIds.length) return [];
  const rows = await db
    .select({ id: productChannelMappingsTable.id })
    .from(productChannelMappingsTable)
    .where(and(
      eq(productChannelMappingsTable.companyId, companyId),
      inArray(productChannelMappingsTable.productId, productIds),
      eq(productChannelMappingsTable.isActive, true),
    ));
  return [...new Set(rows.map((r) => r.id))];
}

export function enrichAutopilotLogRow(row: typeof marketplaceAutopilotActionLogsTable.$inferSelect) {
  const snap = (row.beforeSnapshot as { mappings?: Record<string, unknown> } | null)?.mappings;
  const canRollback = row.status === "applied"
    && !row.rolledBackAt
    && snap
    && Object.keys(snap).length > 0;
  let rollbackHint = "";
  if (row.status === "rolled_back" || row.rolledBackAt) {
    rollbackHint = "Bu kayıt zaten geri alınmış.";
  } else if (row.status !== "applied") {
    rollbackHint = "Yalnızca uygulanmış (applied) kayıtlar geri alınabilir.";
  } else if (!canRollback) {
    rollbackHint = "Snapshot eksik — güvenli geri al önerilmez.";
  } else {
    const n = Object.keys(snap).length;
    rollbackHint = `Öneri: ${n} kanal eşlemesi için kayıtlı fiyat/stok/yayın değerleri geri yüklenir. Daha önce kuyruğa giren push_price işleri otomatik iptal edilmez; gerekirse İşler sekmesinden izleyin.`;
  }
  return {
    ...row,
    rollbackPreview: { canRollback, rollbackHint },
  };
}

export async function applyRepricingActions(
  companyId: number,
  userId: number,
  mappingIds: number[],
  confirm: boolean,
): Promise<{ logId: number; applied: number; jobsEnqueued: number }> {
  if (!confirm) {
    const e: any = new Error("confirm_required");
    e.code = "CONFIRM";
    throw e;
  }
  const preview = await previewRepricingActions(companyId, mappingIds);
  if (!preview.lines.length) throw new Error("nothing_to_apply");

  const before: Record<string, Record<string, unknown>> = {};
  const after: Record<string, Record<string, unknown>> = {};
  const targets: unknown[] = [];

  let jobs = 0;
  let outLogId = 0;
  await db.transaction(async (tx) => {
    const byAccount = new Map<number, { externalProductId: string; channelSku: string | null; price: number }[]>();
    for (const line of preview.lines) {
      const [m] = await tx.select().from(productChannelMappingsTable).where(and(
        eq(productChannelMappingsTable.id, line.mappingId),
        eq(productChannelMappingsTable.companyId, companyId),
      )).limit(1);
      if (!m) continue;
      before[String(m.id)] = {
        priceOverride: m.priceOverride,
        stockOverride: m.stockOverride,
        isActive: m.isActive,
        updatedAt: m.updatedAt?.toISOString?.() ?? null,
      };
      await tx.update(productChannelMappingsTable).set({
        priceOverride: line.suggestedPrice,
        updatedAt: new Date(),
      }).where(eq(productChannelMappingsTable.id, m.id));
      after[String(m.id)] = { priceOverride: line.suggestedPrice };
      targets.push({ mappingId: m.id, productId: m.productId, accountId: m.accountId, suggestedPrice: line.suggestedPrice });
      if (m.externalProductId) {
        const arr = byAccount.get(m.accountId) ?? [];
        arr.push({
          externalProductId: String(m.externalProductId),
          channelSku: m.channelSku ?? null,
          price: line.suggestedPrice,
        });
        byAccount.set(m.accountId, arr);
      }
    }
    if (!Object.keys(before).length) {
      throw new Error("nothing_to_apply");
    }
    for (const [accountId, items] of byAccount) {
      if (!items.length) continue;
      await tx.insert(syncJobsTable).values({
        companyId,
        accountId,
        jobType: "push_price",
        payload: { items, source: "autopilot_repricing" },
        createdBy: userId,
      });
      jobs++;
    }
    const [log] = await tx.insert(marketplaceAutopilotActionLogsTable).values({
      companyId,
      userId,
      actionType: "repricing_apply",
      status: "applied",
      targets,
      beforeSnapshot: { mappings: before },
      afterSnapshot: { mappings: after },
      estimatedImpact: {
        estimatedMonthlyDeltaTryApprox: preview.totalEstimatedMonthlyDeltaTryApprox,
        lines: preview.lines,
      },
      notes: "Manuel onaylı fiyat override + push_price kuyruğu",
    }).returning({ id: marketplaceAutopilotActionLogsTable.id });
    outLogId = log?.id ?? 0;
    if (!outLogId) throw new Error("log_insert_failed");
  });
  const logId = outLogId;
  await logSync({
    companyId,
    accountId: null,
    jobId: null,
    operation: "autopilot_repricing_apply",
    status: "success",
    level: "info",
    message: `Autopilot: ${preview.lines.length} kanal fiyatı güncellendi (log #${logId}).`,
    payload: { logId, mappingIds: preview.lines.map((l) => l.mappingId) },
  });
  return { logId, applied: preview.lines.length, jobsEnqueued: jobs };
}

export async function applyMarginRecoveryActions(
  companyId: number,
  userId: number,
  mappingIds: number[],
  targetMarginPct: number,
  confirm: boolean,
): Promise<{ logId: number; applied: number; jobsEnqueued: number }> {
  if (!confirm) {
    const e: any = new Error("confirm_required");
    e.code = "CONFIRM";
    throw e;
  }
  const preview = await previewMarginRecoveryActions(companyId, mappingIds, targetMarginPct);
  if (!preview.lines.length) throw new Error("nothing_to_apply");
  let jobs = 0;
  let logId = 0;
  const before: Record<string, Record<string, unknown>> = {};
  const after: Record<string, Record<string, unknown>> = {};
  const targets: unknown[] = preview.lines.map((l) => ({ ...l }));
  await db.transaction(async (tx) => {
    const byAccount = new Map<number, { externalProductId: string; channelSku: string | null; price: number }[]>();
    for (const line of preview.lines) {
      const [m] = await tx.select().from(productChannelMappingsTable).where(and(
        eq(productChannelMappingsTable.id, line.mappingId),
        eq(productChannelMappingsTable.companyId, companyId),
      )).limit(1);
      if (!m) continue;
      before[String(m.id)] = { priceOverride: m.priceOverride, stockOverride: m.stockOverride, isActive: m.isActive };
      await tx.update(productChannelMappingsTable).set({
        priceOverride: line.suggestedPrice,
        updatedAt: new Date(),
      }).where(eq(productChannelMappingsTable.id, m.id));
      after[String(m.id)] = { priceOverride: line.suggestedPrice };
      if (m.externalProductId) {
        const arr = byAccount.get(m.accountId) ?? [];
        arr.push({
          externalProductId: String(m.externalProductId),
          channelSku: m.channelSku ?? null,
          price: line.suggestedPrice,
        });
        byAccount.set(m.accountId, arr);
      }
    }
    if (!Object.keys(before).length) {
      throw new Error("nothing_to_apply");
    }
    for (const [accountId, items] of byAccount) {
      if (!items.length) continue;
      await tx.insert(syncJobsTable).values({
        companyId,
        accountId,
        jobType: "push_price",
        payload: { items, source: "autopilot_margin_recovery" },
        createdBy: userId,
      });
      jobs++;
    }
    const [log] = await tx.insert(marketplaceAutopilotActionLogsTable).values({
      companyId,
      userId,
      actionType: "margin_recovery_apply",
      status: "applied",
      targets,
      beforeSnapshot: { mappings: before },
      afterSnapshot: { mappings: after },
      estimatedImpact: {
        estimatedMonthlyDeltaTryApprox: preview.totalEstimatedMonthlyDeltaTryApprox,
        targetMarginPct,
        lines: preview.lines,
      },
    }).returning({ id: marketplaceAutopilotActionLogsTable.id });
    logId = log?.id ?? 0;
  });
  await logSync({
    companyId,
    accountId: null,
    jobId: null,
    operation: "autopilot_margin_recovery_apply",
    status: "success",
    level: "info",
    message: `Autopilot marj: ${preview.lines.length} fiyat güncellendi (log #${logId}).`,
    payload: { logId },
  });
  return { logId, applied: preview.lines.length, jobsEnqueued: jobs };
}

export async function applyLowStockOverrides(
  companyId: number,
  userId: number,
  updates: { mappingId: number; stockOverride: number }[],
  confirm: boolean,
): Promise<{ logId: number; applied: number }> {
  if (!confirm) {
    const e: any = new Error("confirm_required");
    e.code = "CONFIRM";
    throw e;
  }
  if (!updates.length) throw new Error("nothing_to_apply");
  const ids = updates.map((u) => u.mappingId);
  const before: Record<string, Record<string, unknown>> = {};
  const after: Record<string, Record<string, unknown>> = {};
  let logId = 0;
  await db.transaction(async (tx) => {
    for (const u of updates) {
      const [m] = await tx.select().from(productChannelMappingsTable).where(and(
        eq(productChannelMappingsTable.id, u.mappingId),
        eq(productChannelMappingsTable.companyId, companyId),
      )).limit(1);
      if (!m) continue;
      before[String(m.id)] = { stockOverride: m.stockOverride, priceOverride: m.priceOverride };
      await tx.update(productChannelMappingsTable).set({
        stockOverride: Math.max(0, Math.floor(u.stockOverride)),
        updatedAt: new Date(),
      }).where(eq(productChannelMappingsTable.id, m.id));
      after[String(m.id)] = { stockOverride: Math.max(0, Math.floor(u.stockOverride)) };
    }
    if (!Object.keys(before).length) {
      throw new Error("nothing_to_apply");
    }
    const [log] = await tx.insert(marketplaceAutopilotActionLogsTable).values({
      companyId,
      userId,
      actionType: "low_stock_override_apply",
      status: "applied",
      targets: updates,
      beforeSnapshot: { mappings: before },
      afterSnapshot: { mappings: after },
      estimatedImpact: { note: "Kanal stok görünümü; ERP stoğu değişmedi." },
    }).returning({ id: marketplaceAutopilotActionLogsTable.id });
    logId = log?.id ?? 0;
  });
  await logSync({
    companyId,
    accountId: null,
    jobId: null,
    operation: "autopilot_low_stock_override",
    status: "success",
    level: "info",
    message: `Autopilot stok override: ${updates.length} mapping (log #${logId}).`,
    payload: { logId },
  });
  return { logId, applied: updates.length };
}

export async function applyStaleResync(
  companyId: number,
  userId: number,
  mappingIds: number[],
  confirm: boolean,
): Promise<{ logId: number; jobsEnqueued: number }> {
  if (!confirm) {
    const e: any = new Error("confirm_required");
    e.code = "CONFIRM";
    throw e;
  }
  const pairs = await loadMappingsWithProducts(companyId, mappingIds);
  const byAccount = new Map<number, { externalProductId: string; channelSku: string | null; price: number }[]>();
  const targets: unknown[] = [];
  for (const { mapping, product } of pairs) {
    if (!mapping.externalProductId) continue;
    const price = Number(mapping.priceOverride ?? product.salePrice ?? 0);
    const arr = byAccount.get(mapping.accountId) ?? [];
    arr.push({
      externalProductId: String(mapping.externalProductId),
      channelSku: mapping.channelSku ?? null,
      price: roundMoney(price),
    });
    byAccount.set(mapping.accountId, arr);
    targets.push({ mappingId: mapping.id, accountId: mapping.accountId, productId: mapping.productId });
  }
  if (!targets.length) {
    throw new Error("nothing_to_apply");
  }
  let jobs = 0;
  let logId = 0;
  await db.transaction(async (tx) => {
    for (const [accountId, items] of byAccount) {
      if (!items.length) continue;
      await tx.insert(syncJobsTable).values({
        companyId,
        accountId,
        jobType: "push_price",
        payload: { items, source: "autopilot_stale_resync" },
        createdBy: userId,
      });
      jobs++;
    }
    const [log] = await tx.insert(marketplaceAutopilotActionLogsTable).values({
      companyId,
      userId,
      actionType: "stale_resync_enqueue",
      status: "applied",
      targets,
      beforeSnapshot: { note: "DB mapping alanları değişmedi; yalnızca kuyruk." },
      afterSnapshot: { jobsEnqueued: jobs },
      estimatedImpact: { note: "Harici kanal fiyat senkronu — gerçek etki sağlayıcıya bağlı." },
    }).returning({ id: marketplaceAutopilotActionLogsTable.id });
    logId = log?.id ?? 0;
  });
  await logSync({
    companyId,
    accountId: null,
    jobId: null,
    operation: "autopilot_stale_resync",
    status: "success",
    level: "info",
    message: `Autopilot: ${jobs} push_price job sıraya alındı (log #${logId}).`,
    payload: { logId, mappingIds },
  });
  return { logId, jobsEnqueued: jobs };
}

export async function applyPauseHighReturn(
  companyId: number,
  userId: number,
  mappingIds: number[],
  confirm: boolean,
): Promise<{ logId: number; paused: number }> {
  if (!confirm) {
    const e: any = new Error("confirm_required");
    e.code = "CONFIRM";
    throw e;
  }
  const before: Record<string, Record<string, unknown>> = {};
  const after: Record<string, Record<string, unknown>> = {};
  let n = 0;
  let logId = 0;
  await db.transaction(async (tx) => {
    for (const id of mappingIds) {
      const [m] = await tx.select().from(productChannelMappingsTable).where(and(
        eq(productChannelMappingsTable.id, id),
        eq(productChannelMappingsTable.companyId, companyId),
      )).limit(1);
      if (!m) continue;
      before[String(m.id)] = { isActive: m.isActive, isPublished: m.isPublished };
      await tx.update(productChannelMappingsTable).set({
        isActive: false,
        updatedAt: new Date(),
      }).where(eq(productChannelMappingsTable.id, m.id));
      after[String(m.id)] = { isActive: false };
      n++;
    }
    if (!n) {
      throw new Error("nothing_to_apply");
    }
    const [log] = await tx.insert(marketplaceAutopilotActionLogsTable).values({
      companyId,
      userId,
      actionType: "pause_high_return_listing",
      status: "applied",
      targets: mappingIds.map((id) => ({ mappingId: id })),
      beforeSnapshot: { mappings: before },
      afterSnapshot: { mappings: after },
      estimatedImpact: { note: "Yayın duraklatıldı — geri al ile is_active eski haline döner." },
    }).returning({ id: marketplaceAutopilotActionLogsTable.id });
    logId = log?.id ?? 0;
  });
  await logSync({
    companyId,
    accountId: null,
    jobId: null,
    operation: "autopilot_pause_high_return",
    status: "success",
    level: "warn",
    message: `Autopilot: ${n} mapping pasifleştirildi (log #${logId}).`,
    payload: { logId, mappingIds },
  });
  return { logId, paused: n };
}

export async function rollbackAutopilotAction(
  companyId: number,
  userId: number,
  logId: number,
  confirm: boolean,
): Promise<{ restored: number }> {
  if (!confirm) {
    const e: any = new Error("confirm_required");
    e.code = "CONFIRM";
    throw e;
  }
  const [row] = await db.select().from(marketplaceAutopilotActionLogsTable).where(and(
    eq(marketplaceAutopilotActionLogsTable.id, logId),
    eq(marketplaceAutopilotActionLogsTable.companyId, companyId),
  )).limit(1);
  if (!row) throw new Error("log_not_found");
  if (row.status !== "applied") throw new Error("not_rollbackable");
  if (row.rolledBackAt) throw new Error("already_rolled_back");
  if (row.actionType === "stale_resync_enqueue") {
    const e: any = new Error("rollback_unsupported_for_action");
    e.code = "ROLLBACK_UNSUPPORTED";
    throw e;
  }
  const snap = (row.beforeSnapshot as any)?.mappings as Record<string, Record<string, unknown>> | undefined;
  if (!snap) throw new Error("no_snapshot");

  let restored = 0;
  await db.transaction(async (tx) => {
    for (const [midStr, prev] of Object.entries(snap)) {
      const mid = Number(midStr);
      if (!Number.isFinite(mid)) continue;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if ("priceOverride" in prev) patch.priceOverride = prev.priceOverride as number | null;
      if ("stockOverride" in prev) patch.stockOverride = prev.stockOverride as number | null;
      if ("isActive" in prev) patch.isActive = prev.isActive as boolean;
      if ("isPublished" in prev) patch.isPublished = prev.isPublished as boolean;
      await tx.update(productChannelMappingsTable).set(patch as any).where(and(
        eq(productChannelMappingsTable.id, mid),
        eq(productChannelMappingsTable.companyId, companyId),
      ));
      restored++;
    }
    await tx.update(marketplaceAutopilotActionLogsTable).set({
      status: "rolled_back",
      rolledBackAt: new Date(),
      rolledBackByUserId: userId,
    }).where(eq(marketplaceAutopilotActionLogsTable.id, logId));
  });
  await logSync({
    companyId,
    accountId: null,
    jobId: null,
    operation: "autopilot_rollback",
    status: "success",
    level: "info",
    message: `Autopilot rollback: log #${logId}, ${restored} mapping geri yüklendi.`,
    payload: { logId },
  });
  return { restored };
}

export async function listAutopilotHistory(companyId: number, limit = 40) {
  return db.select().from(marketplaceAutopilotActionLogsTable)
    .where(eq(marketplaceAutopilotActionLogsTable.companyId, companyId))
    .orderBy(desc(marketplaceAutopilotActionLogsTable.appliedAt))
    .limit(Math.min(100, limit));
}

export async function bulkApplyFromProfitRecommendations(
  companyId: number,
  userId: number,
  confirm: boolean,
): Promise<{ logId: number; applied: number; jobsEnqueued: number; skipped: number }> {
  const profit = await buildMarketplaceProfitAutomationV1(companyId);
  const ids = profit.repricingRecommendations.map((r) => r.mappingId);
  if (!ids.length) return { logId: 0, applied: 0, jobsEnqueued: 0, skipped: 0 };
  const r = await applyRepricingActions(companyId, userId, ids, confirm);
  return { ...r, skipped: profit.repricingRecommendations.length - r.applied };
}

export async function buildMarketplaceAutopilotFounderRoiSummaryV1(): Promise<{
  generatedAtIso: string;
  rows: {
    companyId: number;
    companyName: string;
    actions30d: number;
    estimatedDeltaTry30dApprox: number;
    rolledBack: number;
  }[];
}> {
  const raw = await db.execute<{
    company_id: number;
    company_name: string;
    actions: number;
    est: number;
    rb: number;
  }>(sql`
    SELECT l.company_id, c.name AS company_name,
      count(*) FILTER (WHERE l.rolled_back_at IS NULL)::int AS actions,
      coalesce(sum((l.estimated_impact->>'estimatedMonthlyDeltaTryApprox')::double precision)
        FILTER (WHERE l.rolled_back_at IS NULL), 0)::float AS est,
      count(*) FILTER (WHERE l.rolled_back_at IS NOT NULL)::int AS rb
    FROM marketplace_autopilot_action_logs l
    INNER JOIN companies c ON c.id = l.company_id
    WHERE l.applied_at >= NOW() - INTERVAL '30 days'
      AND l.action_type IN ('repricing_apply', 'margin_recovery_apply', 'low_stock_override_apply')
    GROUP BY l.company_id, c.name
    ORDER BY est DESC NULLS LAST
    LIMIT 25
  `);
  const rows = ((raw as { rows?: any[] }).rows ?? []).map((r) => ({
    companyId: Number(r.company_id),
    companyName: String(r.company_name ?? ""),
    actions30d: Number(r.actions ?? 0),
    estimatedDeltaTry30dApprox: roundMoney(Number(r.est ?? 0)),
    rolledBack: Number(r.rb ?? 0),
  }));
  return { generatedAtIso: new Date().toISOString(), rows };
}
