import type { ChannelKey } from "@workspace/db/schema";

export interface AdapterListingInput {
  productId: number;
  productCode: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  effectivePrice: number;
  effectiveStock: number;
  customTitle: string | null;
  customSku: string | null;
  customCategory: string | null;
  customImageUrl: string | null;
}

export interface AdapterContext {
  companyId: number;
  channelKey: ChannelKey;
  mode: "test" | "live";
  credentials: Record<string, any>;
}

export interface AdapterResult {
  ok: boolean;
  payload?: any;
  response?: any;
  error?: string;
}

export interface ChannelAdapter {
  readonly key: ChannelKey;
  pushListing(ctx: AdapterContext, item: AdapterListingInput): Promise<AdapterResult>;
  updateStock(
    ctx: AdapterContext,
    item: { productId: number; barcode: string | null; sku: string | null; stock: number }
  ): Promise<AdapterResult>;
  updatePrice(
    ctx: AdapterContext,
    item: { productId: number; barcode: string | null; sku: string | null; price: number }
  ): Promise<AdapterResult>;
}

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly key: ChannelKey;

  protected abstract buildListingPayload(
    ctx: AdapterContext,
    item: AdapterListingInput
  ): Record<string, any>;

  protected abstract buildStockPayload(
    ctx: AdapterContext,
    item: { productId: number; barcode: string | null; sku: string | null; stock: number }
  ): Record<string, any>;

  protected abstract buildPricePayload(
    ctx: AdapterContext,
    item: { productId: number; barcode: string | null; sku: string | null; price: number }
  ): Record<string, any>;

  async pushListing(ctx: AdapterContext, item: AdapterListingInput): Promise<AdapterResult> {
    const payload = this.buildListingPayload(ctx, item);
    if (ctx.mode === "test") {
      return { ok: true, payload, response: { dryRun: true, would_send_to: this.key } };
    }
    return { ok: false, payload, error: "Live mode not yet implemented" };
  }

  async updateStock(ctx: AdapterContext, item: { productId: number; barcode: string | null; sku: string | null; stock: number }) {
    const payload = this.buildStockPayload(ctx, item);
    if (ctx.mode === "test") {
      return { ok: true, payload, response: { dryRun: true, would_send_to: this.key } };
    }
    return { ok: false, payload, error: "Live mode not yet implemented" };
  }

  async updatePrice(ctx: AdapterContext, item: { productId: number; barcode: string | null; sku: string | null; price: number }) {
    const payload = this.buildPricePayload(ctx, item);
    if (ctx.mode === "test") {
      return { ok: true, payload, response: { dryRun: true, would_send_to: this.key } };
    }
    return { ok: false, payload, error: "Live mode not yet implemented" };
  }
}
