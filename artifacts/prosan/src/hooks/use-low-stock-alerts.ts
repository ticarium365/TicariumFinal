import { useQuery } from "@tanstack/react-query";

export interface LowStockProduct {
  id: number;
  productCode: string;
  name: string;
  stock: number;
  minStock: number;
  category: string | null;
}

export interface LowStockAlerts {
  count: number;
  critical: number;
  low: number;
  products: LowStockProduct[];
}

async function fetchLowStockAlerts(): Promise<LowStockAlerts> {
  const res = await fetch("/api/alerts/low-stock", { credentials: "include" });
  if (!res.ok) throw new Error("Alarm verisi alınamadı");
  return res.json();
}

export function useLowStockAlerts() {
  return useQuery<LowStockAlerts>({
    queryKey: ["alerts", "low-stock"],
    queryFn: fetchLowStockAlerts,
    refetchInterval: 60_000,      // Her 60 saniyede bir güncelle
    staleTime: 30_000,
    retry: false,
  });
}
