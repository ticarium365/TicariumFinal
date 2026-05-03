import { createContext, useContext, useEffect, useState } from "react";
import { customFetch, ApiError, ApiValidationError } from "@workspace/api-client-react";

export interface CompanyInfo {
  id: number;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
}

const PLATFORM: CompanyInfo = {
  id: 0,
  name: "Ticarium365",
  subdomain: "admin",
  primaryColor: "#2563eb",
  logoUrl: null,
};

interface CompanyContextType {
  company: CompanyInfo | null;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  company: null,
  isLoading: true,
});

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function resolve() {
      // Önce oturum kontrolü — super_admin ise platform markası göster
      try {
        const me = await customFetch<{ role?: string }>("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
          responseType: "json",
        });
        if (me.role === "super_admin") {
          if (mounted) {
            setCompany(PLATFORM);
            setIsLoading(false);
          }
          return;
        }
      } catch (e) {
        if (e instanceof ApiValidationError) {
          /* Sentry: api-runtime-bootstrap */
        } else if (!(e instanceof ApiError)) {
          /* ağ / beklenmeyen */
        }
      }

      // Normal kullanıcı: tenant'a ait şirket bilgisini al
      const tenantRes = await fetch("/api/settings/company", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);
      if (tenantRes?.ok) {
        const data = await tenantRes.json().catch(() => null);
        if (mounted && data) setCompany(data);
      }

      if (mounted) setIsLoading(false);
    }

    resolve();
    return () => { mounted = false; };
  }, []);

  return (
    <CompanyContext.Provider value={{ company, isLoading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
