import { useState, useEffect } from "react";
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

interface Customer {
  id: number;
  code: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  contactPerson: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  creditLimit: number;
  openingBalance: number;
  notes: string | null;
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

interface Props {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSuccess: () => void;
}

const INITIAL = {
  code: "", name: "", type: "individual",
  phone: "", email: "", city: "", district: "", address: "",
  contactPerson: "", taxOffice: "", taxNumber: "",
  creditLimit: "", openingBalance: "", notes: "",
};

export function CustomerModal({ open, onClose, customer, onSuccess }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState(INITIAL);

  useEffect(() => {
    if (customer) {
      setForm({
        code: customer.code,
        name: customer.name,
        type: customer.type,
        phone: customer.phone || "",
        email: customer.email || "",
        city: customer.city || "",
        district: customer.district || "",
        address: customer.address || "",
        contactPerson: customer.contactPerson || "",
        taxOffice: customer.taxOffice || "",
        taxNumber: customer.taxNumber || "",
        creditLimit: String(customer.creditLimit || ""),
        openingBalance: String(customer.openingBalance || ""),
        notes: customer.notes || "",
      });
    } else {
      setForm(INITIAL);
    }
  }, [customer, open]);

  const mutation = useMutation({
    mutationFn: (data: typeof INITIAL) => {
      const payload = {
        ...data,
        creditLimit: parseFloat(data.creditLimit) || 0,
        openingBalance: parseFloat(data.openingBalance) || 0,
      };
      if (customer) return apiFetch("PUT", `/customers/${customer.id}`, payload);
      return apiFetch("POST", "/customers", payload);
    },
    onSuccess: () => {
      toast({ title: customer ? "Müşteri güncellendi" : "Müşteri oluşturuldu" });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Müşteri Düzenle" : "Yeni Müşteri"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="code">Müşteri Kodu *</Label>
            <Input id="code" value={form.code} onChange={set("code")} placeholder="MUS001" />
          </div>
          <div className="space-y-1">
            <Label>Tür</Label>
            <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Bireysel</SelectItem>
                <SelectItem value="company">Kurumsal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">Ad Soyad / Firma Adı *</Label>
            <Input id="name" value={form.name} onChange={set("name")} placeholder="Müşteri adı" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="05xx xxx xx xx" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="ornek@mail.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="city">Şehir</Label>
            <Input id="city" value={form.city} onChange={set("city")} placeholder="İstanbul" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="district">İlçe</Label>
            <Input id="district" value={form.district} onChange={set("district")} placeholder="Kadıköy" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="address">Adres</Label>
            <Input id="address" value={form.address} onChange={set("address")} placeholder="Cadde, sokak, no..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contactPerson">İrtibat Kişisi</Label>
            <Input id="contactPerson" value={form.contactPerson} onChange={set("contactPerson")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="creditLimit">Kredi Limiti (₺)</Label>
            <Input id="creditLimit" type="number" min="0" value={form.creditLimit} onChange={set("creditLimit")} placeholder="0" />
          </div>
          {!customer && (
            <div className="space-y-1">
              <Label htmlFor="openingBalance">Açılış Bakiyesi (₺)</Label>
              <Input id="openingBalance" type="number" value={form.openingBalance} onChange={set("openingBalance")} placeholder="0" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="taxOffice">Vergi Dairesi</Label>
            <Input id="taxOffice" value={form.taxOffice} onChange={set("taxOffice")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="taxNumber">Vergi No</Label>
            <Input id="taxNumber" value={form.taxNumber} onChange={set("taxNumber")} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="notes">Notlar</Label>
            <Input id="notes" value={form.notes} onChange={set("notes")} placeholder="Opsiyonel not..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending || !form.code || !form.name}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {customer ? "Güncelle" : "Oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
