import { useGetDashboardStats, useGetTodaySales, useGetTopProducts, useGetCriticalStock } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, TrendingUp, DollarSign, Activity, ShoppingCart, ScanBarcode } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: todaySales, isLoading: salesLoading } = useGetTodaySales();
  const { data: topProducts, isLoading: topLoading } = useGetTopProducts();
  const { data: criticalStock, isLoading: criticalLoading } = useGetCriticalStock();

  const isLoading = statsLoading || salesLoading || topLoading || criticalLoading;

  if (isLoading) {
    return <div className="p-8">Yükleniyor...</div>;
  }

  const formatCurrency = (value: number | undefined) => {
    return (value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Ana Panel</h1>
      </div>

      {/* Hızlı Satış Butonu */}
      <Link href="/sales">
        <div className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:from-orange-700 active:to-orange-800 transition-all shadow-lg cursor-pointer">
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <p className="text-white/80 text-sm font-medium uppercase tracking-wider">Hızlı İşlem</p>
              <p className="text-white text-2xl font-bold mt-0.5">Barkod ile Satış Yap</p>
              <p className="text-white/70 text-sm mt-1">Kamera ile barkod oku, sepete ekle, satışı tamamla</p>
            </div>
            <div className="bg-white/20 rounded-full p-4 shrink-0">
              <ScanBarcode className="h-9 w-9 text-white" />
            </div>
          </div>
        </div>
      </Link>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Günlük Ciro</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.todayGrossRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.todaySalesCount} adet satış yapıldı
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Günlük Kâr</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(stats?.todayProfit)}</div>
            <p className="text-xs text-muted-foreground">
              Ortalama {stats?.todayProfitPercent?.toFixed(1)}% marj
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Ürün</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              Sistemde kayıtlı aktif ürün
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Kritik Stok</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.criticalStockCount}</div>
            <p className="text-xs text-muted-foreground">
              Ürün minimum stok seviyesinin altında
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Critical Stock List */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Kritik Stok Uyarıları
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Min.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criticalStock?.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {product.name}
                      <div className="text-xs text-muted-foreground">{product.productCode}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={product.stock === 0 ? "destructive" : "secondary"} className="font-mono">
                        {product.stock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-mono">{product.minStock}</TableCell>
                  </TableRow>
                ))}
                {!criticalStock?.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      Kritik stokta ürün bulunmamaktadır.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Çok Satanlar (30 Gün)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Satış</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts?.topSelling?.slice(0, 5).map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {product.name}
                      <div className="text-xs text-muted-foreground">{product.productCode}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-success">
                      +{product.sales30Days}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {product.stock}
                    </TableCell>
                  </TableRow>
                ))}
                {!topProducts?.topSelling?.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      Henüz satış verisi yok.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}