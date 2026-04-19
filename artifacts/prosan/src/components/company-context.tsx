import { createContext, useContext, useEffect, useState } from "react";

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
      const meRes = await fetch("/api/auth/me", { credentials: "include" }).catch(() => null);
      if (meRes?.ok) {
        const me = await meRes.json().catch(() => null);
        if (me?.role === "super_admin") {
          if (mounted) { setCompany(PLATFORM); setIsLoading(false); }
          return;
        }
      }

      // Normal kullanıcı: tenant'a ait şirket bilgisini al
      const tenantRes = await fetch("/api/auth/tenant", { credentials: "include" }).catch(() => null);
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
