import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DollarSign, ArrowRightLeft, Plus } from "lucide-react";

type Rate = { id: number; currency: string; rate: number; asOf: string; source: string };

export default function CurrencyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<{ supported: string[]; latest: Record<string, Rate>; history: Rate[] }>({
    queryKey: ["/api/currency/rates"],
    queryFn: async () => (await fetch("/api/currency/rates", { credentials: "include" })).json(),
  });

  const [newCurrency, setNewCurrency] = useState("USD");
  const [newRate, setNewRate] = useState("");
  const [convAmount, setConvAmount] = useState("100");
  const [convFrom, setConvFrom] = useState("USD");
  const [convTo, setConvTo] = useState("TRY");
  const [convResult, setConvResult] = useState<{ result: number; rate: number } | null>(null);

  async function addRate() {
    const r = await fetch("/api/currency/rates", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: newCurrency, rate: Number(newRate) }),
    });
    if (!r.ok) {
      const e = await r.json();
      { toast({ title: "Hata", description: e.error, variant: "destructive" }); return; }
    }
    toast({ title: `${newCurrency} kuru güncellendi` });
    setNewRate(""); qc.invalidateQueries({ queryKey: ["/api/currency/rates"] });
  }

  async function convert() {
    const url = `/api/currency/convert?amount=${convAmount}&from=${convFrom}&to=${convTo}`;
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) {
      const e = await r.json();
      setConvResult(null);
      { toast({ title: "Hata", description: e.error, variant: "destructive" }); return; }
    }
    setConvResult(await r.json());
  }

  const latest = data?.latest || {};
  const supported = data?.supported || [];

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-currency">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <DollarSign className="h-7 w-7 text-primary" /> Çoklu Para Birimi
        </h1>
        <p className="text-muted-foreground">USD, EUR, GBP gibi para birimleri için kur yönetimi (TRY bazlı).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Mevcut Kurlar (1 birim = ? TRY)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Para Birimi</TableHead>
                  <TableHead className="text-right">Kur (TRY)</TableHead>
                  <TableHead>Güncellendi</TableHead>
                  <TableHead>Kaynak</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supported.map((cu) => {
                  const r = latest[cu];
                  return (
                    <TableRow key={cu} data-testid={`rate-${cu}`}>
                      <TableCell className="font-bold">{cu}</TableCell>
                      <TableCell className="text-right font-mono">{r ? r.rate.toFixed(4) : "—"}</TableCell>
                      <TableCell className="text-xs">{r ? new Date(r.asOf).toLocaleString("tr-TR") : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r?.source || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Plus className="h-4 w-4 inline mr-1" /> Kur Ekle / Güncelle</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Para Birimi</Label>
              <Select value={newCurrency} onValueChange={setNewCurrency}>
                <SelectTrigger data-testid="select-new-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {supported.map((cu) => <SelectItem key={cu} value={cu}>{cu}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>1 birim {newCurrency} = ? TRY</Label>
              <Input type="number" min="0.0001" step="0.0001" value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="32.50" data-testid="input-new-rate" />
            </div>
            <Button onClick={addRate} disabled={!newRate} data-testid="btn-add-rate">Kaydet</Button>
            <p className="text-xs text-muted-foreground">Her kayıt yeni bir geçmiş satır oluşturur; en son yazılan kullanılır.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle><ArrowRightLeft className="h-4 w-4 inline mr-1" /> Çevirici</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <Label>Tutar</Label>
                <Input type="number" value={convAmount} onChange={(e) => setConvAmount(e.target.value)} data-testid="input-conv-amount" />
              </div>
              <div>
                <Label>Kaynak</Label>
                <Select value={convFrom} onValueChange={setConvFrom}>
                  <SelectTrigger data-testid="select-conv-from"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY">TRY</SelectItem>
                    {supported.map((cu) => <SelectItem key={cu} value={cu}>{cu}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hedef</Label>
                <Select value={convTo} onValueChange={setConvTo}>
                  <SelectTrigger data-testid="select-conv-to"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY">TRY</SelectItem>
                    {supported.map((cu) => <SelectItem key={cu} value={cu}>{cu}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button onClick={convert} className="w-full" data-testid="btn-convert">Çevir</Button>
              </div>
              <div className="text-right">
                {convResult && (
                  <div data-testid="conv-result">
                    <div className="text-2xl font-bold font-mono">{convResult.result.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</div>
                    <div className="text-xs text-muted-foreground">kur: {convResult.rate.toFixed(4)}</div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {data?.history && data.history.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Kur Geçmişi (son {data.history.length} kayıt)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Birim</TableHead>
                  <TableHead className="text-right">Kur</TableHead>
                  <TableHead>Kaynak</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.slice(0, 20).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{new Date(h.asOf).toLocaleString("tr-TR")}</TableCell>
                    <TableCell>{h.currency}</TableCell>
                    <TableCell className="text-right font-mono">{h.rate.toFixed(4)}</TableCell>
                    <TableCell className="text-xs">{h.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
