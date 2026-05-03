import { createContext, useContext, useEffect, useCallback, useState } from "react";
import { setSentryUser, clearSentryUser } from "@/lib/sentry";
import { useGetMe, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { loginUrlWithCurrentLocationNext } from "@/lib/login-redirect";
import { SessionExpiryModal } from "@/components/session-expiry-modal";

const SESSION_ROLES = ["admin", "staff", "viewer", "super_admin"] as const;

/** `/me` başarılı ama gövde eksik / bozuksa oturum geçersiz sayılır */
export function isVerifiedSessionUser(u: unknown): u is User {
  if (!u || typeof u !== "object") return false;
  const o = u as Record<string, unknown>;
  return (
    typeof o.id === "number" &&
    Number.isFinite(o.id) &&
    typeof o.username === "string" &&
    o.username.length > 0 &&
    typeof o.role === "string" &&
    (SESSION_ROLES as readonly string[]).includes(o.role)
  );
}

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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  needsOnboarding: false,
  plan: null,
  usage: null,
  checkAuth: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: rawMe, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 0,
    },
  });

  const [, setLocation] = useLocation();
  const [showSessionExpiryModal, setShowSessionExpiryModal] = useState(false);

  /** Hata veya şüpheli gövde — önceki başarılı cache'i kullanma (RQ stale-on-error) */
  const user =
    error ? null : rawMe && isVerifiedSessionUser(rawMe) ? rawMe : null;

  useEffect(() => {
    if (error) {
      queryClient.setQueryData(getGetMeQueryKey(), undefined);
      
      // 401 hatası durumunda session expiry modal'ı göster (public path'ler hariç)
      if (error?.status === 401 || error?.response?.status === 401) {
        const publicPaths = ["/", "/login", "/kayit", "/verify", "/sifremi-unuttum", "/forgot-password", "/karsilastir", "/neden-ticarium365", "/hakkimizda", "/amacimiz", "/paketler", "/iletisim", "/kvkk", "/kullanim-kosullari", "/odeme/sonuc", "/catalog", "/s/", "/pazar"];
        const here = window.location.pathname.replace(/\/$/, "") || "/";
        const isPublicPath = publicPaths.some((p) => here === p || (p !== "/" && here.startsWith(p + "/")));
        
        if (!isPublicPath) {
          setShowSessionExpiryModal(true);
        }
      }
      return;
    }
    if (rawMe != null && !isVerifiedSessionUser(rawMe)) {
      queryClient.setQueryData(getGetMeQueryKey(), undefined);
    }
  }, [error, rawMe, queryClient]);

  const needsOnboarding =
    !!user &&
    user.role === "admin" &&
    (user as any).onboardingCompleted === false;

  useEffect(() => {
    if (isLoading) return;
    if (!error) return;
    const publicPaths = ["/", "/login", "/kayit", "/verify", "/sifremi-unuttum", "/forgot-password", "/karsilastir", "/neden-ticarium365", "/hakkimizda", "/amacimiz", "/paketler", "/iletisim", "/kvkk", "/kullanim-kosullari", "/odeme/sonuc"];
    const here = window.location.pathname.replace(/\/$/, "") || "/";
    if (!publicPaths.some((p) => here === p || (p !== "/" && here.startsWith(p + "/")))) {
      setLocation(loginUrlWithCurrentLocationNext());
    }
  }, [isLoading, error, setLocation]);

  const checkAuth = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient]);

  const logout = useCallback(() => {
    // TanStack Query cache'i temizle
    queryClient.clear();
    
    // localStorage ve sessionStorage temizle
    localStorage.clear();
    sessionStorage.clear();
    
    // Session expiry modal'ı kapat
    setShowSessionExpiryModal(false);
    
    // Sentry user context'i temizle
    clearSentryUser();
  }, [queryClient, setShowSessionExpiryModal]);

  // Set Sentry user context when user logs in
  useEffect(() => {
    if (user) {
      setSentryUser({
        id: user.id,
        username: (user as any).username,
        role: user.role,
      });
    } else {
      clearSentryUser();
    }
  }, [user]);

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
        user,
        isLoading,
        isAuthenticated: !!user,
        needsOnboarding,
        plan: (user ? ((user as any)?.plan as PlanInfo | null) : null) ?? null,
        usage: (user ? ((user as any)?.usage as UsageInfo | null) : null) ?? null,
        checkAuth,
        logout,
      }}
    >
      {children}
      {showSessionExpiryModal && <SessionExpiryModal />}
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
