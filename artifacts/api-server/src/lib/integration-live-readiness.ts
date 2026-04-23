/**
 * Kiracı bazlı entegrasyon canlı hazırlık özeti — dürüst durumlar, gizli anahtar içermez.
 * Ödeme sağlayıcısı, pazaryeri kanal hesapları, senkron hataları ve kargo mimarisi (kurallar).
 */
import {
  and, desc, eq, gte, sql, count,
} from "drizzle-orm";
import {
  db,
  channelAccountsTable,
  syncLogsTable,
  syncJobsTable,
  shippingZonesTable,
  shippingRulesTable,
  accountingSyncLogsTable,
  ecommerceSyncLogsTable,
  salesTable,
  productsTable,
  SHIPPING_CARRIERS,
} from "@workspace/db";
import { getBillingProvider } from "../services/billing/iyzico.js";
import { MP_META } from "../services/marketplace/factory.js";

export type IntegrationReadinessState =
  | "healthy"
  | "unhealthy"
  | "unchecked"
  | "inactive";

export type MarketplaceAccountReadinessRow = {
  accountId: number;
  name: string;
  provider: string;
  sandbox: boolean;
  isActive: boolean;
  readiness: IntegrationReadinessState;
  readinessDetail: string;
  lastSyncAtIso: string | null;
  lastHealthOk: boolean | null;
  credentialFieldsExpected: number;
  credentialFieldsNonEmpty: number;
};

export type SyncFailureRow = {
  id: number;
  source: "marketplace_log" | "marketplace_job" | "accounting_sync" | "ecommerce_sync";
  accountId: number | null;
  integrationId?: number;
  operationOrType: string;
  message: string | null;
  status: string;
  createdAtIso: string;
};

export type LiveReadinessBundleV1 = {
  version: 1;
  generatedAtIso: string;
  payment: {
    providerName: "mock" | "iyzico";
    healthOk: boolean;
    healthMessage: string;
    mode: "sandbox" | "live" | "unknown";
    /** Anahtar varlığı (değer değil). */
    iyzicoApiKeyConfigured: boolean;
    iyzicoSecretConfigured: boolean;
    iyzicoModeOverride: string | null;
    returnPathHint: string;
  };
  marketplace: {
    accounts: MarketplaceAccountReadinessRow[];
    /** Son başarısız pazaryeri senkron / iş logları */
    recentFailures: SyncFailureRow[];
  };
  shipping: {
    architecturePhase: "zones_and_rules";
    description: string;
    zonesCount: number;
    rulesCount: number;
    defaultZoneConfigured: boolean;
    managePath: string;
    carrierCatalog: readonly string[];
  };
  extSyncFailures: {
    accounting: Pick<SyncFailureRow, "id" | "integrationId" | "operationOrType" | "message" | "createdAtIso">[];
    ecommerce: Pick<SyncFailureRow, "id" | "integrationId" | "operationOrType" | "message" | "createdAtIso">[];
  };
};

function countCredentialSignals(provider: string, creds: Record<string, unknown>): { expected: number; nonEmpty: number } {
  const meta = MP_META.find((m) => m.key === provider);
  const needs = meta?.needs ?? [];
  if (!needs.length) return { expected: 0, nonEmpty: 0 };
  let nonEmpty = 0;
  for (const k of needs) {
    const v = creds[k];
    if (v == null) continue;
    if (typeof v === "string" && v.trim().length > 0) nonEmpty++;
    else if (typeof v === "object" && v !== null) nonEmpty++; // şifreli blob veya nesne — yapılandırılmış kabul
  }
  return { expected: needs.length, nonEmpty };
}

function rowReadiness(
  isActive: boolean,
  lastHealthOk: boolean | null,
  lastHealthMessage: string | null,
  credExpected: number,
  credNonEmpty: number,
): { readiness: IntegrationReadinessState; readinessDetail: string } {
  if (!isActive) {
    return { readiness: "inactive", readinessDetail: "Hesap pasif." };
  }
  if (credExpected > 0 && credNonEmpty < credExpected) {
    return {
      readiness: "unchecked",
      readinessDetail: `Sağlayıcı şablonu ${credExpected} alan bekliyor; yapılandırılmış görünen: ${credNonEmpty}. Eksik alanlar sağlık testini başarısız yapar.`,
    };
  }
  if (lastHealthOk === true) {
    return { readiness: "healthy", readinessDetail: lastHealthMessage || "Son sağlık kontrolü başarılı." };
  }
  if (lastHealthOk === false) {
    return { readiness: "unhealthy", readinessDetail: lastHealthMessage || "Son sağlık kontrolü başarısız." };
  }
  return {
    readiness: "unchecked",
    readinessDetail: "Henüz otomatik sağlık taraması yok. Pazaryeri → mağaza satırından «Sağlık» çalıştırın.",
  };
}

export async function buildLiveReadinessBundleV1(companyId: number): Promise<LiveReadinessBundleV1> {
  const provider = getBillingProvider();
  const hc = await provider.healthCheck();

  const [
    accounts,
    mpFailLogs,
    mpFailJobs,
    accFail,
    ecFail,
    zoneAgg,
    ruleCnt,
  ] = await Promise.all([
    db.select().from(channelAccountsTable)
      .where(eq(channelAccountsTable.companyId, companyId))
      .orderBy(desc(channelAccountsTable.updatedAt))
      .limit(40),
    db.select().from(syncLogsTable)
      .where(and(eq(syncLogsTable.companyId, companyId), eq(syncLogsTable.status, "failed")))
      .orderBy(desc(syncLogsTable.createdAt))
      .limit(12),
    db.select().from(syncJobsTable)
      .where(and(eq(syncJobsTable.companyId, companyId), eq(syncJobsTable.status, "failed")))
      .orderBy(desc(syncJobsTable.createdAt))
      .limit(8),
    db.select({
      id: accountingSyncLogsTable.id,
      integrationId: accountingSyncLogsTable.integrationId,
      syncType: accountingSyncLogsTable.syncType,
      errorMessage: accountingSyncLogsTable.errorMessage,
      startedAt: accountingSyncLogsTable.startedAt,
    })
      .from(accountingSyncLogsTable)
      .where(and(
        eq(accountingSyncLogsTable.companyId, companyId),
        eq(accountingSyncLogsTable.status, "failed"),
      ))
      .orderBy(desc(accountingSyncLogsTable.startedAt))
      .limit(8),
    db.select({
      id: ecommerceSyncLogsTable.id,
      integrationId: ecommerceSyncLogsTable.integrationId,
      syncType: ecommerceSyncLogsTable.syncType,
      errorMessage: ecommerceSyncLogsTable.errorMessage,
      startedAt: ecommerceSyncLogsTable.startedAt,
    })
      .from(ecommerceSyncLogsTable)
      .where(and(
        eq(ecommerceSyncLogsTable.companyId, companyId),
        eq(ecommerceSyncLogsTable.status, "failed"),
      ))
      .orderBy(desc(ecommerceSyncLogsTable.startedAt))
      .limit(8),
    db.select({
      n: sql<number>`count(*)::int`,
      def: sql<number>`count(*) filter (where ${shippingZonesTable.isDefault} = true)::int`,
    }).from(shippingZonesTable).where(eq(shippingZonesTable.companyId, companyId)),
    db.select({ c: count() }).from(shippingRulesTable).where(eq(shippingRulesTable.companyId, companyId)),
  ]);

  const zonesRow = zoneAgg[0] as { n?: number | string; def?: number | string } | undefined;
  const zonesCount = Number(zonesRow?.n ?? 0);
  const defaultZoneConfigured = Number(zonesRow?.def ?? 0) > 0;
  const rulesCount = Number(ruleCnt[0]?.c ?? 0);

  const mRows: MarketplaceAccountReadinessRow[] = accounts.map((a) => {
    const creds = (a.credentials && typeof a.credentials === "object" ? a.credentials : {}) as Record<string, unknown>;
    const { expected, nonEmpty } = countCredentialSignals(a.provider, creds);
    const { readiness, readinessDetail } = rowReadiness(
      a.isActive,
      a.lastHealthOk ?? null,
      a.lastHealthMessage ?? null,
      expected,
      nonEmpty,
    );
    return {
      accountId: a.id,
      name: a.name,
      provider: a.provider,
      sandbox: a.sandbox,
      isActive: a.isActive,
      readiness,
      readinessDetail,
      lastSyncAtIso: a.lastSyncAt ? new Date(a.lastSyncAt).toISOString() : null,
      lastHealthOk: a.lastHealthOk ?? null,
      credentialFieldsExpected: expected,
      credentialFieldsNonEmpty: nonEmpty,
    };
  });

  const recentFailures: SyncFailureRow[] = [
    ...mpFailLogs.map((r) => ({
      id: r.id,
      source: "marketplace_log" as const,
      accountId: r.accountId ?? null,
      operationOrType: r.operation,
      message: r.message ?? null,
      status: r.status,
      createdAtIso: new Date(r.createdAt).toISOString(),
    })),
    ...mpFailJobs.map((j) => ({
      id: j.id,
      source: "marketplace_job" as const,
      accountId: j.accountId,
      operationOrType: j.jobType,
      message: j.lastError ?? null,
      status: j.status,
      createdAtIso: new Date(j.createdAt).toISOString(),
    })),
  ].sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1)).slice(0, 16);

  return {
    version: 1,
    generatedAtIso: new Date().toISOString(),
    payment: {
      providerName: provider.name,
      healthOk: hc.ok,
      healthMessage: hc.message,
      mode: hc.mode,
      iyzicoApiKeyConfigured: Boolean(process.env.IYZICO_API_KEY?.trim()),
      iyzicoSecretConfigured: Boolean(process.env.IYZICO_SECRET_KEY?.trim()),
      iyzicoModeOverride: (process.env.IYZICO_MODE || "").trim() || null,
      returnPathHint:
        "Ödeme dönüşü: üretimde `/api/billing/return` ve tarayıcıda `/odeme/sonuc` hostunun uygulama kökü ile eşleştiğini doğrulayın.",
    },
    marketplace: {
      accounts: mRows,
      recentFailures,
    },
    shipping: {
      architecturePhase: "zones_and_rules",
      description:
        "Taşıyıcı API entegrasyonu henüz yok; gönderim ücreti şirket içi bölge + kural motoru ile hesaplanır. Gelecekte taşıyıcı credential’ları burada ping’lenecek.",
      zonesCount,
      rulesCount,
      defaultZoneConfigured,
      managePath: "/kargo",
      carrierCatalog: SHIPPING_CARRIERS,
    },
    extSyncFailures: {
      accounting: accFail.map((r) => ({
        id: r.id,
        integrationId: r.integrationId,
        operationOrType: r.syncType,
        message: r.errorMessage ?? null,
        createdAtIso: new Date(r.startedAt).toISOString(),
      })),
      ecommerce: ecFail.map((r) => ({
        id: r.id,
        integrationId: r.integrationId,
        operationOrType: r.syncType,
        message: r.errorMessage ?? null,
        createdAtIso: new Date(r.startedAt).toISOString(),
      })),
    },
  };
}

/** Katalog önerileri için hafif aktivite profili (ürün / satış / kanal). */
export async function loadTenantActivityProfile(companyId: number): Promise<{
  productsCount: number;
  salesLast30d: number;
  activeMarketplaceChannelAccounts: number;
}> {
  const ago30 = new Date(Date.now() - 30 * 86400000);
  const [[pc], [sc], [cc]] = await Promise.all([
    db.select({ c: count() }).from(productsTable)
      .where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive, true))),
    db.select({ c: count() }).from(salesTable).where(and(
      eq(salesTable.companyId, companyId),
      gte(salesTable.createdAt, ago30),
    )),
    db.select({ c: count() }).from(channelAccountsTable).where(and(
      eq(channelAccountsTable.companyId, companyId),
      eq(channelAccountsTable.isActive, true),
    )),
  ]);
  return {
    productsCount: Number(pc?.c ?? 0),
    salesLast30d: Number(sc?.c ?? 0),
    activeMarketplaceChannelAccounts: Number(cc?.c ?? 0),
  };
}
