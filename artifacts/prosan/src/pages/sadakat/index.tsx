import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Award, Settings as SettingsIcon, Plus, Trophy, History } from "lucide-react";

type Settings = { id: number; pointsPerHundredTL: number; tlPerPoint: number; minRedeemPoints: number; isActive: number };
type TopCustomer = { customerId: number; customerName: string; customerCode: string; balance: number };
type Customer = { id: number; name: string; code: string };
type Tx = { id: number; type: string; points: number; amount: number | null; note: string | null; createdAt: string };

export default function LoyaltyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/loyalty/settings"],
    queryFn: async () => (await fetch("/api/loyalty/settings", { credentials: "include" })).json(),
  });
  const { data: top = [] } = useQuery<TopCustomer[]>({
    queryKey: ["/api/loyalty/top-customers"],
    queryFn: async () => (await fetch("/api/loyalty/top-customers", { credentials: "include" })).json(),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const d = await (await fetch("/api/customers?limit=500", { credentials: "include" })).json();
      return Array.isArray(d) ? d : (d.customers || d.items || []);
    },
  });

  const [form, setForm] = useState<Partial<Settings>>({});
  const cur = { ...settings, ...form } as Settings;

  async function saveSettings() {
    const r = await fetch("/api/loyalty/settings", {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pointsPerHundredTL: cur.pointsPerHundredTL,
        tlPerPoint: cur.tlPerPoint,
        minRedeemPoints: cur.minRedeemPoints,
        isActive: cur.isActive ? true : false,
      }),
    });
    if (r.ok) { toast({ title: "Ayarlar kaydedildi" }); setForm({}); qc.invalidateQueries({ queryKey: ["/api/loyalty/settings"] }); }
    else toast({ title: "Hata", variant: "destructive" });
  }

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-loyalty">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Award className="h-7 w-7 text-primary" /> Sadakat & Puan Sistemi
        </h1>
        <p className="text-muted-foreground">Müşteri puan kazanımı, harcama ve sıralaması.</p>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard"><Trophy className="h-4 w-4 mr-1" />Sıralama</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings"><SettingsIcon className="h-4 w-4 mr-1" />Ayarlar</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setAdjustOpen(true)} data-testid="btn-adjust">
              <Plus className="h-4 w-4 mr-1" /> Manuel Puan İşlemi
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>En Çok Puanlı Müşteriler</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Müşteri</TableHead>
                    <TableHead>Kod</TableHead>
                    <TableHead className="text-right">Bakiye (puan)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Henüz puan hareketi yok.</TableCell></TableRow>
                  )}
                  {top.map((t, i) => (
                    <TableRow key={t.customerId} data-testid={`top-row-${t.customerId}`}>
                      <TableCell className="font-mono">{i + 1}</TableCell>
                      <TableCell>{t.customerName || `#${t.customerId}`}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.customerCode}</TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        <Badge variant={t.balance > 0 ? "default" : "secondary"}>{t.balance.toLocaleString("tr-TR")}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader><CardTitle>Sadakat Ayarları</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Sistem Aktif</Label>
                  <p className="text-xs text-muted-foreground">Kapalıyken yeni puan kazanılmaz.</p>
                </div>
                <Switch
                  checked={!!cur.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v ? 1 : 0 })}
                  data-testid="switch-active"
                />
              </div>
              <div>
                <Label>Her 100 TL satışta kazanılan puan</Label>
                <Input type="number" min="0" step="0.1" value={cur.pointsPerHundredTL ?? ""}
                  onChange={(e) => setForm({ ...form, pointsPerHundredTL: Number(e.target.value) })}
                  data-testid="input-points-per-tl" />
              </div>
              <div>
                <Label>1 puan = kaç TL indirim?</Label>
                <Input type="number" min="0" step="0.01" value={cur.tlPerPoint ?? ""}
                  onChange={(e) => setForm({ ...form, tlPerPoint: Number(e.target.value) })}
                  data-testid="input-tl-per-point" />
              </div>
              <div>
                <Label>Minimum harcanabilir puan</Label>
                <Input type="number" min="0" value={cur.minRedeemPoints ?? ""}
                  onChange={(e) => setForm({ ...form, minRedeemPoints: Number(e.target.value) })}
                  data-testid="input-min-redeem" />
              </div>
              <Button onClick={saveSettings} data-testid="btn-save-settings">Kaydet</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AdjustDialog open={adjustOpen} setOpen={setAdjustOpen} customers={customers} onDone={() => {
        qc.invalidateQueries({ queryKey: ["/api/loyalty/top-customers"] });
      }} />
    </div>
  );
}

function AdjustDialog({ open, setOpen, customers, onDone }: any) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState("earn");
  const [points, setPoints] = useState(10);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<Tx[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  async function loadHist(cid: string) {
    if (!cid) return;
    const [t, b] = await Promise.all([
      fetch(`/api/loyalty/customers/${cid}/transactions`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/loyalty/customers/${cid}/balance`, { credentials: "include" }).then((r) => r.json()),
    ]);
    setHistory(t); setBalance(b.balance);
  }

  async function save() {
    if (!customerId || !points) return toast({ title: "Müşteri ve puan zorunlu", variant: "destructive" });
    const signedPoints = type === "redeem" ? -Math.abs(points) : Math.abs(points);
    const r = await fetch(`/api/loyalty/customers/${customerId}/adjust`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: signedPoints, type, note }),
    });
    if (!r.ok) {
      const e = await r.json();
      return toast({ title: "Hata", description: e.error, variant: "destructive" });
    }
    toast({ title: "Puan işlemi kaydedildi" });
    setNote(""); loadHist(customerId); onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle><History className="h-5 w-5 inline mr-1" /> Manuel Puan İşlemi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Müşteri</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); loadHist(v); }}>
              <SelectTrigger data-testid="select-loyalty-customer"><SelectValue placeholder="Seç..." /></SelectTrigger>
              <SelectContent>
                {customers.map((c: Customer) => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {balance !== null && (
            <div className="p-2 bg-muted rounded text-center text-sm">Mevcut bakiye: <span className="font-bold font-mono" data-testid="text-current-balance">{balance}</span> puan</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tip</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="select-loyalty-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="earn">Kazanç</SelectItem>
                  <SelectItem value="redeem">Harcama</SelectItem>
                  <SelectItem value="adjust">Düzeltme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Puan</Label>
              <Input type="number" min="1" value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} data-testid="input-loyalty-points" />
            </div>
          </div>
          <div>
            <Label>Not</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Açıklama..." />
          </div>
          {history.length > 0 && (
            <div className="border rounded p-2 max-h-40 overflow-y-auto text-xs">
              <div className="font-semibold mb-1">Son hareketler</div>
              {history.slice(0, 10).map((h) => (
                <div key={h.id} className="flex justify-between border-b py-1">
                  <span>{h.type} • {new Date(h.createdAt).toLocaleDateString("tr-TR")}</span>
                  <span className={h.points > 0 ? "text-green-600" : "text-red-600"}>{h.points > 0 ? "+" : ""}{h.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Kapat</Button>
          <Button onClick={save} data-testid="btn-save-adjust">Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
