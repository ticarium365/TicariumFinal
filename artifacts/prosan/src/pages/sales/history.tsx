import { useState } from "react";
import { useListSales, getListSalesQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function useReturnSale() {
  return useMutation({
    mutationFn: async ({ saleId, note }: { saleId: number; note?: string }) => {
      const res = await fetch(`/api/sales/${saleId}/return`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "İade başarısız");
      }
      return res.json();
    },
  });
}

export default function SalesHistory() {
  const [page, setPage] = useState(1);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const returnSale = useReturnSale();

  const [returnDialog, setReturnDialog] = useState<{ id: number; name: string; qty: number } | null>(null);
  const [returnNote, setReturnNote] = useState("");

  const { data, isLoading } = useListSales({
    query: {
      queryKey: getListSalesQueryKey({ startDate: dateStr, endDate: dateStr, page, limit: 50 })
    }
  }, {
    startDate: dateStr,
    endDate: dateStr,
    page,
    limit: 50
  });

  const handleReturn = async () => {
    if (!returnDialog) return;
    try {
      await returnSale.mutateAsync({ saleId: returnDialog.id, note: returnNote });
      toast({ title: "İade kaydedildi", description: `${returnDialog.name} — ${returnDialog.qty} adet iade edildi, stok güncellendi.` });
      setReturnDialog(null);
      setReturnNote("");
      queryClient.invalidateQueries({ queryKey: getListSalesQueryKey({ startDate: dateStr, endDate: dateStr, page, limit: 50 }) });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    }
  };

  const totalRevenue = data?.sales?.filter(s => !(s as any).returned).reduce((s, r) => s + r.totalPrice, 0) ?? 0;
  const totalProfit = data?.sales?.filter(s => !(s as any).returned).reduce((s, r) => s + r.profit, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Satış Geçmişi
        </h1>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap font-medium" htmlFor="dateFilter">Tarih:</Label>
          <Input
            id="dateFilter"
            type="date"
            value={dateStr}
            onChange={e => { setDateStr(e.target.value); setPage(1); }}
            className="w-auto"
          />
        </div>
      </div>

      {/* Özet kartlar */}
      {data?.sales && data.sales.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Satış Adedi</p>
            <p className="text-xl font-bold">{data.sales.filter(s => !(s as any).returned).length}</p>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Toplam Ciro</p>
            <p className="text-xl font-bold text-primary">{totalRevenue.toFixed(2)} TL</p>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Toplam Kâr</p>
            <p className="text-xl font-bold text-emerald-600">{totalProfit.toFixed(2)} TL</p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Saat</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-right">Birim</TableHead>
                <TableHead className="text-center">Adet</TableHead>
                <TableHead className="text-right">Toplam</TableHead>
                <TableHead className="text-right hidden md:table-cell">Kâr</TableHead>
                <TableHead className="w-[90px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Yükleniyor...</TableCell>
                </TableRow>
              ) : !data?.sales?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Bu tarihte satış bulunmamaktadır.</TableCell>
                </TableRow>
              ) : (
                data.sales.map(sale => {
                  const isReturned = (sale as any).returned as boolean;
                  return (
                  <TableRow key={sale.id} className={isReturned ? "opacity-50 bg-muted/20" : ""}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {sale.productName}
                        {isReturned && <Badge variant="secondary" className="text-[10px] h-4 px-1">İade</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{sale.productCode}</div>
                    </TableCell>
                    <TableCell className="text-right">{sale.unitPrice.toFixed(2)} TL</TableCell>
                    <TableCell className="text-center font-bold">x{sale.quantity}</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {isReturned ? <span className="line-through text-muted-foreground">{sale.totalPrice.toFixed(2)} TL</span> : `${sale.totalPrice.toFixed(2)} TL`}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <span className="text-emerald-600 font-medium">+{sale.profit.toFixed(2)} TL</span>
                    </TableCell>
                    <TableCell>
                      {!isReturned && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setReturnNote(""); setReturnDialog({ id: sale.id, name: sale.productName, qty: sale.quantity }); }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />İade
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {data && data.totalPages > 1 && (
            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Sayfa {page} / {data.totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>Önceki</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === data.totalPages}>Sonraki</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* İade Dialog */}
      <Dialog open={!!returnDialog} onOpenChange={() => { setReturnDialog(null); setReturnNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Satış İadesi</DialogTitle>
            <DialogDescription>
              <span className="font-bold">{returnDialog?.name}</span> — {returnDialog?.qty} adet iade edilecek.
              Stok otomatik olarak geri yüklenecek.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="returnNote">İade Notu (isteğe bağlı)</Label>
            <Input
              id="returnNote"
              placeholder="İade sebebi..."
              value={returnNote}
              onChange={e => setReturnNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnDialog(null)}>İptal</Button>
            <Button variant="destructive" onClick={handleReturn} disabled={returnSale.isPending}>
              {returnSale.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              İadeyi Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
