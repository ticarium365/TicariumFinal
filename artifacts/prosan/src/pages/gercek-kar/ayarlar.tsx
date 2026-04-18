import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus, Save, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/components/auth-context";

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n || 0);

interface Rules {
  id?: number; monthlyRent: number; monthlyStaff: number; monthlyElectric: number;
  monthlyOther: number; totalShelfM2: number; defaultM2PerProduct: number;
  capitalCostAnnualPct: number; spoilageRiskPct: number;
  allocMethod: string; isEnabled: boolean;
}
interface Expense {
  id: number; name: string; amount: number; allocMethod: string;
  categoryFilter: string | null; manualPct: number | null; isActive: boolean;
}

const defaultRules: Rules = {
  monthlyRent: 0, monthlyStaff: 0, monthlyElectric: 0, monthlyOther: 0,
  totalShelfM2: 100, defaultM2PerProduct: 0.05,
  capitalCostAnnualPct: 30, spoilageRiskPct: 0,
  allocMethod: "revenue", isEnabled: true,
};

export default function GercekKarAyarlar() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rulesData, isLoading: rulesLoading } = useQuery<Rules | null>({
    queryKey: ["/api/profit-engine/rules"],
    queryFn: async () => {
      const r = await fetch("/api/profit-engine/rules", { credentials: "include" });
      if (!r.ok) throw new Error("Hata");
      return r.json();
    },
  });

  const { data: expenses = [], isLoading: expLoading } = useQuery<Expense[]>({
    queryKey: ["/api/profit-engine/expenses"],
    queryFn: async () => {
      const r = await fetch("/api/profit-engine/expenses", { credentials: "include" });
      if (!r.ok) throw new Error("Hata");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const [form, setForm] = useState<Rules>(defaultRules);
  useEffect(() => {
    if (rulesData) setForm(rulesData);
  }, [rulesData]);

  const saveRules = useMutation({
    mutationFn: async (data: Rules) => {
      const r = await fetch("/api/profit-engine/rules", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Kaydedilemedi");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Kaydedildi", description: "Raf maliyeti kuralları güncellendi." });
      qc.invalidateQueries({ queryKey: ["/api/profit-engine/rules"] });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const recompute = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/profit-engine/recompute", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Hesaplanamadı");
      return r.json();
    },
    onSuccess: (d) => toast({ title: "Hesaplandı", description: `${d.updated} ürün güncellendi.` }),
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const [newExp, setNewExp] = useState({ name: "", amount: "", allocMethod: "revenue" });
  const addExpense = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/profit-engine/expenses", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newExp.name, amount: Number(newExp.amount), allocMethod: newExp.allocMethod }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Eklenemedi");
      return r.json();
    },
    onSuccess: () => {
      setNewExp({ name: "", amount: "", allocMethod: "revenue" });
      qc.invalidateQueries({ queryKey: ["/api/profit-engine/expenses"] });
      toast({ title: "Eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/profit-engine/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/profit-engine/expenses"] });
      toast({ title: "Silindi" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader><CardTitle>Erişim Reddedildi</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Bu sayfayı sadece şirket sahibi (admin) düzenleyebilir.</p>
            <Link href="/gercek-kar"><Button variant="outline" className="mt-3">Geri Dön</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthlyTotal = form.monthlyRent + form.monthlyStaff + form.monthlyElectric + form.monthlyOther;
  const expTotal = (expenses ?? []).filter((e) => e.isActive).reduce((a, x) => a + x.amount, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Gerçek Kâr Ayarları</h1>
        <p className="text-sm text-muted-foreground">Raf maliyeti, sermaye maliyeti ve gider dağıtım kuralları</p>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" data-testid="tab-rules">Raf & Sermaye</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses">Aylık Giderler</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Raf Maliyeti Yapılandırması</CardTitle>
              <CardDescription>Ürünleriniz rafta durdukça maliyet yüklenir. Bu maliyetin nasıl hesaplandığını burada belirleyin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rulesLoading ? (
                <div className="h-40 bg-muted animate-pulse rounded" />
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <Label className="font-medium">Aktif</Label>
                      <p className="text-xs text-muted-foreground">Kapatırsanız raf maliyeti hesaplanmaz</p>
                    </div>
                    <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm({ ...form, isEnabled: v })} data-testid="switch-enabled" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rent">Aylık Kira (Depo + Mağaza)</Label>
                      <Input id="rent" type="number" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: Number(e.target.value) })} data-testid="input-rent" />
                    </div>
                    <div>
                      <Label htmlFor="staff">Aylık Operasyon Personeli</Label>
                      <Input id="staff" type="number" value={form.monthlyStaff} onChange={(e) => setForm({ ...form, monthlyStaff: Number(e.target.value) })} data-testid="input-staff" />
                    </div>
                    <div>
                      <Label htmlFor="electric">Aylık Elektrik</Label>
                      <Input id="electric" type="number" value={form.monthlyElectric} onChange={(e) => setForm({ ...form, monthlyElectric: Number(e.target.value) })} data-testid="input-electric" />
                    </div>
                    <div>
                      <Label htmlFor="other">Aylık Diğer Operasyon</Label>
                      <Input id="other" type="number" value={form.monthlyOther} onChange={(e) => setForm({ ...form, monthlyOther: Number(e.target.value) })} data-testid="input-other" />
                    </div>
                    <div>
                      <Label htmlFor="m2">Toplam Raf Alanı (m²)</Label>
                      <Input id="m2" type="number" step="0.1" value={form.totalShelfM2} onChange={(e) => setForm({ ...form, totalShelfM2: Number(e.target.value) })} data-testid="input-m2" />
                    </div>
                    <div>
                      <Label htmlFor="dm2">Ürün Başına Ortalama m²</Label>
                      <Input id="dm2" type="number" step="0.001" value={form.defaultM2PerProduct} onChange={(e) => setForm({ ...form, defaultM2PerProduct: Number(e.target.value) })} data-testid="input-default-m2" />
                    </div>
                    <div>
                      <Label htmlFor="cap">Yıllık Sermaye Maliyeti (%)</Label>
                      <Input id="cap" type="number" step="0.5" value={form.capitalCostAnnualPct} onChange={(e) => setForm({ ...form, capitalCostAnnualPct: Number(e.target.value) })} data-testid="input-capital" />
                      <p className="text-xs text-muted-foreground mt-1">Paranın alternatif getirisi (mevduat faizi vb.)</p>
                    </div>
                    <div>
                      <Label htmlFor="spoil">Yıllık Bozulma/Fire Riski (%)</Label>
                      <Input id="spoil" type="number" step="0.5" value={form.spoilageRiskPct} onChange={(e) => setForm({ ...form, spoilageRiskPct: Number(e.target.value) })} data-testid="input-spoilage" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Gider Dağıtım Yöntemi (varsayılan)</Label>
                      <Select value={form.allocMethod} onValueChange={(v) => setForm({ ...form, allocMethod: v })}>
                        <SelectTrigger data-testid="select-alloc"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">Ciroya göre</SelectItem>
                          <SelectItem value="qty">Adet satışa göre</SelectItem>
                          <SelectItem value="category">Kategoriye göre</SelectItem>
                          <SelectItem value="m2">Raf alanına göre</SelectItem>
                          <SelectItem value="manual">Manuel oran</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Card className="bg-muted/30">
                    <CardContent className="p-4 text-sm">
                      <p>📊 Aylık operasyon havuzu: <b>{fmt(monthlyTotal)}</b></p>
                      <p>📦 Aylık ek gider havuzu: <b>{fmt(expTotal)}</b></p>
                      <p className="text-xs text-muted-foreground mt-2">Bu maliyetler ürün satışlarına dağıtılır ve "Etkin Maliyet"e eklenir.</p>
                    </CardContent>
                  </Card>

                  <div className="flex gap-2">
                    <Button onClick={() => saveRules.mutate(form)} disabled={saveRules.isPending} data-testid="button-save">
                      <Save className="h-4 w-4 mr-1" />Kaydet
                    </Button>
                    <Button variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending} data-testid="button-recompute">
                      <Calculator className="h-4 w-4 mr-1" />Şimdi Hesapla
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <CardTitle>Aylık Ek Giderler</CardTitle>
              <CardDescription>Reklam, abonelik, temizlik vb. — ürünlere dağıtılacak ek maliyetler</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end p-3 border rounded bg-muted/20">
                <div>
                  <Label>Gider Adı</Label>
                  <Input value={newExp.name} onChange={(e) => setNewExp({ ...newExp, name: e.target.value })} placeholder="Örn. Google Reklam" data-testid="input-exp-name" />
                </div>
                <div>
                  <Label>Aylık Tutar</Label>
                  <Input type="number" value={newExp.amount} onChange={(e) => setNewExp({ ...newExp, amount: e.target.value })} data-testid="input-exp-amount" />
                </div>
                <div>
                  <Label>Dağıtım</Label>
                  <Select value={newExp.allocMethod} onValueChange={(v) => setNewExp({ ...newExp, allocMethod: v })}>
                    <SelectTrigger data-testid="select-exp-alloc"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Ciroya göre</SelectItem>
                      <SelectItem value="qty">Adet satışa göre</SelectItem>
                      <SelectItem value="category">Kategoriye göre</SelectItem>
                      <SelectItem value="m2">Raf alanına göre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => addExpense.mutate()} disabled={!newExp.name || !newExp.amount || addExpense.isPending} data-testid="button-add-exp">
                  <Plus className="h-4 w-4 mr-1" />Ekle
                </Button>
              </div>

              {expLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded" />
              ) : expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Henüz ek gider eklenmemiş</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 px-2">Ad</th>
                        <th className="py-2 px-2 text-right">Tutar</th>
                        <th className="py-2 px-2">Yöntem</th>
                        <th className="py-2 px-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((e) => (
                        <tr key={e.id} className="border-b" data-testid={`row-exp-${e.id}`}>
                          <td className="py-2 px-2 font-medium">{e.name}</td>
                          <td className="py-2 px-2 text-right">{fmt(e.amount)}</td>
                          <td className="py-2 px-2 text-muted-foreground">{e.allocMethod}</td>
                          <td className="py-2 px-2 text-right">
                            <Button size="icon" variant="ghost" onClick={() => deleteExpense.mutate(e.id)} data-testid={`button-del-exp-${e.id}`}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
