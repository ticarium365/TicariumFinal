import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save } from "lucide-react";

interface PlatformSettings {
  iban_info?: string;
}

export default function PlatformSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");

  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const res = await fetch("/api/payment/admin/platform-settings", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  useEffect(() => {
    if (settings?.iban_info) {
      try {
        const parsed = JSON.parse(settings.iban_info);
        setIban(parsed.iban ?? "");
        setBankName(parsed.bankName ?? "");
        setAccountHolder(parsed.accountHolder ?? "");
        setMonthlyPrice(parsed.monthlyPrice ?? "");
      } catch {}
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payment/admin/platform-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban, bankName, accountHolder, monthlyPrice }),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
      toast({ title: "Ayarlar kaydedildi" });
    },
    onError: () => {
      toast({ title: "Hata", description: "Kaydedilemedi.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Ayarları</h1>
        <p className="text-muted-foreground text-sm mt-1">Ödeme ve IBAN bilgilerini yapılandırın</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">Havale / IBAN Bilgileri</CardTitle>
          </div>
          <CardDescription>Bu bilgiler trial süresi dolan müşterilere gösterilir</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="iban">IBAN Numarası</Label>
              <Input
                id="iban"
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankName">Banka Adı</Label>
              <Input
                id="bankName"
                placeholder="ör: Ziraat Bankası"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountHolder">Hesap Sahibi</Label>
              <Input
                id="accountHolder"
                placeholder="Ad Soyad / Firma Adı"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monthlyPrice">Aylık Ücret (₺)</Label>
              <Input
                id="monthlyPrice"
                type="number"
                placeholder="ör: 500"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
