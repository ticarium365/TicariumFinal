import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardStatsQueryOptions,
  getGetTodaySalesQueryOptions,
  getListProductsQueryOptions,
} from "@workspace/api-client-react";

/**
 * Sidebar hover: olası sonraki sayfa için TanStack önbelleğini doldurur (sessizce).
 */
export function prefetchNavHref(href: string, qc: QueryClient): void {
  const path = href.split("?")[0].replace(/\/+$/, "") || "/";

  try {
    if (path === "/dashboard") {
      void qc.prefetchQuery(getGetDashboardStatsQueryOptions());
      void qc.prefetchQuery(getGetTodaySalesQueryOptions());
      return;
    }
    if (path === "/products" || path.startsWith("/products/")) {
      void qc.prefetchQuery(getListProductsQueryOptions({ limit: 80, page: 1 }));
      return;
    }
    if (path === "/sales" || path.startsWith("/sales/")) {
      void qc.prefetchQuery(getGetTodaySalesQueryOptions());
      void qc.prefetchQuery(getListProductsQueryOptions({ limit: 500 }));
    }
  } catch {
    /* prefetch isteğe bağlı */
  }
}
