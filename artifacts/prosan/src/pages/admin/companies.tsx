import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Building2, CheckCircle, XCircle, Package, Users, ShoppingCart, Calendar, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { initialLetter } from "@/lib/display-initial";

interface Company {
  id: number;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
  isActive: boolean;
  planType: "trial" | "active" | "suspended";
  trialEndsAt: string | null;
  createdAt: string;
  productCount: number;
  userCount: number;
  saleCount: number;
}

interface NewCompanyForm {
  name: string;
  subdomain: string;
  adminUsername: string;
  adminPassword: string;
  adminFullName: string;
  primaryColor: string;
  trialDays: string;
}

const LIST_PAGE_SIZE = 15;

const emptyForm: NewCompanyForm = {
  name: "",
  subdomain: "",
  adminUsername: "",
  adminPassword: "",
  adminFullName: "",
  primaryColor: "#2563eb",
  trialDays: "21",
};

function PlanBadge({ company }: { company: Company }) {
  const now = new Date();
  const expired = company.trialEndsAt && new Date(company.trialEndsAt) < now;
  const daysLeft = company.trialEndsAt
    ? Math.ceil((new Date(company.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (company.planType === "active") {
    return <Badge className="bg-green-500/15 text-green-300 border-green-500/20 text-xs">Aktif Abonelik</Badge>;
  }
  if (company.planType === "suspended") {
    return <Badge className="bg-red-500/15 text-red-300 border-red-500/20 text-xs">Askıya Alınmış</Badge>;
  }
  if (expired) {
    return <Badge className="bg-red-500/15 text-red-300 border-red-500/20 text-xs">Trial Doldu</Badge>;
  }
  if (daysLeft !== null && daysLeft >= 0) {
    return <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/20 text-xs">Trial • {daysLeft} gün</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground text-xs">Trial</Badge>;
}

export default function CompaniesAdmin() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [listPage, setListPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [trialDialog, setTrialDialog] = useState<Company | null>(null);
  const [trialDays, setTrialDays] = useState("21");
  const [planType, setPlanType] = useState<string>("trial");
  const [form, setForm] = useState<NewCompanyForm>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const { toast } = useToast();

  const loadCompanies = async () => {
    try {
      const res = await fetch("/api/companies", { credentials: "include" });
      if (!res.ok) throw new Error("Yüklenemedi");
      const data = await res.json();
      setCompanies(data);
      setListPage(1);
    } catch {
      toast({ title: "Hata", description: "Firmalar yüklenemedi.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadCompanies(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Oluşturulamadı");

      // Trial günü ayarla
      if (form.trialDays && parseInt(form.trialDays) > 0) {
        await fetch(`/api/companies/${data.company.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trialDays: parseInt(form.trialDays) }),
        });
      }

      toast({ title: "Başarılı", description: `${form.name} firması oluşturuldu.` });
      setDialogOpen(false);
      setForm(emptyForm);
      await loadCompanies();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message || "Firma oluşturulamadı.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (company: Company) => {
    setTogglingId(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !company.isActive }),
      });
      if (!res.ok) throw new Error("Güncelleme başarısız");
      toast({ title: "Güncellendi", description: `${company.name} ${!company.isActive ? "aktif edildi" : "devre dışı bırakıldı"}.` });
      await loadCompanies();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleUpdateTrial = async () => {
    if (!trialDialog) return;
    try {
      const body: Record<string, unknown> = { planType, updatedAt: new Date() };
      if (planType === "trial" && trialDays) {
        body.trialDays = parseInt(trialDays);
      }
      const res = await fetch(`/api/companies/${trialDialog.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Güncelleme başarısız");
      toast({ title: "Güncellendi" });
      setTrialDialog(null);
      await loadCompanies();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    }
  };

  const openTrialDialog = (company: Company) => {
    setTrialDialog(company);
    setPlanType(company.planType);
    setTrialDays("14");
  };

  const f = (key: keyof NewCompanyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const totalListPages = Math.max(1, Math.ceil(companies.length / LIST_PAGE_SIZE));
  const pagedCompanies = useMemo(() => {
    const start = (listPage - 1) * LIST_PAGE_SIZE;
    return companies.slice(start, start + LIST_PAGE_SIZE);
  }, [companies, listPage]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Firma Yönetimi</h1>
          <p className="text-muted-foreground text-sm mt-1">Tüm kiracı firmaları yönetin</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Firma
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Yeni Firma Oluştur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Firma Adı *</Label>
                <Input id="name" value={form.name} onChange={f("name")} placeholder="ÖRNEK ENDÜSTRİ" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subdomain">Subdomain *</Label>
                <div className="flex items-center gap-2">
                  <Input id="subdomain" value={form.subdomain} onChange={f("subdomain")} placeholder="ornek" pattern="[a-z0-9\-]+" required />
                  <span className="text-sm text-muted-foreground shrink-0">.smsystem.com</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trialDays">Trial Süresi (gün)</Label>
                <Input id="trialDays" type="number" min="1" max="365" value={form.trialDays} onChange={f("trialDays")} placeholder="21" />
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Admin Kullanıcı</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="adminFullName">Ad Soyad *</Label>
                    <Input id="adminFullName" value={form.adminFullName} onChange={f("adminFullName")} placeholder="Ad Soyad" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adminUsername">Kullanıcı Adı *</Label>
                    <Input id="adminUsername" value={form.adminUsername} onChange={f("adminUsername")} placeholder="kullanici" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adminPassword">Şifre *</Label>
                    <Input id="adminPassword" type="password" value={form.adminPassword} onChange={f("adminPassword")} placeholder="••••••••" required />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="primaryColor">Ana Renk</Label>
                <div className="flex items-center gap-3">
                  <input id="primaryColor" type="color" value={form.primaryColor} onChange={f("primaryColor")} className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <Input value={form.primaryColor} onChange={f("primaryColor")} className="flex-1" placeholder="#2563eb" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Oluşturuluyor...</> : "Oluştur"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : companies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Henüz firma yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.length > LIST_PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {(listPage - 1) * LIST_PAGE_SIZE + 1}–{Math.min(listPage * LIST_PAGE_SIZE, companies.length)} / {companies.length} firma
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={listPage <= 1} onClick={() => setListPage((p) => p - 1)} aria-label="Önceki sayfa">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">Sayfa {listPage} / {totalListPages}</span>
                <Button variant="outline" size="sm" disabled={listPage >= totalListPages} onClick={() => setListPage((p) => p + 1)} aria-label="Sonraki sayfa">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        <div className="grid gap-4">
          {pagedCompanies.map((company) => (
            <div key={company.id} className="bg-card border rounded-xl p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: company.primaryColor ?? "#2563eb" }}>
                {initialLetter(company.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{company.name}</span>
                  <Badge variant={company.isActive ? "default" : "secondary"} className="text-xs">
                    {company.isActive ? <><CheckCircle className="h-3 w-3 mr-1" />Aktif</> : <><XCircle className="h-3 w-3 mr-1" />Pasif</>}
                  </Badge>
                  <PlanBadge company={company} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{company.subdomain}.smsystem.com</p>
                {company.trialEndsAt && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {company.planType === "active" ? "Abonelik bitiş:" : "Trial bitiş:"} {new Date(company.trialEndsAt).toLocaleDateString("tr-TR")}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Package className="h-3 w-3" />{company.productCount} ürün</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{company.userCount} kullanıcı</span>
                  <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{company.saleCount} satış</span>
                </div>
              </div>
              <div className="flex gap-2 ml-3 shrink-0">
                <Button variant="outline" size="sm" onClick={() => openTrialDialog(company)}>
                  <Settings className="h-3.5 w-3.5 mr-1" /> Plan
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleToggleActive(company)} disabled={togglingId === company.id}>
                  {togglingId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : company.isActive ? "Devre Dışı" : "Aktif Et"}
                </Button>
              </div>
            </div>
          ))}
        </div>
        </div>
      )}

      {/* Trial / Plan Yönetimi Dialog */}
      <Dialog open={!!trialDialog} onOpenChange={() => setTrialDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Plan Ayarla — {trialDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Plan Tipi</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["trial", "active", "suspended"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlanType(p)}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${planType === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {p === "trial" ? "Trial" : p === "active" ? "Aktif" : "Askıya Al"}
                  </button>
                ))}
              </div>
            </div>
            {planType === "trial" && (
              <div className="space-y-1.5">
                <Label>Bugünden itibaren kaç gün trial?</Label>
                <Input type="number" min="1" max="365" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
              </div>
            )}
            {planType === "active" && (
              <p className="text-sm text-muted-foreground">
                Firma tamamen aktif edilecek. Havale onaylandıktan sonra da bu işlem otomatik yapılır.
              </p>
            )}
            {planType === "suspended" && (
              <p className="text-sm text-orange-400 bg-orange-500/10 rounded p-2 text-xs">
                Firma sisteme erişemeyecek ve ödeme sayfasına yönlendirilecek.
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setTrialDialog(null)}>İptal</Button>
              <Button onClick={handleUpdateTrial}>Kaydet</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
