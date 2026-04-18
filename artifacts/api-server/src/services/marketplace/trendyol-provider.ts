import {
  MarketplaceProvider, MarketplaceAccountConfig, MarketplaceProductPayload,
  PushResult, IncomingOrder, ProviderHealth, OrderItem,
} from "./types.js";

const PROD_BASE = "https://api.trendyol.com/sapigw";
const SANDBOX_BASE = "https://stageapigw.trendyol.com/sapigw";
const REQUIRED = ["sellerId", "apiKey", "apiSecret"] as const;

function basicAuth(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

export class TrendyolRealProvider implements MarketplaceProvider {
  readonly key = "trendyol";
  readonly displayName = "Trendyol";
  readonly capabilities = { pushProduct: true, pushStock: true, pushPrice: true, pullOrders: true, pullProducts: true };

  constructor(private cfg: MarketplaceAccountConfig) {}

  private requireConfig(): { sellerId: string; apiKey: string; apiSecret: string; base: string } | { error: string } {
    for (const k of REQUIRED) {
      if (!this.cfg.credentials?.[k]) return { error: `Eksik config: ${k}` };
    }
    const sellerId = String(this.cfg.credentials.sellerId);
    const apiKey = String(this.cfg.credentials.apiKey);
    const apiSecret = String(this.cfg.credentials.apiSecret);
    const base = this.cfg.sandbox ? SANDBOX_BASE : PROD_BASE;
    return { sellerId, apiKey, apiSecret, base };
  }

  private async req(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json?: any; text?: string; error?: string }> {
    const c = this.requireConfig();
    if ("error" in c) return { ok: false, status: 0, error: c.error };
    const url = `${c.base}${path}`;
    try {
      const r = await fetch(url, {
        ...init,
        headers: {
          "Authorization": basicAuth(c.apiKey, c.apiSecret),
          "Content-Type": "application/json",
          "User-Agent": `${c.sellerId} - SelfIntegration`,
          ...(init.headers || {}),
        },
      });
      const txt = await r.text();
      let parsed: any = undefined;
      try { parsed = txt ? JSON.parse(txt) : undefined; } catch { /* not json */ }
      if (!r.ok) {
        return { ok: false, status: r.status, json: parsed, text: txt, error: `HTTP ${r.status}: ${parsed?.message || parsed?.errors?.[0]?.message || txt?.slice(0, 200)}` };
      }
      return { ok: true, status: r.status, json: parsed, text: txt };
    } catch (e: any) {
      return { ok: false, status: 0, error: `Bağlantı hatası: ${e?.message || e}` };
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const c = this.requireConfig();
    if ("error" in c) return { ok: false, message: c.error, checkedAt: new Date() };
    // Hafif endpoint: addresses (yetkili sayılır, hızlı, taban URL doğrulaması)
    const r = await this.req(`/suppliers/${c.sellerId}/addresses`);
    if (!r.ok) {
      return { ok: false, message: r.error || "Trendyol API erişilemedi", meta: { status: r.status }, checkedAt: new Date() };
    }
    const count = Array.isArray(r.json?.supplierAddresses) ? r.json.supplierAddresses.length : 0;
    return {
      ok: true,
      message: `Trendyol ${this.cfg.sandbox ? "SANDBOX" : "PROD"} bağlantısı başarılı (${count} adres)`,
      meta: { addressCount: count, sandbox: this.cfg.sandbox },
      checkedAt: new Date(),
    };
  }

  async pushProduct(_p: MarketplaceProductPayload): Promise<PushResult> {
    // Trendyol ürün açma akışı zorunlu kategori-attribute eşleşmesi gerektirir.
    // İlk faz: stock+price güncelleme yeterli; pushProduct ileride katalog yönetimi
    // ile beraber eklenecek.
    return { success: false, message: "Trendyol pushProduct: katalog mapping akışı henüz uygulanmadı (Sprint sonrası)." };
  }

  async pushStock(p: { externalProductId: string; channelSku?: string | null; quantity: number }): Promise<PushResult> {
    const c = this.requireConfig();
    if ("error" in c) return { success: false, message: c.error };
    // Trendyol price-and-inventory tek endpoint üzerinden barcode bazlı güncellenir
    const barcode = p.channelSku || p.externalProductId;
    const body = { items: [{ barcode, quantity: p.quantity }] };
    const r = await this.req(`/suppliers/${c.sellerId}/products/price-and-inventory`, {
      method: "POST", body: JSON.stringify(body),
    });
    return { success: r.ok, message: r.ok ? `Stok güncellendi (${barcode}=${p.quantity})` : r.error, raw: r.json };
  }

  async pushPrice(p: { externalProductId: string; channelSku?: string | null; price: number; listPrice?: number }): Promise<PushResult> {
    const c = this.requireConfig();
    if ("error" in c) return { success: false, message: c.error };
    const barcode = p.channelSku || p.externalProductId;
    const body = { items: [{ barcode, salePrice: p.price, listPrice: p.listPrice ?? p.price }] };
    const r = await this.req(`/suppliers/${c.sellerId}/products/price-and-inventory`, {
      method: "POST", body: JSON.stringify(body),
    });
    return { success: r.ok, message: r.ok ? `Fiyat güncellendi (${barcode}=${p.price})` : r.error, raw: r.json };
  }

  async pullOrders(opts?: { since?: Date; limit?: number }): Promise<IncomingOrder[]> {
    const c = this.requireConfig();
    if ("error" in c) return [];
    const params = new URLSearchParams();
    if (opts?.since) params.set("startDate", String(opts.since.getTime()));
    params.set("size", String(Math.min(200, opts?.limit ?? 50)));
    params.set("orderByField", "PackageLastModifiedDate");
    params.set("orderByDirection", "DESC");
    const r = await this.req(`/suppliers/${c.sellerId}/orders?${params.toString()}`);
    if (!r.ok || !Array.isArray(r.json?.content)) return [];

    return r.json.content.map((o: any): IncomingOrder => {
      const items: OrderItem[] = (o.lines || []).map((l: any) => ({
        externalLineId: String(l.id ?? l.lineId ?? ""),
        externalProductId: l.productCode ? String(l.productCode) : null,
        channelSku: l.merchantSku || l.sku || null,
        channelBarcode: l.barcode || null,
        title: l.productName || l.productTitle || "",
        quantity: Number(l.quantity || 1),
        unitPrice: Number(l.price || l.amount || 0),
        totalPrice: Number((l.price || l.amount || 0) * (l.quantity || 1)),
        vatRate: l.vatBaseAmount ? Number(l.vatBaseAmount) : undefined,
      }));
      return {
        externalOrderId: String(o.orderNumber || o.id),
        orderNumber: o.orderNumber ? String(o.orderNumber) : null,
        status: mapStatus(o.status),
        orderedAt: o.orderDate ? new Date(o.orderDate) : new Date(),
        customerName: [o.customerFirstName, o.customerLastName].filter(Boolean).join(" ") || null,
        customerEmail: o.customerEmail || null,
        customerPhone: o.gsm || null,
        shippingAddress: o.shipmentAddress?.fullAddress || null,
        city: o.shipmentAddress?.city || null,
        district: o.shipmentAddress?.district || null,
        totalAmount: Number(o.totalPrice || 0),
        shippingFee: Number(o.deliveryAddressType?.shipmentPackagePrice || 0),
        currency: o.currencyCode || "TRY",
        items,
        raw: o,
      };
    });
  }
}

function mapStatus(trendyolStatus?: string): string {
  switch ((trendyolStatus || "").toLowerCase()) {
    case "created":
    case "awaiting": return "created";
    case "picking":
    case "invoiced": return "paid";
    case "shipped":
    case "atcollectionpoint": return "shipped";
    case "delivered": return "delivered";
    case "cancelled":
    case "unsupplied": return "cancelled";
    case "returned": return "returned";
    default: return trendyolStatus || "created";
  }
}
