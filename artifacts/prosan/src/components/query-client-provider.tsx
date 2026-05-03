import { useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { mapApiError } from "@/lib/map-api-error";
import { loginUrlWithCurrentLocationNext } from "@/lib/login-redirect";
import { toastApiError } from "@/lib/app-toast";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          /** İşlem / satış / stok hareketleri: varsayılan taze veri */
          staleTime: 0,
        },
        mutations: {
          onError: (error, _vars, _ctx, mutation) => {
            const meta = mutation.meta as { skipGlobalErrorHandler?: boolean } | undefined;
            if (meta?.skipGlobalErrorHandler) return;
            const mapped = mapApiError(error);
            if (mapped.redirectToLogin) {
              navigate(loginUrlWithCurrentLocationNext(), { replace: true });
            }
            toastApiError(mapped.message);
          },
        },
      },
    });
    /** Referans veriler — ürün / cari listeleri */
    client.setQueryDefaults(["/api/products"], { staleTime: 5 * 60 * 1000 });
    client.setQueryDefaults(["/api/customers"], { staleTime: 5 * 60 * 1000 });
    return client;
  }, [navigate]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
