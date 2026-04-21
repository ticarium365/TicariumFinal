import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";

export interface PaymentStatus {
  planType: "trial" | "active" | "suspended";
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  isTrialExpired: boolean;
  isActive: boolean;
}

export function usePaymentStatus() {
  const { apiGet, user } = useAuth();
  return useQuery<PaymentStatus>({
    queryKey: ["payment-status"],
    queryFn: () => apiGet<PaymentStatus>("/payment/status"),
    enabled: !!user && user.role !== "super_admin",
    staleTime: 60 * 1000,
    retry: false,
  });
}
