import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const { toast } = useToast();
  const { company } = useCompany();

  const companyName = "SMSYSTEMS";
  const companySubtitle = "Stok Yönetim Sistemi";

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

  return (
    <div className="min-h-screen w-full flex" style={{ background: "hsl(216 33% 97%)" }}>
      {/* Sol panel — lacivert */}
      <div
        className="hidden lg:flex flex-col justify-between w-96 shrink-0 p-10"
        style={{ background: "hsl(222 47% 15%)" }}
      >
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{companyName}</h1>
          <p className="text-sm font-medium mt-1 uppercase tracking-widest" style={{ color: "hsl(215 25% 55%)" }}>
            {companySubtitle}
          </p>
        </div>
        <div className="space-y-4">
          {[
            { title: "Stok Yönetimi", desc: "Barkod destekli ürün takibi" },
            { title: "Satış Ekranı", desc: "Kamera ile hızlı satış" },
            { title: "Canlı Dashboard", desc: "Ciro, kâr ve trend grafikleri" },
          ].map(item => (
            <div key={item.title} className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full mt-2 shrink-0" style={{ background: "hsl(221 83% 60%)" }} />
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs" style={{ color: "hsl(215 25% 55%)" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: "hsl(215 25% 40%)" }}>© {new Date().getFullYear()} {companyName}</p>
      </div>

      {/* Sağ panel — giriş formu */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobil logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold text-primary tracking-tight">{companyName}</h1>
            <p className="text-sm text-muted-foreground mt-1">{companySubtitle}</p>
          </div>

          <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Giriş Yap</h2>
              <p className="text-sm text-muted-foreground mt-1">Hesabınıza erişmek için bilgilerinizi girin</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Kullanıcı Adı</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Kullanıcı adı"
                    className="pl-9 h-11"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={login.isPending}
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
          </div>
        </div>
      </div>
    </div>
  );
}
