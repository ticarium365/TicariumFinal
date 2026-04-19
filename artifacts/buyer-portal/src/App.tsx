import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import NotFound from "@/pages/not-found";
import { ShoppingCart, FileText, Search, LogIn, Loader2 } from "lucide-react";
import { useState } from "react";

const queryClient = new QueryClient();

const API_BASE = "/api";

type Me = {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  companyId: number;
  accountType: "seller" | "buyer" | "both";
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
}

function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const r = await apiFetch("/auth/me");
      if (r.status === 401) return null;
      if (!r.ok) throw new Error(`me: ${r.status}`);
      const j = await r.json();
      return j as Me;
    },
    retry: false,
    staleTime: 30_000,
  });
}

function LoginPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error?.message || j?.message || "Giriş başarısız");
        return;
      }
      // Cache invalidation + dashboard'a git
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    } catch (ex: any) {
      setErr(ex?.message || "Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Ticarium365 Alıcı Paneli</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tedarikçi keşfedin, teklif talebi gönderin, en iyi fiyatları karşılaştırın.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Kullanıcı adı</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required data-testid="input-username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required data-testid="input-password" />
            </div>
            {err && <p className="text-sm text-red-500" data-testid="login-error">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy} data-testid="btn-login">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
              Giriş yap
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard({ me }: { me: Me }) {
  const isBuyerEnabled = me.accountType === "buyer" || me.accountType === "both";
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold">Ticarium365 Alıcı Paneli</h1>
              <p className="text-xs text-muted-foreground">Hoş geldin, {me.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isBuyerEnabled ? "default" : "secondary"} data-testid="badge-account-type">
              {me.accountType === "buyer" ? "Alıcı" : me.accountType === "both" ? "Alıcı + Satıcı" : "Satıcı"}
            </Badge>
            <Button variant="outline" size="sm" onClick={async () => {
              await apiFetch("/auth/logout", { method: "POST" });
              await queryClient.invalidateQueries({ queryKey: ["me"] });
              window.location.reload();
            }} data-testid="btn-logout">Çıkış</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {!isBuyerEnabled && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold text-amber-900">Alıcı paneline erişiminiz kısıtlı.</p>
              <p className="text-amber-800 mt-1">
                Hesabınız "<strong>{me.accountType}</strong>" tipinde tanımlı. Alıcı (buyer) modunu açmak için
                yöneticinizle veya Ticarium365 destek ekibiyle iletişime geçin.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<Search className="h-6 w-6 text-blue-600" />}
            title="Tedarikçi Keşfet"
            description="Sektör, ürün ve bölgeye göre satıcı firmaları arayın."
            badge="Sprint E"
          />
          <FeatureCard
            icon={<FileText className="h-6 w-6 text-blue-600" />}
            title="Teklif Talebi (RFQ)"
            description="Birden çok satıcıya tek seferde teklif isteyin."
            badge="Sprint E"
          />
          <FeatureCard
            icon={<ShoppingCart className="h-6 w-6 text-blue-600" />}
            title="Teklif Karşılaştırma"
            description="Gelen teklifleri kıyaslayın, en iyisini kabul edin."
            badge="Sprint F"
          />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Hesap Bilgileri</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1 font-mono">
            <div><span className="text-muted-foreground">Kullanıcı:</span> {me.username}</div>
            <div><span className="text-muted-foreground">Şirket ID:</span> {me.companyId}</div>
            <div><span className="text-muted-foreground">Hesap tipi:</span> {me.accountType}</div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description, badge }: {
  icon: React.ReactNode; title: string; description: string; badge?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-2">
        <div className="flex items-start justify-between">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">{icon}</div>
          {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function Home() {
  const { data: me, isLoading } = useMe();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }
  if (!me) return <LoginPage />;
  return <Dashboard me={me} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
