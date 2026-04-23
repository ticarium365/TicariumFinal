import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, Target, ArrowRight, CheckCircle2 } from "lucide-react";

type Resp = {
  scorePercent: number;
  itemsDone: number;
  itemsTotal: number;
  categories: { id: string; label: string; scorePercent: number; items: { id: string; label: string; done: boolean; weight: number; link?: string }[] }[];
  dismissedAt: string | null;
};

export function SetupChecklistPopover() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const sessionKey = `tcrm_checklist_seen_${(user as any).companyId}_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    // Bu sekme oturumunda bir daha gösterme (reload edilse bile)
    sessionStorage.setItem(sessionKey, "1");

    fetch("/api/kurulum-skoru", { credentials: "include" })
      .then((r) => r.json())
      .then((d: Resp) => {
        setData(d);
        // dismissedAt göz ardı — kurulum %100 olana dek her oturumda dürt
        if (d.scorePercent < 100) {
          setOpen(true);
        }
      })
      .catch(() => {});
  }, [user]);

  function close() {
    setOpen(false);
  }

  if (!open || !data) return null;

  // En önemli 3 eksik item
  const topMissing = data.categories
    .flatMap((c) => c.items)
    .filter((i) => !i.done)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={close}
        data-testid="setup-popover-backdrop"
      />
      <div
        className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-blue-200 bg-white shadow-2xl overflow-hidden"
        data-testid="setup-popover"
      >
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-2 rounded-lg">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Hoş geldiniz!</h3>
                <p className="text-xs text-blue-100">
                  Kurulumunuzu birlikte tamamlayalım
                </p>
              </div>
            </div>
            <button
              onClick={close}
              className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>Kurulum ilerlemesi</span>
              <span className="font-semibold">
                {data.scorePercent}% — {data.itemsDone}/{data.itemsTotal}
              </span>
            </div>
            <Progress value={data.scorePercent} className="h-1.5 bg-white/20" />
          </div>
        </div>

        <div className="p-4 space-y-2">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
            Öncelikli yapılacaklar
          </div>
          {topMissing.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-700 py-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Her şey tamam!</span>
            </div>
          ) : (
            topMissing.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  if (it.link) {
                    navigate(it.link);
                    close();
                  }
                }}
                className="w-full flex items-center gap-2 text-left text-sm py-2 px-2 hover:bg-blue-50 rounded transition-colors"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="flex-1 text-slate-700">{it.label}</span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </button>
            ))
          )}
        </div>

        <div className="bg-slate-50 p-3 flex items-center justify-end gap-2 border-t">
          <Link href="/kurulum-skoru">
            <Button size="sm" onClick={close}>
              Tüm listeyi gör
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
