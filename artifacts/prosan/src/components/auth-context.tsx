import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

// ─── Dalga 18B: Aktif plan + limit + isTrial bilgileri ─────────────────────
export interface PlanLimits {
  maxUsers: number;
  maxProducts: number;
  maxBranches: number;
  maxCustomers: number;
  maxEinvoiceMonthly: number;
  einvoiceOverageRate: string;
  maxOcrMonthly: number;
  maxApiCallsMonthly: number;
  maxMarketplaceChannels: number;
  storageMb: number;
}
export interface PlanInfo {
  slug: string;
  name: string;
  status: string;          // active | trial | grace_period | cancelled | suspended
  isTrial: boolean;
  trialEndsAt: string | null;
  limits: PlanLimits;
}

// Dalga 19 — aylık kontör kullanımı
export interface UsageMetricSnapshot { count: number; overage: number; }
export interface UsageInfo {
  period: string; // 'YYYY-MM' UTC
  einvoice: UsageMetricSnapshot;
  ocr: UsageMetricSnapshot;
  apiCalls: UsageMetricSnapshot;
  sms: UsageMetricSnapshot;
}

interface AuthContextType {
  user: (User & { onboardingCompleted?: boolean | null; plan?: PlanInfo | null; usage?: UsageInfo | null }) | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  plan: PlanInfo | null;
  usage: UsageInfo | null;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  needsOnboarding: false,
  plan: null,
  usage: null,
  checkAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, error } = useGetMe({
    query: { retry: false },
  });

  const [, setLocation] = useLocation();

  const needsOnboarding =
    !!user &&
    (user as any).role === "admin" &&
    (user as any).onboardingCompleted === false;

  useEffect(() => {
    if (!isLoading && error) {
      // Public routes — auth gerekmez, /login'e yönlendirme
      const publicPaths = ["/", "/login", "/kayit", "/verify", "/sifremi-unuttum", "/forgot-password", "/karsilastir", "/neden-ticarium365", "/hakkimizda", "/amacimiz", "/paketler", "/iletisim", "/kvkk", "/kullanim-kosullari"];
      const here = window.location.pathname.replace(/\/$/, "") || "/";
      if (!publicPaths.some((p) => here === p || (p !== "/" && here.startsWith(p + "/")))) {
        setLocation("/login");
      }
    }
  }, [isLoading, error, setLocation]);

  const checkAuth = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user: (user as any) || null,
        isLoading,
        isAuthenticated: !!user,
        needsOnboarding,
        plan: ((user as any)?.plan as PlanInfo | null) ?? null,
        usage: ((user as any)?.usage as UsageInfo | null) ?? null,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
