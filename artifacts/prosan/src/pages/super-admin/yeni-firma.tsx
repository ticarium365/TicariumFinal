import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Building2, ChevronRight, ChevronLeft, CheckCircle2, Sparkles } from "lucide-react";

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(json?.message || text || `${r.status}`);
  return json;
}

export default function NewTenantWizard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<any>(null);

  const [form, setForm] = useState({
    name: "",
    subdomain: "",
    primaryColor: "#2563eb",
    logoUrl: "",
    adminFullName: "",
    adminUsername: "",
    adminPassword: "",
    adminPasswordConfirm: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm({ ...form, [k]: v });
  }

  function autoSubdomain(name: string) {
    return name.toLowerCase()
      .replace(/[ğ]/g, "g").replace(/[ü]/g, "u").replace(/[ş]/g, "s")
      .replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ç]/g, "c")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  }

  function validateStep1() {
    if (!form.name.trim()) return "Firma adı zorunlu";
    if (!form.subdomain.match(/^[a-z0-9-]+$/)) return "Subdomain yalnızca küçük harf, rakam, tire içerebilir";
    if (form.subdomain.length < 3) return "Subdomain en az 3 karakter olmalı";
    return null;
  }
  function validateStep2() {
    if (!form.adminFullName.trim()) return "Yönetici adı zorunlu";
    if (form.adminUsername.length < 3) return "Kullanıcı adı en az 3 karakter olmalı";
    if (form.adminPassword.length < 8) return "Parola en az 8 karakter olmalı";
    if (form.adminPassword !== form.adminPasswordConfirm) return "Parolalar eşleşmiyor";
    return null;
  }

  async function submit() {
    const err = validateStep2();
    if (err) { toast({ variant: "destructive", title: "Eksik", description: err }); return; }
    setBusy(true);
    try {
      const res = await api("/companies", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          subdomain: form.subdomain.trim().toLowerCase(),
          primaryColor: form.primaryColor,
          logoUrl: form.logoUrl || null,
          adminFullName: form.adminFullName.trim(),
          adminUsername: form.adminUsername.trim(),
          adminPassword: form.adminPassword,
        }),
      });
      setCreated(res);
      setStep(3);
      toast({ title: "Firma oluşturuldu", description: `${res.company.name} hazır` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> Yeni Firma Ekle
        </h1>
        <p className="text-sm text-muted-foreground">3 adımda yeni tenant'ı sisteme tanıt.</p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`flex-1 h-2 rounded-full ${step >= n ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Adım 1 — Firma bilgileri</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Firma adı *</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!form.subdomain || form.subdomain === autoSubdomain(form.name)) {
                    set("subdomain", autoSubdomain(e.target.value));
                  }
                }}
                placeholder="Örn: ABC Ticaret A.Ş."
              />
            </div>
            <div>
              <Label>Subdomain *</Label>
              <div className="flex items-center gap-1">
                <Input
                  value={form.subdomain}
                  onChange={(e) => set("subdomain", e.target.value.toLowerCase())}
                  placeholder="prosan"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.ticarium365.com</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Yalnızca küçük harf, rakam ve tire — bu URL kullanılarak tenant'a erişilir.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tema rengi</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="h-10 w-16 rounded border" />
                  <Input value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Logo URL (opsiyonel)</Label>
                <Input value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={() => {
                const err = validateStep1();
                if (err) { toast({ variant: "destructive", title: "Eksik", description: err }); return; }
                setStep(2);
              }}>İleri <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Adım 2 — Yönetici kullanıcı</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Yönetici adı soyadı *</Label>
              <Input value={form.adminFullName} onChange={(e) => set("adminFullName", e.target.value)} placeholder="Ad Soyad" />
            </div>
            <div>
              <Label>Kullanıcı adı *</Label>
              <Input value={form.adminUsername} onChange={(e) => set("adminUsername", e.target.value.trim())} placeholder="admin" />
              <p className="text-xs text-muted-foreground mt-1">Bu kullanıcı adıyla giriş yapacak.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Parola * (min. 8 karakter)</Label>
                <Input type="password" value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
              </div>
              <div>
                <Label>Parola tekrar *</Label>
                <Input type="password" value={form.adminPasswordConfirm} onChange={(e) => set("adminPasswordConfirm", e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Geri</Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Oluşturuluyor..." : <>Firma oluştur <Sparkles className="h-4 w-4 ml-1" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && created && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-6 w-6" /> Firma oluşturuldu
          </CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/40 space-y-2 text-sm">
              <div><strong>Firma:</strong> {created.company.name}</div>
              <div><strong>Subdomain:</strong> <code>{created.company.subdomain}.ticarium365.com</code></div>
              <div><strong>Yönetici:</strong> {created.adminUser.fullName} (<code>{created.adminUser.username}</code>)</div>
            </div>
            <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm">
              <strong>📋 Yöneticiye iletilecek bilgiler:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>Giriş URL: <code>https://{created.company.subdomain}.ticarium365.com</code></li>
                <li>Kullanıcı adı: <code>{created.adminUser.username}</code></li>
                <li>Parola: <em>(yöneticiye güvenli kanaldan iletin)</em></li>
                <li>İlk girişten sonra parolasını değiştirmesi önerilir.</li>
              </ul>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => { setStep(1); setCreated(null); setForm({ ...form, name: "", subdomain: "", adminFullName: "", adminUsername: "", adminPassword: "", adminPasswordConfirm: "" }); }}>Yeni firma ekle</Button>
              <Button onClick={() => navigate("/super-admin/firmalar")}>Firmalar listesine dön</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
