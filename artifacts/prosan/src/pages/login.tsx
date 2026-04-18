import { useState } from "react";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User, Store, TrendingUp, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PublicNav } from "@/components/public-nav";

const NAVY = "hsl(222 47% 15%)";
const NAVY_2 = "hsl(222 47% 22%)";
const EMERALD = "hsl(152 76% 45%)";
const SOFT_BLUE = "hsl(221 83% 53%)";

function BrandLogo({ size = "lg", onDark = false }: { size?: "sm" | "md" | "lg"; onDark?: boolean }) {
  const dim = size === "lg" ? "w-12 h-12 text-2xl" : size === "md" ? "w-10 h-10 text-xl" : "w-9 h-9 text-lg";
  const bg = onDark ? "rgba(255,255,255,0.10)" : NAVY;
  const fg = onDark ? "#fff" : "#fff";
  const border = onDark ? "border-white/20" : "border-transparent";
  return (
    <div
      className={`${dim} rounded-xl flex items-center justify-center shadow-lg border ${border} backdrop-blur-md`}
      style={{ background: bg, color: fg, fontFamily: "var(--font-display)" }}
      aria-label="Ticarium365"
    >
      <span className="font-bold leading-none">
        T<span style={{ color: EMERALD }}>3</span>
        <span className="text-[0.55em] align-top ml-0.5 opacity-90">65</span>
      </span>
    </div>
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
      // Sade ve net hata mesajı — korkutucu güvenlik diliyle değil
      const apiMessage = error?.response?.data?.message || error?.data?.message;
      toast({
        title: "Giriş yapılamadı",
        description: apiMessage || "Kullanıcı adı veya şifrenizi tekrar kontrol edin.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <PublicNav />

      <div className="flex-1 w-full flex">
        {/* Sol panel — marka tanıtımı (lg ve üstü) */}
        <div
          className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_2} 100%)` }}
        >
          <div
            className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full blur-3xl pointer-events-none"
            style={{ background: `${EMERALD}26` }}
          />
          <div
            className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full blur-3xl pointer-events-none"
            style={{ background: `${SOFT_BLUE}26` }}
          />

          {/* Logo + tagline */}
          <div className="relative z-10 flex items-center gap-3">
            <BrandLogo size="lg" onDark />
            <div className="leading-tight">
              <div
                className="font-bold text-2xl tracking-tight text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Ticarium<span style={{ color: EMERALD }}>365</span>
              </div>
              <div className="text-[13px] mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
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
              <span style={{ color: EMERALD }}>tek panelden</span> yönetim.
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
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: EMERALD }} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium leading-snug">{title}</h3>
                    <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.62)" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
            © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır
          </p>
        </div>

        {/* Sağ panel — giriş formu */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-8">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <div className="flex items-center gap-3">
                <BrandLogo size="md" />
                <span
                  className="font-bold text-2xl tracking-tight"
                  style={{ fontFamily: "var(--font-display)", color: NAVY }}
                >
                  Ticarium<span style={{ color: EMERALD }}>365</span>
                </span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-xl shadow-blue-500/5 p-7 md:p-8">
              <div className="mb-6">
                <h2
                  className="text-2xl font-bold tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Hoş geldiniz
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
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
                  <Label htmlFor="username">Kullanıcı adı</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="kullanici_adi"
                      className="pl-9 h-11"
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
                    <Label htmlFor="password">Şifre</Label>
                    <Link
                      href="/sifremi-unuttum"
                      className="text-xs font-medium text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Şifremi unuttum
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-9 pr-10 h-11"
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 mt-2 text-base font-semibold"
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

              <div className="mt-6 pt-5 border-t border-border/60 text-center">
                <p className="text-xs text-muted-foreground">
                  Hesabınız yok mu?{" "}
                  <a
                    href="mailto:demo@ticarium365.com"
                    className="font-semibold text-primary hover:underline"
                  >
                    Demo talep edin
                  </a>
                </p>
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground mt-5 leading-relaxed">
              Bu siteye girerek <a href="/kvkk" className="underline hover:text-foreground">KVKK Aydınlatma Metni</a> ve{" "}
              <a href="/kullanim-kosullari" className="underline hover:text-foreground">Kullanım Koşulları</a>'nı kabul etmiş olursunuz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
