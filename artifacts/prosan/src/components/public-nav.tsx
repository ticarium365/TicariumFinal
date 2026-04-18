import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const items = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/amacimiz", label: "Amacımız" },
  { href: "/paketler", label: "Paketler" },
  { href: "/karsilastir", label: "Neden Farklıyız" },
  { href: "/iletisim", label: "İletişim" },
];

// Tek kaynaklı marka rozeti
function NavBrandIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <defs>
        <linearGradient id="t365grad-nav" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#t365grad-nav)" />
      <path d="M11 14 H37 V20 H27 V36 H21 V20 H11 Z" fill="white" />
      <rect x="28" y="30" width="15" height="9" rx="2.5" fill="white" />
      <text
        x="35.5"
        y="36.7"
        textAnchor="middle"
        fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
        fontWeight={800}
        fontSize={6.4}
        fill="#1D4ED8"
        letterSpacing="0.2"
      >
        365
      </text>
    </svg>
  );
}

export function PublicNav() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const headerStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.85)",
    borderBottom: "1px solid #E2E8F0",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };

  const linkStyle = (active: boolean): React.CSSProperties => ({
    color: active ? "#2563EB" : "#475569",
    background: active ? "#EFF6FF" : "transparent",
  });

  return (
    <header
      className="sticky top-0 z-40"
      style={headerStyle}
      data-testid="public-nav"
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/login"
          className="flex items-center gap-2.5"
          data-testid="nav-logo"
        >
          <NavBrandIcon size={36} />
          <span
            className="font-bold text-lg tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              color: "#0F172A",
            }}
          >
            Ticarium<span style={{ color: "#2563EB" }}>365</span>
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
                className="px-3 py-2 text-sm font-medium rounded-md transition-colors"
                style={linkStyle(active)}
                data-testid={`nav-${it.href.slice(1)}`}
              >
                {it.label}
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
            style={{
              background: "#FFFFFF",
              borderColor: "#CBD5E1",
              color: "#334155",
            }}
          >
            Sizi Arayalım
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/login")}
            data-testid="nav-cta-login"
            style={{ background: "#2563EB", color: "#FFFFFF", border: 0 }}
          >
            Giriş Yap
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
            background: "#FFFFFF",
            borderTop: "1px solid #E2E8F0",
          }}
        >
          <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="px-3 py-2.5 text-sm font-medium rounded-md"
                style={{ color: "#334155" }}
                onClick={() => setOpen(false)}
                data-testid={`nav-mob-${it.href.slice(1)}`}
              >
                {it.label}
              </Link>
            ))}
            <div
              className="grid grid-cols-2 gap-2 pt-2 mt-2"
              style={{ borderTop: "1px solid #E2E8F0" }}
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
                  borderColor: "#CBD5E1",
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
                style={{ background: "#2563EB", color: "#FFFFFF", border: 0 }}
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
      className="py-10 mt-16"
      style={{ borderTop: "1px solid #E2E8F0", background: "#F8FAFC" }}
    >
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        <div>
          <div
            className="font-bold text-base mb-2"
            style={{ fontFamily: "var(--font-display)", color: "#0F172A" }}
          >
            Ticarium<span style={{ color: "#2563EB" }}>365</span>
          </div>
          <p style={{ color: "#64748B" }}>
            365 gün işinin yanında. KOBİ'ler için bulut tabanlı işletim sistemi.
          </p>
        </div>
        <div>
          <div className="font-semibold mb-2" style={{ color: "#0F172A" }}>
            Şirket
          </div>
          <ul className="space-y-1.5" style={{ color: "#64748B" }}>
            <li>
              <Link href="/hakkimizda" className="hover:underline">
                Hakkımızda
              </Link>
            </li>
            <li>
              <Link href="/amacimiz" className="hover:underline">
                Amacımız
              </Link>
            </li>
            <li>
              <Link href="/paketler" className="hover:underline">
                Paketler
              </Link>
            </li>
            <li>
              <Link href="/iletisim" className="hover:underline">
                İletişim
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2" style={{ color: "#0F172A" }}>
            İletişim
          </div>
          <p style={{ color: "#64748B" }}>
            Soruların ya da deneme hesabı için{" "}
            <Link
              href="/iletisim"
              className="underline"
              style={{ color: "#2563EB" }}
            >
              bize ulaş
            </Link>
            .
          </p>
        </div>
      </div>
      <div
        className="container mx-auto px-4 mt-8 text-xs text-center"
        style={{ color: "#94A3B8" }}
      >
        © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır.
      </div>
    </footer>
  );
}
