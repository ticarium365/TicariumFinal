import { useState } from "react";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Lock, User, Eye, EyeOff,
  Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo, BrandWordmark } from "@/components/brand-logo";
import { safePathAfterLogin } from "@/lib/login-redirect";

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
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(safePathAfterLogin(next));
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || error?.data?.message;
      toast({
        title: "Giriş bilgilerini kontrol edelim",
        description: apiMessage || "Kullanıcı adı veya şifre eşleşmedi. Büyük/küçük harf ve boşlukları kontrol edip tekrar deneyin.",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-6 sm:py-10"
      style={{
        background:
          "linear-gradient(180deg,#F8FAFF 0%, #EEF2FF 60%, #F1FBFB 100%)",
        color: "#0F172A",
      }}
    >
      {/* Yumuşak arka plan ışığı */}
      <div
        className="fixed top-0 right-0 w-[28rem] h-[28rem] rounded-full pointer-events-none -z-0"
        style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.10), transparent 70%)" }}
      />
      <div
        className="fixed bottom-0 left-0 w-[28rem] h-[28rem] rounded-full pointer-events-none -z-0"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.10), transparent 70%)" }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Marka logo + isim — kart üstünde, ortalı */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <BrandLogo size={56} />
          <BrandWordmark className="font-bold text-2xl tracking-tight leading-none" />
          <p className="text-xs" style={{ color: "#64748B" }}>
            365 gün işinizin yanında
          </p>
        </div>

        {/* Form kartı */}
        <div
          className="rounded-2xl p-6 sm:p-7"
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(99,102,241,0.12)",
            boxShadow:
              "0 1px 2px rgba(15,23,42,0.04), " +
              "0 12px 30px -12px rgba(79,70,229,0.15)",
          }}
        >
          <div className="mb-5">
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: "#0F172A", fontFamily: "var(--font-display)" }}
            >
              Hoş geldiniz
            </h1>
            <p className="text-sm mt-1" style={{ color: "#64748B" }}>
              İşletme ya da satınalma hesabınızla güvenli şekilde giriş yapın.
            </p>
          </div>

          {/* Hesap türü bilgi kutusu — seçim zorunluluğu yok */}
          <div
            className="rounded-xl mb-5 px-4 py-3 text-sm"
            style={{
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.10)",
            }}
          >
            <div className="flex items-start gap-2 text-slate-600">
              <Building2 className="w-4 h-4 mt-0.5 text-blue-600" />
              <span>Tek giriş ekranı: işletme, satınalmacı ve yönetici hesapları buradan devam eder.</span>
            </div>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" style={{ color: "#334155", fontWeight: 500 }}>
                  Şifre
                </Label>
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
            </div>

            <Button
              type="submit"
              className="w-full h-11 mt-1 text-base font-semibold border-0 transition-all hover:translate-y-[-1px]"
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
            className="mt-5 pt-4 text-center"
            style={{ borderTop: "1px solid rgba(99,102,241,0.12)" }}
          >
            <p className="text-sm" style={{ color: "#64748B" }}>
              Hesabınız yok mu?{" "}
              <Link
                href="/kayit"
                className="font-semibold hover:underline"
                data-testid="link-register"
                style={{
                  background: "linear-gradient(135deg,#2563eb,#0EA5A4)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Ücretsiz hesap oluşturun
              </Link>
            </p>
          </div>
        </div>

        {/* Alt bilgi: KVKK */}
        <p
          className="text-center text-[11px] mt-5 leading-relaxed px-2"
          style={{ color: "#64748B" }}
        >
          Giriş yaparak verilerinizin güvenli oturum ve firma sınırları içinde işlendiğini kabul edersiniz.{" "}
          <a href="/kvkk" className="underline hover:text-blue-700">
            KVKK Aydınlatma Metni
          </a>{" "}
          ve{" "}
          <a href="/kullanim-kosullari" className="underline hover:text-blue-700">
            Kullanım Koşulları
          </a>
          'nı kabul etmiş olursunuz.
        </p>

        <p
          className="text-center text-[11px] mt-3"
          style={{ color: "#94A3B8" }}
        >
          © {new Date().getFullYear()} Ticarium365
        </p>
      </div>
    </div>
  );
}
