// N11 SOAP API entegrasyonu (gerçek - basitleştirilmiş)
// Doküman: https://www.n11.com/satisDestek/api-dokumantasyon
// N11 hâlâ ağırlıkla SOAP/XML kullanır. Burada ProductStockService ve OrderService
// için minimum entegrasyon yapıldı. REST geçişi tamamlandığında refactor edilecek.
import {
  MarketplaceProvider, MarketplaceAccountConfig, MarketplaceProductPayload,
  PushResult, IncomingOrder, ProviderHealth, OrderItem,
} from "./types.js";

const N11_BASE = "https://api.n11.com/ws";
const REQUIRED = ["apiKey", "apiSecret"] as const;

function authXml(apiKey: string, apiSecret: string) {
  return `<auth><appKey>${apiKey}</appKey><appSecret>${apiSecret}</appSecret></auth>`;
}

function envelope(operation: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
  <soapenv:Header/>
  <soapenv:Body>
    <sch:${operation}>${body}</sch:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function pickXml(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function pickAllXml(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

export class N11RealProvider implements MarketplaceProvider {
  readonly key = "n11";
  readonly displayName = "N11";
  readonly capabilities = { pushProduct: false, pushStock: true, pushPrice: true, pullOrders: true, pullProducts: false };

  constructor(private cfg: MarketplaceAccountConfig) {}

  private requireConfig(): { apiKey: string; apiSecret: string } | { error: string } {
    for (const k of REQUIRED) {
      if (!this.cfg.credentials?.[k]) return { error: `Eksik config: ${k}` };
    }
    return { apiKey: String(this.cfg.credentials.apiKey), apiSecret: String(this.cfg.credentials.apiSecret) };
  }

  private async soap(service: string, action: string, body: string): Promise<{ ok: boolean; xml?: string; error?: string }> {
    const c = this.requireConfig();
    if ("error" in c) return { ok: false, error: c.error };
    try {
      const r = await fetch(`${N11_BASE}/${service}.wsdl`, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          "SOAPAction": action,
        },
        body: envelope(action, authXml(c.apiKey, c.apiSecret) + body),
        signal: AbortSignal.timeout(30_000),
      });
      const xml = await r.text();
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      const errCode = pickXml(xml, "errorCode");
      if (errCode) return { ok: false, xml, error: `N11 hata: ${errCode} ${pickXml(xml, "errorMessage") || ""}` };
      return { ok: true, xml };
    } catch (e: any) {
      return { ok: false, error: `Bağlantı hatası: ${e?.message || e}` };
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const r = await this.soap("CategoryService", "GetTopLevelCategories", "");
    if (!r.ok) return { ok: false, message: r.error || "N11 API erişilemedi", checkedAt: new Date() };
    return {
      ok: true,
      message: `N11 bağlantısı başarılı`,
      meta: { sandbox: this.cfg.sandbox },
      checkedAt: new Date(),
    };
  }

  async pushProduct(_p: MarketplaceProductPayload): Promise<PushResult> {
    return { success: false, message: "N11 pushProduct: katalog mapping akışı henüz uygulanmadı." };
  }

  async pushStock(p: { externalProductId: string; channelSku?: string | null; quantity: number }): Promise<PushResult> {
    const sellerCode = p.channelSku || p.externalProductId;
    if (!sellerCode) return { success: false, message: "channelSku/sellerCode zorunlu" };
    const body = `<productSellerCode>${sellerCode}</productSellerCode><quantity>${p.quantity}</quantity>`;
    const r = await this.soap("ProductStockService", "UpdateStockBySellerCode", body);
    return { success: r.ok, message: r.ok ? `Stok güncellendi (${sellerCode}=${p.quantity})` : r.error };
  }

  async pushPrice(p: { externalProductId: string; channelSku?: string | null; price: number; listPrice?: number }): Promise<PushResult> {
    const sellerCode = p.channelSku || p.externalProductId;
    if (!sellerCode) return { success: false, message: "channelSku/sellerCode zorunlu" };
    const body = `<productSellerCode>${sellerCode}</productSellerCode><price>${p.price}</price>`;
    const r = await this.soap("ProductService", "UpdateProductPriceBySellerCode", body);
    return { success: r.ok, message: r.ok ? `Fiyat güncellendi (${sellerCode}=${p.price})` : r.error };
  }

  async pullOrders(opts?: { since?: Date; limit?: number }): Promise<IncomingOrder[]> {
    const since = opts?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const body = `<searchData><productSellerCode></productSellerCode><status>New</status><startDate>${since.toISOString().slice(0, 10).replace(/-/g, "/")}</startDate></searchData><pagingData><currentPage>0</currentPage><pageSize>${Math.min(100, opts?.limit ?? 50)}</pageSize></pagingData>`;
    const r = await this.soap("OrderService", "OrderList", body);
    if (!r.ok || !r.xml) return [];

    const orders: IncomingOrder[] = [];
    const orderXmls = pickAllXml(r.xml, "order");
    for (const ox of orderXmls) {
      const orderNumber = pickXml(ox, "orderNumber") || pickXml(ox, "id") || "";
      const items: OrderItem[] = pickAllXml(ox, "orderItem").map((ix) => ({
        externalLineId: pickXml(ix, "id") || "",
        externalProductId: pickXml(ix, "productSellerCode") || pickXml(ix, "productId") || null,
        channelSku: pickXml(ix, "productSellerCode") || null,
        channelBarcode: null,
        title: pickXml(ix, "productName") || "",
        quantity: Number(pickXml(ix, "quantity") || 1),
        unitPrice: Number(pickXml(ix, "price") || 0),
        totalPrice: Number(pickXml(ix, "totalAmount") || 0),
      }));
      orders.push({
        externalOrderId: String(orderNumber),
        orderNumber: String(orderNumber),
        status: mapN11Status(pickXml(ox, "status")),
        orderedAt: pickXml(ox, "createDate") ? new Date(pickXml(ox, "createDate")!) : new Date(),
        customerName: pickXml(ox, "fullName") || null,
        customerEmail: pickXml(ox, "email") || null,
        customerPhone: pickXml(ox, "gsm") || null,
        shippingAddress: pickXml(ox, "address") || null,
        city: pickXml(ox, "city") || null,
        district: pickXml(ox, "district") || null,
        totalAmount: Number(pickXml(ox, "totalAmount") || 0),
        shippingFee: Number(pickXml(ox, "shippingFee") || 0),
        currency: "TRY",
        items,
      });
    }
    return orders;
  }
}

function mapN11Status(s?: string | null): string {
  switch ((s || "").toLowerCase()) {
    case "new": return "created";
    case "approved": return "paid";
    case "shipped": return "shipped";
    case "delivered": return "delivered";
    case "cancelled":
    case "rejected": return "cancelled";
    case "returned": return "returned";
    default: return s || "created";
  }
}
