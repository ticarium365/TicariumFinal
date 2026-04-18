// Hepsiburada Mpop API entegrasyonu (gerçek)
// Doküman: https://developers.hepsiburada.com/
// Kritik fark (Trendyol'dan): Stok/fiyat güncelleme MERCHANTSKU bazlıdır,
// barcode değil. Mapping önceliği: channelSku (= merchantSku) > productCode.
import {
  MarketplaceProvider, MarketplaceAccountConfig, MarketplaceProductPayload,
  PushResult, IncomingOrder, ProviderHealth, OrderItem,
} from "./types.js";

const LISTING_BASE = "https://listing-external.hepsiburada.com";
const MPOP_BASE = "https://mpop-sit.hepsiburada.com";
const PROD_MPOP = "https://mpop.hepsiburada.com";
const REQUIRED = ["merchantId", "username", "password"] as const;

export class HepsiburadaRealProvider implements MarketplaceProvider {
  readonly key = "hepsiburada";
  readonly displayName = "Hepsiburada";
  readonly capabilities = { pushProduct: false, pushStock: true, pushPrice: true, pullOrders: true, pullProducts: false };

  constructor(private cfg: MarketplaceAccountConfig) {}

  private requireConfig(): { merchantId: string; auth: string; mpopBase: string } | { error: string } {
    for (const k of REQUIRED) {
      if (!this.cfg.credentials?.[k]) return { error: `Eksik config: ${k}` };
    }
    const merchantId = String(this.cfg.credentials.merchantId);
    const username = String(this.cfg.credentials.username);
    const password = String(this.cfg.credentials.password);
    const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    return { merchantId, auth, mpopBase: this.cfg.sandbox ? MPOP_BASE : PROD_MPOP };
  }

  private async req(base: string, path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json?: any; text?: string; error?: string }> {
    const c = this.requireConfig();
    if ("error" in c) return { ok: false, status: 0, error: c.error };
    try {
      const r = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          "Authorization": c.auth,
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": `${c.merchantId} - SelfIntegration`,
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(30_000),
      });
      const txt = await r.text();
      let parsed: any;
      try { parsed = txt ? JSON.parse(txt) : undefined; } catch { /* */ }
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
    const r = await this.req(c.mpopBase, `/orders/merchantid/${c.merchantId}?limit=1`);
    if (!r.ok) {
      return { ok: false, message: r.error || "Hepsiburada API erişilemedi", meta: { status: r.status }, checkedAt: new Date() };
    }
    return {
      ok: true,
      message: `Hepsiburada ${this.cfg.sandbox ? "SANDBOX" : "PROD"} bağlantısı başarılı`,
      meta: { sandbox: this.cfg.sandbox },
      checkedAt: new Date(),
    };
  }

  async pushProduct(_p: MarketplaceProductPayload): Promise<PushResult> {
    return { success: false, message: "Hepsiburada pushProduct: katalog mapping akışı henüz uygulanmadı." };
  }

  async pushStock(p: { externalProductId: string; channelSku?: string | null; quantity: number }): Promise<PushResult> {
    const c = this.requireConfig();
    if ("error" in c) return { success: false, message: c.error };
    // Hepsiburada: merchantSku (= channelSku) öncelikli, fallback productCode
    const merchantSku = p.channelSku || p.externalProductId;
    if (!merchantSku) return { success: false, message: "merchantSku/channelSku zorunlu" };
    const body = [{ hepsiburadaSku: undefined, merchantSku, availableStock: p.quantity }];
    const r = await this.req(LISTING_BASE, `/listings/merchantid/${c.merchantId}/stock-uploads`, {
      method: "POST", body: JSON.stringify(body),
    });
    return { success: r.ok, message: r.ok ? `Stok güncellendi (${merchantSku}=${p.quantity})` : r.error, raw: r.json };
  }

  async pushPrice(p: { externalProductId: string; channelSku?: string | null; price: number; listPrice?: number }): Promise<PushResult> {
    const c = this.requireConfig();
    if ("error" in c) return { success: false, message: c.error };
    const merchantSku = p.channelSku || p.externalProductId;
    if (!merchantSku) return { success: false, message: "merchantSku/channelSku zorunlu" };
    const body = [{ merchantSku, price: p.price }];
    const r = await this.req(LISTING_BASE, `/listings/merchantid/${c.merchantId}/price-uploads`, {
      method: "POST", body: JSON.stringify(body),
    });
    return { success: r.ok, message: r.ok ? `Fiyat güncellendi (${merchantSku}=${p.price})` : r.error, raw: r.json };
  }

  async pullOrders(opts?: { since?: Date; limit?: number }): Promise<IncomingOrder[]> {
    const c = this.requireConfig();
    if ("error" in c) return [];
    const params = new URLSearchParams();
    if (opts?.since) {
      params.set("beginDate", opts.since.toISOString().slice(0, 10));
    }
    params.set("limit", String(Math.min(100, opts?.limit ?? 50)));
    const r = await this.req(c.mpopBase, `/orders/merchantid/${c.merchantId}?${params.toString()}`);
    if (!r.ok || !Array.isArray(r.json?.items)) return [];

    return r.json.items.map((o: any): IncomingOrder => {
      const items: OrderItem[] = (o.items || []).map((l: any) => ({
        externalLineId: String(l.lineItemId ?? l.id ?? ""),
        externalProductId: l.productCode ? String(l.productCode) : (l.hepsiburadaSku || null),
        channelSku: l.merchantSku || null,
        channelBarcode: l.barcode || null,
        title: l.productName || "",
        quantity: Number(l.quantity || 1),
        unitPrice: Number(l.unitPrice?.amount || l.totalPrice?.amount / (l.quantity || 1) || 0),
        totalPrice: Number(l.totalPrice?.amount || 0),
        vatRate: l.vatRate ? Number(l.vatRate) : undefined,
      }));
      return {
        externalOrderId: String(o.orderNumber || o.id),
        orderNumber: o.orderNumber ? String(o.orderNumber) : null,
        status: mapHbStatus(o.status),
        orderedAt: o.orderDate ? new Date(o.orderDate) : new Date(),
        customerName: o.customer?.name || null,
        customerEmail: o.customer?.email || null,
        customerPhone: o.customer?.phoneNumber || null,
        shippingAddress: o.shippingAddress?.address || null,
        city: o.shippingAddress?.city || null,
        district: o.shippingAddress?.town || o.shippingAddress?.district || null,
        totalAmount: Number(o.totalPrice?.amount || 0),
        shippingFee: Number(o.shippingTotalPrice?.amount || 0),
        currency: o.totalPrice?.currency || "TRY",
        items,
        raw: o,
      };
    });
  }
}

function mapHbStatus(s?: string): string {
  switch ((s || "").toLowerCase()) {
    case "open":
    case "neworder":
    case "new": return "created";
    case "packaged":
    case "ready_to_ship": return "paid";
    case "shipped":
    case "intransit": return "shipped";
    case "delivered": return "delivered";
    case "cancelled":
    case "cancelledbysystem":
    case "cancelledbycustomer": return "cancelled";
    case "returned": return "returned";
    default: return s || "created";
  }
}
