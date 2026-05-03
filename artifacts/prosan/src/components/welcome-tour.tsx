import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, Sparkles, Package, ShoppingCart, BarChart2, ScanLine, ArrowRight } from "lucide-react";

const TOUR_KEY = "sms_welcome_tour_done";
const SHOW_KEY = "show_welcome_tour";

const STEPS = [
  {
    icon: Package,
    title: "Ürün Yönetimi",
    desc: "Sol menüden \"Ürünler\" seçerek ürün ekleyebilir, düzenleyebilir ve toplu Excel import yapabilirsiniz.",
    color: "text-[color:var(--color-brand-700)]",
    bg: "bg-[color-mix(in_srgb,var(--color-brand-500)_14%,var(--color-surface-card))]",
  },
  {
    icon: ShoppingCart,
    title: "Satış Ekranı",
    desc: "\"Satış\" ekranından ürün arayarak ya da barkod okutarak sepete ekleyin ve ödeme yöntemi seçerek satışı tamamlayın.",
    color: "text-[color:var(--color-semantic-success)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-success)_14%,var(--color-surface-card))]",
  },
  {
    icon: ScanLine,
    title: "Barkod Tarayıcı",
    desc: "\"Barkod\" sayfasında kameranızla ürün tarayabilir, stok ve fiyat bilgisine anında ulaşabilirsiniz.",
    color: "text-[color:var(--color-accent-violet)]",
    bg: "bg-[color-mix(in_srgb,var(--color-accent-violet)_14%,var(--color-surface-card))]",
  },
  {
    icon: BarChart2,
    title: "Günlük Kapanış",
    desc: "\"Raporlar → Günlük Kapanış\" sayfasından günün ciro, satış ve stok özetini görebilirsiniz.",
    color: "text-[color:var(--color-semantic-warning)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-warning)_14%,var(--color-surface-card))]",
  },
];

export function WelcomeTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const alreadyDone = localStorage.getItem(TOUR_KEY);
    const shouldShow = localStorage.getItem(SHOW_KEY);
    if (!alreadyDone && shouldShow === "1") {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "1");
    localStorage.removeItem(SHOW_KEY);
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  };

  if (!visible) return null;

  const current = STEPS[step]!;
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Hızlı Başlangıç Turu</span>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${current.bg}`}>
            <Icon className={`h-6 w-6 ${current.color}`} />
          </div>
          <h3 className="font-bold text-lg mb-2">{current.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{current.desc}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
          {/* Dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
              Atla
            </Button>
            <Button size="sm" onClick={next} className="gap-1.5">
              {step < STEPS.length - 1 ? (
                <><ChevronRight className="h-4 w-4" /> İleri</>
              ) : (
                <><ArrowRight className="h-4 w-4" /> Başla</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
