import { useState } from "react";
import { useListProducts, useCreateSale, useGetTodaySales, getGetTodaySalesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Package } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface CartItem {
  productId: number;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

export default function SalesScreen() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSale = useCreateSale();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const { data: searchResults, isLoading: searching } = useListProducts(
    { query: { enabled: !!debouncedSearch } }, 
    { search: debouncedSearch, limit: 5 }
  );

  const { data: todaySales } = useGetTodaySales();

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast({ title: "Uyarı", description: "Yetersiz stok.", variant: "destructive" });
          return prev;
        }
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (product.stock <= 0) {
        toast({ title: "Uyarı", description: "Ürün stokta yok.", variant: "destructive" });
        return prev;
      }
      return [...prev, { 
        productId: product.id, 
        productCode: product.productCode,
        name: product.name, 
        unitPrice: product.salePrice, 
        quantity: 1,
        stock: product.stock
      }];
    });
    setSearchTerm("");
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQ = item.quantity + delta;
        if (newQ > item.stock) {
          toast({ title: "Uyarı", description: "Yetersiz stok.", variant: "destructive" });
          return item;
        }
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const completeSale = async () => {
    if (cart.length === 0) return;
    
    try {
      // Process each item sequentially or Promise.all. 
      // API expects single sale creation for simplicity based on spec `CreateSaleBody`.
      await Promise.all(cart.map(item => 
        createSale.mutateAsync({ 
          data: { 
            productId: item.productId, 
            quantity: item.quantity, 
            unitPrice: item.unitPrice 
          } 
        })
      ));
      
      toast({ title: "Başarılı", description: "Satış tamamlandı." });
      setCart([]);
      queryClient.invalidateQueries({ queryKey: getGetTodaySalesQueryKey() });
    } catch (error) {
      toast({ title: "Hata", description: "Satış tamamlanamadı.", variant: "destructive" });
    }
  };

  const totalAmount = cart.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Left Panel - Products */}
      <div className="flex-1 flex flex-col gap-4">
        <Card className="flex-none">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input 
                className="pl-10 h-12 text-lg font-mono" 
                placeholder="Barkod okutun veya ürün arayın..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            
            {debouncedSearch && searchResults?.products && (
              <div className="mt-2 border rounded-md divide-y">
                {searchResults.products.map(product => (
                  <div key={product.id} className="p-3 flex items-center justify-between hover:bg-muted cursor-pointer transition-colors" onClick={() => addToCart(product)}>
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{product.barcode || product.productCode} • Stok: {product.stock}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{product.salePrice.toFixed(2)} TL</p>
                    </div>
                  </div>
                ))}
                {searchResults.products.length === 0 && !searching && (
                  <div className="p-4 text-center text-muted-foreground">Ürün bulunamadı.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 border-b bg-muted/20 flex-none">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Sepet ({cart.reduce((a,c) => a + c.quantity, 0)} Ürün)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <Package className="h-16 w-16 mb-4 opacity-20" />
                <p>Sepet boş. Barkod okutun veya ürün arayın.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-background sticky top-0">
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Fiyat</TableHead>
                    <TableHead className="text-center w-[140px]">Adet</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.map(item => (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">
                        {item.name}
                        <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{item.unitPrice.toFixed(2)} TL</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2 bg-muted/50 rounded-md p-1 border">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.productId, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center font-bold font-mono">{item.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.productId, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">{(item.quantity * item.unitPrice).toFixed(2)} TL</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeFromCart(item.productId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Summary & Checkout */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        <Card className="flex-none bg-zinc-950 text-white border-zinc-800 shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Ödenecek Tutar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl lg:text-5xl font-bold tracking-tighter text-primary">
              {totalAmount.toFixed(2)}
              <span className="text-2xl ml-1">TL</span>
            </div>
            
            <div className="mt-8 space-y-3">
              <Button 
                size="lg" 
                className="w-full h-16 text-lg font-bold shadow-lg" 
                disabled={cart.length === 0 || createSale.isPending}
                onClick={completeSale}
              >
                {createSale.isPending ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <CheckCircle2 className="mr-2 h-6 w-6" />}
                Satışı Tamamla
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="w-full text-zinc-950" 
                disabled={cart.length === 0}
                onClick={() => setCart([])}
              >
                İptal Et
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 bg-muted/30">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-medium">Günlük Satış Özeti</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Satış Sayısı</span>
              <span className="font-bold font-mono">{todaySales?.totalSales || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Satılan Ürün</span>
              <span className="font-bold font-mono">{todaySales?.totalQuantity || 0}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-bold">Ciro</span>
              <span className="font-bold text-lg text-primary">{(todaySales?.grossRevenue || 0).toFixed(2)} TL</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}