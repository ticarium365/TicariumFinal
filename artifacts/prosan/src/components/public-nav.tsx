import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, Phone, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/amacimiz", label: "Amacımız" },
  { href: "/paketler", label: "Paketler" },
  { href: "/karsilastir", label: "Neden Farklıyız" },
  { href: "/iletisim", label: "İletişim" },
];

// ─── Marka rozeti — yumuşak indigo→teal gradient + tırpan T monogram ──────
function NavBrandIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <defs>
        <linearGradient id="t365grad-nav" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0EA5A4" />
        </linearGradient>
        <linearGradient id="t365grad-nav-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#t365grad-nav)" />
      <rect x="0" y="0" width="48" height="24" rx="13" fill="url(#t365grad-nav-glow)" />
      <path d="M11 14 H37 V20 H27 V36 H21 V20 H11 Z" fill="white" />
      <rect x="28" y="30" width="15" height="9" rx="2.5" fill="white" />
      <text
        x="35.5" y="36.7" textAnchor="middle"
        fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
        fontWeight={800} fontSize={6.4} fill="#2563eb" letterSpacing="0.2"
      >
        365
      </text>
    </svg>
  );
}

export function PublicNav() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 transition-all duration-300"
      style={{
        background: scrolled
          ? "rgba(255,255,255,0.78)"
          : "rgba(255,255,255,0.55)",
        borderBottom: scrolled
          ? "1px solid rgba(99,102,241,0.12)"
          : "1px solid rgba(15,23,42,0.04)",
        backdropFilter: "saturate(160%) blur(16px)",
        WebkitBackdropFilter: "saturate(160%) blur(16px)",
        boxShadow: scrolled ? "0 8px 30px -16px rgba(15,23,42,0.10)" : "none",
      }}
      data-testid="public-nav"
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/login"
          className="flex items-center gap-2.5 group"
          data-testid="nav-logo"
        >
          <span className="transition-transform duration-300 group-hover:scale-[1.05]">
            <NavBrandIcon size={36} />
          </span>
          <span
            className="font-bold text-lg tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "#0F172A" }}
          >
            Ticarium
            <span
              style={{
                background: "linear-gradient(135deg,#2563eb 0%,#0EA5A4 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              365
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {items.map((it) => {
            const active = location === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className="relative px-3.5 py-2 text-sm font-medium rounded-full transition-all duration-200"
                style={{
                  color: active ? "#0F172A" : "#475569",
                  background: active
                    ? "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(14,165,164,0.08))"
                    : "transparent",
                }}
                data-testid={`nav-${it.href.slice(1)}`}
              >
                {it.label}
                {active && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 h-[3px] w-7 rounded-full"
                    style={{
                      background: "linear-gradient(90deg,#6366F1,#0EA5A4)",
                      boxShadow: "0 0 12px rgba(99,102,241,0.5)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/iletisim")}
            data-testid="nav-cta-call"
            className="gap-1.5"
            style={{
              background: "rgba(255,255,255,0.7)",
              borderColor: "rgba(99,102,241,0.20)",
              color: "#334155",
            }}
          >
            <Phone className="w-3.5 h-3.5" />
            Sizi Arayalım
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/login")}
            data-testid="nav-cta-login"
            className="gap-1.5"
            style={{
              background: "linear-gradient(135deg,#2563eb 0%,#0EA5A4 100%)",
              color: "#FFFFFF",
              border: 0,
              boxShadow: "0 6px 20px -6px rgba(79,70,229,0.55)",
            }}
          >
            Giriş Yap
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden p-2 rounded-md"
          style={{ color: "#334155" }}
          onClick={() => setOpen((v) => !v)}
          aria-label="Menüyü aç"
          data-testid="nav-burger"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          className="md:hidden"
          style={{
            background: "rgba(255,255,255,0.96)",
            borderTop: "1px solid rgba(99,102,241,0.12)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="px-3 py-2.5 text-sm font-medium rounded-lg"
                style={{ color: "#334155" }}
                onClick={() => setOpen(false)}
                data-testid={`nav-mob-${it.href.slice(1)}`}
              >
                {it.label}
              </Link>
            ))}
            <div
              className="grid grid-cols-2 gap-2 pt-2 mt-2"
              style={{ borderTop: "1px solid rgba(99,102,241,0.10)" }}
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  setLocation("/iletisim");
                }}
                style={{
                  background: "#FFFFFF",
                  borderColor: "rgba(99,102,241,0.20)",
                  color: "#334155",
                }}
              >
                Sizi Arayalım
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  setLocation("/login");
                }}
                style={{
                  background: "linear-gradient(135deg,#2563eb 0%,#0EA5A4 100%)",
                  color: "#FFFFFF",
                  border: 0,
                }}
              >
                Giriş Yap
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer
      className="py-12 mt-16 relative overflow-hidden"
      style={{
        borderTop: "1px solid rgba(99,102,241,0.10)",
        background:
          "linear-gradient(180deg,#F8FAFC 0%, #F1F5FB 100%)",
      }}
    >
      <div
        className="absolute -top-32 left-1/4 w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(closest-side, rgba(79,70,229,0.08), transparent 70%)" }}
      />
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm relative">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <NavBrandIcon size={32} />
            <div
              className="font-bold text-base"
              style={{ fontFamily: "var(--font-display)", color: "#0F172A" }}
            >
              Ticarium
              <span
                style={{
                  background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                365
              </span>
            </div>
          </div>
          <p style={{ color: "#64748B", lineHeight: 1.6 }}>
            365 gün işinin yanında. KOBİ'ler için bulut tabanlı işletim sistemi.
          </p>
        </div>
        <div>
          <div className="font-semibold mb-3" style={{ color: "#0F172A" }}>
            Şirket
          </div>
          <ul className="space-y-2" style={{ color: "#64748B" }}>
            <li><Link href="/hakkimizda" className="hover:text-blue-600 transition-colors">Hakkımızda</Link></li>
            <li><Link href="/amacimiz" className="hover:text-blue-600 transition-colors">Amacımız</Link></li>
            <li><Link href="/paketler" className="hover:text-blue-600 transition-colors">Paketler</Link></li>
            <li><Link href="/iletisim" className="hover:text-blue-600 transition-colors">İletişim</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3" style={{ color: "#0F172A" }}>
            İletişim
          </div>
          <p style={{ color: "#64748B", lineHeight: 1.6 }}>
            Soruların ya da deneme hesabı için{" "}
            <Link
              href="/iletisim"
              className="font-medium hover:underline"
              style={{
                background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              bize ulaş
            </Link>
            .
          </p>
        </div>
      </div>
      <div
        className="container mx-auto px-4 mt-10 pt-6 text-xs text-center"
        style={{
          color: "#94A3B8",
          borderTop: "1px solid rgba(99,102,241,0.08)",
        }}
      >
        © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır.
      </div>
    </footer>
  );
}
