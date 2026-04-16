import { useState, useEffect } from "react";
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
import { Loader2, Plus, Building2, CheckCircle, XCircle, Package, Users, ShoppingCart } from "lucide-react";

interface Company {
  id: number;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
  isActive: boolean;
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
}

const emptyForm: NewCompanyForm = {
  name: "",
  subdomain: "",
  adminUsername: "",
  adminPassword: "",
  adminFullName: "",
  primaryColor: "#2563eb",
};

export default function CompaniesAdmin() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
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
    } catch (err) {
      toast({ title: "Hata", description: "Firmalar yüklenemedi.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

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
      toast({
        title: "Güncellendi",
        description: `${company.name} ${!company.isActive ? "aktif edildi" : "devre dışı bırakıldı"}.`,
      });
      await loadCompanies();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const f = (key: keyof NewCompanyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Firma Yönetimi</h1>
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
                  <Input
                    id="subdomain"
                    value={form.subdomain}
                    onChange={f("subdomain")}
                    placeholder="ornek"
                    pattern="[a-z0-9\-]+"
                    title="Yalnızca küçük harf, rakam ve tire"
                    required
                  />
                  <span className="text-sm text-muted-foreground shrink-0">.smsystem.com</span>
                </div>
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
                  <input
                    id="primaryColor"
                    type="color"
                    value={form.primaryColor}
                    onChange={f("primaryColor")}
                    className="w-10 h-10 rounded cursor-pointer border border-border"
                  />
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
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Henüz firma yok</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {companies.map((company) => (
            <div key={company.id} className="bg-card border rounded-xl p-5 flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
                style={{ background: company.primaryColor ?? "#2563eb" }}
              >
                {company.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{company.name}</span>
                  <Badge variant={company.isActive ? "default" : "secondary"} className="text-xs">
                    {company.isActive ? (
                      <><CheckCircle className="h-3 w-3 mr-1" />Aktif</>
                    ) : (
                      <><XCircle className="h-3 w-3 mr-1" />Pasif</>
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{company.subdomain}.smsystem.com</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Package className="h-3 w-3" />{company.productCount} ürün</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{company.userCount} kullanıcı</span>
                  <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{company.saleCount} satış</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleActive(company)}
                disabled={togglingId === company.id}
                className="shrink-0"
              >
                {togglingId === company.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : company.isActive ? "Devre Dışı Bırak" : "Aktif Et"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
