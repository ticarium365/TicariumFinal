import { useState } from "react";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Lock, User, Store, TrendingUp, ShieldCheck,
  Eye, EyeOff, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PublicNav } from "@/components/public-nav";
import { BrandLogo, BrandWordmark as SharedWordmark } from "@/components/brand-logo";

const BrandIcon = ({ size = 48 }: { size?: number }) => <BrandLogo size={size} />;
const BrandWordmark = ({ light = false }: { light?: boolean }) => (
  <SharedWordmark className="font-bold text-2xl tracking-tight leading-none" light={light} />
);

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
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg,#F8FAFF 0%, #EEF2FF 60%, #F1FBFB 100%)",
        color: "#0F172A",
      }}
    >
      {/* Sayfa arka plan glow blob'ları (sağ panel için yumuşak doku) */}
      <div
        className="absolute top-1/3 right-[-10rem] w-[36rem] h-[36rem] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.10), transparent 70%)" }}
      />
      <div
        className="absolute bottom-[-14rem] right-1/3 w-[30rem] h-[30rem] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.10), transparent 70%)" }}
      />

      <PublicNav />

      <div className="flex-1 w-full flex relative z-10">
        {/* ─── SOL PANEL — premium dark mesh hero ──────────────────────────── */}
        <div
          className="hidden lg:flex flex-col justify-between w-[520px] shrink-0 p-12 relative overflow-hidden"
          style={{
            background:
              "radial-gradient(at 20% 10%, #312E81 0%, transparent 55%), " +
              "radial-gradient(at 90% 80%, #0E7490 0%, transparent 50%), " +
              "linear-gradient(140deg,#0B1027 0%, #1E1B4B 50%, #0F172A 100%)",
            color: "#FFFFFF",
          }}
        >
          {/* Hareketli yumuşak ışık küreleri */}
          <div
            className="absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full pointer-events-none animate-pulse"
            style={{
              background: "radial-gradient(closest-side, rgba(129,140,248,0.40), transparent 70%)",
              animationDuration: "6s",
            }}
          />
          <div
            className="absolute -bottom-32 -left-24 w-[26rem] h-[26rem] rounded-full pointer-events-none animate-pulse"
            style={{
              background: "radial-gradient(closest-side, rgba(34,211,238,0.32), transparent 70%)",
              animationDuration: "8s",
              animationDelay: "1.5s",
            }}
          />
          {/* İnce grid noise overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.10]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), " +
                "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />

          {/* Logo + alt başlık */}
          <div className="relative z-10 flex items-center gap-3">
            <BrandIcon size={52} />
            <div className="leading-tight">
              <BrandWordmark light />
              <div className="text-[13px] mt-1 text-cyan-100/85">
                365 gün işinizin yanında
              </div>
            </div>
          </div>

          {/* Değer önerisi */}
          <div className="relative z-10 space-y-8">
            <div>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider mb-5"
                style={{
                  background: "rgba(165,243,252,0.10)",
                  color: "#A5F3FC",
                  border: "1px solid rgba(165,243,252,0.25)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <Sparkles className="w-3 h-3" />
                Yeni nesil işletme platformu
              </span>
              <h2
                className="text-[2.05rem] font-semibold leading-[1.15] tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Türkiye'nin esnafı için
                <br />
                <span
                  style={{
                    background:
                      "linear-gradient(135deg,#A5F3FC 0%,#C7D2FE 50%,#FFFFFF 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  tek panelden yönetim.
                </span>
              </h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  icon: Store,
                  title: "Stoktan satışa, kâra kadar tek yerde",
                  desc: "Stok hareketleri, fatura, cari hesap ve raporlar bir arada çalışır.",
                  ring: "rgba(129,140,248,0.45)",
                },
                {
                  icon: TrendingUp,
                  title: "Gerçek kârınızı net görün",
                  desc: "Komisyon, iade ve giderler düşüldükten sonra kalan net kâr.",
                  ring: "rgba(34,211,238,0.45)",
                },
                {
                  icon: ShieldCheck,
                  title: "Güvenli, KVKK uyumlu, yedeklenir",
                  desc: "Verileriniz şifreli kanaldan iletilir, düzenli olarak yedeklenir.",
                  ring: "rgba(74,222,128,0.45)",
                },
              ].map(({ icon: Icon, title, desc, ring }) => (
                <div
                  key={title}
                  className="flex items-start gap-4 p-3.5 rounded-xl transition-all hover:translate-x-0.5"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: `1px solid ${ring}`,
                      boxShadow: `0 0 18px -4px ${ring}`,
                    }}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium leading-snug">{title}</h3>
                    <p className="text-sm mt-0.5 text-slate-300/80 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-xs text-slate-400/80">
            © {new Date().getFullYear()} Ticarium365 · Tüm hakları saklıdır
          </p>
        </div>

        {/* ─── SAĞ PANEL — cam form kartı ──────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-8 relative">
          <div className="w-full max-w-sm relative">
            {/* Mobil logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <div className="flex items-center gap-3">
                <BrandIcon size={44} />
                <BrandWordmark />
              </div>
            </div>

            {/* Kartın etrafına ince renkli kenarlık halesi */}
            <div
              className="absolute -inset-px rounded-[1.25rem] pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.30) 0%, rgba(14,165,164,0.20) 50%, rgba(99,102,241,0.05) 100%)",
                filter: "blur(0.5px)",
              }}
            />

            <div
              className="relative rounded-2xl p-7 md:p-8"
              style={{
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.7)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.04), " +
                  "0 20px 50px -16px rgba(79,70,229,0.18), " +
                  "0 8px 20px -8px rgba(14,165,164,0.10)",
              }}
            >
              <div className="mb-6">
                <h2
                  className="text-[1.65rem] font-bold tracking-tight leading-tight"
                  style={{ color: "#0F172A", fontFamily: "var(--font-display)" }}
                >
                  Hoş geldiniz
                </h2>
                <p className="text-sm mt-1.5" style={{ color: "#64748B" }}>
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
                  <Label htmlFor="username" style={{ color: "#334155", fontWeight: 500 }}>
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
                      className="pl-9 h-11 transition-all focus:ring-2"
                      style={{
                        background: "rgba(248,250,255,0.7)",
                        borderColor: "rgba(99,102,241,0.18)",
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
                  <Label htmlFor="password" style={{ color: "#334155", fontWeight: 500 }}>
                    Şifre
                  </Label>
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
                      className="pl-9 pr-10 h-11 transition-all focus:ring-2"
                      style={{
                        background: "rgba(248,250,255,0.7)",
                        borderColor: "rgba(99,102,241,0.18)",
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100/80 transition-colors"
                      style={{ color: "#64748B" }}
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Link
                      href="/sifremi-unuttum"
                      className="text-xs font-semibold hover:underline"
                      style={{
                        background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                      data-testid="link-forgot-password"
                    >
                      Şifremi unuttum
                    </Link>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 mt-2 text-base font-semibold border-0 transition-all hover:translate-y-[-1px]"
                  style={{
                    background:
                      "linear-gradient(135deg,#2563eb 0%,#5E5CE6 50%,#0EA5A4 100%)",
                    color: "#FFFFFF",
                    boxShadow:
                      "0 8px 24px -8px rgba(79,70,229,0.55), 0 2px 4px rgba(14,165,164,0.20)",
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
                style={{ borderTop: "1px solid rgba(99,102,241,0.12)" }}
              >
                <p className="text-xs" style={{ color: "#64748B" }}>
                  Hesabınız yok mu?{" "}
                  <a
                    href="mailto:demo@ticarium365.com"
                    className="font-semibold hover:underline"
                    style={{
                      background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
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
              <a href="/kvkk" className="underline hover:text-blue-700">
                KVKK Aydınlatma Metni
              </a>{" "}
              ve{" "}
              <a href="/kullanim-kosullari" className="underline hover:text-blue-700">
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
