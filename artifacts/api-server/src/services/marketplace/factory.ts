import { db, channelAccountsTable, syncLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { MarketplaceProvider, MarketplaceAccountConfig } from "./types.js";
import { MockMarketplaceProvider } from "./mock-provider.js";
import { decryptSecrets } from "../../lib/secret-crypto.js";
import {
  TrendyolProvider, HepsiburadaProvider, N11Provider, AmazonTrProvider,
  CiceksepetiProvider, PttAvmProvider, ShopifyProvider, WooCommerceProvider,
  IdeasoftProvider, TicimaxProvider,
} from "./stub-providers.js";
import { TrendyolRealProvider } from "./trendyol-provider.js";
import { HepsiburadaRealProvider } from "./hepsiburada-provider.js";
import { N11RealProvider } from "./n11-provider.js";

export const MP_REGISTRY: Record<string, new (cfg: MarketplaceAccountConfig) => MarketplaceProvider> = {
  mock: MockMarketplaceProvider,
  trendyol: TrendyolRealProvider,
  hepsiburada: HepsiburadaRealProvider,
  n11: N11RealProvider,
  amazon_tr: AmazonTrProvider,
  ciceksepeti: CiceksepetiProvider,
  pttavm: PttAvmProvider,
  shopify: ShopifyProvider,
  woocommerce: WooCommerceProvider,
  ideasoft: IdeasoftProvider,
  ticimax: TicimaxProvider,
};

export const MP_META = [
  { key: "mock", label: "Mock (Sandbox)", needs: [] },
  { key: "trendyol", label: "Trendyol", needs: ["sellerId", "apiKey", "apiSecret"] },
  { key: "hepsiburada", label: "Hepsiburada", needs: ["merchantId", "username", "password"] },
  { key: "n11", label: "N11", needs: ["apiKey", "apiSecret"] },
  { key: "amazon_tr", label: "Amazon TR", needs: ["sellerId", "accessKey", "secretKey", "marketplaceId"] },
  { key: "ciceksepeti", label: "Çiçeksepeti", needs: ["dealerCode", "apiKey"] },
  { key: "pttavm", label: "PTT AVM", needs: ["username", "password"] },
  { key: "shopify", label: "Shopify", needs: ["storeUrl", "accessToken"] },
  { key: "woocommerce", label: "WooCommerce", needs: ["storeUrl", "consumerKey", "consumerSecret"] },
  { key: "ideasoft", label: "İdeaSoft", needs: ["storeUrl", "clientId", "clientSecret"] },
  { key: "ticimax", label: "Ticimax", needs: ["storeUrl", "apiKey"] },
];

export async function getProviderForAccount(companyId: number, accountId: number): Promise<{
  provider: MarketplaceProvider;
  account: typeof channelAccountsTable.$inferSelect;
}> {
  const [account] = await db.select().from(channelAccountsTable).where(and(
    eq(channelAccountsTable.id, accountId),
    eq(channelAccountsTable.companyId, companyId),
  )).limit(1);
  if (!account) throw new Error("account_not_found");
  const Klass = MP_REGISTRY[account.provider] || MockMarketplaceProvider;
  // Provider'a credentials geçerken decrypt et — DB'de hep şifreli durur
  const cfg: MarketplaceAccountConfig = {
    provider: account.provider, sandbox: account.sandbox,
    credentials: decryptSecrets(account.credentials || {}), settings: account.settings || {},
  };
  return { provider: new Klass(cfg), account };
}

export async function logSync(opts: {
  companyId: number; accountId?: number | null; jobId?: number | null;
  operation: string; status?: "success" | "failed" | "partial"; level?: "info" | "warn" | "error";
  durationMs?: number; itemsProcessed?: number; itemsFailed?: number;
  message?: string; payload?: any; errorPayload?: any;
}) {
  try {
    await db.insert(syncLogsTable).values({
      companyId: opts.companyId,
      accountId: opts.accountId ?? null,
      jobId: opts.jobId ?? null,
      operation: opts.operation,
      status: opts.status || "success",
      level: opts.level || "info",
      durationMs: opts.durationMs ?? null,
      itemsProcessed: opts.itemsProcessed || 0,
      itemsFailed: opts.itemsFailed || 0,
      message: opts.message || null,
      payload: opts.payload || null,
      errorPayload: opts.errorPayload || null,
    });
  } catch (e) {
    console.error("[marketplace/logSync]", e);
  }
}
