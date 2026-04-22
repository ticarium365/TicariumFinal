import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Supplier } from "./types";

interface Props { open: boolean; onClose: () => void; supplier: Supplier | null; onSuccess: () => void; }

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

export function SupplierModal({ open, onClose, supplier, onSuccess }: Props) {
  const { toast } = useToast();
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    code: "", name: "", phone: "", email: "", city: "", district: "", address: "",
    contactPerson: "", taxOffice: "", taxNumber: "", openingBalance: "0", notes: "",
  });

  useEffect(() => {
    if (open) {
      if (supplier) {
        setForm({
          code: supplier.code, name: supplier.name, phone: supplier.phone ?? "",
          email: supplier.email ?? "", city: supplier.city ?? "", district: supplier.district ?? "",
          address: supplier.address ?? "", contactPerson: supplier.contactPerson ?? "",
          taxOffice: supplier.taxOffice ?? "", taxNumber: supplier.taxNumber ?? "",
          openingBalance: String(supplier.openingBalance ?? 0), notes: supplier.notes ?? "",
        });
      } else {
        setForm({ code: "", name: "", phone: "", email: "", city: "", district: "", address: "",
          contactPerson: "", taxOffice: "", taxNumber: "", openingBalance: "0", notes: "" });
      }
    }
  }, [open, supplier]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: (data: typeof form) => isEdit
      ? apiFetch("PUT", `/suppliers/${supplier!.id}`, data)
      : apiFetch("POST", "/suppliers", data),
    onSuccess: () => {
      toast({ title: isEdit ? "Tedarikçi güncellendi" : "Tedarikçi eklendi" });
      onSuccess(); onClose();
    },
    onError: (err: Error) => toast({ title: "Hata", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Tedarikçi Düzenle" : "Yeni Tedarikçi"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1">
            <Label>Kod *</Label>
            <Input value={form.code} onChange={f("code")} placeholder="TDR001" />
          </div>
          <div className="space-y-1">
            <Label>Ad / Ünvan *</Label>
            <Input value={form.name} onChange={f("name")} placeholder="ABC Tekstil Ltd." />
          </div>
          <div className="space-y-1">
            <Label>Telefon</Label>
            <Input value={form.phone} onChange={f("phone")} placeholder="0212 555 00 00" />
          </div>
          <div className="space-y-1">
            <Label>E-posta</Label>
            <Input value={form.email} onChange={f("email")} placeholder="info@firma.com" type="email" />
          </div>
          <div className="space-y-1">
            <Label>İrtibat Kişisi</Label>
            <Input value={form.contactPerson} onChange={f("contactPerson")} placeholder="Ahmet Yılmaz" />
          </div>
          <div className="space-y-1">
            <Label>Şehir</Label>
            <Input value={form.city} onChange={f("city")} placeholder="İstanbul" />
          </div>
          <div className="space-y-1">
            <Label>İlçe</Label>
            <Input value={form.district} onChange={f("district")} placeholder="Bağcılar" />
          </div>
          <div className="space-y-1">
            <Label>Vergi Dairesi</Label>
            <Input value={form.taxOffice} onChange={f("taxOffice")} placeholder="Bağcılar VD" />
          </div>
          <div className="space-y-1">
            <Label>Vergi No / TC</Label>
            <Input value={form.taxNumber} onChange={f("taxNumber")} placeholder="1234567890" />
          </div>
          {!isEdit && (
            <div className="space-y-1">
              <Label>Açılış Bakiyesi (₺)</Label>
              <Input value={form.openingBalance} onChange={f("openingBalance")} type="number" placeholder="0" />
            </div>
          )}
          <div className="col-span-2 space-y-1">
            <Label>Adres</Label>
            <Textarea value={form.address} onChange={f("address")} placeholder="Açık adres..." rows={2} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Notlar</Label>
            <Textarea value={form.notes} onChange={f("notes")} placeholder="İsteğe bağlı notlar..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.code || !form.name}>
            {mutation.isPending ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Ekle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
