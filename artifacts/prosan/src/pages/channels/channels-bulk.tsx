import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Wand2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import { apiBase } from "@/lib/api";

interface ChannelDef {
  key: string;
  label: string;
  color: string;
}

type ActionType =
  | "enable"
  | "disable"
  | "set_price_mode"
  | "set_min_price"
  | "set_stock_mode"
  | "set_stop_below_critical"
  | "set_campaign";

export default function ChannelsBulkPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<ChannelDef[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [minStockGte, setMinStockGte] = useState("");

  const [actionType, setActionType] = useState<ActionType>("enable");
  const [priceMode, setPriceMode] = useState("markup_pct");
  const [priceValue, setPriceValue] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [stockMode, setStockMode] = useState("buffer");
  const [stockValue, setStockValue] = useState("");
  const [campaignPrice, setCampaignPrice] = useState("");
  const [campaignStarts, setCampaignStarts] = useState("");
  const [campaignEnds, setCampaignEnds] = useState("");

  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  useEffect(() => {
    fetch(`${apiBase}/channels`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setChannels(Array.isArray(d) ? d : []));
  }, []);

  function toggleChannel(k: string) {
    const s = new Set(selectedChannels);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setSelectedChannels(s);
  }

  async function execute() {
    if (selectedChannels.size === 0) {
      toast({ title: "En az 1 kanal seçin", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const filter: any = {};
      if (brand.trim()) filter.brand = brand.trim();
      if (category.trim()) filter.category = category.trim();
      if (maxStock.trim()) filter.maxStock = Number(maxStock);
      if (minStockGte.trim()) filter.minStockGte = Number(minStockGte);

      let action: any = { type: actionType };
      if (actionType === "set_price_mode") {
        action.mode = priceMode;
        action.value = priceValue.trim() ? Number(priceValue) : null;
      } else if (actionType === "set_min_price") {
        action.minPrice = minPrice.trim() ? Number(minPrice) : null;
      } else if (actionType === "set_stock_mode") {
        action.mode = stockMode;
        action.value = stockValue.trim() ? Number(stockValue) : null;
      } else if (actionType === "set_stop_below_critical") {
        action.value = true;
      } else if (actionType === "set_campaign") {
        action.campaignPrice = campaignPrice.trim() ? Number(campaignPrice) : null;
        action.startsAt = campaignStarts ? new Date(campaignStarts).toISOString() : null;
        action.endsAt = campaignEnds ? new Date(campaignEnds).toISOString() : null;
      }

      const r = await fetch(`${apiBase}/channels/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter,
          channels: Array.from(selectedChannels),
          action,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "fail");
      setLastResult(d);
      toast({
        title: "Toplu işlem tamamlandı",
        description: `${d.productCount} ürün × ${d.channels.length} kanal — ${d.affected} kayıt güncellendi`,
      });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnlineSalesFeatureGate>
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <Link href="/channels">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kanallar
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-primary" />
          Toplu İşlem Merkezi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Filtre belirle → kanallara uygulanacak işlemi seç → tek tıkla 1000 ürün güncelle
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Hangi ürünler?</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Marka</label>
            <Input
              placeholder="Boş = tümü"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Kategori</label>
            <Input
              placeholder="Boş = tümü"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Max stok ≤</label>
            <Input
              type="number"
              placeholder="Sınırsız"
              value={maxStock}
              onChange={(e) => setMaxStock(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Min stok ≥</label>
            <Input
              type="number"
              placeholder="Sınırsız"
              value={minStockGte}
              onChange={(e) => setMinStockGte(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Hangi kanallara?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => {
              const sel = selectedChannels.has(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() => toggleChannel(c.key)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    sel
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                  style={sel ? { backgroundColor: c.color, borderColor: c.color, color: "white" } : {}}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Hangi işlem?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={actionType} onValueChange={(v: ActionType) => setActionType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enable">Yayına al (aktif)</SelectItem>
              <SelectItem value="disable">Yayını kapat (pasif)</SelectItem>
              <SelectItem value="set_price_mode">Fiyatlama kuralı</SelectItem>
              <SelectItem value="set_min_price">Min fiyat belirle</SelectItem>
              <SelectItem value="set_stock_mode">Stok gösterim kuralı</SelectItem>
              <SelectItem value="set_stop_below_critical">Kritik stokta yayını durdur</SelectItem>
              <SelectItem value="set_campaign">Kampanya fiyatı ata</SelectItem>
            </SelectContent>
          </Select>

          {actionType === "set_price_mode" && (
            <div className="grid grid-cols-2 gap-2">
              <Select value={priceMode} onValueChange={setPriceMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Sabit fiyat (₺)</SelectItem>
                  <SelectItem value="markup_pct">Yüzde ekle (%)</SelectItem>
                  <SelectItem value="markup_amount">Sabit ekle (+₺)</SelectItem>
                  <SelectItem value="base">Ana fiyatı kullan</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Değer"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
              />
            </div>
          )}

          {actionType === "set_min_price" && (
            <Input
              type="number"
              placeholder="Min fiyat (boş = kaldır)"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          )}

          {actionType === "set_stock_mode" && (
            <div className="grid grid-cols-2 gap-2">
              <Select value={stockMode} onValueChange={setStockMode}>
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
                value={stockValue}
                onChange={(e) => setStockValue(e.target.value)}
              />
            </div>
          )}

          {actionType === "set_campaign" && (
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Kampanya fiyatı (boş = kaldır)"
                value={campaignPrice}
                onChange={(e) => setCampaignPrice(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="datetime-local"
                  value={campaignStarts}
                  onChange={(e) => setCampaignStarts(e.target.value)}
                />
                <Input
                  type="datetime-local"
                  value={campaignEnds}
                  onChange={(e) => setCampaignEnds(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/10/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium">İşlem geri alınamaz</p>
            <p className="text-muted-foreground">
              {selectedChannels.size > 0
                ? `${selectedChannels.size} kanalda filtreye uyan tüm ürünleri etkileyecek.`
                : "Henüz kanal seçilmedi."}
            </p>
          </div>
          <Button onClick={execute} disabled={busy || selectedChannels.size === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Uygula"}
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Son işlem sonucu</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              <Badge variant="secondary">{lastResult.productCount} ürün</Badge>{" "}
              × <Badge variant="secondary">{lastResult.channels?.length} kanal</Badge>
            </p>
            <p className="text-muted-foreground">{lastResult.affected} kayıt yazıldı/güncellendi.</p>
          </CardContent>
        </Card>
      )}
    </div>
    </OnlineSalesFeatureGate>
  );
}
