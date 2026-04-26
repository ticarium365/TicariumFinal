import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicNav, PublicFooter } from "@/components/public-nav";
import { Phone, Mail, Clock, CheckCircle2, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function IletisimPage() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ fullName: "", companyName: "", phone: "", email: "" });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim()) {
      toast({ title: "Eksik bilgi", description: "Ad soyad, telefon ve e-posta zorunludur.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const base = (import.meta as any).env?.BASE_URL || "/";
      const res = await fetch(`${base}api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim() || null,
          phone: form.phone.trim(),
          email: form.email.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Talep gönderilemedi");
      }
      setDone(true);
      setForm({ fullName: "", companyName: "", phone: "", email: "" });
    } catch (err: any) {
      toast({ title: "Hata", description: err?.message || "Talep gönderilemedi.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-iletisim">
      <PublicNav />
      <section className="t365-page-hero container mx-auto px-4 py-20 md:py-24 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5" style={{ fontFamily: "var(--font-display)" }}>
          <span className="t365-brand-gradient">15 dakikalık demo planlayalım.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Kısa bir not bırakın; ekibimiz <strong>1 iş günü içinde</strong> sizi arasın.
          Satış baskısı değil, ihtiyacınıza uygun net yol haritası çıkaralım.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <a href="https://wa.me/" target="_blank" rel="noreferrer">
            <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp hattı hazır olduğunda buradan açılacak
            </Button>
          </a>
          <Button size="lg" className="w-full sm:w-auto" onClick={() => document.getElementById("fullName")?.focus()}>
            Demo talebi bırak
          </Button>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <Card className="border-2">
              <CardHeader>
                <CardTitle style={{ fontFamily: "var(--font-display)" }}>Demo talebi</CardTitle>
                <p className="text-sm text-muted-foreground">Sadece ulaşabilmemiz için gereken bilgileri istiyoruz.</p>
              </CardHeader>
              <CardContent>
                {done ? (
                  <div className="text-center py-10" data-testid="contact-success">
                    <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">Talebin alındı!</h3>
                    <p className="text-muted-foreground mb-6">En geç 1 iş günü içinde arayıp işletmenize en uygun başlangıç yolunu konuşacağız.</p>
                    <Button onClick={() => setDone(false)} variant="outline" data-testid="btn-new-request">Yeni talep</Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4" data-testid="contact-form">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="fullName">Ad Soyad <span className="text-red-500">*</span></Label>
                        <Input
                          id="fullName"
                          required
                          autoComplete="name"
                          value={form.fullName}
                          onChange={f("fullName")}
                          placeholder="Örn. Ahmet Yılmaz"
                          data-testid="input-fullName"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="companyName">Şirket</Label>
                        <Input
                          id="companyName"
                          autoComplete="organization"
                          value={form.companyName}
                          onChange={f("companyName")}
                          placeholder="Şirket adınız (opsiyonel)"
                          data-testid="input-companyName"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone">Telefon <span className="text-red-500">*</span></Label>
                        <Input
                          id="phone"
                          required
                          type="tel"
                          autoComplete="tel"
                          value={form.phone}
                          onChange={f("phone")}
                          placeholder="0 5XX XXX XX XX"
                          data-testid="input-phone"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email">E-posta <span className="text-red-500">*</span></Label>
                        <Input
                          id="email"
                          required
                          type="email"
                          autoComplete="email"
                          value={form.email}
                          onChange={f("email")}
                          placeholder="ornek@sirket.com"
                          data-testid="input-email"
                        />
                      </div>
                    </div>
                    <Button type="submit" size="lg" className="w-full h-12" disabled={submitting} data-testid="btn-submit-contact">
                      {submitting ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gönderiliyor...</>
                      ) : (
                        "15 dakikalık demo iste"
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      KVKK kapsamında bilgileriniz yalnızca sizinle iletişime geçmek ve talebinizi değerlendirmek için kullanılır.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card><CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="h-5 w-5 text-primary" />
                <div className="font-semibold">Çalışma saatlerimiz</div>
              </div>
              <p className="text-sm text-muted-foreground">Hafta içi 09:00 – 18:00<br />Cumartesi 10:00 – 14:00</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                <div className="font-semibold">E-posta</div>
              </div>
              <p className="text-sm text-muted-foreground">destek@ticarium365.com</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <Phone className="h-5 w-5 text-primary" />
                <div className="font-semibold">Doğrudan ara</div>
              </div>
              <p className="text-sm text-muted-foreground">Telefon numaramız demo görüşmede paylaşılır.</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <div className="font-semibold">WhatsApp destek</div>
              </div>
              <p className="text-sm text-muted-foreground">Canlı destek hattı açılışa hazır. Numara yayına alınmadan önce burada gösterilecek.</p>
              <Button size="sm" variant="outline" className="w-full mt-3" asChild>
                <a href="https://wa.me/" target="_blank" rel="noreferrer">WhatsApp hazır olduğunda aç</a>
              </Button>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div className="font-semibold">Güven notu</div>
              </div>
              <p className="text-sm text-muted-foreground">Form bilgileri satış baskısı için değil, doğru kurulum yönlendirmesi için kullanılır.</p>
            </CardContent></Card>
            <Card className="bg-primary/5 border-primary/20"><CardContent className="p-5">
              <div className="font-semibold mb-1">Karar vermeden önce görün</div>
              <p className="text-sm text-muted-foreground mb-3">15 dakikalık demo görüşmesinde işletmenize uygun akışı birlikte gezelim.</p>
              <Link href="/kayit">
                <Button size="sm" variant="outline" className="w-full" data-testid="btn-trial-side">Yine de kendim başlarım</Button>
              </Link>
            </CardContent></Card>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
