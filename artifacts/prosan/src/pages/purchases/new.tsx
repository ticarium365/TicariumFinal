import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Supplier { id: number; code: string; name: string; }
interface Product { id: number; productCode: string; name: string; purchasePrice: number; }
interface LineItem { productId: number; productName: string; quantity: number; unitCost: number; }

async function apiFetch(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method, credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error?.message || "İşlem başarısız");
  }
  return res.json();
}

export default function NewPurchase() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [taxAmount, setTaxAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ productId: 0, productName: "", quantity: 1, unitCost: 0 }]);

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => apiFetch("GET", "/suppliers?limit=200&active=true"),
  });

  const { data: productsData } = useQuery({
    queryKey: ["products-all"],
    queryFn: () => apiFetch("GET", "/products?limit=500&active=true"),
  });

  const suppliers: Supplier[] = suppliersData?.suppliers ?? [];
  const products: Product[] = productsData?.products ?? [];

  const subtotal = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitCost || 0), 0);
  const total = subtotal + (parseFloat(taxAmount) || 0) - (parseFloat(discountAmount) || 0);

  const addLine = () => setLines(prev => [...prev, { productId: 0, productName: "", quantity: 1, unitCost: 0 }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const next = [...prev];
      if (field === "productId") {
        const pid = Number(value);
        const p = products.find(p => p.id === pid);
        next[i] = { ...next[i], productId: pid, productName: p?.name ?? "", unitCost: p?.purchasePrice ?? 0 };
      } else if (field === "quantity" || field === "unitCost") {
        next[i] = { ...next[i], [field]: Number(value) };
      }
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () => apiFetch("POST", "/purchases", {
      supplierId: parseInt(supplierId),
      invoiceNo: invoiceNo || null,
      invoiceDate,
      taxAmount: parseFloat(taxAmount) || 0,
      discountAmount: parseFloat(discountAmount) || 0,
      note: note || null,
      items: lines.filter(l => l.productId > 0 && l.quantity > 0).map(l => ({
        productId: l.productId, quantity: l.quantity, unitCost: l.unitCost,
      })),
    }),
    onSuccess: () => {
      toast({ title: "Alış faturası kaydedildi", description: `Stoklar güncellendi` });
      navigate("/purchases");
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  const validLines = lines.filter(l => l.productId > 0 && l.quantity > 0);
  const canSubmit = !!supplierId && !!invoiceDate && validLines.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/purchases")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Yeni Alış Faturası</h1>
          <p className="text-sm text-muted-foreground">Stok girişi ve tedarikçi cari takibi</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol - fatura bilgileri */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fatura başlığı */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Fatura Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Tedarikçi *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tedarikçi seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} <span className="text-muted-foreground text-xs">({s.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fatura No</Label>
                <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="FAT-001" />
              </div>
              <div className="space-y-1">
                <Label>Fatura Tarihi *</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Kalemler */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Ürün Kalemleri</h2>
              <Button size="sm" variant="outline" onClick={addLine} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Kalem Ekle
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <Select value={line.productId ? String(line.productId) : ""} onValueChange={v => updateLine(i, "productId", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Ürün seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} <span className="text-muted-foreground text-xs">({p.productCode})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="1" className="h-9" placeholder="Miktar" value={line.quantity || ""}
                      onChange={e => updateLine(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    <Input type="number" min="0" step="0.01" className="h-9" placeholder="Birim fiyat" value={line.unitCost || ""}
                      onChange={e => updateLine(i, "unitCost", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <p className="text-xs text-right text-muted-foreground whitespace-nowrap">
                      {((line.quantity || 0) * (line.unitCost || 0)).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                    </p>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Not */}
          <div className="bg-card border rounded-xl p-5 space-y-2">
            <Label>Not (İsteğe Bağlı)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Fatura notu..." />
          </div>
        </div>

        {/* Sağ - özet */}
        <div className="space-y-4">
          <div className="bg-card border rounded-xl p-5 space-y-4 sticky top-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Fatura Özeti</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">KDV / Vergi (₺)</Label>
                <Input type="number" min="0" step="0.01" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">İskonto (₺)</Label>
                <Input type="number" min="0" step="0.01" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} />
              </div>
            </div>
            <div className="border-t pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Ara Toplam</span>
                <span>{subtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
              </div>
              {parseFloat(taxAmount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>KDV</span>
                  <span>+{parseFloat(taxAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                </div>
              )}
              {parseFloat(discountAmount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>İskonto</span>
                  <span>−{parseFloat(discountAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Toplam</span>
                <span>{total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1"><Package className="h-3 w-3" />
                {validLines.length} ürün kalemi, stoklar otomatik güncellenir
              </p>
            </div>
            <Button className="w-full" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Kaydediliyor..." : "Faturayı Kaydet"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
