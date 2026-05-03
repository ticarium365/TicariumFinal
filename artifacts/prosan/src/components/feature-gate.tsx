import { Link } from "wouter";
import { useFeatures } from "@/components/use-features";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, ArrowRight } from "lucide-react";

type Props = {
  feature?: string;
  children: React.ReactNode;
  /** sayfa başlığı (kilitli ekranda gösterilir) */
  title?: string;
};

export function FeatureGate({ feature, children, title }: Props) {
  const { has, planName, isLoading, isError } = useFeatures();

  if (!feature) return <>{children}</>;

  // Yükleniyorsa skeleton göster — fail-open ya da fail-closed çakışmasını önler
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse" data-testid="feature-gate-loading">
        <div className="h-8 w-48 rounded bg-[color-mix(in_srgb,var(--color-neutral-500)_18%,var(--color-surface-card))]" />
        <div className="h-32 rounded bg-[color-mix(in_srgb,var(--color-neutral-500)_10%,var(--color-surface-card))]" />
        <div className="h-32 rounded bg-[color-mix(in_srgb,var(--color-neutral-500)_10%,var(--color-surface-card))]" />
      </div>
    );
  }

  // Hata durumunda fail-open (sunucuya ulaşılamıyor → kullanıcıyı kilitleme)
  if (isError || has(feature)) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-[calc(100vh-150px)]">
      {/* Arka planda içerik gösterilsin (kullanıcı neyi kaçırdığını görsün) */}
      <div className="pointer-events-none select-none blur-[2px] opacity-50">{children}</div>

      {/* Kilit overlay */}
      <div className="absolute inset-0 flex items-start justify-center pt-16">
        <Card className="max-w-md w-[92%] shadow-2xl border-[color:color-mix(in_srgb,var(--color-brand-500)_35%,var(--color-border-subtle))]">
          <CardContent className="p-8 text-center space-y-4">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                background:
                  "linear-gradient(to bottom right, color-mix(in srgb, var(--color-brand-200) 80%, var(--color-surface-card)), color-mix(in srgb, var(--color-accent-violet) 15%, var(--color-surface-card)))",
              }}
            >
              <Lock className="h-7 w-7 text-[color:var(--color-brand-700)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[color:var(--color-neutral-900)]">
                {title ?? "Bu modül paketinizde yok"}
              </h2>
              <p className="mt-2 text-sm text-[color:var(--color-neutral-600)]">
                Mevcut paketiniz: <span className="font-semibold">{planName}</span>.
                Bu özelliği kullanmak için paketinizi yükseltin — modülün önizlemesini
                arka planda görebilirsiniz.
              </p>
            </div>
            <div
              className="flex items-center justify-center gap-2 rounded-lg border p-3 text-xs text-[color:var(--color-brand-900)]"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-brand-500) 10%, var(--color-surface-card))",
                borderColor: "color-mix(in srgb, var(--color-brand-500) 30%, var(--color-border-subtle))",
              }}
            >
              <Sparkles className="h-4 w-4" />
              <span>Yükseltme: anında aktifleşir, verileriniz korunur.</span>
            </div>
            <Link href="/settings/subscription">
              <Button className="w-full" size="lg">
                Paketi Yükselt
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
