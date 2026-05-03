/**
 * DemoDataBanner — onboarding'i tamamlamış ama demo veri seçmemiş
 * (veya hiçbir şey eklememiş) tenant'lar için ikinci şans CTA'sı.
 *
 * Görünür koşullar (hepsi true olmalı):
 *   - Kullanıcı admin
 *   - companies.demo_seeded_at NULL  (henüz demo yüklenmemiş)
 *   - companies.onboarding_completed_at NOT NULL (wizard atlanmış sayılır)
 *   - kurulum-skoru.scorePercent < 20  (sistem gerçekten boş)
 *
 * Kullanıcı "Daha sonra" derse 7 gün boyunca localStorage ile gizlenir.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Factory, Store, X, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * Architect bulgu #5: snooze key tenant-scoped olmalı; yoksa bir tenant'ta
 * banner'ı gizleyen kullanıcı diğer tenant'larında da görmüyor (aynı tarayıcı).
 */
const SNOOZE_KEY_PREFIX = "demo_data_banner_snoozed_until::";
const SNOOZE_DAYS = 7;

interface OnboardingStatus {
  sector: "industrial" | "retail" | "other" | null;
  onboardingCompleted: boolean;
  demoSeeded: boolean;
}

interface SetupScore {
  scorePercent: number;
  dismissedAt?: string | null;
}

export function DemoDataBanner() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const tenantKey = (user as any)?.companyId ?? window.location.host;
  const snoozeKey = `${SNOOZE_KEY_PREFIX}${tenantKey}`;
  const [hidden, setHidden] = useState(() => {
    const until = localStorage.getItem(snoozeKey);
    return until ? new Date(until).getTime() > Date.now() : false;
  });

  const isAdmin = user?.role === "admin";

  const { data: status } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    enabled: isAdmin && !hidden,
    queryFn: async () => {
      const r = await fetch("/api/onboarding/status", { credentials: "include" });
      if (!r.ok) throw new Error("status fetch failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: score } = useQuery<SetupScore>({
    queryKey: ["/api/kurulum-skoru"],
    enabled: isAdmin && !hidden && !!status && status.onboardingCompleted && !status.demoSeeded,
    queryFn: async () => {
      const r = await fetch("/api/kurulum-skoru", { credentials: "include" });
      if (!r.ok) throw new Error("score fetch failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const seed = useMutation({
    mutationFn: async (sector: "industrial" | "retail") => {
      const r = await fetch("/api/onboarding/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sector }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message ?? "Seed başarısız");
      }
      return r.json();
    },
    onSuccess: (j) => {
      toast({
        title: "Demo veriler yüklendi 🎉",
        description: `${j.summary?.products} ürün, ${j.summary?.sales} satış, ${j.summary?.purchases} alış oluşturuldu.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      qc.invalidateQueries({ queryKey: ["/api/kurulum-skoru"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (e: any) => {
      toast({
        title: "Yükleme başarısız",
        description: e?.message ?? "Tekrar deneyin.",
        variant: "destructive",
      });
    },
  });

  if (!isAdmin || hidden) return null;
  if (!status || !status.onboardingCompleted || status.demoSeeded) return null;
  if (!score || score.scorePercent >= 20) return null;

  const snooze = () => {
    const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    localStorage.setItem(snoozeKey, until.toISOString());
    setHidden(true);
  };

  return (
    <div
      className="border-b border-[color:color-mix(in_srgb,var(--color-brand-500)_30%,var(--color-border-subtle))] bg-gradient-to-r from-[color-mix(in_srgb,var(--color-brand-500)_10%,var(--color-surface-card))] to-[color-mix(in_srgb,var(--color-accent-violet)_8%,var(--color-surface-card))] px-4 md:px-6 py-3"
    >
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="rounded-lg bg-[var(--color-brand-500)] p-2 text-[color:var(--color-nav-text-active)] shrink-0">
            <Database className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--color-neutral-900)]">
              Sisteminiz boş görünüyor — denemek için demo veriler yükleyelim mi?
            </p>
            <p className="text-xs text-[color:var(--color-neutral-600)] mt-0.5">
              Tek tıkla örnek ürünler, müşteriler ve satışlarla dolu bir görünüm; istediğinizde silebilirsiniz.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => seed.mutate("industrial")}
            disabled={seed.isPending}
            data-testid="button-demo-industrial"
          >
            {seed.isPending && seed.variables === "industrial"
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Factory className="h-3.5 w-3.5 mr-1" />}
            Endüstriyel
          </Button>
          <Button
            size="sm"
            onClick={() => seed.mutate("retail")}
            disabled={seed.isPending}
            data-testid="button-demo-retail"
          >
            {seed.isPending && seed.variables === "retail"
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Store className="h-3.5 w-3.5 mr-1" />}
            Perakende
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={snooze}
            title="7 gün gizle"
            data-testid="button-demo-snooze"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
