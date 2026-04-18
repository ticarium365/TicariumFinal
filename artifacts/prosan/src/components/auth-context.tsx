import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

interface AuthContextType {
  user: (User & { onboardingCompleted?: boolean | null }) | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  needsOnboarding: false,
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
      const publicPaths = ["/login", "/sifremi-unuttum", "/forgot-password", "/karsilastir", "/neden-ticarium365", "/neden-smsystems", "/hakkimizda", "/amacimiz", "/paketler", "/iletisim", "/kvkk"];
      const here = window.location.pathname.replace(/\/$/, "") || "/";
      if (!publicPaths.some((p) => here === p || here.startsWith(p + "/"))) {
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
