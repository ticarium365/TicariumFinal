import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Percent, BadgeDollarSign, PackageCheck, Clock, CheckCircle2, XCircle, Calendar } from "lucide-react";
import { apiBase } from "@/lib/api";

interface Campaign {
  id: number;
  name: string;
  description?: string;
  discountType: string;
  discountLabel: string;
  discountValue: string;
  scope: string;
  scopeLabel: string;
  scopeIds: number[];
  minQuantity: number;
  minAmount?: string;
  maxUses?: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  couponCode?: string;
  statusLabel: string;
}

const statusColors: Record<string, string> = {
  Aktif: "bg-green-100 text-green-800",
  Planlandı: "bg-blue-100 text-blue-800",
  "Sona Erdi": "bg-muted text-muted-foreground",
  Pasif: "bg-red-100 text-red-700",
};

const discountIcons: Record<string, typeof Percent> = {
  percent: Percent,
  fixed: BadgeDollarSign,
  buy_x_get_y: PackageCheck,
};

const DISCOUNT_TYPES = [
  { value: "percent", label: "Yüzde İndirim (%)" },
  { value: "fixed", label: "Sabit İndirim (₺)" },
  { value: "buy_x_get_y", label: "Al X Öde Y" },
];

const SCOPE_TYPES = [
  { value: "all", label: "Tüm Ürünler" },
  { value: "category", label: "Kategoriye Özel" },
  { value: "product", label: "Ürüne Özel" },
];

const emptyForm = {
  name: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  scope: "all",
  scopeIds: "",
  minQuantity: "1",
  minAmount: "",
  maxUses: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  isActive: true,
  couponCode: "",
};

export default function CampaignsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState("all");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allR, activeR] = await Promise.all([
        fetch(`${apiBase}/campaigns`, { credentials: "include" }),
        fetch(`${apiBase}/campaigns/active`, { credentials: "include" }),
      ]);
      if (allR.ok) setCampaigns((await allR.json()).campaigns);
      if (activeR.ok) setActiveCampaigns((await activeR.json()).campaigns);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      discountType: c.discountType,
      discountValue: c.discountValue,
      scope: c.scope,
      scopeIds: (c.scopeIds ?? []).join(","),
      minQuantity: String(c.minQuantity ?? 1),
      minAmount: c.minAmount ?? "",
      maxUses: c.maxUses ? String(c.maxUses) : "",
      startDate: c.startDate,
      endDate: c.endDate,
      isActive: c.isActive,
      couponCode: c.couponCode ?? "",
    });
    setShowModal(true);
  }

  async function save() {
    const body = {
      ...form,
      discountValue: parseFloat(form.discountValue),
      minQuantity: parseInt(form.minQuantity) || 1,
      minAmount: form.minAmount ? parseFloat(form.minAmount) : null,
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      scopeIds: form.scopeIds ? form.scopeIds.split(",").map((s) => parseInt(s.trim())).filter(Boolean) : [],
      couponCode: form.couponCode || null,
      description: form.description || null,
    };
    const url = editing ? `${apiBase}/campaigns/${editing.id}` : `${apiBase}/campaigns`;
    const method = editing ? "PUT" : "POST";
    const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setShowModal(false); fetchData(); }
  }

  async function toggle(c: Campaign) {
    await fetch(`${apiBase}/campaigns/${c.id}/toggle`, { method: "PATCH", credentials: "include" });
    fetchData();
  }

  async function remove(c: Campaign) {
    if (!confirm(`"${c.name}" kampanyası silinsin mi?`)) return;
    await fetch(`${apiBase}/campaigns/${c.id}`, { method: "DELETE", credentials: "include" });
    fetchData();
  }

  const campaignColumns: DataTableColumn<Campaign>[] = [
    {
      id: "campaign",
      header: "Kampanya",
      sortable: true,
      sortValue: (c) => c.name,
      cell: (c) => {
        const Icon = discountIcons[c.discountType] ?? Tag;
        const discountDisplay =
          c.discountType === "percent" ? `%${c.discountValue}` :
          c.discountType === "fixed" ? `₺${parseFloat(c.discountValue).toLocaleString("tr-TR")}` :
          c.discountValue;
        return (
          <div className={`flex gap-3 min-w-0 max-w-xl ${!c.isActive ? "opacity-60" : ""}`}>
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{c.name}</span>
                <Badge className={`text-xs ${statusColors[c.statusLabel] ?? ""}`}>{c.statusLabel}</Badge>
                <Badge variant="outline" className="text-xs">{c.discountLabel}</Badge>
                <Badge variant="outline" className="text-xs">{c.scopeLabel}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="font-medium text-orange-600">{discountDisplay} indirim</span>
                <span className="hidden sm:inline">• {c.startDate} → {c.endDate}</span>
                {c.couponCode && (
                  <span>
                    • Kupon: <code className="bg-muted px-1 rounded">{c.couponCode}</code>
                  </span>
                )}
                {c.maxUses != null && <span>• Kullanım: {c.usedCount}/{c.maxUses}</span>}
              </div>
              {c.description && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{c.description}</p>}
            </div>
          </div>
        );
      },
    },
    {
      id: "period",
      header: "Dönem",
      sortable: true,
      sortValue: (c) => c.startDate,
      headerClassName: "hidden lg:table-cell",
      className: "hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap",
      cell: (c) => <span>{c.startDate} → {c.endDate}</span>,
    },
    {
      id: "uses",
      header: "Kullanım",
      headerClassName: "text-right hidden md:table-cell",
      className: "text-right hidden md:table-cell text-sm tabular-nums",
      sortable: true,
      sortValue: (c) => c.usedCount,
      cell: (c) => (c.maxUses != null ? `${c.usedCount}/${c.maxUses}` : "—"),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "text-right w-[108px]",
      className: "text-right",
      cell: (c) =>
        isAdmin ? (
          <div className="flex gap-0.5 justify-end">
            <Button size="sm" variant="ghost" onClick={() => openEdit(c)} aria-label="Düzenle">
              <Edit className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggle(c)} aria-label="Aç/Kapat">
              {c.isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" className="text-[color:var(--color-semantic-danger)]" onClick={() => remove(c)} aria-label="Sil">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Kampanyalar"
        subtitle="İndirim kampanyaları ve promosyonlar"
        right={
          isAdmin ? (
            <Button size="sm" className="gap-2" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Kampanya Ekle
            </Button>
          ) : undefined
        }
      />

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Toplam", value: campaigns.length, icon: Tag, color: "text-blue-600" },
          { label: "Aktif", value: activeCampaigns.length, icon: CheckCircle2, color: "text-green-600" },
          { label: "Pasif", value: campaigns.filter((c) => !c.isActive).length, icon: XCircle, color: "text-red-500" },
          { label: "Planlandı", value: campaigns.filter((c) => c.statusLabel === "Planlandı").length, icon: Clock, color: "text-blue-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Tüm Kampanyalar ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="active">Aktif ({activeCampaigns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataTable<Campaign>
                columns={campaignColumns}
                data={campaigns}
                getRowId={(c) => String(c.id)}
                loading={loading}
                enableRowSelection={false}
                showFooterPagination={false}
                emptyState={
                  <EmptyState
                    icon={Tag}
                    title="Kampanya listesi boş"
                    description="İndirim ve promosyon kampanyalarını oluşturup kayıtlı müşterilere uygulayın."
                    action={
                      isAdmin
                        ? { label: "Kampanya ekle", onClick: openAdd }
                        : undefined
                    }
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataTable<Campaign>
                columns={campaignColumns}
                data={activeCampaigns}
                getRowId={(c) => String(c.id)}
                loading={loading}
                enableRowSelection={false}
                showFooterPagination={false}
                emptyState={
                  <EmptyState
                    icon={Calendar}
                    title="Aktif kampanya yok"
                    description="Başlangıç ve bitiş tarihi bu döneme denk gelen açık kampanyalar burada listelenir."
                    action={
                      isAdmin ? { label: "Yeni kampanya", onClick: openAdd } : undefined
                    }
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Kampanya Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Kampanya Düzenle" : "Yeni Kampanya"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Kampanya Adı *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Açıklama</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>İndirim Türü *</Label>
                <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DISCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>İndirim Değeri *</Label>
                <Input type="number" min={0} value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                  placeholder={form.discountType === "percent" ? "örn: 20" : "örn: 50"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kapsam</Label>
                <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v, scopeIds: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SCOPE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.scope !== "all" && (
                <div>
                  <Label>ID'ler (virgülle)</Label>
                  <Input value={form.scopeIds} onChange={(e) => setForm((f) => ({ ...f, scopeIds: e.target.value }))} placeholder="1,2,3" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Başlangıç *</Label><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>Bitiş *</Label><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label>Min. Adet</Label><Input type="number" min={1} value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} /></div>
              <div><Label>Min. Tutar (₺)</Label><Input type="number" min={0} value={form.minAmount} onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))} /></div>
              <div><Label>Max. Kullanım</Label><Input type="number" min={1} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} /></div>
            </div>

            <div><Label>Kupon Kodu</Label><Input value={form.couponCode} onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))} placeholder="Boş bırakırsanız kupon kodu olmaz" /></div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="campActive"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v === true }))}
              />
              <Label htmlFor="campActive">Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowModal(false)}>İptal</Button>
            <Button onClick={save}>{editing ? "Güncelle" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
