import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const NAVY = "hsl(222 47% 15%)";
const EMERALD = "hsl(152 76% 45%)";

const items = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/amacimiz", label: "Amacımız" },
  { href: "/paketler", label: "Paketler" },
  { href: "/karsilastir", label: "Neden Farklıyız" },
  { href: "/iletisim", label: "İletişim" },
];

export function PublicNav() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl" data-testid="public-nav">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/login" className="flex items-center gap-2.5" data-testid="nav-logo">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold shadow-sm"
            style={{ background: NAVY, fontFamily: "var(--font-display)" }}
          >
            T<span style={{ color: EMERALD }}>3</span>
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ fontFamily: "var(--font-display)", color: NAVY }}>
            Ticarium<span style={{ color: EMERALD }}>365</span>
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
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  active ? "text-primary bg-primary/10" : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
                data-testid={`nav-${it.href.slice(1)}`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation("/iletisim")} data-testid="nav-cta-call">
            Sizi Arayalım
          </Button>
          <Button size="sm" onClick={() => setLocation("/login")} data-testid="nav-cta-login">
            Giriş Yap
          </Button>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden p-2 rounded-md hover:bg-muted"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menüyü aç"
          data-testid="nav-burger"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-background/95 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="px-3 py-2.5 text-sm font-medium rounded-md hover:bg-muted"
                onClick={() => setOpen(false)}
                data-testid={`nav-mob-${it.href.slice(1)}`}
              >
                {it.label}
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setOpen(false); setLocation("/iletisim"); }}>
                Sizi Arayalım
              </Button>
              <Button size="sm" className="w-full" onClick={() => { setOpen(false); setLocation("/login"); }}>
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
    <footer className="border-t py-10 bg-muted/30 mt-16">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        <div>
          <div className="font-bold text-base mb-2" style={{ fontFamily: "var(--font-display)", color: NAVY }}>
            Ticarium<span style={{ color: EMERALD }}>365</span>
          </div>
          <p className="text-muted-foreground">365 gün işinin yanında. KOBİ'ler için bulut tabanlı işletim sistemi.</p>
        </div>
        <div>
          <div className="font-semibold mb-2">Şirket</div>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><Link href="/hakkimizda" className="hover:text-foreground">Hakkımızda</Link></li>
            <li><Link href="/amacimiz" className="hover:text-foreground">Amacımız</Link></li>
            <li><Link href="/paketler" className="hover:text-foreground">Paketler</Link></li>
            <li><Link href="/iletisim" className="hover:text-foreground">İletişim</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2">İletişim</div>
          <p className="text-muted-foreground">Soruların ya da deneme hesabı için <Link href="/iletisim" className="text-primary underline">bize ulaş</Link>.</p>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-8 text-xs text-center text-muted-foreground">
        © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır.
      </div>
    </footer>
  );
}
