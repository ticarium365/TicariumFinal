import {
  MarketplaceProvider, MarketplaceAccountConfig, MarketplaceProductPayload,
  PushResult, IncomingOrder, ProviderHealth,
} from "./types.js";

abstract class BaseStub implements MarketplaceProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  // capabilities=false ⇒ worker bu çağrıları SKIP eder (failed/retry değil)
  readonly capabilities = { pushProduct: false, pushStock: false, pushPrice: false, pullOrders: false, pullProducts: false };
  constructor(protected cfg: MarketplaceAccountConfig) {}
  protected abstract requiredKeys(): string[];
  protected missing(): string | null {
    for (const k of this.requiredKeys()) if (!this.cfg.credentials?.[k]) return `Eksik: ${k}`;
    return null;
  }
  protected notImpl(op: string): PushResult {
    return { success: false, message: `${this.displayName} ${op} henüz uygulanmadı (sözleşme tamam, HTTP eklenmeyi bekliyor).` };
  }
  async healthCheck(): Promise<ProviderHealth> {
    const m = this.missing();
    if (m) return { ok: false, message: m, checkedAt: new Date() };
    return { ok: false, message: `${this.displayName} HTTP entegrasyonu henüz uygulanmadı (kimlikler kayıtlı, çağrı eklenmeyi bekliyor).`, checkedAt: new Date() };
  }
  async pushProduct(_: MarketplaceProductPayload): Promise<PushResult> { return this.notImpl("pushProduct"); }
  async pushStock(_: any): Promise<PushResult> { return this.notImpl("pushStock"); }
  async pushPrice(_: any): Promise<PushResult> { return this.notImpl("pushPrice"); }
  async pullOrders(): Promise<IncomingOrder[]> { return []; }
}

export class TrendyolProvider extends BaseStub { readonly key = "trendyol"; readonly displayName = "Trendyol"; protected requiredKeys() { return ["sellerId", "apiKey", "apiSecret"]; } }
export class HepsiburadaProvider extends BaseStub { readonly key = "hepsiburada"; readonly displayName = "Hepsiburada"; protected requiredKeys() { return ["merchantId", "username", "password"]; } }
export class N11Provider extends BaseStub { readonly key = "n11"; readonly displayName = "N11"; protected requiredKeys() { return ["apiKey", "apiSecret"]; } }
export class AmazonTrProvider extends BaseStub { readonly key = "amazon_tr"; readonly displayName = "Amazon TR"; protected requiredKeys() { return ["sellerId", "accessKey", "secretKey", "marketplaceId"]; } }
export class CiceksepetiProvider extends BaseStub { readonly key = "ciceksepeti"; readonly displayName = "Çiçeksepeti"; protected requiredKeys() { return ["dealerCode", "apiKey"]; } }
export class PttAvmProvider extends BaseStub { readonly key = "pttavm"; readonly displayName = "PTT AVM"; protected requiredKeys() { return ["username", "password"]; } }
export class ShopifyProvider extends BaseStub { readonly key = "shopify"; readonly displayName = "Shopify"; protected requiredKeys() { return ["storeUrl", "accessToken"]; } }
export class WooCommerceProvider extends BaseStub { readonly key = "woocommerce"; readonly displayName = "WooCommerce"; protected requiredKeys() { return ["storeUrl", "consumerKey", "consumerSecret"]; } }
export class IdeasoftProvider extends BaseStub { readonly key = "ideasoft"; readonly displayName = "İdeaSoft"; protected requiredKeys() { return ["storeUrl", "clientId", "clientSecret"]; } }
export class TicimaxProvider extends BaseStub { readonly key = "ticimax"; readonly displayName = "Ticimax"; protected requiredKeys() { return ["storeUrl", "apiKey"]; } }
