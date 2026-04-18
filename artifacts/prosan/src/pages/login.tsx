import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User, Store, TrendingUp, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PublicNav } from "@/components/public-nav";

const NAVY = "hsl(222 47% 15%)";
const NAVY_2 = "hsl(222 47% 20%)";
const EMERALD = "hsl(152 76% 45%)";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    try {
      await login.mutateAsync({ data: { username, password } });
      window.location.replace("/dashboard");
    } catch (error: any) {
      toast({
        title: "Giriş Başarısız",
        description: error?.response?.data?.message || error?.data?.message || "Kullanıcı adı veya şifre hatalı.",
        variant: "destructive",
      });
    }
  };

  const Logo = ({ size = "lg" }: { size?: "sm" | "lg" }) => (
    <div className="flex items-center gap-3">
      <div
        className={`${size === "lg" ? "w-12 h-12 text-2xl" : "w-9 h-9 text-lg"} rounded-xl flex items-center justify-center shadow-xl border border-white/20 backdrop-blur-md`}
        style={{ background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "var(--font-display)" }}
      >
        <span className="font-bold">T<span style={{ color: EMERALD }}>3</span></span>
      </div>
      {size === "sm" && (
        <span className="font-bold text-xl tracking-tight" style={{ fontFamily: "var(--font-display)", color: NAVY }}>
          Ticarium<span style={{ color: EMERALD }}>365</span>
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: "hsl(216 33% 97%)" }}>
      <PublicNav />
      <div className="flex-1 w-full flex">
      {/* Sol panel — Ticarium365 brand */}
      <div
        className="hidden lg:flex flex-col justify-between w-[460px] shrink-0 p-12 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_2} 100%)` }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ background: `${EMERALD}33` }} />
        <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(59,130,246,0.18)" }} />

        <div className="relative z-10">
          <Logo size="lg" />
          <h1 className="font-bold text-4xl text-white tracking-tight mt-6" style={{ fontFamily: "var(--font-display)" }}>
            Ticarium<span style={{ color: EMERALD }}>365</span>
          </h1>
          <p className="mt-2 text-lg" style={{ color: "rgba(255,255,255,0.78)" }}>
            365 gün işinin yanında.
          </p>
        </div>

        <div className="relative z-10 space-y-7">
          <h2 className="text-3xl font-semibold text-white leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Türkiye'nin esnafı için tasarlandı.
          </h2>

          <div className="space-y-5">
            {[
              { icon: Store, title: "Tek platform, tam kontrol", desc: "Stok, satış, fatura ve cari takibi tek bir yerde." },
              { icon: TrendingUp, title: "Gerçek kârınızı görün", desc: "Gelişmiş kâr analizi ile işletmenizin sağlığını ölçün." },
              { icon: ShieldCheck, title: "Güvenli ve bulut tabanlı", desc: "Verileriniz banka standartlarında korunur ve yedeklenir." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <Icon className="w-5 h-5" style={{ color: EMERALD }} />
                </div>
                <div>
                  <h3 className="text-white font-medium">{title}</h3>
                  <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
          © {new Date().getFullYear()} Ticarium365. Tüm hakları saklıdır.
        </p>
      </div>

      {/* Sağ panel — giriş formu */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg font-bold" style={{ background: NAVY, fontFamily: "var(--font-display)" }}>
                T<span style={{ color: EMERALD }}>3</span>
              </div>
              <span className="font-bold text-xl tracking-tight" style={{ fontFamily: "var(--font-display)", color: NAVY }}>
                Ticarium<span style={{ color: EMERALD }}>365</span>
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Hoş Geldiniz</h2>
              <p className="text-sm text-muted-foreground mt-1">Hesabınıza giriş yaparak işinize devam edin.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Kullanıcı Adı</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="kullanici_adi"
                    className="pl-9 h-11"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={login.isPending}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Şifre</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9 h-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={login.isPending}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 mt-2 text-base font-semibold"
                disabled={login.isPending || !username || !password}
              >
                {login.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Giriş Yapılıyor...</>
                ) : (
                  "Giriş Yap"
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Hesabınız yok mu? <a href="mailto:demo@ticarium365.com" className="font-semibold" style={{ color: NAVY }}>Demo talep edin</a>
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
