import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Rocket } from "lucide-react";
import { PageHeader } from "@/components/page-header";

interface ComingSoonProps {
  title: string;
  description?: string;
  features?: string[];
  eta?: string;
  icon?: ReactNode;
}

export function ComingSoon({
  title,
  description = "Bu modül üzerinde çalışıyoruz. Yakında kullanımınıza sunulacak.",
  features,
  eta,
  icon,
}: ComingSoonProps) {
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid="coming-soon">
      <PageHeader
        title={title}
        description={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Yakında geliyor</span>
            {eta && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{eta}</span>}
          </span>
        }
      />
      <Card className="border-dashed border-2">
        <CardContent className="p-10 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-100 to-blue-100 flex items-center justify-center">
              {icon ?? <Rocket className="h-10 w-10 text-emerald-600" />}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Çok yakında!</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{description}</p>
          </div>
          {features && features.length > 0 && (
            <div className="pt-4 border-t max-w-xl mx-auto">
              <p className="text-sm font-medium mb-3 text-muted-foreground">Yol haritasında:</p>
              <ul className="space-y-2 text-sm text-left inline-block">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-4">
            <p className="text-xs text-muted-foreground">
              Bu modülün önceliklendirilmesini ister misiniz?{" "}
              <a href="/iletisim" className="text-emerald-700 hover:underline font-medium">
                Bize bildirin
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ComingSoon;
