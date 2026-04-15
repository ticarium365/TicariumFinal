import { useState } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    companyName: "",
    iban: "",
    bankName: "",
    accountHolder: "",
    phone: "",
    email: "",
    address: ""
  });

  // Init form
  useState(() => {
    if (settings) {
      setFormData({
        companyName: settings.companyName || "",
        iban: settings.iban || "",
        bankName: settings.bankName || "",
        accountHolder: settings.accountHolder || "",
        phone: settings.phone || "",
        email: settings.email || "",
        address: settings.address || ""
      });
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings.mutateAsync({ data: formData });
      toast({
        title: "Başarılı",
        description: "Firma ayarları güncellendi."
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Ayarlar güncellenirken bir hata oluştu.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Ayarlar</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Firma Bilgileri</CardTitle>
            <CardDescription>Firma iletişim ve banka hesap bilgilerini yönetin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="companyName">Firma Adı</Label>
                  <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleChange} required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta</Label>
                  <Input id="email" type="email" name="email" value={formData.email} onChange={handleChange} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Adres</Label>
                  <Input id="address" name="address" value={formData.address} onChange={handleChange} />
                </div>

                <div className="space-y-2 md:col-span-2 pt-4 border-t">
                  <Label className="text-lg font-semibold">Banka Bilgileri</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bankName">Banka Adı</Label>
                  <Input id="bankName" name="bankName" value={formData.bankName} onChange={handleChange} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accountHolder">Hesap Sahibi</Label>
                  <Input id="accountHolder" name="accountHolder" value={formData.accountHolder} onChange={handleChange} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input id="iban" name="iban" value={formData.iban} onChange={handleChange} placeholder="TR..." className="font-mono" />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>IBAN QR Kod</CardTitle>
            <CardDescription>Müşterilerinize kolay ödeme için okutabileceğiniz QR kod.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center space-y-4 pt-6">
            {formData.iban ? (
              <>
                <div className="p-4 bg-white rounded-lg shadow-sm border">
                  <QRCodeSVG 
                    value={formData.iban} 
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="text-center w-full">
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">{formData.bankName}</p>
                  <p className="font-mono text-sm break-all bg-muted p-2 rounded">{formData.iban}</p>
                  <p className="text-xs text-muted-foreground mt-2">{formData.accountHolder}</p>
                </div>
              </>
            ) : (
              <div className="text-center p-8 text-muted-foreground border-2 border-dashed rounded-lg w-full">
                IBAN bilgisi girilmemiş.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}