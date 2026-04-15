import { useState } from "react";
import { useGetSalesReport, useGetStockReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, TrendingUp, Package, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, subDays } from "date-fns";

export default function Reports() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: salesData, isLoading: salesLoading } = useGetSalesReport({ query: { enabled: !!startDate && !!endDate }}, { startDate, endDate });
  const { data: stockData, isLoading: stockLoading } = useGetStockReport();

  const formatCurrency = (val: number | undefined) => (val || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Raporlar</h1>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          PDF İndir
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
          <div className="space-y-1">
            <Label htmlFor="start">Başlangıç</Label>
            <Input id="start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end">Bitiş</Label>
            <Input id="end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Brüt Ciro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(salesData?.grossRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">{salesData?.totalSales} işlem</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Ciro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(salesData?.netRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Kâr</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{formatCurrency(salesData?.totalProfit)}</div>
              <p className="text-xs text-muted-foreground mt-1">Ort. %{(salesData?.profitPercent || 0).toFixed(1)} Marj</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Satılan Ürün</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{salesData?.totalQuantity || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Adet</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Ürün Bazlı Satışlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Ciro</TableHead>
                    <TableHead className="text-right">Kâr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesData?.productBreakdown?.slice(0,10).map(p => (
                    <TableRow key={p.productId}>
                      <TableCell className="font-medium text-sm">
                        {p.productName}
                        <div className="text-xs text-muted-foreground font-mono">{p.productCode}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">{p.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                      <TableCell className="text-right text-success">{formatCurrency(p.profit)}</TableCell>
                    </TableRow>
                  ))}
                  {(!salesData?.productBreakdown || salesData.productBreakdown.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Veri yok</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
             <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-secondary-foreground" />
                Stok Durumu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Toplam Depo Değeri (Alış)</p>
                  <p className="text-xl font-bold">{formatCurrency(stockData?.totalStockValue)}</p>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Kayıtlı Ürün Çeşidi</p>
                  <p className="text-xl font-bold font-mono">{stockData?.totalProducts || 0}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> 
                  Tükenen Ürünler
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kod</TableHead>
                      <TableHead>Ürün</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockData?.outOfStock?.slice(0,5).map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.productCode}</TableCell>
                        <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      </TableRow>
                    ))}
                    {(!stockData?.outOfStock || stockData.outOfStock.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-2 text-muted-foreground">Tükenen ürün yok</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}