import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import {
  ScanLine,
  ArrowRight,
  ShoppingCart,
  Receipt,
  Boxes,
  Store,
  TrendingUp,
  Smartphone,
  Sparkles,
  Zap,
  ShieldCheck,
  Cloud,
  BarChart3,
  CheckCircle2,
} from "lucide-react";

const stars = [
  { icon: ScanLine, title: "Barkod → POS → E-Fatura", desc: "Tek tarama: stok düşer, satış kapanır, e-fatura kesilir. 30 saniye." },
  { icon: Store, title: "11 Pazaryeri Yerleşik", desc: "Trendyol, Hepsiburada, N11, Amazon, İdeaSoft, Ticimax — tek panelden." },
  { icon: Receipt, title: "Fiş OCR (Yapay Zeka)", desc: "Fişin fotoğrafını çek; tutar, KDV, satıcı otomatik girilsin." },
  { icon: BarChart3, title: "Net Kâr Merkezi", desc: "Ciro − COGS − gider − maaş − amortisman = anlık net kâr." },
  { icon: Smartphone, title: "Mobil-Doğal", desc: "iOS + Android her abonelikte dahil. Telefondan sat, say, kontrol et." },
  { icon: ShieldCheck, title: "Çok-Kiracılı İzolasyon", desc: "Her firmanın verisi ayrı. KVKK / GDPR uyumlu mimari." },
];

const flowSteps = [
  { icon: ScanLine, label: "Barkod Tara", color: "from-indigo-500 to-blue-500" },
  { icon: Boxes, label: "Stok Düş", color: "from-blue-500 to-cyan-500" },
  { icon: ShoppingCart, label: "Satış Kapat", color: "from-cyan-500 to-teal-500" },
  { icon: Receipt, label: "E-Fatura Kes", color: "from-teal-500 to-emerald-500" },
  { icon: Store, label: "Pazaryeri Senkron", color: "from-emerald-500 to-green-500" },
  { icon: TrendingUp, label: "Net Kâr", color: "from-green-500 to-lime-500" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-home">
      <PublicNav />

      {/* ─── HERO — dark mesh, headline + flow visual ──────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, #1e1b4b 0%, transparent 55%)," +
            "radial-gradient(circle at 80% 30%, #3730a3 0%, transparent 50%)," +
            "radial-gradient(circle at 70% 90%, #4f46e5 0%, transparent 60%)," +
            "linear-gradient(180deg, #0b0a1f 0%, #15123a 100%)",
        }}
        data-testid="home-hero"
      >
        {/* mesh accent */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            background:
              "radial-gradient(800px 400px at 50% 0%, rgba(129,140,248,0.18), transparent 70%)",
          }}
        />
        {/* grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="container mx-auto px-4 py-16 md:py-24 lg:py-28 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* SOL — başlık + CTA */}
            <div className="text-white">
              <Badge
                variant="outline"
                className="mb-5 border-white/20 bg-white/5 backdrop-blur text-cyan-300"
                data-testid="hero-badge"
              >
                <Sparkles className="h-3 w-3 mr-1.5" />
                KOBİ için tek platform — barkod'tan e-ticarete
              </Badge>

              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="hero-title"
              >
                <span className="block">Bir tarama,</span>
                <span className="block bg-gradient-to-r from-cyan-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">
                  hesabın e-ticarette.
                </span>
              </h1>

              <p
                className="text-lg md:text-xl text-white/70 max-w-xl mb-8 leading-relaxed"
                data-testid="hero-subtitle"
              >
                Stok, barkod, hızlı satış, e-fatura, 11 pazaryeri ve net kâr —
                hepsi tek panelde. Eklenti yok, sürpriz kalem yok.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                <Link href="/kayit">
                  <Button
                    size="lg"
                    className="bg-white text-indigo-700 hover:bg-cyan-100 font-bold px-7 h-12 rounded-xl shadow-[0_8px_30px_-8px_rgba(255,255,255,0.4)]"
                    data-testid="hero-cta-trial"
                  >
                    Ücretsiz Dene
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/karsilastir">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/25 bg-white/5 text-white hover:bg-white/10 font-semibold px-7 h-12 rounded-xl"
                    data-testid="hero-cta-compare"
                  >
                    Neden Farklıyız
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70">
                {[
                  "Kurulum 5 dakika",
                  "Kredi kartı yok",
                  "iOS + Android dahil",
                  "Türkçe destek",
                ].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* SAĞ — barkod → e-ticaret akışı görseli */}
            <div className="relative" data-testid="hero-flow">
              {/* Glow */}
              <div
                className="absolute -inset-8 rounded-[3rem] opacity-60 blur-3xl pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(99,102,241,0.45), transparent 65%)",
                }}
              />

              {/* Ana kart */}
              <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl p-6 md:p-8 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.6)]">
                {/* Üst — barkod tarayıcı simülasyonu */}
                <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-5 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase tracking-wider text-cyan-300 font-semibold">
                      Tarama anı
                    </span>
                    <span className="text-xs text-white/40 font-mono">
                      8690000123456
                    </span>
                  </div>
                  <div className="relative h-20 rounded-lg bg-gradient-to-b from-slate-800 to-slate-900 overflow-hidden flex items-center justify-center">
                    {/* Barkod çizgileri */}
                    <div className="flex items-end gap-[2px] h-12">
                      {[3, 1, 2, 1, 3, 2, 1, 2, 3, 1, 2, 1, 3, 1, 2, 3, 1, 2, 1, 3, 2, 1].map((w, i) => (
                        <div
                          key={i}
                          className="bg-white"
                          style={{ width: w * 2, height: "100%" }}
                        />
                      ))}
                    </div>
                    {/* Tarama lazer */}
                    <div
                      className="absolute inset-x-4 h-[2px] bg-gradient-to-r from-transparent via-red-400 to-transparent"
                      style={{
                        top: "50%",
                        boxShadow: "0 0 12px rgba(248,113,113,0.7)",
                        animation: "scan 2.2s ease-in-out infinite",
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ürün eşleşti — Endüstriyel Vida M8 — ₺12,40
                  </div>
                </div>

                {/* Alt — akış adımları */}
                <div className="grid grid-cols-3 gap-3">
                  {flowSteps.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.label}
                        className="relative rounded-xl bg-white/[0.04] border border-white/10 p-3 hover:border-white/30 transition-colors"
                        style={{
                          animation: `flowPulse 4s ease-in-out infinite`,
                          animationDelay: `${i * 0.4}s`,
                        }}
                      >
                        <div
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${s.color} mb-2`}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="text-[11px] font-semibold text-white leading-tight">
                          {s.label}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer rozetleri */}
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-300">30 sn</div>
                    <div className="text-[10px] text-emerald-200/70 uppercase tracking-wider">tarama→fatura</div>
                  </div>
                  <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/20 p-3 text-center">
                    <div className="text-2xl font-bold text-cyan-300">11</div>
                    <div className="text-[10px] text-cyan-200/70 uppercase tracking-wider">pazaryeri</div>
                  </div>
                  <div className="rounded-xl bg-violet-500/10 border border-violet-400/20 p-3 text-center">
                    <div className="text-2xl font-bold text-violet-300">∞</div>
                    <div className="text-[10px] text-violet-200/70 uppercase tracking-wider">şube/kullanıcı</div>
                  </div>
                </div>
              </div>

              {/* Yüzen rozetler */}
              <div className="absolute -top-3 -right-3 rounded-full bg-white text-indigo-700 px-3 py-1.5 text-xs font-bold shadow-lg flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Kurulum 5 dk
              </div>
              <div className="absolute -bottom-3 -left-3 rounded-full bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold shadow-lg flex items-center gap-1.5">
                <Cloud className="h-3.5 w-3.5" />
                Bulutta canlı
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── YILDIZ ÖZELLİKLER ─────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 py-16 md:py-24" data-testid="home-features">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge variant="outline" className="mb-3 border-primary/30">
            <Sparkles className="h-3 w-3 mr-1 text-primary" />
            Yıldız Özellikler
          </Badge>
          <h2
            className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Rakipler eklenti satar.{" "}
            <span className="text-primary">Biz yerleşik veriyoruz.</span>
          </h2>
          <p className="text-muted-foreground">
            Ön muhasebe yazılımının çok ötesinde — KOBİ'nizin tüm operasyonu
            tek panelde, tek faturada.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stars.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="group rounded-2xl border bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all"
                data-testid={`star-${s.title}`}
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3 group-hover:bg-primary group-hover:text-white transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base mb-1.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <Link href="/kayit">
            <Button
              size="lg"
              className="rounded-xl px-8 h-12 font-bold"
              data-testid="features-cta"
            >
              Şimdi Ücretsiz Başla
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <PublicFooter />

      {/* Animations */}
      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-22px); opacity: 0.4; }
          50% { transform: translateY(22px); opacity: 1; }
        }
        @keyframes flowPulse {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 0 0 rgba(99,102,241,0); }
          50% { transform: translateY(-3px); box-shadow: 0 8px 20px -10px rgba(99,102,241,0.5); }
        }
      `}</style>
    </div>
  );
}
