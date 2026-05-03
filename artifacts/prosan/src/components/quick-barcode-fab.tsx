import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ScanBarcode, PackagePlus, Plus, X } from "lucide-react";

/**
 * Sağ alt köşede sabit yüzen "hızlı erişim" butonu.
 * Mevcut sayfalara dokunmaz, sadece kısayol sağlar.
 * - Barkod Tara → /barcode
 * - Stok Girişi → /stock
 * - Yeni Ürün  → /products/new
 *
 * Sadece authenticated layout altında render edilir (Layout içinden çağrılır).
 */
export function QuickBarcodeFab() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Esc ile kapat + dış tıklama ile kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const items: Array<{
    icon: React.ElementType;
    label: string;
    href: string;
    iconGradient: string;
  }> = [
    {
      icon: ScanBarcode,
      label: "Barkod Tara",
      href: "/barcode",
      iconGradient: "linear-gradient(135deg, var(--color-accent-violet) 0%, var(--color-accent-teal) 100%)",
    },
    {
      icon: PackagePlus,
      label: "Stok Girişi",
      href: "/stock",
      iconGradient: "linear-gradient(135deg, var(--color-chart-mint) 0%, var(--color-accent-teal) 100%)",
    },
    {
      icon: Plus,
      label: "Yeni Ürün",
      href: "/products/new",
      iconGradient: "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-violet) 100%)",
    },
  ];

  return (
    <div ref={containerRef} className="fixed bottom-5 right-5 z-40 md:bottom-6 md:right-6 print:hidden">
      {/* Açılır menü */}
      {open && (
        <div
          id="quick-fab-menu"
          role="menu"
          className="absolute bottom-16 right-0 flex flex-col items-end gap-2.5 mb-1 animate-in slide-in-from-bottom-2 fade-in duration-150"
        >
          {items.map(({ icon: Icon, label, href, iconGradient }) => (
            <button
              key={href}
              onClick={() => {
                setOpen(false);
                navigate(href);
              }}
              className="group flex items-center gap-2.5 pr-4 pl-2.5 py-2 rounded-full bg-[var(--color-surface-card)] shadow-lg border border-[color:var(--color-border-subtle)] hover:shadow-xl hover:-translate-y-0.5 transition-all"
              data-testid={`fab-quick-${href.replace(/\//g, "-").slice(1)}`}
            >
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center text-[color:var(--color-nav-text-active)] shadow-sm"
                style={{ background: iconGradient }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-[color:var(--color-neutral-700)] whitespace-nowrap">
                {label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Ana FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-14 w-14 rounded-full text-[color:var(--color-nav-text-active)] shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        style={{
          background: open
            ? "linear-gradient(135deg, var(--color-neutral-600) 0%, var(--color-neutral-700) 100%)"
            : "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-teal) 100%)",
          boxShadow: open
            ? "0 12px 28px -8px color-mix(in srgb, var(--color-neutral-900) 45%, transparent)"
            : "0 12px 28px -8px color-mix(in srgb, var(--color-accent-indigo) 55%, transparent)",
        }}
        aria-label={open ? "Hızlı erişim menüsünü kapat" : "Hızlı erişim menüsünü aç"}
        aria-expanded={open}
        aria-controls="quick-fab-menu"
        aria-haspopup="menu"
        data-testid="fab-quick-toggle"
      >
        {open ? <X className="h-6 w-6" /> : <ScanBarcode className="h-6 w-6" />}
      </button>
    </div>
  );
}
