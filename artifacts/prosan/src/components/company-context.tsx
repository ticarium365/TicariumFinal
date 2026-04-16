import { createContext, useContext, useEffect, useState } from "react";

export interface CompanyInfo {
  id: number;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
}

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
    fetch("/api/auth/tenant", { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject(res))
      .then((data: CompanyInfo) => {
        if (mounted) setCompany(data);
      })
      .catch(() => {
        // Sessizce devam et
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
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
