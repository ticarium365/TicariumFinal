import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, Phone, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

const items = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/amacimiz", label: "Amacımız" },
  { href: "/paketler", label: "Paketler" },
  { href: "/karsilastir", label: "Karşılaştır" },
  { href: "/iletisim", label: "İletişim" },
];

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
          ? "color-mix(in srgb, var(--color-surface-card) 78%, transparent)"
          : "color-mix(in srgb, var(--color-surface-card) 55%, transparent)",
        borderBottom: scrolled
          ? "1px solid color-mix(in srgb, var(--color-accent-violet) 12%, transparent)"
          : "1px solid color-mix(in srgb, var(--color-neutral-900) 4%, transparent)",
        backdropFilter: "saturate(160%) blur(16px)",
        WebkitBackdropFilter: "saturate(160%) blur(16px)",
        boxShadow: scrolled
          ? "0 8px 30px -16px color-mix(in srgb, var(--color-neutral-900) 10%, transparent)"
          : "none",
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
            <BrandLogo size={36} />
          </span>
          <span
            className="font-bold text-lg tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-neutral-900)" }}
          >
            Ticarium
            <span
              style={{
                background: "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-teal) 100%)",
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
                  color: active ? "var(--color-neutral-900)" : "var(--color-neutral-600)",
                  background: active
                    ? "linear-gradient(135deg, color-mix(in srgb, var(--color-accent-violet) 10%, transparent), color-mix(in srgb, var(--color-accent-teal) 8%, transparent))"
                    : "transparent",
                }}
                data-testid={`nav-${it.href.slice(1)}`}
              >
                {it.label}
                {active && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 h-[3px] w-7 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, var(--color-accent-violet), var(--color-accent-teal))",
                      boxShadow: "0 0 12px color-mix(in srgb, var(--color-accent-violet) 50%, transparent)",
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
              background: "color-mix(in srgb, var(--color-surface-card) 70%, transparent)",
              borderColor: "color-mix(in srgb, var(--color-accent-violet) 20%, transparent)",
              color: "var(--color-neutral-700)",
            }}
          >
            <Phone className="w-3.5 h-3.5" />
            Sizi Arayalım
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/login")}
            data-testid="nav-cta-login"
            className="gap-1.5"
            style={{
              background: "color-mix(in srgb, var(--color-surface-card) 70%, transparent)",
              borderColor: "color-mix(in srgb, var(--color-accent-violet) 20%, transparent)",
              color: "var(--color-neutral-700)",
            }}
          >
            Giriş Yap
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/kayit")}
            data-testid="nav-cta-register"
            className="gap-1.5"
            style={{
              background: "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-teal) 100%)",
              color: "var(--color-nav-text-active)",
              border: 0,
              boxShadow: "0 6px 20px -6px color-mix(in srgb, var(--color-accent-indigo) 55%, transparent)",
            }}
          >
            Ücretsiz Başla
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Mobile right cluster: Giriş + Kayıt + burger */}
        <div className="md:hidden flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocation("/login")}
            data-testid="nav-cta-login-mobile"
            className="h-8 px-3 text-xs font-semibold"
            style={{
              background: "color-mix(in srgb, var(--color-surface-card) 85%, transparent)",
              borderColor: "color-mix(in srgb, var(--color-accent-violet) 25%, transparent)",
              color: "var(--color-neutral-700)",
            }}
          >
            Giriş
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/kayit")}
            data-testid="nav-cta-register-mobile"
            className="h-8 px-3 text-xs font-semibold"
            style={{
              background: "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-teal) 100%)",
              color: "var(--color-nav-text-active)",
              border: 0,
              boxShadow: "0 4px 14px -4px color-mix(in srgb, var(--color-accent-indigo) 45%, transparent)",
            }}
          >
            Başla
          </Button>
          <button
            className="p-2 rounded-md"
            style={{ color: "var(--color-neutral-700)" }}
            onClick={() => setOpen((v) => !v)}
            aria-label="Menüyü aç"
            data-testid="nav-burger"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          className="md:hidden"
          style={{
            background: "color-mix(in srgb, var(--color-surface-card) 96%, transparent)",
            borderTop: "1px solid color-mix(in srgb, var(--color-accent-violet) 12%, transparent)",
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
                style={{ color: "var(--color-neutral-700)" }}
                onClick={() => setOpen(false)}
                data-testid={`nav-mob-${it.href.slice(1)}`}
              >
                {it.label}
              </Link>
            ))}
            <div
              className="grid grid-cols-2 gap-2 pt-2 mt-2"
              style={{ borderTop: "1px solid color-mix(in srgb, var(--color-accent-violet) 10%, transparent)" }}
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
                  background: "var(--color-surface-card)",
                  borderColor: "color-mix(in srgb, var(--color-accent-violet) 20%, transparent)",
                  color: "var(--color-neutral-700)",
                }}
              >
                Sizi Arayalım
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  setLocation("/kayit");
                }}
                style={{
                  background: "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-teal) 100%)",
                  color: "var(--color-nav-text-active)",
                  border: 0,
                }}
              >
                Kayıt Ol
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
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden px-3 pb-3 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color-mix(in_srgb,var(--color-surface-card)_95%,transparent)] shadow-2xl backdrop-blur p-2 grid grid-cols-2 gap-2">
          <Button asChild className="h-11 font-semibold">
            <Link href="/kayit">Ücretsiz başla</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 font-semibold">
            <Link href="/iletisim">Demo iste</Link>
          </Button>
        </div>
      </div>
      <footer
        className="py-12 pb-24 md:pb-12 mt-16 relative overflow-hidden"
        style={{
          borderTop: "1px solid color-mix(in srgb, var(--color-accent-violet) 10%, transparent)",
          background: "linear-gradient(180deg, var(--color-neutral-50) 0%, var(--color-neutral-100) 100%)",
        }}
      >
        <div
          className="absolute -top-32 left-1/4 w-[28rem] h-[28rem] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent-indigo) 8%, transparent), transparent 70%)",
          }}
        />
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm relative">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <BrandLogo size={32} />
            <div
              className="font-bold text-base"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-neutral-900)" }}
            >
              Ticarium
              <span
                style={{
                  background: "linear-gradient(135deg, var(--color-brand-500), var(--color-accent-teal))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                365
              </span>
            </div>
          </div>
          <p style={{ color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
            KOBİ’lerin satış, stok, pazaryeri ve kâr takibini sadeleştirmek için geliştirilen yerli işletme platformu.
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
            Firma verisi ayrı tutulur. Kart bilgisi sistemde saklanmaz. Kurulumda gerçek insan desteği hedeflenir.
          </p>
        </div>
        <div>
          <div className="font-semibold mb-3" style={{ color: "var(--color-neutral-900)" }}>
            Şirket
          </div>
          <ul className="space-y-2" style={{ color: "var(--color-neutral-500)" }}>
            <li>
              <Link href="/hakkimizda" className="hover:text-[color:var(--color-brand-700)] transition-colors">
                Hakkımızda
              </Link>
            </li>
            <li>
              <Link href="/amacimiz" className="hover:text-[color:var(--color-brand-700)] transition-colors">
                Amacımız
              </Link>
            </li>
            <li>
              <Link href="/paketler" className="hover:text-[color:var(--color-brand-700)] transition-colors">
                Paketler
              </Link>
            </li>
            <li>
              <Link href="/iletisim" className="hover:text-[color:var(--color-brand-700)] transition-colors">
                İletişim
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3" style={{ color: "var(--color-neutral-900)" }}>
            İletişim
          </div>
          <p style={{ color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
            Soruların ya da deneme hesabı için{" "}
            <Link
              href="/iletisim"
              className="font-medium hover:underline"
              style={{
                background: "linear-gradient(135deg, var(--color-brand-500), var(--color-accent-teal))",
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
            color: "var(--color-neutral-400)",
            borderTop: "1px solid color-mix(in srgb, var(--color-accent-violet) 8%, transparent)",
          }}
        >
          © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır. · KVKK ve güvenli oturum prensipleriyle geliştirilir.
        </div>
      </footer>
    </>
  );
}
