import { useState, useEffect, useRef } from "react";
import { useGetSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, ImageUp, X, Palette, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey } from "@workspace/api-client-react";

const PRESET_COLORS = [
  "#2563eb", "#7c3aed", "#059669", "#dc2626",
  "#d97706", "#0891b2", "#be185d", "#374151",
];

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    companyName: "", iban: "", bankName: "", accountHolder: "",
    phone: "", email: "", address: "", website: "", taxNumber: "",
    primaryColor: "#2563eb", currency: "TRY",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: (settings as any).companyName || "",
        iban: (settings as any).iban || "",
        bankName: (settings as any).bankName || "",
        accountHolder: (settings as any).accountHolder || "",
        phone: (settings as any).phone || "",
        email: (settings as any).email || "",
        address: (settings as any).address || "",
        website: (settings as any).website || "",
        taxNumber: (settings as any).taxNumber || "",
        primaryColor: (settings as any).primaryColor || "#2563eb",
        currency: (settings as any).currency || "TRY",
      });
      if ((settings as any).logoUrl) {
        setLogoPreview((settings as any).logoUrl);
      }
    }
  }, [settings]);

  const field = (name: keyof typeof form) => ({
    name,
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [name]: e.target.value })),
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Başarılı", description: "Ayarlar güncellendi." });
    } catch {
      toast({ title: "Hata", description: "Güncellenemedi.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFile = (f: File) => {
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Çok büyük", description: "Logo 2 MB'dan küçük olmalı.", variant: "destructive" });
      return;
    }
    setLogoFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setSavingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", logoFile);
      const res = await fetch("/api/settings/logo", { method: "POST", credentials: "include", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message);
      setLogoPreview(json.logoUrl);
      setLogoFile(null);
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Logo güncellendi" });
    } catch {
      toast({ title: "Hata", description: "Logo yüklenemedi.", variant: "destructive" });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    setSavingLogo(true);
    try {
      await fetch("/api/settings/logo", { method: "DELETE", credentials: "include" });
      setLogoPreview(null);
      setLogoFile(null);
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Logo kaldırıldı" });
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleDemoReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/settings/reset-demo", { method: "POST", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message);
      setShowResetConfirm(false);
      queryClient.invalidateQueries();
      toast({ title: "Demo verisi temizlendi", description: "Tüm ürün, satış ve stok hareketleri silindi." });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Ayarlar</h1>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Firma Bilgileri */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Firma Bilgileri</CardTitle>
            <CardDescription>İletişim, banka ve vergi bilgilerini yönetin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Firma Adı *</Label>
                  <Input {...field("companyName")} required />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input {...field("phone")} placeholder="05xx xxx xx xx" />
                </div>
                <div className="space-y-2">
                  <Label>E-posta</Label>
                  <Input {...field("email")} type="email" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Adres</Label>
                  <Input {...field("address")} />
                </div>
                <div className="space-y-2">
                  <Label>Web Sitesi</Label>
                  <Input {...field("website")} placeholder="https://firma.com" />
                </div>
                <div className="space-y-2">
                  <Label>Vergi No</Label>
                  <Input {...field("taxNumber")} placeholder="1234567890" />
                </div>

                <div className="space-y-2 md:col-span-2 pt-4 border-t">
                  <Label className="font-semibold">Banka Bilgileri</Label>
                </div>
                <div className="space-y-2">
                  <Label>Banka Adı</Label>
                  <Input {...field("bankName")} />
                </div>
                <div className="space-y-2">
                  <Label>Hesap Sahibi</Label>
                  <Input {...field("accountHolder")} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>IBAN</Label>
                  <Input {...field("iban")} placeholder="TR..." className="font-mono" />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Sağ Kolon */}
        <div className="space-y-6">
          {/* IBAN QR */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IBAN QR Kodu</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              {form.iban ? (
                <>
                  <div className="p-3 bg-card rounded-lg shadow-sm border">
                    <QRCodeSVG value={form.iban} size={160} level="M" includeMargin={false} />
                  </div>
                  <p className="font-mono text-xs break-all text-center text-muted-foreground">{form.iban}</p>
                </>
              ) : (
                <div className="text-center p-6 text-muted-foreground border-2 border-dashed rounded-lg w-full text-sm">
                  IBAN girilmemiş
                </div>
              )}
            </CardContent>
          </Card>

          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageUp className="h-4 w-4" /> Logo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />

              {logoPreview ? (
                <div className="relative">
                  <img src={logoPreview} alt="logo" className="max-h-24 max-w-full mx-auto rounded-lg object-contain border p-2 bg-card" />
                  {!logoFile && (
                    <button
                      onClick={handleLogoRemove}
                      disabled={savingLogo}
                      className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5 shadow"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <ImageUp className="h-7 w-7 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">Tıkla veya sürükle</p>
                </div>
              )}

              {logoFile && (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleLogoUpload} disabled={savingLogo}>
                    {savingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Kaydet</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setLogoFile(null); setLogoPreview((settings as any)?.logoUrl || null); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {!logoFile && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()}>
                  {logoPreview ? "Logoyu Değiştir" : "Logo Yükle"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tema Rengi */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4" /> Tema Rengi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((p) => ({ ...p, primaryColor: c }))}
                    className={`h-9 rounded-lg transition-all ${form.primaryColor === c ? "ring-2 ring-offset-1 ring-current scale-105" : "hover:scale-105"}`}
                    style={{ backgroundColor: c, color: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="h-9 w-12 rounded cursor-pointer border border-border"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Rengi Kaydet
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Demo Sıfırlama (sadece non-production) */}
      {typeof window !== "undefined" && !window.location.hostname.includes(".replit.app") && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Demo Verisi Sıfırlama
            </CardTitle>
            <CardDescription>
              Bu şirkete ait tüm ürün, satış ve stok hareketlerini siler. Geri alınamaz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showResetConfirm ? (
              <Button variant="destructive" size="sm" onClick={() => setShowResetConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Demo Verisini Temizle
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-destructive font-medium">Emin misiniz? Bu işlem geri alınamaz.</span>
                <Button variant="destructive" size="sm" onClick={handleDemoReset} disabled={resetting}>
                  {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  Evet, Temizle
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>İptal</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
