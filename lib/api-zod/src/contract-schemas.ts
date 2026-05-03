/**
 * Named contract exports (z[Resource][Action]Response) + critical paths not in OpenAPI.
 * Generated Orval schemas remain in `./generated/api.ts`.
 */
import * as z from "zod";

import { GetMeResponse } from "./generated/api";

/** GET /api/auth/me — alias for generated schema */
export const zAuthMeResponse = GetMeResponse;

/**
 * POST /api/sales — satış satırı (DB returning(); ek alanlar için passthrough).
 */
export const zSaleCreateResponse = z
  .object({
    id: z.number(),
    companyId: z.number().optional(),
    productId: z.number(),
    productName: z.string(),
    productCode: z.string(),
    barcode: z.string().nullable().optional(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    purchasePrice: z.number(),
    profit: z.number(),
    userId: z.number().nullable().optional(),
    soldBy: z.string().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
    customerId: z.number().nullable().optional(),
    channelKey: z.string().nullable().optional(),
    saleType: z.enum(["retail", "wholesale"]).nullable().optional(),
    returned: z.boolean().optional(),
    returnedAt: z.coerce.date().nullable().optional(),
    returnNote: z.string().nullable().optional(),
    createdAt: z.coerce.date(),
  })
  .passthrough();

/**
 * POST /api/billing/checkout — ödeme oturumu (artifacts/api-server billing-iyzico-flow).
 */
export const zBillingCheckoutResponse = z.object({
  ok: z.literal(true),
  paymentId: z.number(),
  conversationId: z.string(),
  paymentPageUrl: z.string(),
  provider: z.string(),
  amount: z.number(),
  currency: z.literal("TRY"),
});

/**
 * POST /api/stock/entry — stok girişi (artifacts/api-server routes/stock.ts).
 * Not: kod tabanında `/api/stock/entries` yok; gerçek rota `/api/stock/entry`.
 */
export const zStockEntryCreateResponse = z
  .object({
    message: z.string(),
    newStock: z.number(),
    movement: z
      .object({
        id: z.number(),
        companyId: z.number().optional(),
        productId: z.number(),
        productName: z.string(),
        productCode: z.string(),
        type: z.string(),
        quantity: z.number(),
        note: z.string().nullable().optional(),
        createdBy: z.string().nullable().optional(),
        createdAt: z.coerce.date().optional(),
      })
      .passthrough(),
  })
  .passthrough();
