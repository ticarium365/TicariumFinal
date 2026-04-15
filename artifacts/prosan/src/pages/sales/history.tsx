import { useState } from "react";
import { useListSales, getListSalesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function SalesHistory() {
  const [page, setPage] = useState(1);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-8 w-8 text-primary" />
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Saat</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-right">Birim Fiyat</TableHead>
                <TableHead className="text-center">Adet</TableHead>
                <TableHead className="text-right">Toplam Fiyat</TableHead>
                <TableHead className="text-right hidden md:table-cell">Kâr</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Yükleniyor...</TableCell>
                </TableRow>
              ) : !data?.sales?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Bu tarihte satış bulunmamaktadır.</TableCell>
                </TableRow>
              ) : (
                data.sales.map(sale => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.productName}
                      <div className="text-xs text-muted-foreground font-mono">{sale.productCode}</div>
                    </TableCell>
                    <TableCell className="text-right">{sale.unitPrice.toFixed(2)} TL</TableCell>
                    <TableCell className="text-center font-bold">x{sale.quantity}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{sale.totalPrice.toFixed(2)} TL</TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <span className="text-success font-medium">+{sale.profit.toFixed(2)} TL</span>
                    </TableCell>
                  </TableRow>
                ))
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
    </div>
  );
}

// Inline Label for the filter to avoid creating a new file just for this import in this context if not standard.
import { Label } from "@/components/ui/label";