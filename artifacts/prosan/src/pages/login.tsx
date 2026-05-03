import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User, Eye, EyeOff } from "lucide-react";
import { BrandLogo, BrandWordmark } from "@/components/brand-logo";
import { safePathAfterLogin } from "@/lib/login-redirect";
import { apiBase } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tenantLogo, setTenantLogo] = useState<string | null>(null);
  const login = useLogin();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/tenant", { credentials: "include", cache: "no-store" });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { logoUrl?: string | null };
        if (d?.logoUrl && typeof d.logoUrl === "string") setTenantLogo(d.logoUrl);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoginError(null);
    try {
      await login.mutateAsync({ data: { username, password } });
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(safePathAfterLogin(next));
    } catch (error: unknown) {
      const apiMessage =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setLoginError(
        apiMessage ||
          "Kullanıcı adı veya şifre eşleşmedi. Büyük/küçük harf ve boşlukları kontrol edip tekrar deneyin."
      );
    }
  };

  const busy = login.isPending;

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-[400px]">
        <div className="flex flex-col items-center gap-2 mb-6">
          {tenantLogo ? (
            <img
              src={tenantLogo}
              alt=""
              className="h-14 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <>
              <BrandLogo size={56} />
              <BrandWordmark className="font-bold text-2xl tracking-tight leading-none" />
            </>
          )}
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            365 gün işinizin yanında
          </p>
        </div>

        <div
          className="rounded-2xl p-6 sm:p-7"
          style={{
            background: "color-mix(in srgb, var(--color-surface-card) 92%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-accent-violet) 12%, transparent)",
            boxShadow:
              "0 1px 2px color-mix(in srgb, var(--color-neutral-900) 4%, transparent), " +
              "0 12px 30px -12px color-mix(in srgb, var(--color-accent-indigo) 15%, transparent)",
          }}
        >
          <div className="mb-5">
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--color-neutral-900)", fontFamily: "var(--font-display)" }}
            >
              Hoş geldiniz
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
              İşletme hesabınızla güvenli giriş yapın.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            method="post"
            action={`${apiBase}/auth/login`}
          >
            <div className="space-y-1.5">
              <Label htmlFor="username" style={{ color: "var(--color-neutral-700)", fontWeight: 500 }}>
                Kullanıcı adı
              </Label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "var(--color-neutral-400)" }}
                />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="kullanici_adi"
                  className="pl-9 h-11 transition-all focus:ring-2"
                  style={{
                    background: "color-mix(in srgb, var(--color-auth-wash-1) 70%, transparent)",
                    borderColor: "color-mix(in srgb, var(--color-accent-violet) 18%, transparent)",
                    color: "var(--color-neutral-900)",
                  }}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  disabled={busy}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" style={{ color: "var(--color-neutral-700)", fontWeight: 500 }}>
                Şifre
              </Label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "var(--color-neutral-400)" }}
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-10 h-11 transition-all focus:ring-2"
                  style={{
                    background: "color-mix(in srgb, var(--color-auth-wash-1) 70%, transparent)",
                    borderColor: "color-mix(in srgb, var(--color-accent-violet) 18%, transparent)",
                    color: "var(--color-neutral-900)",
                  }}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  disabled={busy}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_10%,var(--color-surface-card))]"
                  style={{ color: "var(--color-neutral-500)" }}
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
                  "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-violet) 50%, var(--color-accent-teal) 100%)",
                color: "var(--color-nav-text-active)",
                boxShadow:
                  "0 8px 24px -8px color-mix(in srgb, var(--color-accent-indigo) 55%, transparent), 0 2px 4px color-mix(in srgb, var(--color-accent-teal) 20%, transparent)",
              }}
              disabled={busy || !username || !password}
              data-testid="btn-login"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Giriş yapılıyor…
                </>
              ) : (
                "Giriş Yap"
              )}
            </Button>

            {loginError && (
              <p className="text-sm text-destructive pt-1" role="alert">
                {loginError}
              </p>
            )}
          </form>

          <div className="flex justify-end mt-4">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
              <Link href="/sifremi-unuttum" data-testid="link-forgot-password">
                Şifremi Unuttum
              </Link>
            </Button>
          </div>

          <div
            className="mt-5 pt-4 text-center"
            style={{ borderTop: "1px solid color-mix(in srgb, var(--color-accent-violet) 12%, transparent)" }}
          >
            <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Hesabınız yok mu?{" "}
              <Link
                href="/kayit"
                className="font-semibold hover:underline"
                data-testid="link-register"
                style={{
                  background: "linear-gradient(135deg, var(--color-brand-500), var(--color-accent-teal))",
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

        <p
          className="text-center text-[11px] mt-5 leading-relaxed px-2"
          style={{ color: "var(--color-neutral-500)" }}
        >
          Giriş yaparak verilerinizin güvenli oturum ve firma sınırları içinde işlendiğini kabul edersiniz.{" "}
          <a href="/kvkk" className="underline hover:text-[color:var(--color-brand-700)]">
            KVKK Aydınlatma Metni
          </a>{" "}
          ve{" "}
          <a href="/kullanim-kosullari" className="underline hover:text-[color:var(--color-brand-700)]">
            Kullanım Koşulları
          </a>
          &apos;nı kabul etmiş olursunuz.
        </p>

        <p className="text-center text-[11px] mt-3" style={{ color: "var(--color-neutral-400)" }}>
          © {new Date().getFullYear()} Ticarium365
        </p>
      </div>
    </AuthShell>
  );
}
