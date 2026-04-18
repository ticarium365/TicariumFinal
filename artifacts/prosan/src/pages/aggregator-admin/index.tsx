import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBasket, Play, Pause, Trash2, RefreshCw, Star, ExternalLink } from "lucide-react";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(n || 0));

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error((await r.text()) || `${r.status}`);
  return r.json();
}

export default function AggregatorAdminPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [marginPct, setMarginPct] = useState("15");
  const [scanning, setScanning] = useState(false);

  async function load() {
    try {
      const [list, st] = await Promise.all([
        api("/aggregator/listings"),
        api("/aggregator/stats"),
      ]);
      setRows(list); setStats(st);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Yüklenemedi", description: String(e.message || e) });
    }
  }
  useEffect(() => { load(); }, []);

  async function scan() {
    setScanning(true);
    try {
      const r = await api("/aggregator/scan", { method: "POST", body: JSON.stringify({ marginPct: Number(marginPct) }) });
      toast({ title: "Tarama tamam", description: `Eklendi: ${r.inserted}, Güncellendi: ${r.updated}, Toplam: ${r.scanned}` });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    } finally { setScanning(false); }
  }

  async function activate(id: number) { await api(`/aggregator/listings/${id}/activate`, { method: "POST" }); load(); }
  async function pause(id: number) { await api(`/aggregator/listings/${id}/pause`, { method: "POST" }); load(); }
  async function del(id: number) { if (!confirm("Sil?")) return; await api(`/aggregator/listings/${id}`, { method: "DELETE" }); load(); }
  async function changeMargin(id: number, pct: string) {
    if (!pct) return;
    await api(`/aggregator/listings/${id}`, { method: "PUT", body: JSON.stringify({ marginPct: Number(pct) }) });
    load();
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBasket className="h-6 w-6 text-orange-500" /> Ticarium Pazar Yönetimi</h1>
          <p className="text-sm text-muted-foreground">Ürünlerinizi merkezi pazarımızda satışa sunun. Aynı ürün için en ucuz tedarikçi otomatik seçilir.</p>
        </div>
        <a href="/pazar" target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-1" /> Pazarı Görüntüle</Button>
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Aday</div><div className="text-2xl font-bold">{stats.candidate || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Aktif</div><div className="text-2xl font-bold text-green-600">{stats.active || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Duraklatıldı</div><div className="text-2xl font-bold">{stats.paused || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Seçilen (en ucuz)</div><div className="text-2xl font-bold flex items-center gap-1"><Star className="h-5 w-5 text-amber-500" /> {stats.chosen || 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ürünleri Tara</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div>
              <Label>Marj %</Label>
              <Input className="w-24" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </div>
            <Button onClick={scan} disabled={scanning}>
              <RefreshCw className={`h-4 w-4 mr-1 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Taranıyor..." : "Aktif ürünlerimi pazara aktar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Aktif ürünleriniz aday liste olarak eklenir. Her ürün için en düşük fiyatlı tedarikçi otomatik "seçilen" olarak işaretlenir.
            Aktif edildikten sonra pazarda görünür.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pazar Listelerim</CardTitle></CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ürün</TableHead><TableHead>Stok</TableHead>
                <TableHead className="text-right">Maliyetim</TableHead>
                <TableHead className="text-right">Marj %</TableHead>
                <TableHead className="text-right">Pazar Fiyatı</TableHead>
                <TableHead>Durum</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.productName}</div>
                      <div className="text-xs text-muted-foreground">{r.barcode || "—"}</div>
                    </TableCell>
                    <TableCell>{r.stock || 0}</TableCell>
                    <TableCell className="text-right">{fmt(r.sourcePrice)}</TableCell>
                    <TableCell className="text-right">
                      <Input className="w-20 inline-block" defaultValue={r.marginPct} onBlur={(e) => changeMargin(r.id, e.target.value)} />
                    </TableCell>
                    <TableCell className="text-right font-bold text-orange-600">{fmt(r.salePrice)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={r.status === "active" ? "default" : r.status === "paused" ? "secondary" : "outline"}>{r.status}</Badge>
                        {r.chosen && <Star className="h-4 w-4 text-amber-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {r.status !== "active" && <Button size="sm" variant="ghost" onClick={() => activate(r.id)}><Play className="h-4 w-4 text-green-600" /></Button>}
                      {r.status === "active" && <Button size="sm" variant="ghost" onClick={() => pause(r.id)}><Pause className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Henüz pazara ürün eklenmemiş. Yukarıdan "Ürünleri Tara" ile başlayın.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
