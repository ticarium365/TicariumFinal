import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Search,
  Loader2,
  Settings2,
  Save,
  Filter,
  Download,
  KeyRound,
  RefreshCw,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface Product {
  id: number;
  productCode: string;
  name: string;
  brand: string | null;
  category: string | null;
  salePrice: number;
  stock: number;
  minStock: number;
}

interface Listing {
  id?: number;
  isEnabled: boolean;
  customTitle?: string | null;
  customDescription?: string | null;
  customSku?: string | null;
  customCategory?: string | null;
  customImageUrl?: string | null;
  priceMode: string;
  priceValue: number | null;
  minPrice: number | null;
  campaignPrice: number | null;
  campaignStartsAt?: string | null;
  campaignEndsAt?: string | null;
  stockMode: string;
  stockValue: number | null;
  minStockShow: number | null;
  maxStockShow: number | null;
  stopBelowCritical: boolean;
}

interface Row {
  product: Product;
  listing: Listing | null;
  isEnabled: boolean;
  effectivePrice: number;
  effectiveStock: number;
}

const PRICE_MODE_LABEL: Record<string, string> = {
  base: "Ana fiyat",
  fixed: "Sabit fiyat",
  markup_pct: "Yüzde ekle",
  markup_amount: "Sabit ekle",
};
const STOCK_MODE_LABEL: Record<string, string> = {
  full: "Tüm stok",
  buffer: "Tampon düş",
  fixed: "Sabit göster",
  percent: "Yüzde göster",
};

interface Props {
  channelKey: string;
}

export default function ChannelDetailPage({ channelKey }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<"all" | "on" | "off">("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [channelLabel, setChannelLabel] = useState(channelKey);
  const [credentials, setCredentials] = useState<any>(null);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [credForm, setCredForm] = useState<{ mode: "test" | "live"; isActive: boolean; fields: Record<string, string> }>({
    mode: "test",
    isActive: false,
    fields: {},
  });

  const adapterChannels = ["trendyol", "hepsiburada", "n11", "amazon_tr"];
  const hasAdapter = adapterChannels.includes(channelKey);

  const credentialFields: Record<string, { key: string; label: string; secret: boolean }[]> = {
    trendyol: [
      { key: "sellerId", label: "Mağaza ID", secret: false },
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    hepsiburada: [
      { key: "merchantId", label: "Merchant ID", secret: false },
      { key: "username", label: "Kullanıcı Adı", secret: false },
      { key: "password", label: "Parola", secret: true },
    ],
    n11: [
      { key: "appKey", label: "App Key", secret: true },
      { key: "appSecret", label: "App Secret", secret: true },
    ],
    amazon_tr: [
      { key: "sellerId", label: "Seller ID", secret: false },
      { key: "marketplaceId", label: "Marketplace ID (A33AVAJ2PDY3EV = TR)", secret: false },
      { key: "refreshToken", label: "Refresh Token", secret: true },
      { key: "lwaClientId", label: "LWA Client ID", secret: true },
      { key: "lwaClientSecret", label: "LWA Client Secret", secret: true },
    ],
  };

  async function loadCredentials() {
    if (!hasAdapter) return;
    const r = await fetch(`${apiBase}/channels/${channelKey}/credentials`, { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      setCredentials(data);
      const fields: Record<string, string> = {};
      for (const f of credentialFields[channelKey] ?? []) {
        fields[f.key] = data.credentials?.[f.key] ?? "";
      }
      setCredForm({ mode: data.mode ?? "test", isActive: !!data.isActive, fields });
    }
  }

  async function saveCredentials() {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/channels/${channelKey}/credentials`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: credForm.mode, isActive: credForm.isActive, credentials: credForm.fields }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Bağlantı bilgileri kaydedildi" });
      setCredDialogOpen(false);
      await loadCredentials();
    } catch {
      toast({ title: "Kaydedilemedi", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function triggerSync() {
    setSyncBusy(true);
    try {
      const r = await fetch(`${apiBase}/channels/${channelKey}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({
        title: `Senkronizasyon tamamlandı (${d.mode === "test" ? "TEST" : "CANLI"})`,
        description: `${d.success}/${d.total} başarılı, ${d.error} hata · ${d.durationMs}ms`,
      });
      await loadCredentials();
    } catch (e: any) {
      toast({ title: "Senkronizasyon başarısız", description: e?.message, variant: "destructive" });
    } finally {
      setSyncBusy(false);
    }
  }

  async function openLogs() {
    setLogsDialogOpen(true);
    const r = await fetch(`${apiBase}/channels/${channelKey}/logs?limit=100`, { credentials: "include" });
    if (r.ok) setLogs(await r.json());
  }

  function downloadExcel() {
    window.open(`${apiBase}/channels/${channelKey}/export.xlsx`, "_blank");
  }

  useEffect(() => {
    loadCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/channels/${channelKey}/listings`, { credentials: "include" });
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Hata", description: "Yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(`${apiBase}/channels`, { credentials: "include" })
      .then((r) => r.json())
      .then((defs: any[]) => {
        const c = defs.find((d) => d.key === channelKey);
        if (c) setChannelLabel(c.label);
      });
    load();
  }, [channelKey]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.product.name.toLowerCase().includes(s) ||
          x.product.productCode.toLowerCase().includes(s) ||
          x.product.brand?.toLowerCase().includes(s)
      );
    }
    if (filterEnabled === "on") r = r.filter((x) => x.isEnabled);
    else if (filterEnabled === "off") r = r.filter((x) => !x.isEnabled);
    return r;
  }, [rows, search, filterEnabled]);

  async function quickToggle(row: Row, value: boolean) {
    try {
      const r = await fetch(`${apiBase}/channels/products/${row.product.id}/${channelKey}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: value }),
      });
      if (!r.ok) throw new Error("fail");
      setRows((prev) =>
        prev.map((p) =>
          p.product.id === row.product.id ? { ...p, isEnabled: value, listing: { ...(p.listing ?? defaultListing()), isEnabled: value } } : p
        )
      );
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    }
  }

  function defaultListing(): Listing {
    return {
      isEnabled: false,
      priceMode: "base",
      priceValue: null,
      minPrice: null,
      campaignPrice: null,
      stockMode: "full",
      stockValue: null,
      minStockShow: null,
      maxStockShow: null,
      stopBelowCritical: false,
    };
  }

  function openEdit(row: Row) {
    setEditing({
      ...row,
      listing: row.listing ?? defaultListing(),
    });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const l = editing.listing!;
      const body: any = {
        isEnabled: l.isEnabled,
        customTitle: l.customTitle || null,
        customDescription: l.customDescription || null,
        customSku: l.customSku || null,
        customCategory: l.customCategory || null,
        priceMode: l.priceMode,
        priceValue: l.priceValue,
        minPrice: l.minPrice,
        campaignPrice: l.campaignPrice,
        stockMode: l.stockMode,
        stockValue: l.stockValue,
        minStockShow: l.minStockShow,
        maxStockShow: l.maxStockShow,
        stopBelowCritical: l.stopBelowCritical,
      };
      const r = await fetch(`${apiBase}/channels/products/${editing.product.id}/${channelKey}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "fail");
      toast({ title: "Kaydedildi" });
      setEditing(null);
      await load();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <Link href="/channels">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kanallar
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{channelLabel}</h1>
            {credentials?.configured && credentials.mode === "test" && (
              <Badge variant="outline" className="border-amber-500 text-amber-300 bg-amber-500/10">
                <AlertTriangle className="h-3 w-3 mr-1" />
                TEST MODU
              </Badge>
            )}
            {credentials?.configured && credentials.mode === "live" && credentials.isActive && (
              <Badge className="bg-emerald-600 text-white">CANLI</Badge>
            )}
            {credentials?.lastSyncStatus === "success" && (
              <Badge variant="outline" className="border-emerald-500 text-emerald-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Son senkron OK
              </Badge>
            )}
            {credentials?.lastSyncStatus === "error" && (
              <Badge variant="outline" className="border-red-500 text-red-300">
                <XCircle className="h-3 w-3 mr-1" />
                Son senkron hata
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Bu kanaldaki ürün listeleme, fiyat ve stok ayarları
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">
            <span className="font-bold text-foreground">{rows.filter((r) => r.isEnabled).length}</span>{" "}
            / {rows.length} aktif
          </span>
          <Button variant="outline" size="sm" onClick={downloadExcel}>
            <Download className="h-4 w-4 mr-2" />
            Excel İndir
          </Button>
          {hasAdapter && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCredDialogOpen(true)}>
                <KeyRound className="h-4 w-4 mr-2" />
                Bağlantı
              </Button>
              <Button variant="outline" size="sm" onClick={openLogs}>
                <History className="h-4 w-4 mr-2" />
                Geçmiş
              </Button>
              <Button size="sm" onClick={triggerSync} disabled={syncBusy}>
                {syncBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Senkronize Et
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ürün ara..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterEnabled} onValueChange={(v: any) => setFilterEnabled(v)}>
          <SelectTrigger className="sm:w-44">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="on">Sadece aktif</SelectItem>
            <SelectItem value="off">Sadece pasif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">Ürün bulunamadı</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Ürün</th>
                    <th className="text-right px-4 py-3">Ana Fiyat</th>
                    <th className="text-right px-4 py-3">Kanal Fiyat</th>
                    <th className="text-right px-4 py-3">Ana Stok</th>
                    <th className="text-right px-4 py-3">Kanal Stok</th>
                    <th className="text-center px-4 py-3">Aktif</th>
                    <th className="text-center px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 300).map((r) => (
                    <tr key={r.product.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <p className="font-medium truncate max-w-xs">{r.product.name}</p>
                        <code className="text-xs text-muted-foreground font-mono">
                          {r.product.productCode}
                        </code>
                      </td>
                      <td className="text-right px-4 py-2 tabular-nums">
                        ₺{r.product.salePrice.toLocaleString("tr-TR")}
                      </td>
                      <td className="text-right px-4 py-2 tabular-nums">
                        <span
                          className={
                            r.effectivePrice !== r.product.salePrice
                              ? "font-bold text-violet-400"
                              : "text-muted-foreground"
                          }
                        >
                          ₺{r.effectivePrice.toLocaleString("tr-TR")}
                        </span>
                        {r.listing && r.listing.priceMode !== "base" && r.listing.priceMode !== "fixed" && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {PRICE_MODE_LABEL[r.listing.priceMode]}
                          </Badge>
                        )}
                      </td>
                      <td className="text-right px-4 py-2 tabular-nums text-muted-foreground">
                        {r.product.stock}
                      </td>
                      <td className="text-right px-4 py-2 tabular-nums">
                        <span
                          className={
                            r.effectiveStock !== r.product.stock
                              ? "font-bold text-violet-400"
                              : "text-muted-foreground"
                          }
                        >
                          {r.effectiveStock}
                        </span>
                        {r.listing && r.listing.stockMode !== "full" && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {STOCK_MODE_LABEL[r.listing.stockMode]}
                          </Badge>
                        )}
                      </td>
                      <td className="text-center px-4 py-2">
                        <Switch checked={r.isEnabled} onCheckedChange={(v) => quickToggle(r, v)} />
                      </td>
                      <td className="text-center px-4 py-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 300 && (
                <p className="text-xs text-center text-muted-foreground py-2 border-t">
                  İlk 300 kayıt gösteriliyor — aramayla daraltın
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.product.name} — {channelLabel}
            </DialogTitle>
          </DialogHeader>
          {editing && editing.listing && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Bu kanalda yayında</span>
                <Switch
                  checked={editing.listing.isEnabled}
                  onCheckedChange={(v) =>
                    setEditing({ ...editing, listing: { ...editing.listing!, isEnabled: v } })
                  }
                />
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">İçerik Override</h3>
                <Input
                  placeholder={`Başlık (boş = orijinal: ${editing.product.name})`}
                  value={editing.listing.customTitle ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, listing: { ...editing.listing!, customTitle: e.target.value } })
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="SKU override"
                    value={editing.listing.customSku ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, listing: { ...editing.listing!, customSku: e.target.value } })
                    }
                  />
                  <Input
                    placeholder="Kategori override"
                    value={editing.listing.customCategory ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, listing: { ...editing.listing!, customCategory: e.target.value } })
                    }
                  />
                </div>
                <Textarea
                  rows={2}
                  placeholder="Açıklama override"
                  value={editing.listing.customDescription ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      listing: { ...editing.listing!, customDescription: e.target.value },
                    })
                  }
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Fiyat Motoru (ana ₺{editing.product.salePrice})</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={editing.listing.priceMode}
                    onValueChange={(v) =>
                      setEditing({ ...editing, listing: { ...editing.listing!, priceMode: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Ana fiyatı kullan</SelectItem>
                      <SelectItem value="fixed">Sabit fiyat (₺)</SelectItem>
                      <SelectItem value="markup_pct">Yüzde ekle (%)</SelectItem>
                      <SelectItem value="markup_amount">Sabit ekle (+₺)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Değer"
                    disabled={editing.listing.priceMode === "base"}
                    value={editing.listing.priceValue ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        listing: {
                          ...editing.listing!,
                          priceValue: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min fiyat (alta düşmesin)"
                    value={editing.listing.minPrice ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        listing: {
                          ...editing.listing!,
                          minPrice: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Kampanya fiyatı"
                    value={editing.listing.campaignPrice ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        listing: {
                          ...editing.listing!,
                          campaignPrice: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Stok Motoru (ana: {editing.product.stock})</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={editing.listing.stockMode}
                    onValueChange={(v) =>
                      setEditing({ ...editing, listing: { ...editing.listing!, stockMode: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Tüm stoğu göster</SelectItem>
                      <SelectItem value="buffer">Tampon (-) düş</SelectItem>
                      <SelectItem value="fixed">Sabit miktar göster</SelectItem>
                      <SelectItem value="percent">Yüzde göster</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Değer"
                    disabled={editing.listing.stockMode === "full"}
                    value={editing.listing.stockValue ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        listing: {
                          ...editing.listing!,
                          stockValue: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id="critical"
                    checked={editing.listing.stopBelowCritical}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        listing: { ...editing.listing!, stopBelowCritical: e.target.checked },
                      })
                    }
                  />
                  <label htmlFor="critical">
                    Kritik stoğa düşünce yayını kapat (min: {editing.product.minStock})
                  </label>
                </div>
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Vazgeç
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Kaydet</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{channelLabel} — Bağlantı Ayarları</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
              <strong>Önemli:</strong> Mevcut gizli alanlar maskeli ("sk***et") gösterilir. Değiştirmek
              istemiyorsanız o alana dokunmayın; sistem mevcut değeri korur. Tamamen yeni bir değer
              yazarsanız üzerine yazılır.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Mod</label>
                <Select value={credForm.mode} onValueChange={(v: any) => setCredForm({ ...credForm, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">TEST (gerçek API'a gönderilmez)</SelectItem>
                    <SelectItem value="live">CANLI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Aktif</label>
                <div className="flex items-center h-9">
                  <Switch
                    checked={credForm.isActive}
                    onCheckedChange={(v) => setCredForm({ ...credForm, isActive: v })}
                  />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {credForm.isActive ? "Senkron yapılır" : "Pasif"}
                  </span>
                </div>
              </div>
            </div>

            {(credentialFields[channelKey] ?? []).map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium">{f.label}</label>
                <Input
                  type={f.secret ? "text" : "text"}
                  value={credForm.fields[f.key] ?? ""}
                  onChange={(e) =>
                    setCredForm({ ...credForm, fields: { ...credForm.fields, [f.key]: e.target.value } })
                  }
                  placeholder={f.secret ? "Gizli — değişmesin diye boş bırakın" : ""}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredDialogOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button onClick={saveCredentials} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Kaydet</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{channelLabel} — Senkronizasyon Geçmişi</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">Kayıt yok</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-2">Zaman</th>
                    <th className="text-left px-2 py-2">İşlem</th>
                    <th className="text-left px-2 py-2">Ürün</th>
                    <th className="text-left px-2 py-2">Durum</th>
                    <th className="text-left px-2 py-2">Mod</th>
                    <th className="text-right px-2 py-2">ms</th>
                    <th className="text-left px-2 py-2">Hata</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString("tr-TR")}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{l.operation}</td>
                      <td className="px-2 py-1.5 tabular-nums">{l.productId ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {l.status === "success" ? (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-300 text-xs">OK</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500 text-red-300 text-xs">{l.status}</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge variant="outline" className="text-xs">{l.mode}</Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.durationMs ?? "—"}</td>
                      <td className="px-2 py-1.5 text-red-300 truncate max-w-xs" title={l.errorMessage ?? ""}>
                        {l.errorMessage ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsDialogOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
