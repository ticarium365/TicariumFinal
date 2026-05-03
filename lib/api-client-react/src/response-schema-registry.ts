/**
 * Maps HTTP method + pathname (query stripped) → Zod schema for successful JSON bodies.
 * Used by customFetch after OK responses. Pathnames are normalized (see normalizeApiPathname).
 */
import type { ZodType } from "zod";

import {
  HealthCheckResponse,
  LoginResponse,
  LogoutResponse,
  GetMeResponse,
  ListUsersResponse,
  GetUserResponse,
  UpdateUserResponse,
  DeleteUserResponse,
  ListProductsResponse,
  GetProductResponse,
  GetProductByBarcodeResponse,
  GenerateBarcodeResponse,
  ListCategoriesResponse,
  ListBrandsResponse,
  UpdateProductResponse,
  DeleteProductResponse,
  QuickUpdateProductResponse,
  ListSalesResponse,
  GetTodaySalesResponse,
  GetDashboardStatsResponse,
  GetTopProductsResponse,
  GetCriticalStockResponse,
  GetSalesReportResponse,
  GetStockReportResponse,
  GetSettingsResponse,
  UpdateSettingsResponse,
  RequestUploadUrlResponse,
  zBillingCheckoutResponse,
  zSaleCreateResponse,
  zStockEntryCreateResponse,
} from "@workspace/api-zod";

export type RouteRule =
  | { method: string; path: string; schema: ZodType<unknown> }
  | { method: string; path: RegExp; schema: ZodType<unknown> };

/** OpenAPI tabanlı client + kritik manuel uçlar (@workspace/api-zod). */
export const RESPONSE_SCHEMA_ROUTES: RouteRule[] = [
  { method: "GET", path: "/api/healthz", schema: HealthCheckResponse },
  { method: "POST", path: "/api/auth/login", schema: LoginResponse },
  { method: "POST", path: "/api/auth/logout", schema: LogoutResponse },
  { method: "GET", path: "/api/auth/me", schema: GetMeResponse },

  { method: "GET", path: "/api/users", schema: ListUsersResponse },
  { method: "POST", path: "/api/users", schema: GetUserResponse },
  { method: "GET", path: /^\/api\/users\/\d+$/, schema: GetUserResponse },
  { method: "PUT", path: /^\/api\/users\/\d+$/, schema: UpdateUserResponse },
  { method: "DELETE", path: /^\/api\/users\/\d+$/, schema: DeleteUserResponse },

  { method: "GET", path: "/api/products", schema: ListProductsResponse },
  { method: "POST", path: "/api/products", schema: GetProductResponse },
  { method: "GET", path: /^\/api\/products\/\d+$/, schema: GetProductResponse },
  { method: "PUT", path: /^\/api\/products\/\d+$/, schema: UpdateProductResponse },
  { method: "DELETE", path: /^\/api\/products\/\d+$/, schema: DeleteProductResponse },
  { method: "PATCH", path: /^\/api\/products\/\d+\/quick-update$/, schema: QuickUpdateProductResponse },
  { method: "GET", path: /^\/api\/products\/barcode\/[^/]+$/, schema: GetProductByBarcodeResponse },
  { method: "POST", path: "/api/products/generate-barcode", schema: GenerateBarcodeResponse },
  { method: "GET", path: "/api/products/categories", schema: ListCategoriesResponse },
  { method: "GET", path: "/api/products/brands", schema: ListBrandsResponse },

  { method: "GET", path: "/api/sales", schema: ListSalesResponse },
  { method: "POST", path: "/api/sales", schema: zSaleCreateResponse },
  { method: "GET", path: "/api/sales/today", schema: GetTodaySalesResponse },

  { method: "GET", path: "/api/dashboard/stats", schema: GetDashboardStatsResponse },
  { method: "GET", path: "/api/dashboard/top-products", schema: GetTopProductsResponse },
  { method: "GET", path: "/api/dashboard/critical-stock", schema: GetCriticalStockResponse },

  { method: "GET", path: "/api/reports/sales", schema: GetSalesReportResponse },
  { method: "GET", path: "/api/reports/stock", schema: GetStockReportResponse },

  { method: "GET", path: "/api/settings", schema: GetSettingsResponse },
  { method: "PUT", path: "/api/settings", schema: UpdateSettingsResponse },

  { method: "POST", path: "/api/storage/uploads/request-url", schema: RequestUploadUrlResponse },

  { method: "POST", path: "/api/billing/checkout", schema: zBillingCheckoutResponse },
  { method: "POST", path: "/api/stock/entry", schema: zStockEntryCreateResponse },
];

export function normalizeApiPathname(url: string): string {
  let raw = url;
  try {
    if (/^https?:\/\//i.test(url)) {
      raw = new URL(url).pathname;
    }
  } catch {
    /* keep raw */
  }
  const q = raw.indexOf("?");
  let p = q === -1 ? raw : raw.slice(0, q);
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function lookupResponseSchema(
  method: string,
  url: string,
): ZodType<unknown> | undefined {
  const pathname = normalizeApiPathname(url);
  const m = method.toUpperCase();
  for (const rule of RESPONSE_SCHEMA_ROUTES) {
    if (rule.method !== m) continue;
    if (typeof rule.path === "string") {
      if (rule.path === pathname) return rule.schema;
    } else if (rule.path.test(pathname)) {
      return rule.schema;
    }
  }
  return undefined;
}
