import { useState } from "react";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User, Store, TrendingUp, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PublicNav } from "@/components/public-nav";

// ------------------------------------------------------------------
// Marka rozeti — temiz, mavi gradyan, beyaz "T" + küçük 365 etiketi
// ------------------------------------------------------------------
function BrandIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <defs>
        <linearGradient id="t365grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#t365grad)" />
      {/* Geniş bar + dikey ayak: stilize T */}
      <path d="M11 14 H37 V20 H27 V36 H21 V20 H11 Z" fill="white" />
      {/* 365 chip */}
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

function BrandWordmark({ light = false }: { light?: boolean }) {
  return (
    <span
      className="font-bold text-2xl tracking-tight leading-none"
      style={{
        fontFamily: "var(--font-display)",
        color: light ? "#FFFFFF" : "#0F172A",
      }}
    >
      Ticarium
      <span style={{ color: light ? "#BFDBFE" : "#2563EB" }}>365</span>
    </span>
  );
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    try {
      await login.mutateAsync({ data: { username, password } });
      window.location.replace("/dashboard");
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || error?.data?.message;
      toast({
        title: "Giriş yapılamadı",
        description: apiMessage || "Kullanıcı adı veya şifrenizi tekrar kontrol edin.",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "#F8FAFC", color: "#0F172A" }}
    >
      <PublicNav />

      <div className="flex-1 w-full flex">
        {/* Sol panel — açık mavi gradyan, beyaz tipografi */}
        <div
          className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(140deg, #1E3A8A 0%, #1D4ED8 45%, #2563EB 100%)",
          }}
        >
          {/* Yumuşak ışık efektleri */}
          <div
            className="absolute -top-40 -right-32 w-[28rem] h-[28rem] rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(147,197,253,0.35)" }}
          />
          <div
            className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(96,165,250,0.30)" }}
          />

          {/* Logo + alt başlık */}
          <div className="relative z-10 flex items-center gap-3">
            <BrandIcon size={52} />
            <div className="leading-tight">
              <BrandWordmark light />
              <div className="text-[13px] mt-1 text-blue-100/85">
                365 gün işinizin yanında
              </div>
            </div>
          </div>

          {/* Değer önerisi */}
          <div className="relative z-10 space-y-7">
            <h2
              className="text-3xl font-semibold text-white leading-snug"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Türkiye'nin esnafı için <br />
              <span className="text-white/95 underline decoration-blue-300/60 decoration-4 underline-offset-4">
                tek panelden
              </span>{" "}
              yönetim.
            </h2>

            <div className="space-y-5">
              {[
                {
                  icon: Store,
                  title: "Stoktan satışa, kâra kadar tek yerde",
                  desc: "Stok hareketleri, fatura, cari hesap ve raporlar bir arada çalışır.",
                },
                {
                  icon: TrendingUp,
                  title: "Gerçek kârınızı net görün",
                  desc: "Komisyon, iade ve giderler düşüldükten sonra kalan net kâr.",
                },
                {
                  icon: ShieldCheck,
                  title: "Güvenli, KVKK uyumlu, yedeklenir",
                  desc: "Verileriniz şifreli kanaldan iletilir, düzenli olarak yedeklenir.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.16)" }}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium leading-snug">{title}</h3>
                    <p className="text-sm mt-0.5 text-blue-100/80">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-xs text-blue-200/70">
            © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır
          </p>
        </div>

        {/* Sağ panel — beyaz, mavi vurgu */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-8">
          <div className="w-full max-w-sm">
            {/* Mobil logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <div className="flex items-center gap-3">
                <BrandIcon size={44} />
                <BrandWordmark />
              </div>
            </div>

            <div
              className="rounded-2xl p-7 md:p-8"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -8px rgba(37,99,235,0.12)",
              }}
            >
              <div className="mb-6">
                <h2
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: "#0F172A", fontFamily: "var(--font-display)" }}
                >
                  Hoş geldiniz
                </h2>
                <p className="text-sm mt-1" style={{ color: "#64748B" }}>
                  Hesabınıza giriş yaparak işinize devam edin.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4"
                method="post"
                action="/api/auth/login"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="username" style={{ color: "#334155" }}>
                    Kullanıcı adı
                  </Label>
                  <div className="relative">
                    <User
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "#94A3B8" }}
                    />
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="kullanici_adi"
                      className="pl-9 h-11"
                      style={{
                        background: "#FFFFFF",
                        borderColor: "#CBD5E1",
                        color: "#0F172A",
                      }}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={login.isPending}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" style={{ color: "#334155" }}>
                      Şifre
                    </Label>
                    <Link
                      href="/sifremi-unuttum"
                      className="text-xs font-medium hover:underline"
                      style={{ color: "#2563EB" }}
                      data-testid="link-forgot-password"
                    >
                      Şifremi unuttum
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "#94A3B8" }}
                    />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-9 pr-10 h-11"
                      style={{
                        background: "#FFFFFF",
                        borderColor: "#CBD5E1",
                        color: "#0F172A",
                      }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={login.isPending}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md"
                      style={{ color: "#64748B" }}
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 mt-2 text-base font-semibold border-0"
                  style={{
                    background: "#2563EB",
                    color: "#FFFFFF",
                  }}
                  disabled={login.isPending || !username || !password}
                  data-testid="btn-login"
                >
                  {login.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Giriş yapılıyor…
                    </>
                  ) : (
                    "Giriş yap"
                  )}
                </Button>
              </form>

              <div
                className="mt-6 pt-5 text-center"
                style={{ borderTop: "1px solid #E2E8F0" }}
              >
                <p className="text-xs" style={{ color: "#64748B" }}>
                  Hesabınız yok mu?{" "}
                  <a
                    href="mailto:demo@ticarium365.com"
                    className="font-semibold hover:underline"
                    style={{ color: "#2563EB" }}
                  >
                    Demo talep edin
                  </a>
                </p>
              </div>
            </div>

            <p
              className="text-center text-[11px] mt-5 leading-relaxed"
              style={{ color: "#64748B" }}
            >
              Bu siteye girerek{" "}
              <a href="/kvkk" className="underline hover:text-slate-900">
                KVKK Aydınlatma Metni
              </a>{" "}
              ve{" "}
              <a href="/kullanim-kosullari" className="underline hover:text-slate-900">
                Kullanım Koşulları
              </a>
              'nı kabul etmiş olursunuz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
