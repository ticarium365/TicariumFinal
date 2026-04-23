import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Circle, ArrowRight, Loader2, Building2,
  Database, Zap, Target, Sparkles,
} from "lucide-react";

type Item = {
  id: string;
  category: "profil" | "veri" | "kullanim";
  label: string;
  hint?: string;
  link?: string;
  weight: number;
  done: boolean;
  value?: string | number;
};

type Cat = {
  id: "profil" | "veri" | "kullanim";
  label: string;
  scorePercent: number;
  weightedDone: number;
  weightedTotal: number;
  items: Item[];
};

type ChecklistData = {
  scorePercent: number;
  itemsDone: number;
  itemsTotal: number;
  weightedDone: number;
  weightedTotal: number;
  categories: Cat[];
  dismissedAt: string | null;
};

const CAT_ICON = {
  profil: Building2,
  veri: Database,
  kullanim: Zap,
} as const;

const CAT_COLOR: Record<string, string> = {
  profil: "from-blue-50 to-indigo-50 border-blue-200",
  veri: "from-emerald-50 to-teal-50 border-emerald-200",
  kullanim: "from-amber-50 to-orange-50 border-amber-200",
};

function ScoreGauge({ value }: { value: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const color =
    value >= 80 ? "stroke-emerald-500" :
    value >= 50 ? "stroke-blue-600" :
    value >= 25 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <div className="relative w-44 h-44">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        <circle
          cx="80" cy="80" r={r} fill="none" strokeWidth="14"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          className={`${color} transition-all duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-bold text-slate-900">{value}<span className="text-2xl text-slate-400">%</span></div>
        <div className="text-xs text-slate-500 uppercase tracking-wide mt-1">Kurulum İlerlemesi</div>
      </div>
    </div>
  );
}

export default function SetupScore() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/kurulum-skoru", { credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Skor hesaplanıyor...
      </div>
    );
  }

  const isComplete = data.scorePercent === 100;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Target className="h-8 w-8 text-blue-700" />
          Kurulum & Kullanım Skoru
        </h1>
        <p className="text-slate-600 mt-1">
          Sistemden tam verim alabilmeniz için doldurmanız ve kullanmanız önerilen alanlar.
        </p>
      </div>

      {/* Üst kart: Gauge + özet */}
      <Card className="border-blue-200">
        <CardContent className="p-6 flex flex-col md:flex-row items-center gap-8">
          <ScoreGauge value={data.scorePercent} />
          <div className="flex-1 space-y-3">
            {isComplete ? (
              <div className="flex items-center gap-2 text-emerald-700">
                <Sparkles className="h-6 w-6" />
                <span className="text-xl font-semibold">
                  Mükemmel — kurulumu eksiksiz tamamladınız!
                </span>
              </div>
            ) : (
              <div className="text-lg font-semibold text-slate-800">
                {data.itemsDone} / {data.itemsTotal} kontrol tamamlandı
              </div>
            )}

            <div className="space-y-2">
              {data.categories.map((c) => {
                const Icon = CAT_ICON[c.id];
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 flex items-center gap-1.5">
                        <Icon className="h-4 w-4 text-slate-500" /> {c.label}
                      </span>
                      <span className="font-semibold text-slate-900">{c.scorePercent}%</span>
                    </div>
                    <Progress value={c.scorePercent} className="h-2" />
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kategori detayları */}
      {data.categories.map((cat) => {
        const Icon = CAT_ICON[cat.id];
        const missing = cat.items.filter((i) => !i.done);
        const done = cat.items.filter((i) => i.done);
        return (
          <Card key={cat.id} className={`bg-gradient-to-br ${CAT_COLOR[cat.id]}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Icon className="h-5 w-5" />
                {cat.label}
                <Badge variant="secondary" className="ml-auto">
                  {cat.scorePercent}% · {cat.weightedDone}/{cat.weightedTotal} puan
                </Badge>
              </CardTitle>
              <CardDescription>
                {missing.length > 0
                  ? `${missing.length} eksik öğe — soldaki linklerden tamamlayabilirsiniz`
                  : "Bu bölümde her şey tamam, harika!"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {missing.map((it) => (
                <ChecklistRow key={it.id} item={it} />
              ))}
              {done.length > 0 && missing.length > 0 && (
                <div className="pt-3 mt-2 border-t border-slate-200/60">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                    Tamamlananlar
                  </div>
                </div>
              )}
              {done.map((it) => (
                <ChecklistRow key={it.id} item={it} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ChecklistRow({ item }: { item: Item }) {
  return (
    <div className={`flex items-start gap-3 rounded-md px-3 py-2 ${item.done ? "bg-white/40" : "bg-white/80"}`}>
      {item.done
        ? <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        : <Circle className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm ${item.done ? "text-slate-600" : "text-slate-900"}`}>
            {item.label}
          </span>
          {item.value && (
            <Badge variant="outline" className="text-xs">{item.value}</Badge>
          )}
          {!item.done && item.weight >= 3 && (
            <Badge className="bg-blue-600 text-white text-[10px] uppercase tracking-wide px-1.5 py-0">
              Yüksek öncelik
            </Badge>
          )}
        </div>
        {item.hint && !item.done && (
          <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>
        )}
      </div>
      {!item.done && item.link && (
        <Link href={item.link}>
          <Button size="sm" variant="ghost" className="text-blue-700 hover:text-blue-900 -my-1">
            Tamamla <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      )}
    </div>
  );
}
