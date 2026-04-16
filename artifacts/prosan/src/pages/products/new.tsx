import { useState, useEffect } from "react";
import { useCreateProduct, useGenerateBarcode, useListBrands, useListCategories } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, RefreshCw } from "lucide-react";
import { Link } from "wouter";

const NUM_FIELDS = ["stock", "minStock", "purchasePrice", "salePrice", "profitPercent"] as const;

export default function ProductNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createProduct = useCreateProduct();
  const generateBarcode = useGenerateBarcode();

  const { data: brands } = useListBrands();
  const { data: categories } = useListCategories();

  const [formData, setFormData] = useState({
    productCode: "",
    barcode: "",
    name: "",
    brand: "",
    category: "",
    description: "",
    stock: 0,
    minStock: 0,
    purchasePrice: 0,
    salePrice: 0,
    profitPercent: 0,
  });

  // Sayfa açıldığında otomatik barkod üret
  useEffect(() => {
    generateBarcode.mutateAsync().then(res => {
      setFormData(prev => ({ ...prev, barcode: res.barcode }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };

      if (NUM_FIELDS.includes(name as any)) {
        (newData as any)[name] = value === "" ? 0 : Number(value);
      }

      if (name === "purchasePrice") {
        const pp = Number(value);
        if (pp > 0 && prev.profitPercent > 0)
          newData.salePrice = Number((pp * (1 + prev.profitPercent / 100)).toFixed(2));
      } else if (name === "salePrice") {
        const sp = Number(value);
        if (prev.purchasePrice > 0)
          newData.profitPercent = Number((((sp - prev.purchasePrice) / prev.purchasePrice) * 100).toFixed(2));
      } else if (name === "profitPercent") {
        const pct = Number(value);
        if (prev.purchasePrice > 0)
          newData.salePrice = Number((prev.purchasePrice * (1 + pct / 100)).toFixed(2));
      }

      return newData as typeof prev;
    });
  };

  const handleGenerateBarcode = async () => {
    try {
      const res = await generateBarcode.mutateAsync();
      setFormData(prev => ({ ...prev, barcode: res.barcode }));
      toast({ title: "Başarılı", description: "Barkod üretildi." });
    } catch {
      toast({ title: "Hata", description: "Barkod üretilemedi.", variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newProd = await createProduct.mutateAsync({ data: formData });
      toast({ title: "Başarılı", description: "Ürün eklendi." });
      setLocation(`/products/${newProd.id}`);
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error?.response?.data?.message || "Ürün eklenirken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  const numFocus = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/products">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Yeni Ürün Ekle</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Ürün Bilgileri</CardTitle>
            <CardDescription>Sisteme yeni bir ürün kaydedin. Ürün kodu ve adı zorunludur.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="productCode">Ürün Kodu *</Label>
                <Input id="productCode" name="productCode" value={formData.productCode} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">Barkod</Label>
                <div className="flex gap-2">
                  <Input id="barcode" name="barcode" value={formData.barcode} onChange={handleChange} className="flex-1" />
                  <Button type="button" variant="secondary" onClick={handleGenerateBarcode} disabled={generateBarcode.isPending}>
                    {generateBarcode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">Ürün Adı *</Label>
                <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Marka</Label>
                <AutocompleteInput
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={(v) => setFormData(prev => ({ ...prev, brand: v }))}
                  suggestions={(brands as string[] | undefined) ?? []}
                  placeholder="Marka seçin veya yazın..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Kategori</Label>
                <AutocompleteInput
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
                  suggestions={(categories as string[] | undefined) ?? []}
                  placeholder="Kategori seçin veya yazın..."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Açıklama</Label>
                <Textarea id="description" name="description" value={formData.description} onChange={handleChange} rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock">Stok Miktarı *</Label>
                <Input
                  id="stock" name="stock" type="number" min="0" step="1"
                  value={formData.stock} onChange={handleChange} onFocus={numFocus}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minStock">Min. Stok (Uyarı Seviyesi) *</Label>
                <Input
                  id="minStock" name="minStock" type="number" min="0" step="1"
                  value={formData.minStock} onChange={handleChange} onFocus={numFocus}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Alış Fiyatı (TL) *</Label>
                <Input
                  id="purchasePrice" name="purchasePrice" type="number" min="0" step="0.01"
                  value={formData.purchasePrice} onChange={handleChange} onFocus={numFocus}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profitPercent">Kâr Marjı (%)</Label>
                <Input
                  id="profitPercent" name="profitPercent" type="number" min="0" step="0.1"
                  value={formData.profitPercent} onChange={handleChange} onFocus={numFocus}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="salePrice">Satış Fiyatı (TL) *</Label>
                <Input
                  id="salePrice" name="salePrice" type="number" min="0" step="0.01"
                  value={formData.salePrice} onChange={handleChange} onFocus={numFocus}
                  required className="font-bold text-primary border-primary/50"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createProduct.isPending}>
                {createProduct.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Ürünü Kaydet
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
