import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  supplierId: number;
  supplierName: string;
  currentBalance: number;
}

async function apiFetch(method: string, path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
    method, credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error?.message || "İşlem başarısız");
  }
  return res.json();
}

export function SupplierPaymentModal({ open, onClose, supplierId, supplierName, currentBalance }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("nakit");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiFetch("POST", `/suppliers/${supplierId}/payment`, { amount: parseFloat(amount), paymentMethod, note }),
    onSuccess: (data) => {
      toast({ title: "Ödeme kaydedildi", description: `Yeni bakiye: ${data.newBalance?.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺` });
      qc.invalidateQueries({ queryKey: ["supplier", String(supplierId)] });
      qc.invalidateQueries({ queryKey: ["supplier-transactions", String(supplierId)] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setAmount(""); setNote(""); onClose();
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tedarikçi Ödemesi</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-sm">
            <p className="font-medium text-orange-300">{supplierName}</p>
            <p className="text-orange-600 mt-0.5">
              Mevcut borç: {currentBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
            </p>
          </div>
          <div className="space-y-1">
            <Label>Ödeme Tutarı (₺) *</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01"
              placeholder="0,00" autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Ödeme Yöntemi</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nakit">Nakit</SelectItem>
                <SelectItem value="havale">Havale / EFT</SelectItem>
                <SelectItem value="kredi_karti">Kredi Kartı</SelectItem>
                <SelectItem value="cek">Çek</SelectItem>
                <SelectItem value="senet">Senet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Açıklama</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="İsteğe bağlı not..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !amount || parseFloat(amount) <= 0}
            className="bg-orange-600 hover:bg-orange-700 text-white">
            {mutation.isPending ? "Kaydediliyor..." : "Ödeme Yap"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
