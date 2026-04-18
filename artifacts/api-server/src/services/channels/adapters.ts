import { BaseChannelAdapter } from "./adapter-base";
import type { AdapterContext, AdapterListingInput, ChannelAdapter } from "./adapter-base";
import type { ChannelKey } from "@workspace/db/schema";

export class TrendyolAdapter extends BaseChannelAdapter {
  readonly key = "trendyol" as const;
  protected buildListingPayload(_ctx: AdapterContext, item: AdapterListingInput) {
    return {
      barcode: item.barcode ?? item.productCode,
      title: item.customTitle ?? item.name,
      productMainId: item.customSku ?? item.productCode,
      brand: item.brand ?? "",
      categoryName: item.customCategory ?? item.category ?? "",
      quantity: item.effectiveStock,
      stockCode: item.customSku ?? item.productCode,
      dimensionalWeight: 1,
      description: item.description ?? item.name,
      currencyType: "TRY",
      listPrice: item.effectivePrice,
      salePrice: item.effectivePrice,
      vatRate: 20,
      cargoCompanyId: 10,
      images: item.customImageUrl ? [{ url: item.customImageUrl }] : [],
    };
  }
  protected buildStockPayload(_ctx: AdapterContext, item: { barcode: string | null; sku: string | null; stock: number }) {
    return { items: [{ barcode: item.barcode ?? item.sku, quantity: item.stock }] };
  }
  protected buildPricePayload(_ctx: AdapterContext, item: { barcode: string | null; sku: string | null; price: number }) {
    return { items: [{ barcode: item.barcode ?? item.sku, salePrice: item.price, listPrice: item.price }] };
  }
}

export class HepsiburadaAdapter extends BaseChannelAdapter {
  readonly key = "hepsiburada" as const;
  protected buildListingPayload(_ctx: AdapterContext, item: AdapterListingInput) {
    return {
      merchantSku: item.customSku ?? item.productCode,
      productName: item.customTitle ?? item.name,
      brand: item.brand ?? "",
      categoryId: item.customCategory ?? item.category ?? "",
      barcode: item.barcode ?? item.productCode,
      price: item.effectivePrice,
      availableStock: item.effectiveStock,
      description: item.description ?? item.name,
      images: item.customImageUrl ? [item.customImageUrl] : [],
    };
  }
  protected buildStockPayload(_ctx: AdapterContext, item: { sku: string | null; stock: number }) {
    return { merchantSku: item.sku, availableStock: item.stock };
  }
  protected buildPricePayload(_ctx: AdapterContext, item: { sku: string | null; price: number }) {
    return { merchantSku: item.sku, price: item.price };
  }
}

export class N11Adapter extends BaseChannelAdapter {
  readonly key = "n11" as const;
  protected buildListingPayload(_ctx: AdapterContext, item: AdapterListingInput) {
    return {
      productSellerCode: item.customSku ?? item.productCode,
      title: item.customTitle ?? item.name,
      subtitle: "",
      description: item.description ?? item.name,
      category: { id: item.customCategory ?? item.category ?? "" },
      price: item.effectivePrice,
      currencyType: "1",
      stockItems: { stockItem: [{ quantity: item.effectiveStock, sellerStockCode: item.customSku ?? item.productCode }] },
      images: item.customImageUrl ? { image: [{ url: item.customImageUrl, order: 1 }] } : undefined,
    };
  }
  protected buildStockPayload(_ctx: AdapterContext, item: { sku: string | null; stock: number }) {
    return { productSellerCode: item.sku, stockItems: { stockItem: [{ quantity: item.stock, sellerStockCode: item.sku }] } };
  }
  protected buildPricePayload(_ctx: AdapterContext, item: { sku: string | null; price: number }) {
    return { productSellerCode: item.sku, price: item.price };
  }
}

export class AmazonTrAdapter extends BaseChannelAdapter {
  readonly key = "amazon_tr" as const;
  protected buildListingPayload(_ctx: AdapterContext, item: AdapterListingInput) {
    return {
      sku: item.customSku ?? item.productCode,
      product_id: item.barcode ?? item.productCode,
      product_id_type: "EAN",
      item_name: item.customTitle ?? item.name,
      brand_name: item.brand ?? "",
      item_type: item.customCategory ?? item.category ?? "",
      manufacturer: item.brand ?? "",
      standard_price: item.effectivePrice,
      quantity: item.effectiveStock,
      product_description: item.description ?? item.name,
      main_image_url: item.customImageUrl ?? "",
      currency: "TRY",
    };
  }
  protected buildStockPayload(_ctx: AdapterContext, item: { sku: string | null; stock: number }) {
    return { sku: item.sku, quantity: item.stock };
  }
  protected buildPricePayload(_ctx: AdapterContext, item: { sku: string | null; price: number }) {
    return { sku: item.sku, standard_price: item.price, currency: "TRY" };
  }
}

const REGISTRY: Partial<Record<ChannelKey, ChannelAdapter>> = {
  trendyol: new TrendyolAdapter(),
  hepsiburada: new HepsiburadaAdapter(),
  n11: new N11Adapter(),
  amazon_tr: new AmazonTrAdapter(),
};

export function getAdapter(key: ChannelKey): ChannelAdapter | null {
  return REGISTRY[key] ?? null;
}

export function hasAdapter(key: string): boolean {
  return key in REGISTRY;
}
