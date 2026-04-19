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
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="h-32 bg-slate-100 rounded" />
        <div className="h-32 bg-slate-100 rounded" />
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
        <Card className="max-w-md w-[92%] shadow-2xl border-blue-200">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
              <Lock className="h-7 w-7 text-blue-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {title ?? "Bu modül paketinizde yok"}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Mevcut paketiniz: <span className="font-semibold">{planName}</span>.
                Bu özelliği kullanmak için paketinizi yükseltin — modülün önizlemesini
                arka planda görebilirsiniz.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-center gap-2 justify-center">
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
