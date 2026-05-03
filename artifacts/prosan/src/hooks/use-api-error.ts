import { useCallback } from "react";
import { useLocation } from "wouter";

import { loginUrlWithCurrentLocationNext } from "@/lib/login-redirect";
import { mapApiError } from "@/lib/map-api-error";
import { toastApiError } from "@/lib/app-toast";

export type UseApiErrorOptions = {
  /** Skip toast (e.g. when UI shows inline error) */
  silent?: boolean;
};

/**
 * Central API error handling: maps backend codes → Turkish messages,
 * optional redirect to /login for 401 / TENANT_SESSION_MISMATCH.
 */
export function useApiError() {
  const [, navigate] = useLocation();

  const handleError = useCallback(
    (error: unknown, options?: UseApiErrorOptions) => {
      const mapped = mapApiError(error);
      if (mapped.redirectToLogin) {
        navigate(loginUrlWithCurrentLocationNext(), { replace: true });
      }
      if (!options?.silent) {
        toastApiError(mapped.message);
      }
      return mapped;
    },
    [navigate]
  );

  const mapMessage = useCallback((error: unknown) => mapApiError(error).message, []);

  return { handleError, mapMessage };
}
