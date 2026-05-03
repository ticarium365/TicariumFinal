import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2, Save, ImageUp, X, Palette, Trash2, AlertTriangle, Building2, CreditCard, Flag, Activity, Inbox, ScrollText, UserPlus,
  FileText, Percent, Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LS_INVOICE = "ticarium-settings-invoice-footer";
const LS_LOCALE = "ticarium-settings-locale-v1";

type LocalePrefs = { lang: string; timezone: string };

const LANG_OPTIONS = [
  { value: "tr-TR", label: "Türkçe (tr-TR)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "de-DE", label: "Deutsch (de-DE)" },
];

const TIMEZONE_OPTIONS = [
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "Asia/Dubai",
  "UTC",
];

const PRESET_COLORS = [
  "#2563eb", "#7c3aed", "#059669", "#dc2626",
  "#d97706", "#0891b2", "#be185d", "#374151",
];

export default function Settings() {
  const { user } = useAuth();
  const { data: settings, isLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    companyName: "", iban: "", bankName: "", accountHolder: "",
    phone: "", email: "", address: "", website: "", taxNumber: "", taxOffice: "",
    primaryColor: "#2563eb", currency: "TRY",
    taxRate: 20,
    vatRegime: "gercek" as "gercek" | "basit",
  });
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [localePrefs, setLocalePrefs] = useState<LocalePrefs>({ lang: "tr-TR", timezone: "Europe/Istanbul" });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const snapshotRef = useRef<{
    form: typeof form;
    invoiceFooter: string;
    localePrefs: LocalePrefs;
  } | null>(null);

  useEffect(() => {
    if (!settings) return;
    const s = settings as unknown as Record<string, unknown>;
    let inv = "";
    let loc: LocalePrefs = { lang: "tr-TR", timezone: "Europe/Istanbul" };
    try {
      inv = localStorage.getItem(LS_INVOICE) || "";
      const raw = localStorage.getItem(LS_LOCALE);
      if (raw) loc = JSON.parse(raw) as LocalePrefs;
    } catch {
      /* ignore */
    }
    const nextForm = {
      companyName: String(s.companyName || ""),
      iban: String(s.iban || ""),
      bankName: String(s.bankName || ""),
      accountHolder: String(s.accountHolder || ""),
      phone: String(s.phone || ""),
      email: String(s.email || ""),
      address: String(s.address || ""),
      website: String(s.website || ""),
      taxNumber: String(s.taxNumber || ""),
      taxOffice: String(s.taxOffice || ""),
      primaryColor: String(s.primaryColor || "#2563eb"),
      currency: String(s.currency || "TRY"),
      taxRate: typeof s.taxRate === "number" ? s.taxRate : Number(s.taxRate) || 20,
      vatRegime: (s.vatRegime === "basit" ? "basit" : "gercek") as "gercek" | "basit",
    };
    setForm(nextForm);
    setInvoiceFooter(inv);
    setLocalePrefs(loc);
    if (s.logoUrl) setLogoPreview(String(s.logoUrl));
    snapshotRef.current = { form: nextForm, invoiceFooter: inv, localePrefs: loc };
  }, [settings]);

  const isDirty = useMemo(() => {
    if (!snapshotRef.current) return false;
    const sn = snapshotRef.current;
    const formSame = JSON.stringify(form) === JSON.stringify(sn.form);
    const invSame = invoiceFooter === sn.invoiceFooter;
    const locSame = JSON.stringify(localePrefs) === JSON.stringify(sn.localePrefs);
    return !formSame || !invSame || !locSame || logoFile !== null;
  }, [form, invoiceFooter, localePrefs, logoFile]);

  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [isDirty]);

  const field = (name: keyof typeof form) => ({
    name,
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [name]: e.target.value })),
  });

  const persistLocalPrefs = useCallback(() => {
    try {
      localStorage.setItem(LS_INVOICE, invoiceFooter);
      localStorage.setItem(LS_LOCALE, JSON.stringify(localePrefs));
    } catch {
      /* ignore */
    }
  }, [invoiceFooter, localePrefs]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          taxRate: Number(form.taxRate),
          vatRegime: form.vatRegime,
        }),
      });
      persistLocalPrefs();
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      snapshotRef.current = {
        form: { ...form },
        invoiceFooter,
        localePrefs: { ...localePrefs },
      };
      setLogoFile(null);
      toast({ title: "Başarılı", description: "Ayarlar güncellendi." });
    } catch {
      toast({ title: "Hata", description: "Güncellenemedi.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFile = (f: File) => {
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Çok büyük", description: "Logo en fazla 2 MB olmalı.", variant: "destructive" });
      return;
    }
    if (!/^image\/(jpeg|png|gif|webp|svg\+xml)$/i.test(f.type) && !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)) {
      toast({ title: "Geçersiz dosya", description: "Yalnızca JPG, PNG, GIF, WebP veya SVG.", variant: "destructive" });
      return;
    }
    setLogoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
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

  const settingsLogoUrl = (settings as { logoUrl?: string | null })?.logoUrl;
  const timezoneSelectOptions = useMemo(() => {
    const t = localePrefs.timezone;
    if (t && !TIMEZONE_OPTIONS.includes(t)) return [t, ...TIMEZONE_OPTIONS];
    return TIMEZONE_OPTIONS;
  }, [localePrefs.timezone]);

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Ayarlar</h1>

      {isDirty && (
        <Alert className="border-2 border-[var(--color-brand-500)]/35 bg-[color-mix(in_srgb,var(--color-brand-500)_8%,var(--color-surface-card))]">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span>Kaydedilmemiş değişiklikleriniz var. Sayfadan ayrılmadan önce kaydedin.</span>
            <Button type="button" size="sm" className="shrink-0" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Kaydet
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="firma" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
          <TabsTrigger value="firma">Firma Bilgileri</TabsTrigger>
          <TabsTrigger value="fatura">Fatura Şablonu</TabsTrigger>
          <TabsTrigger value="kdv">KDV Oranları</TabsTrigger>
          <TabsTrigger value="dil">Dil & Bölge</TabsTrigger>
        </TabsList>

        <TabsContent value="firma" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
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
                    <div className="space-y-2 md:col-span-2">
                      <Label>Vergi Dairesi</Label>
                      <Input {...field("taxOffice")} placeholder="Örn. Kadıköy" />
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

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Kaydet
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageUp className="h-4 w-4" /> Logo
                  </CardTitle>
                  <CardDescription>En fazla 2 MB · JPG, PNG, GIF, WebP veya SVG</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,.jpg,.jpeg,.png,.gif,.webp,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoFile(f);
                    }}
                  />

                  {logoPreview ? (
                    <div className="relative">
                      <img
                        src={logoPreview}
                        alt="logo"
                        className="max-h-28 max-w-full mx-auto rounded-lg object-contain border p-2 bg-card"
                      />
                      {!logoFile && (
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          disabled={savingLogo}
                          className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5 shadow"
                          aria-label="Logoyu kaldır"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : null}

                  <div
                    role="presentation"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleLogoFile(f);
                    }}
                    className={cn(
                      "rounded-lg border-2 border-dashed p-5 text-center transition-colors",
                      dragOver
                        ? "border-[var(--color-brand-500)] bg-muted/60"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <ImageUp className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">Dosyayı buraya sürükleyip bırakın veya seçin.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      Dosya seç
                    </Button>
                  </div>

                  {logoFile && (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" type="button" onClick={handleLogoUpload} disabled={savingLogo}>
                        {savingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">Logoyu yükle</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setLogoFile(null);
                          setLogoPreview(settingsLogoUrl ? String(settingsLogoUrl) : null);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

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
                        type="button"
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
                  <Button type="button" size="sm" className="w-full" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Rengi kaydet
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="fatura">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Fatura şablonu
              </CardTitle>
              <CardDescription>
                Fatura altlığı metni bu cihazda saklanır (tarayıcı); sunucu ile senkronize değildir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Alt bilgi / şartlar metni</Label>
                <Textarea
                  value={invoiceFooter}
                  onChange={(e) => setInvoiceFooter(e.target.value)}
                  rows={8}
                  placeholder="Ödeme koşulları, banka bilgisi tekrarı, yasal uyarılar..."
                  className="min-h-[180px] resize-y"
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kdv">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                KDV oranları
              </CardTitle>
              <CardDescription>Varsayılan KDV oranı ve vergi rejimi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-md">
              <div className="space-y-2">
                <Label>Varsayılan KDV (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.taxRate}
                  onChange={(e) => setForm((p) => ({ ...p, taxRate: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Vergi rejimi</Label>
                <Select
                  value={form.vatRegime}
                  onValueChange={(v) => setForm((p) => ({ ...p, vatRegime: v as "gercek" | "basit" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gercek">Gerçek usul</SelectItem>
                    <SelectItem value="basit">Basit usul</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dil">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Dil ve bölge
              </CardTitle>
              <CardDescription>Tarih ve saat gösterimi için tercihler (cihazda saklanır).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-md">
              <div className="space-y-2">
                <Label>Dil</Label>
                <Select
                  value={localePrefs.lang}
                  onValueChange={(lang) => setLocalePrefs((p) => ({ ...p, lang }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANG_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Saat dilimi</Label>
                <Select
                  value={localePrefs.timezone}
                  onValueChange={(timezone) => setLocalePrefs((p) => ({ ...p, timezone }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneSelectOptions.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(user as { role?: string } | null)?.role === "super_admin" && (
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Platform yönetimi
            </CardTitle>
            <CardDescription>
              Tüm kiracılar ve faturalama — yalnız süper admin erişir. Demo veya satış toplantısından önce bu kısayolları kullanın.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><Link href="/admin/companies"><Building2 className="h-3.5 w-3.5 mr-1" />Firmalar</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/admin/planlar"><CreditCard className="h-3.5 w-3.5 mr-1" />Planlar</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/admin/payments"><CreditCard className="h-3.5 w-3.5 mr-1" />Ödemeler</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/admin/billing"><CreditCard className="h-3.5 w-3.5 mr-1" />Faturalama</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/admin/runtime-flags"><Flag className="h-3.5 w-3.5 mr-1" />Özellik bayrakları</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/super-admin/sistem-saglik"><Activity className="h-3.5 w-3.5 mr-1" />Sistem sağlığı</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/super-admin/pazaryeri-saglik"><Activity className="h-3.5 w-3.5 mr-1" />Pazaryeri sağlığı</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/super-admin/talepler"><Inbox className="h-3.5 w-3.5 mr-1" />İletişim talepleri</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/super-admin/audit-logs"><ScrollText className="h-3.5 w-3.5 mr-1" />Denetim günlüğü</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/super-admin/yeni-firma"><UserPlus className="h-3.5 w-3.5 mr-1" />Yeni firma</Link></Button>
          </CardContent>
        </Card>
      )}

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
