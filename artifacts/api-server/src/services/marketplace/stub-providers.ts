import {
  MarketplaceProvider, MarketplaceAccountConfig, MarketplaceProductPayload,
  PushResult, IncomingOrder, ProviderHealth,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// BaseStub — provider-agnostic iskelet. Sprint 51-55 zenginleştirme:
//   PRODUCTION (cfg.sandbox=false): tüm push/pull metotları "henüz uygulanmadı"
//     yanıtı verir; capabilities=false → worker SKIP eder (kuyruk dolmaz).
//   SANDBOX  (cfg.sandbox=true):     tüm metotlar mock-success yanıt verir;
//     capabilities=true → worker normal akar; UI/E2E tüm akış denenebilir.
// Gerçek provider'lar (Trendyol/HB/N11) kendi capabilities ve metotlarıyla
// shadow eder; bu base sadece stub provider'lar için geçerlidir.
// ─────────────────────────────────────────────────────────────────────────────
abstract class BaseStub implements MarketplaceProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  constructor(protected cfg: MarketplaceAccountConfig) {}
  protected abstract requiredKeys(): string[];
  protected missing(): string | null {
    for (const k of this.requiredKeys()) if (!this.cfg.credentials?.[k]) return `Eksik: ${k}`;
    return null;
  }
  // Sandbox modunda capabilities açık → worker push/pull'ları gerçekten dener (mock döner).
  // Production'da kapalı → worker SKIP, kuyrukta failed/retry birikmez.
  get capabilities() {
    if (this.cfg.sandbox) {
      return { pushProduct: true, pushStock: true, pushPrice: true, pullOrders: true, pullProducts: false };
    }
    return { pushProduct: false, pushStock: false, pushPrice: false, pullOrders: false, pullProducts: false };
  }
  protected notImpl(op: string): PushResult {
    return { success: false, message: `${this.displayName} ${op} PRODUCTION transport'u henüz uygulanmadı. Test için mağaza ayarlarından "Sandbox modu"nu açın.` };
  }
  protected mockSuccess(op: string, extra?: Record<string, any>): PushResult {
    return {
      success: true,
      message: `${this.displayName} (sandbox): ${op} mock kabul edildi.`,
      raw: { provider: this.key, sandbox: true, simulated: true, op, timestamp: new Date().toISOString(), ...extra },
    };
  }
  async healthCheck(): Promise<ProviderHealth> {
    const m = this.missing();
    if (m && !this.cfg.sandbox) return { ok: false, message: m, checkedAt: new Date() };
    if (this.cfg.sandbox) {
      return {
        ok: true,
        message: `${this.displayName} sandbox modu aktif — gerçek API çağrısı yapılmaz, mock yanıt döner.`,
        checkedAt: new Date(),
        meta: { sandbox: true, provider: this.key, missingCredentials: !!m },
      };
    }
    return { ok: false, message: `${this.displayName} HTTP entegrasyonu henüz uygulanmadı (kimlikler kayıtlı, çağrı eklenmeyi bekliyor).`, checkedAt: new Date() };
  }
  async pushProduct(p: MarketplaceProductPayload): Promise<PushResult> {
    if (!this.cfg.sandbox) return this.notImpl("pushProduct");
    return this.mockSuccess("pushProduct", {
      externalProductId: `SBX-${this.key}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      title: p?.title || null,
      barcode: p?.barcode || null,
    });
  }
  async pushStock(p: { externalProductId: string; channelSku?: string | null; quantity: number }): Promise<PushResult> {
    if (!this.cfg.sandbox) return this.notImpl("pushStock");
    return this.mockSuccess("pushStock", { externalProductId: p.externalProductId, quantity: p.quantity, syncedAt: new Date().toISOString() });
  }
  async pushPrice(p: { externalProductId: string; channelSku?: string | null; price: number; listPrice?: number }): Promise<PushResult> {
    if (!this.cfg.sandbox) return this.notImpl("pushPrice");
    return this.mockSuccess("pushPrice", { externalProductId: p.externalProductId, price: p.price, listPrice: p.listPrice ?? null });
  }
  async pullOrders(opts?: { since?: Date; limit?: number }): Promise<IncomingOrder[]> {
    if (!this.cfg.sandbox) return [];
    const limit = Math.min(opts?.limit ?? 2, 5);
    const now = Date.now();
    const sandboxCustomers = [
      { name: "Demo Müşteri Ahmet Y.", email: "ahmet@sandbox.local", phone: "5551112233", city: "İstanbul", district: "Kadıköy" },
      { name: "Test Alıcı Zeynep K.", email: "zeynep@sandbox.local", phone: "5552223344", city: "Ankara", district: "Çankaya" },
      { name: "Örnek Kullanıcı Mehmet D.", email: "mehmet@sandbox.local", phone: "5553334455", city: "İzmir", district: "Konak" },
    ];
    const orders: IncomingOrder[] = [];
    for (let i = 0; i < limit; i++) {
      const c = sandboxCustomers[i % sandboxCustomers.length]!;
      const qty = 1 + (i % 3);
      // Deterministic unitPrice (i ve key türevi) — E2E snapshot stabilitesi için.
      const seed = (this.key.length * 37 + i * 113) % 950;
      const unitPrice = Math.round((50 + seed) * 100) / 100;
      const total = Math.round(qty * unitPrice * 100) / 100;
      const orderedAt = new Date(now - i * 3_600_000);
      const orderId = `SBX-${this.key}-${orderedAt.toISOString().slice(0, 10)}-${String(i + 1).padStart(4, "0")}`;
      orders.push({
        externalOrderId: orderId,
        orderNumber: `${this.key.toUpperCase().slice(0, 3)}2026${String(100000 + i).padStart(6, "0")}`,
        status: i === 0 ? "created" : (i % 2 === 0 ? "paid" : "shipped"),
        orderedAt,
        customerName: c.name,
        customerEmail: c.email,
        customerPhone: c.phone,
        shippingAddress: `${c.district}, ${c.city} (sandbox)`,
        city: c.city,
        district: c.district,
        totalAmount: total,
        shippingFee: 29.99,
        currency: "TRY",
        items: [{
          externalLineId: `${orderId}-L1`,
          externalProductId: `SBX-PROD-${i + 1}`,
          channelSku: `SKU-${this.key.toUpperCase()}-${i + 1}`,
          channelBarcode: `869${String(1000000 + i).padStart(7, "0")}`,
          title: `Sandbox Demo Ürün ${i + 1} (${this.displayName})`,
          quantity: qty,
          unitPrice,
          totalPrice: total,
          vatRate: 20,
        }],
        raw: { provider: this.key, sandbox: true, simulated: true },
      });
    }
    if (opts?.since) return orders.filter(o => o.orderedAt >= opts.since!);
    return orders;
  }
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
