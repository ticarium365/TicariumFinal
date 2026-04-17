import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  currentBalance: number;
  onSuccess: () => void;
}

async function apiFetch(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error?.message || "İşlem başarısız");
  }
  return res.json();
}

export function PaymentModal({ open, onClose, customerId, customerName, currentBalance, onSuccess }: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiFetch("POST", `/customers/${customerId}/payment`, {
      amount: parseFloat(amount),
      paymentMethod,
      note,
    }),
    onSuccess: (data) => {
      toast({
        title: "Tahsilat alındı",
        description: `Yeni bakiye: ${data.newBalance?.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`,
      });
      setAmount("");
      setNote("");
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tahsilat Al</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <span className="text-muted-foreground">Müşteri: </span>
            <span className="font-semibold">{customerName}</span>
            <br />
            <span className="text-muted-foreground">Mevcut bakiye: </span>
            <span className={`font-semibold ${currentBalance > 0 ? "text-red-600" : "text-green-600"}`}>
              {currentBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
            </span>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pay-amount">Tahsilat Tutarı (₺) *</Label>
            <Input
              id="pay-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label>Ödeme Yöntemi</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Nakit</SelectItem>
                <SelectItem value="card">Kart</SelectItem>
                <SelectItem value="transfer">Havale/EFT</SelectItem>
                <SelectItem value="other">Diğer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pay-note">Not (opsiyonel)</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tahsilat notu..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount || parseFloat(amount) <= 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Tahsilat Al
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
