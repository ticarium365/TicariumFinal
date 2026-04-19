import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building2, TrendingUp, Users, AlertCircle, Settings, Plus, Clock } from "lucide-react";

type Tenant = {
  companyId: number;
  companyName: string;
  subdomain: string;
  planType: string;
  trialEndsAt: string | null;
  isActive: boolean;
  subStatus: string | null;
  planSlug: string | null;
  planName: string | null;
  planPrice: string | null;
  subExpiresAt: string | null;
};

type Metrics = {
  mrr: number;
  arr: number;
  activeTenantCount: number;
  trialTenantCount: number;
  expiredTenantCount: number;
  totalTenants: number;
  churnedSubscriptions: number;
  planBreakdown: Record<string, { count: number; mrr: number; name: string }>;
};

type Plan = { id: number; slug: string; name: string; priceMonthly: string };

export default function AdminBillingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [planSlug, setPlanSlug] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [trialDays, setTrialDays] = useState(30);
  const [extendDialogTenant, setExtendDialogTenant] = useState<Tenant | null>(null);

  const { data: tData } = useQuery<{ tenants: Tenant[] }>({
    queryKey: ["/api/subscriptions/admin/billing/tenants"],
    queryFn: async () => (await fetch("/api/subscriptions/admin/billing/tenants", { credentials: "include" })).json(),
  });
  const { data: mData } = useQuery<Metrics>({
    queryKey: ["/api/subscriptions/admin/billing/metrics"],
    queryFn: async () => (await fetch("/api/subscriptions/admin/billing/metrics", { credentials: "include" })).json(),
  });
  const { data: pData } = useQuery<{ plans: Plan[] }>({
    queryKey: ["/api/subscriptions/plans"],
    queryFn: async () => (await fetch("/api/subscriptions/plans")).json(),
  });

  const tenants = tData?.tenants || [];
  const plans = pData?.plans || [];

  async function setPlan() {
    if (!selected || !planSlug) return;
    const r = await fetch("/api/subscriptions/admin/billing/set-plan", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selected.companyId, planSlug, billingCycle, markPaid: true,
      }),
    });
    if (r.ok) {
      toast({ title: "Plan ayarlandı", description: `${selected.companyName} → ${planSlug}` });
      setSelected(null); setPlanSlug("");
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/tenants"] });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/metrics"] });
    } else {
      const e = await r.json();
      toast({ title: "Hata", description: e.message ?? "Başarısız", variant: "destructive" });
    }
  }

  async function extendTrial() {
    if (!extendDialogTenant) return;
    const r = await fetch("/api/subscriptions/admin/billing/extend-trial", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: extendDialogTenant.companyId, days: trialDays }),
    });
    if (r.ok) {
      toast({ title: "Trial uzatıldı", description: `${extendDialogTenant.companyName} +${trialDays} gün` });
      setExtendDialogTenant(null);
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/tenants"] });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/metrics"] });
    } else {
      const e = await r.json();
      toast({ title: "Hata", description: e.message ?? "Başarısız", variant: "destructive" });
    }
  }

  function statusBadge(t: Tenant) {
    if (t.subStatus === "active") return <Badge variant="default">Aktif</Badge>;
    if (t.subStatus === "grace_period") return <Badge variant="secondary">Grace</Badge>;
    if (t.planType === "trial" && t.trialEndsAt && new Date(t.trialEndsAt) > new Date()) {
      return <Badge variant="outline" className="text-blue-600">Trial</Badge>;
    }
    return <Badge variant="destructive">Expired</Badge>;
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold">Abonelik & Faturalama Yönetimi</h1>
      </div>

      {/* MRR Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">MRR</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1">
              <TrendingUp className="w-5 h-5 text-green-600" />
              ₺{(mData?.mrr ?? 0).toLocaleString("tr-TR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">ARR</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₺{(mData?.arr ?? 0).toLocaleString("tr-TR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Aktif Tenant</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1">
              <Users className="w-5 h-5 text-primary" />
              {mData?.activeTenantCount ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Trial</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{mData?.trialTenantCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Expired</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {mData?.expiredTenantCount ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants">Tenant Listesi</TabsTrigger>
          <TabsTrigger value="breakdown">Plan Dağılımı</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <Card>
            <CardHeader><CardTitle>Tüm Şirketler ({tenants.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Şirket</TableHead>
                    <TableHead>Subdomain</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Bitiş</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.companyId}>
                      <TableCell className="font-medium">{t.companyName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.subdomain}</TableCell>
                      <TableCell>{t.planName ?? "-"}</TableCell>
                      <TableCell>{statusBadge(t)}</TableCell>
                      <TableCell className="text-xs">
                        {t.subExpiresAt ? new Date(t.subExpiresAt).toLocaleDateString("tr-TR") :
                         t.trialEndsAt ? `Trial: ${new Date(t.trialEndsAt).toLocaleDateString("tr-TR")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => { setSelected(t); setPlanSlug(t.planSlug ?? ""); }}>
                          <Settings className="w-3 h-3 mr-1" /> Plan
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setExtendDialogTenant(t); setTrialDays(30); }}>
                          <Clock className="w-3 h-3 mr-1" /> Trial+
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader><CardTitle>Plan Dağılımı (Aktif Abonelikler)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Müşteri Sayısı</TableHead>
                    <TableHead className="text-right">MRR Katkısı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(mData?.planBreakdown ?? {}).map(([slug, info]) => (
                    <TableRow key={slug}>
                      <TableCell>{info.name}</TableCell>
                      <TableCell className="text-right">{info.count}</TableCell>
                      <TableCell className="text-right font-mono">₺{Math.round(info.mrr).toLocaleString("tr-TR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan değiştir dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan Ata: {selected?.companyName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Yeni Plan</Label>
              <Select value={planSlug} onValueChange={setPlanSlug}>
                <SelectTrigger><SelectValue placeholder="Plan seçin" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.slug}>{p.name} — ₺{p.priceMonthly}/ay</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Faturalama</Label>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Aylık</SelectItem>
                  <SelectItem value="yearly">Yıllık</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={setPlan} disabled={!planSlug}>Uygula (Manuel ödeme olarak işaretle)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trial uzat dialog */}
      <Dialog open={!!extendDialogTenant} onOpenChange={(o) => !o && setExtendDialogTenant(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Trial Uzat: {extendDialogTenant?.companyName}</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Eklenecek Gün</Label>
            <Input type="number" value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button onClick={extendTrial}>Uzat (+{trialDays} gün)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
