// ─────────────────────────────────────────────────────────────────────────────
// Provider-bağımsız Pazaryeri / E-Ticaret sözleşmesi
// Trendyol, Hepsiburada, N11, Amazon, Shopify, WooCommerce vb. bu interface'i
// uygular. Üst katman provider-spesifik kod tanımaz.
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceProductPayload {
  productId: number;
  sku: string;
  barcode?: string | null;
  title: string;
  description?: string | null;
  brand?: string | null;
  categoryName?: string | null;
  price: number;       // satış fiyatı (KDV dahil)
  listPrice?: number;  // piyasa fiyatı
  stockQuantity: number;
  vatRate: number;
  imageUrls?: string[];
  attributes?: Record<string, any>;
  // Override'lar provider'a özgü genişletilebilir
  externalProductId?: string | null;
  externalListingId?: string | null;
  channelSku?: string | null;
}

export interface PushResult {
  success: boolean;
  externalProductId?: string | null;
  externalListingId?: string | null;
  message?: string;
  raw?: any;
}

export interface OrderItem {
  externalLineId: string;
  externalProductId?: string | null;
  channelSku?: string | null;
  channelBarcode?: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  vatRate?: number;
}

export interface IncomingOrder {
  externalOrderId: string;
  orderNumber?: string | null;
  status: string; // created | paid | shipped | delivered | cancelled | returned
  orderedAt: Date;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shippingAddress?: string | null;
  city?: string | null;
  district?: string | null;
  totalAmount: number;
  shippingFee?: number;
  currency: string;
  items: OrderItem[];
  raw?: any;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
  meta?: any;
  checkedAt: Date;
}

export interface MarketplaceAccountConfig {
  provider: string;
  sandbox: boolean;
  credentials: Record<string, any>;
  settings: Record<string, any>;
}

export interface MarketplaceProvider {
  readonly key: string;
  readonly displayName: string;
  readonly capabilities: {
    pushProduct: boolean;
    pushStock: boolean;
    pushPrice: boolean;
    pullOrders: boolean;
    pullProducts: boolean;
  };
  healthCheck(): Promise<ProviderHealth>;
  pushProduct(p: MarketplaceProductPayload): Promise<PushResult>;
  pushStock(p: { externalProductId: string; channelSku?: string | null; quantity: number }): Promise<PushResult>;
  pushPrice(p: { externalProductId: string; channelSku?: string | null; price: number; listPrice?: number }): Promise<PushResult>;
  pullOrders(opts?: { since?: Date; limit?: number }): Promise<IncomingOrder[]>;
  // Opsiyonel — capability=true ise uygulanır
  pullProducts?(opts?: { since?: Date; limit?: number }): Promise<MarketplaceProductPayload[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider hata türleri
// Provider implementasyonları hata fırlatırken bu yardımcı sınıfları kullanırsa
// worker özel davranabilir (rate-limit için backoff penceresi gibi).
// ─────────────────────────────────────────────────────────────────────────────

/** Provider rate-limit'e takıldığında. Worker `retryAfterMs` kadar bekleyip kuyruğa geri koyar. */
export class RateLimitError extends Error {
  readonly isRateLimit = true;
  constructor(public readonly retryAfterMs: number, message?: string) {
    super(message || `Rate limit aşıldı, ${Math.round(retryAfterMs / 1000)} sn sonra tekrar denenecek`);
    this.name = "RateLimitError";
  }
}

/** Geçici/iletişim hatası — provider tarafı geçici olarak ulaşılamıyor. */
export class TransientProviderError extends Error {
  readonly isTransient = true;
  constructor(message: string) {
    super(message);
    this.name = "TransientProviderError";
  }
}

/** Kalıcı hata — retry yapılmamalı (yanlış config, geçersiz veri vb.). */
export class PermanentProviderError extends Error {
  readonly isPermanent = true;
  constructor(message: string) {
    super(message);
    this.name = "PermanentProviderError";
  }
}

// Pricing engine yardımcıları
export function applyPricingRule(basePrice: number, rule: {
  type: string; value: number; roundTo?: number | null; minPrice?: number | null; maxPrice?: number | null;
}): number {
  let p = basePrice;
  switch (rule.type) {
    case "markup_pct":  p = basePrice * (1 + rule.value / 100); break;
    case "margin_pct":  p = basePrice / (1 - rule.value / 100); break;
    case "fixed_amount": p = basePrice + rule.value; break;
    default: p = basePrice;
  }
  if (rule.roundTo && rule.roundTo > 0) {
    p = Math.round(p / rule.roundTo) * rule.roundTo;
  }
  if (rule.minPrice != null && p < rule.minPrice) p = rule.minPrice;
  if (rule.maxPrice != null && p > rule.maxPrice) p = rule.maxPrice;
  return Math.round(p * 100) / 100;
}

// Stok engine yardımcısı
export function applyStockRule(physicalStock: number, rule: {
  safetyStock?: number | null; maxStock?: number | null;
  allocationType?: string | null; allocationValue?: number | null;
}): number {
  let s = Math.max(0, physicalStock - (rule.safetyStock || 0));
  if (rule.allocationType === "percentage" && rule.allocationValue != null) {
    s = Math.floor(s * (rule.allocationValue / 100));
  } else if (rule.allocationType === "fixed_value" && rule.allocationValue != null) {
    s = Math.min(s, Math.floor(rule.allocationValue));
  }
  if (rule.maxStock != null) s = Math.min(s, rule.maxStock);
  return Math.max(0, s);
}
