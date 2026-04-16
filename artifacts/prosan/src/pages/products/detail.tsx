import { useState, useEffect, useRef } from "react";
import { useGetProduct, useQuickUpdateProduct, getGetProductQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Save, Loader2, Printer, PackagePlus, TrendingDown, RotateCcw, Wrench, Activity } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";

interface StockMovement {
  id: number;
  type: string;
  quantity: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

function useProductMovements(productId: number) {
  return useQuery<{ movements: StockMovement[]; total: number }>({
    queryKey: ["stock-movements", productId],
    queryFn: async () => {
      const res = await fetch(`/api/stock/movements?productId=${productId}&limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch error");
      return res.json();
    },
    enabled: !!productId,
    staleTime: 30_000,
  });
}

const movementMeta: Record<string, { label: string; icon: React.ElementType; color: string; sign: string }> = {
  sale:       { label: "Satış",        icon: TrendingDown,  color: "text-rose-600",    sign: "-" },
  purchase:   { label: "Stok Girişi",  icon: PackagePlus,   color: "text-emerald-600", sign: "+" },
  return:     { label: "İade",         icon: RotateCcw,     color: "text-blue-600",    sign: "+" },
  correction: { label: "Düzeltme",     icon: Wrench,        color: "text-amber-600",   sign: "" },
};

export default function ProductDetail({ id }: { id: string }) {
  const productId = parseInt(id, 10);
  const { data: product, isLoading } = useGetProduct(productId, { query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId) } });
  const quickUpdate = useQuickUpdateProduct();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const barcodeSvgRef = useRef<SVGSVGElement>(null);
  const { data: movementsData } = useProductMovements(productId);

  const [editMode, setEditMode] = useState(false);
  const [quickData, setQuickData] = useState({
    stock: 0,
    purchasePrice: 0,
    salePrice: 0,
    profitPercent: 0,
    discountSalePct: 0
  });

  useEffect(() => {
    if (product) {
      setQuickData({
        stock: product.stock,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        profitPercent: product.profitPercent,
        discountSalePct: product.discountSalePct ?? 0
      });
    }
  }, [product]);

  const barcodeValue = product?.barcode || product?.productCode || "";

  useEffect(() => {
    if (barcodeSvgRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeSvgRef.current, barcodeValue, {
          format: barcodeValue.length === 13 ? "EAN13" : barcodeValue.length === 12 ? "EAN13" : "CODE128",
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 13,
          margin: 8,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {
        try {
          JsBarcode(barcodeSvgRef.current, barcodeValue, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 13,
            margin: 8,
          });
        } catch { /* barcode not renderable */ }
      }
    }
  }, [barcodeValue]);

  const handlePrintBarcode = () => {
    if (!barcodeSvgRef.current || !barcodeValue) return;
    const svgData = barcodeSvgRef.current.outerHTML;
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) return;
    win.document.write(`
      <html><head><title>Barkod - ${product?.name}</title>
      <style>body{margin:20px;font-family:sans-serif;text-align:center} h3{font-size:12px;margin-bottom:8px}</style>
      </head><body>
      <h3>${product?.name}</h3>
      ${svgData}
      <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>
    `);
    win.document.close();
  };

  const handleQuickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = value === '' ? 0 : Number(value);
    
    setQuickData(prev => {
      const newData = { ...prev, [name]: numValue };
      if (name === 'purchasePrice' && newData.purchasePrice > 0) {
        newData.salePrice = Number((newData.purchasePrice * (1 + newData.profitPercent / 100)).toFixed(2));
      } else if (name === 'salePrice' && prev.purchasePrice > 0) {
        newData.profitPercent = Number((((newData.salePrice - prev.purchasePrice) / prev.purchasePrice) * 100).toFixed(2));
      } else if (name === 'profitPercent' && prev.purchasePrice > 0) {
        newData.salePrice = Number((prev.purchasePrice * (1 + newData.profitPercent / 100)).toFixed(2));
      }
      return newData;
    });
  };

  const discountedPrice = (quickData.purchasePrice > 0 && quickData.discountSalePct > 0)
    ? quickData.purchasePrice * (1 + quickData.discountSalePct / 100)
    : null;

  const handleQuickSave = async () => {
    try {
      const updated = await quickUpdate.mutateAsync({ id: productId, data: quickData });
      toast({ title: "Başarılı", description: "Hızlı güncelleme yapıldı." });
      setEditMode(false);
      queryClient.setQueryData(getGetProductQueryKey(productId), updated);
    } catch (error) {
      toast({ title: "Hata", description: "Güncelleme başarısız.", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-8 text-center">Yükleniyor...</div>;
  if (!product) return <div className="p-8 text-center">Ürün bulunamadı.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/products">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
        </div>
        <Link href={`/products/${product.id}/edit`}>
          <Button variant="secondary">
            <Edit className="mr-2 h-4 w-4" />
            Tam Düzenle
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Ürün Detayları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Kategori</p>
                <p>{product.category || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Marka</p>
                <p>{product.brand || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ürün Kodu</p>
                <p className="font-mono">{product.productCode}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Barkod</p>
                <p className="font-mono">{product.barcode || "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-muted-foreground">Açıklama</p>
                <p className="whitespace-pre-wrap">{product.description || "-"}</p>
              </div>
            </div>

            {barcodeValue && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-muted-foreground">Barkod Etiketi</p>
                  <Button variant="outline" size="sm" onClick={handlePrintBarcode}>
                    <Printer className="h-4 w-4 mr-2" />
                    Yazdır
                  </Button>
                </div>
                <div className="flex justify-center bg-white rounded-md border p-3">
                  <svg ref={barcodeSvgRef} />
                </div>
              </div>
            )}

            <div className="border-t pt-4 grid grid-cols-2 gap-4 mt-4">
               <div>
                <p className="text-sm font-medium text-muted-foreground">Oluşturulma</p>
                <p>{product.createdAt ? new Date(product.createdAt).toLocaleDateString("tr-TR") : "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Son Güncelleme</p>
                <p>{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("tr-TR") : "-"}</p>
              </div>
               <div>
                <p className="text-sm font-medium text-muted-foreground">Son 30 Gün Görüntülenme</p>
                <p>{product.views30Days}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Son 30 Gün Satış</p>
                <p>{product.sales30Days}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle>Hızlı Yönetim</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setEditMode(!editMode)}>
              {editMode ? "İptal" : "Düzenle"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {editMode ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Stok</Label>
                  <Input name="stock" type="number" value={quickData.stock} onChange={handleQuickChange} />
                </div>
                <div className="space-y-2">
                  <Label>Alış Fiyatı (TL)</Label>
                  <Input name="purchasePrice" type="number" step="0.01" value={quickData.purchasePrice} onChange={handleQuickChange} />
                </div>
                <div className="space-y-2">
                  <Label>Kâr Marjı (%)</Label>
                  <Input name="profitPercent" type="number" step="0.1" value={quickData.profitPercent} onChange={handleQuickChange} />
                </div>
                <div className="space-y-2">
                  <Label>Satış Fiyatı (TL)</Label>
                  <Input name="salePrice" type="number" step="0.01" value={quickData.salePrice} onChange={handleQuickChange} className="border-primary" />
                </div>
                <div className="space-y-2">
                  <Label>İskontolu Satış Marjı (%)</Label>
                  <Input name="discountSalePct" type="number" step="0.1" min="0" value={quickData.discountSalePct} onChange={handleQuickChange} />
                  {discountedPrice !== null && (
                    <p className="text-xs text-muted-foreground">
                      Hesaplanan: <span className="font-semibold text-amber-600">{discountedPrice.toFixed(2)} TL</span>
                    </p>
                  )}
                </div>
                <Button className="w-full" onClick={handleQuickSave} disabled={quickUpdate.isPending}>
                  {quickUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Kaydet
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Stok</span>
                  <span className="font-bold text-lg">{product.stock}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Min. Stok</span>
                  <span>{product.minStock}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Alış</span>
                  <span>{product.purchasePrice.toFixed(2)} TL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Kâr Marjı</span>
                  <span>%{product.profitPercent.toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground font-medium">Satış</span>
                  <span className="font-bold text-2xl text-primary">{product.salePrice.toFixed(2)} TL</span>
                </div>
                {(product.discountSalePct ?? 0) > 0 && (
                  <div className="flex justify-between items-center py-2 bg-amber-50 dark:bg-amber-950/20 -mx-4 px-4 rounded-b-md">
                    <div>
                      <span className="text-amber-700 dark:text-amber-400 font-medium text-sm">İskontolu Satış</span>
                      <span className="text-xs text-muted-foreground ml-1">(%{(product.discountSalePct ?? 0).toFixed(1)} marj)</span>
                    </div>
                    <span className="font-bold text-xl text-amber-600 dark:text-amber-400">
                      {(product.purchasePrice * (1 + (product.discountSalePct ?? 0) / 100)).toFixed(2)} TL
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stok Hareketi Geçmişi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Stok Hareketi Geçmişi
            {movementsData?.total != null && movementsData.total > 0 && (
              <Badge variant="secondary" className="ml-1">{movementsData.total}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-2">
          {!movementsData?.movements?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Henüz stok hareketi bulunmuyor.</p>
          ) : (
            <div className="divide-y">
              {movementsData.movements.map(m => {
                const meta = movementMeta[m.type] ?? { label: m.type, icon: Activity, color: "text-muted-foreground", sign: "" };
                const Icon = meta.icon;
                const sign = m.type === "correction" ? (m.quantity >= 0 ? "+" : "") : meta.sign;
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2.5">
                    <div className={`rounded-full p-1.5 bg-muted/60 shrink-0 ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{meta.label}</span>
                        {m.note && <span className="text-xs text-muted-foreground truncate">· {m.note}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{new Date(m.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}</span>
                        {m.createdBy && <span>· {m.createdBy}</span>}
                      </div>
                    </div>
                    <span className={`font-mono font-bold text-sm shrink-0 ${meta.color}`}>
                      {sign}{Math.abs(m.quantity)} adet
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}