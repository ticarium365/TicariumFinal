import { Loader2 } from "lucide-react";

/** Route lazy chunk yüklenirken — tam sayfa yerine hafif gösterge */
export function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-muted-foreground" data-testid="route-fallback">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm">Sayfa yükleniyor…</p>
    </div>
  );
}
