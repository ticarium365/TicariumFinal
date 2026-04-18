import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

type LockedDetail = {
  requiredFeature?: string;
  currentPlan?: string;
  upgradeUrl?: string;
  message?: string;
};

const FEATURE_LABELS: Record<string, string> = {
  "production.bom": "Üretim & Reçete (BOM)",
  "loyalty.points": "Sadakat & Puan",
  "currency.multi": "Çoklu Para Birimi",
  "einvoice.pro": "E-Fatura + E-İrsaliye",
  "marketplace.basic": "Pazaryeri Entegrasyonu",
  "marketplace.pro": "Shopify / WooCommerce",
  "finance.banking": "Banka Yönetimi",
  "finance.expenses": "Gider Merkezi",
  "hr.staff": "Personel Yönetimi",
  "profit.dashboard": "Net Kâr Paneli",
  "accountant.panel": "Mali Müşavir Paneli",
  "reports.advanced": "Gelişmiş Raporlar",
  "campaigns": "Kampanya Motoru",
};

export function UpgradeModal() {
  const [detail, setDetail] = useState<LockedDetail | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<LockedDetail>;
      setDetail(ce.detail);
    }
    window.addEventListener("feature-locked", handler);
    return () => window.removeEventListener("feature-locked", handler);
  }, []);

  if (!detail) return null;
  const featLabel = detail.requiredFeature ? (FEATURE_LABELS[detail.requiredFeature] ?? detail.requiredFeature) : "Bu özellik";

  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-2">
            <Lock className="w-6 h-6 text-amber-600" />
          </div>
          <DialogTitle className="text-center">Bu özellik mevcut planınıza dahil değil</DialogTitle>
          <DialogDescription className="text-center pt-2">
            <Badge variant="outline" className="mb-2">{featLabel}</Badge>
            <div className="mt-2">
              {detail.message ?? "Daha üst pakete geçerek bu özelliği ve diğer gelişmiş yetenekleri kullanmaya başlayabilirsiniz."}
            </div>
            {detail.currentPlan && (
              <div className="mt-3 text-xs text-muted-foreground">
                Mevcut planınız: <span className="font-mono">{detail.currentPlan}</span>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => setDetail(null)}>Daha Sonra</Button>
          <Button onClick={() => { setDetail(null); navigate(detail.upgradeUrl ?? "/pricing"); }}>
            <Sparkles className="w-4 h-4 mr-1" />
            Paketleri Görüntüle <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Install once: wrap window.fetch to dispatch event on 403 FEATURE_LOCKED
let installed = false;
export function installFeatureLockInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    if (res.status === 403) {
      try {
        const cloned = res.clone();
        const data = await cloned.json();
        if (data?.code === "FEATURE_LOCKED" || data?.error?.code === "FEATURE_LOCKED") {
          const payload = data.code ? data : data.error;
          window.dispatchEvent(new CustomEvent("feature-locked", { detail: {
            requiredFeature: payload.requiredFeature,
            currentPlan: payload.currentPlan,
            upgradeUrl: payload.upgradeUrl ?? "/pricing",
            message: payload.message,
          }}));
        }
      } catch { /* not JSON */ }
    }
    return res;
  };
}
