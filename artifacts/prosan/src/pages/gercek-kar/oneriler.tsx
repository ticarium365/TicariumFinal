import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, AlertTriangle, TrendingUp, Star, Clock, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface Suggestion {
  productId: number; productName: string; productCode: string;
  severity: "critical" | "warning" | "info";
  type: string; title: string; message: string; action: string;
}

const sevColors: Record<string, string> = {
  critical: "border-red-500/30 dark:border-red-900 bg-red-500/10/50 dark:bg-red-950/20",
  warning: "border-orange-500/30 dark:border-orange-900 bg-orange-500/10/50 dark:bg-orange-950/20",
  info: "border-blue-500/30 dark:border-blue-900 bg-blue-500/10/50 dark:bg-blue-950/20",
};
const sevIcons: Record<string, any> = {
  critical: <AlertTriangle className="h-5 w-5 text-red-600" />,
  warning: <Clock className="h-5 w-5 text-orange-600" />,
  info: <Star className="h-5 w-5 text-blue-600" />,
};
const sevLabels: Record<string, string> = {
  critical: "Acil", warning: "Önemli", info: "Bilgi",
};

export default function GercekKarOneriler() {
  const { data, isLoading, isError, refetch, error } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ["/api/profit-engine/advisor"],
    queryFn: async () => {
      const r = await fetch("/api/profit-engine/advisor", { credentials: "include" });
      if (!r.ok) throw new Error("Veri alınamadı");
      const j = await r.json();
      return { suggestions: Array.isArray(j?.suggestions) ? j.suggestions : [] };
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/gercek-kar"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Geri</Button></Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-2"><Lightbulb className="h-6 w-6 text-yellow-500" />Akıllı Öneriler</h1>
          <p className="text-sm text-muted-foreground">Sistem ürünlerinizi analiz etti ve şu önerileri çıkardı:</p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded" />)}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">{(error as Error)?.message ?? "Hata"}</p>
            <Button onClick={() => refetch()} size="sm">Tekrar Dene</Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data?.suggestions.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Star className="h-12 w-12 text-yellow-500 mx-auto mb-3" />
            <p className="text-lg font-medium">Tebrikler! 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">Şu an aksiyon gerektiren bir ürün yok. Stok ve fiyatlandırmanız sağlıklı görünüyor.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.suggestions.map((s, idx) => (
          <Card key={`${s.productId}-${idx}`} className={sevColors[s.severity]} data-testid={`suggestion-${s.productId}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                {sevIcons[s.severity]}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{sevLabels[s.severity]}</Badge>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-1">{s.productCode}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pl-12">
              <p className="text-sm mb-3">{s.message}</p>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xs"><TrendingUp className="h-3 w-3 mr-1" />Öneri: {s.action}</Badge>
                <Link href={`/products/${s.productId}`}>
                  <Button size="sm" variant="outline" data-testid={`button-go-${s.productId}`}>Ürüne Git</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
