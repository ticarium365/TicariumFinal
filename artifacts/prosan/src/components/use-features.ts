import { useQuery } from "@tanstack/react-query";

export type SubscriptionFeatures = {
  planId: number;
  planName: string;
  features: string[];
  limits: {
    maxUsers: number;
    maxProducts: number;
    maxBranches: number;
    maxMonthlySales: number;
    storageMb: number;
  };
};

export function useFeatures() {
  const q = useQuery<SubscriptionFeatures>({
    queryKey: ["/api/subscriptions/features"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/features", { credentials: "include" });
      if (!r.ok) throw new Error("features fetch failed");
      return r.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  const features = q.data?.features ?? [];
  const planName = q.data?.planName ?? "—";

  function has(code?: string | null): boolean {
    if (!code) return true;
    // Hata durumunda fail-open (sunucuya ulaşılamıyorsa kullanıcıyı engelleme)
    if (q.isError) return true;
    // Yükleniyorsa "henüz bilinmiyor" — caller bu durumu ayrıca ele almalı (FeatureGate skeleton gösterir)
    if (q.isLoading) return true;
    return features.includes(code);
  }

  return { ...q, features, planName, has };
}
