import { Switch, Route, Router as WouterRouter, useLocation, Link } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import NotFound from "@/pages/not-found";
import Discovery from "@/pages/Discovery";
import NewRfq from "@/pages/NewRfq";
import { RfqsList, RfqDetail } from "@/pages/Rfqs";
import SellerInbox from "@/pages/SellerInbox";
import { ShoppingCart, FileText, Search, LogIn, Loader2, Inbox } from "lucide-react";
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
      return (await r.json()) as Me;
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
      const r = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error?.message || j?.message || "Giriş başarısız"); return; }
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
          <p className="text-sm text-muted-foreground">Tedarikçi keşfedin, teklif talebi gönderin, en iyi fiyatları karşılaştırın.</p>
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
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />} Giriş yap
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Layout({ me, children }: { me: Me; children: React.ReactNode }) {
  const isBuyerEnabled = me.accountType === "buyer" || me.accountType === "both";
  const isSellerEnabled = me.accountType === "seller" || me.accountType === "both";
  const [location] = useLocation();
  const NavLink = ({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) => {
    const active = location === href || (href !== "/" && location.startsWith(href));
    return (
      <Link href={href}>
        <button
          data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {icon}{label}
        </button>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-semibold text-sm">Ticarium365 Alıcı Paneli</h1>
                <p className="text-[11px] text-muted-foreground">Hoş geldin, {me.fullName}</p>
              </div>
            </div>
          </Link>
          {!isBuyerEnabled && isSellerEnabled && (
            <nav className="flex items-center gap-1">
              <NavLink href="/" label="Ana Sayfa" icon={<ShoppingCart className="h-4 w-4" />} />
              <NavLink href="/inbox" label="Gelen RFQ" icon={<Inbox className="h-4 w-4" />} />
            </nav>
          )}
          {isBuyerEnabled && (
            <nav className="flex items-center gap-1">
              <NavLink href="/" label="Ana Sayfa" icon={<ShoppingCart className="h-4 w-4" />} />
              <NavLink href="/discover" label="Keşfet" icon={<Search className="h-4 w-4" />} />
              <NavLink href="/rfqs" label="RFQ'larım" icon={<FileText className="h-4 w-4" />} />
              {isSellerEnabled && <NavLink href="/inbox" label="Gelen RFQ" icon={<Inbox className="h-4 w-4" />} />}
            </nav>
          )}
          <div className="flex items-center gap-2">
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
      <main className="container mx-auto px-4 py-6">
        {!isBuyerEnabled && !isSellerEnabled ? (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-6 text-sm">
              <p className="font-semibold text-amber-900 text-base">Alıcı paneline erişiminiz kısıtlı.</p>
              <p className="text-amber-800 mt-2">
                Hesabınız "<strong>{me.accountType}</strong>" tipinde tanımlı. Alıcı (buyer) modunu açmak için yöneticinizle iletişime geçin.
              </p>
            </CardContent>
          </Card>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

function HomePage({ me }: { me: Me }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Hoş geldin, {me.fullName}</h2>
        <p className="text-sm text-muted-foreground mt-1">Tedarik süreçlerini Ticarium365 üzerinden tek panelden yönet.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/discover">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-discovery">
            <CardContent className="p-5 space-y-2">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><Search className="h-6 w-6 text-blue-600" /></div>
              <h3 className="font-semibold">Tedarikçi Keşfet</h3>
              <p className="text-sm text-muted-foreground">Sektör ve firma adına göre satıcı ara.</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rfqs/new">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-new-rfq">
            <CardContent className="p-5 space-y-2">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><FileText className="h-6 w-6 text-blue-600" /></div>
              <h3 className="font-semibold">Yeni Teklif Talebi</h3>
              <p className="text-sm text-muted-foreground">Birden çok satıcıya tek seferde RFQ gönder.</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rfqs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-rfqs">
            <CardContent className="p-5 space-y-2">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><ShoppingCart className="h-6 w-6 text-blue-600" /></div>
              <h3 className="font-semibold">RFQ'larım</h3>
              <p className="text-sm text-muted-foreground">Açık/kapalı talepleri ve gelen teklifleri gör.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function AuthGate() {
  const { data: me, isLoading } = useMe();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }
  if (!me) return <LoginPage />;
  return (
    <Layout me={me}>
      <Switch>
        <Route path="/" component={() => <HomePage me={me} />} />
        <Route path="/discover" component={Discovery} />
        <Route path="/rfqs" component={RfqsList} />
        <Route path="/rfqs/new" component={NewRfq} />
        <Route path="/rfqs/:id" component={RfqDetail} />
        <Route path="/inbox" component={SellerInbox} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
