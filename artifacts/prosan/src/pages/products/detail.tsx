import { useState, useEffect } from "react";
import { useGetProduct, useQuickUpdateProduct, getGetProductQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Edit, Save, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ProductDetail({ id }: { id: string }) {
  const productId = parseInt(id, 10);
  const { data: product, isLoading } = useGetProduct(productId, { query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId) } });
  const quickUpdate = useQuickUpdateProduct();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [quickData, setQuickData] = useState({
    stock: 0,
    purchasePrice: 0,
    salePrice: 0,
    profitPercent: 0
  });

  useEffect(() => {
    if (product) {
      setQuickData({
        stock: product.stock,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        profitPercent: product.profitPercent
      });
    }
  }, [product]);

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
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground font-medium">Satış</span>
                  <span className="font-bold text-2xl text-primary">{product.salePrice.toFixed(2)} TL</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}