import { randomUUID } from "crypto";
import {
  MarketplaceProvider, MarketplaceAccountConfig, MarketplaceProductPayload,
  PushResult, IncomingOrder, ProviderHealth, OrderItem,
} from "./types.js";

// Account başına in-memory store
const memProducts = new Map<string, Map<string, any>>(); // accountKey -> sku -> product
const memOrders = new Map<string, IncomingOrder[]>();

export class MockMarketplaceProvider implements MarketplaceProvider {
  readonly key = "mock";
  readonly displayName = "Mock Pazaryeri (Sandbox)";
  readonly capabilities = {
    pushProduct: true, pushStock: true, pushPrice: true, pullOrders: true, pullProducts: true,
  };
  private accKey: string;

  constructor(private cfg: MarketplaceAccountConfig) {
    this.accKey = cfg.credentials?.accountKey || "default";
    if (!memProducts.has(this.accKey)) memProducts.set(this.accKey, new Map());
    if (!memOrders.has(this.accKey)) memOrders.set(this.accKey, []);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: `Mock pazaryeri hazır (sandbox=${this.cfg.sandbox}).`, checkedAt: new Date() };
  }

  async pushProduct(p: MarketplaceProductPayload): Promise<PushResult> {
    const externalId = p.externalProductId || randomUUID();
    const externalListingId = p.externalListingId || randomUUID();
    const store = memProducts.get(this.accKey)!;
    store.set(p.sku, { ...p, externalId, externalListingId, updatedAt: new Date() });
    return { success: true, externalProductId: externalId, externalListingId, message: "Mock push başarılı" };
  }

  async pushStock({ externalProductId, channelSku, quantity }: { externalProductId: string; channelSku?: string | null; quantity: number }) {
    const store = memProducts.get(this.accKey)!;
    let updated = false;
    store.forEach((v) => {
      if (v.externalId === externalProductId || (channelSku && v.sku === channelSku)) {
        v.stockQuantity = quantity; v.updatedAt = new Date(); updated = true;
      }
    });
    return { success: true, externalProductId, message: updated ? "Stok güncellendi" : "Ürün bulunamadı (yine de OK döndü)" };
  }

  async pushPrice({ externalProductId, channelSku, price, listPrice }: any) {
    const store = memProducts.get(this.accKey)!;
    let updated = false;
    store.forEach((v) => {
      if (v.externalId === externalProductId || (channelSku && v.sku === channelSku)) {
        v.price = price; if (listPrice != null) v.listPrice = listPrice; v.updatedAt = new Date(); updated = true;
      }
    });
    return { success: true, externalProductId, message: updated ? "Fiyat güncellendi" : "OK (no-op)" };
  }

  async pullProducts(_opts?: { since?: Date; limit?: number }) {
    const store = memProducts.get(this.accKey)!;
    return Array.from(store.values()).map((v: any) => ({
      productId: v.productId, sku: v.sku, barcode: v.barcode || null,
      title: v.title, price: v.price, stockQuantity: v.stockQuantity, vatRate: v.vatRate,
      externalProductId: v.externalId, externalListingId: v.externalListingId, channelSku: v.sku,
    }));
  }

  async pullOrders(opts?: { since?: Date; limit?: number }): Promise<IncomingOrder[]> {
    const list = memOrders.get(this.accKey)!;
    if (this.cfg.sandbox && list.length === 0) {
      // Sandbox demo: bir adet fake sipariş üret
      const items: OrderItem[] = [{
        externalLineId: randomUUID(), externalProductId: null, channelSku: "DEMO-SKU",
        title: "Demo Ürün", quantity: 1, unitPrice: 199.9, totalPrice: 199.9, vatRate: 20,
      }];
      const order: IncomingOrder = {
        externalOrderId: "MOCK-ORD-" + Date.now(),
        orderNumber: "MOCK-" + Math.floor(Math.random() * 100000),
        status: "paid", orderedAt: new Date(),
        customerName: "Demo Müşteri", customerEmail: "demo@example.com", customerPhone: "+905551112233",
        shippingAddress: "Demo Mah. Test Sk. No:1", city: "İstanbul", district: "Kadıköy",
        totalAmount: 199.9, shippingFee: 0, currency: "TRY", items,
      };
      list.push(order);
    }
    let r = list;
    if (opts?.since) r = r.filter((o) => o.orderedAt >= opts.since!);
    if (opts?.limit) r = r.slice(0, opts.limit);
    return r;
  }
}
