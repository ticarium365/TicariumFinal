import { useQuery } from "@tanstack/react-query";

export interface PaymentStatus {
  planType: "trial" | "active" | "suspended";
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  isTrialExpired: boolean;
  isActive: boolean;
  ibanInfo: {
    iban?: string;
    bankName?: string;
    accountHolder?: string;
    monthlyPrice?: string;
  };
}

export function usePaymentStatus() {
  return useQuery<PaymentStatus>({
    queryKey: ["payment-status"],
    queryFn: async () => {
      const res = await fetch("/api/payment/status", { credentials: "include" });
      if (!res.ok) throw new Error("Ödeme durumu alınamadı");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}
