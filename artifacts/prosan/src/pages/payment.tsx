import { useState } from "react";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Building2, CheckCircle2, Clock, Copy, LogOut } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";

export default function PaymentPage() {
  const { data: status } = usePaymentStatus();
  const { user } = useAuth();
  const { toast } = useToast();
  const logout = useLogout();
  const [amount, setAmount] = useState(status?.ibanInfo?.monthlyPrice ?? "");
  const [senderName, setSenderName] = useState(user?.fullName ?? "");
  const [referenceNote, setReferenceNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const iban = status?.ibanInfo;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} kopyalandı` });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !senderName) return;
    setLoading(true);
    try {
      const res = await fetch("/api/payment/bank-transfer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), senderName, referenceNote }),
      });
      if (!res.ok) throw new Error("Hata");
      setSubmitted(true);
    } catch {
      toast({ title: "Hata", description: "Ödeme bildirimi gönderilemedi.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout.mutateAsync().catch(() => {});
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        {/* Başlık */}
        <div className="text-center space-y-1 mb-6">
          <h1 className="text-2xl font-bold text-slate-800">SMSYSTEMS</h1>
          <p className="text-slate-500 text-sm">
            {status?.isTrialExpired
              ? "Trial süreniz doldu. Sisteme erişmek için ödeme yapın."
              : "Hesabınız askıya alınmış. Ödeme yaparak sisteme erişebilirsiniz."}
          </p>
        </div>

        {/* IBAN Bilgileri */}
        {iban?.iban ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base">Havale / EFT Bilgileri</CardTitle>
              </div>
              {iban.monthlyPrice && (
                <CardDescription>
                  Aylık ücret: <span className="font-semibold text-slate-700">{iban.monthlyPrice} ₺</span>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {iban.bankName && (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-xs text-slate-500">Banka</p>
                    <p className="font-medium text-slate-800">{iban.bankName}</p>
                  </div>
                </div>
              )}
              {iban.accountHolder && (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-xs text-slate-500">Hesap Sahibi</p>
                    <p className="font-medium text-slate-800">{iban.accountHolder}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(iban.accountHolder!, "Hesap sahibi")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-xs text-blue-600">IBAN</p>
                  <p className="font-mono font-semibold text-blue-900 tracking-wide">{iban.iban}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => copyToClipboard(iban.iban!, "IBAN")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-slate-500 text-sm">
              Ödeme bilgileri henüz tanımlanmamış. Lütfen yöneticinizle iletişime geçin.
            </CardContent>
          </Card>
        )}

        {/* Ödeme Bildirimi */}
        {submitted ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-6 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-semibold text-green-800">Ödeme bildiriminiz alındı!</p>
              <p className="text-sm text-green-700">En kısa sürede kontrol edilerek hesabınız aktifleştirilecektir.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-base">Ödeme Yaptım Bildirimi</CardTitle>
              </div>
              <CardDescription>Havale yaptıktan sonra aşağıdaki formu doldurun, size en kısa sürede erişim açılır.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Gönderilen Tutar (₺)</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="ör: 500"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senderName">Gönderen Ad Soyad</Label>
                    <Input
                      id="senderName"
                      placeholder="Hesap sahibi adı"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="referenceNote">Açıklama / Referans (opsiyonel)</Label>
                  <Textarea
                    id="referenceNote"
                    placeholder="Havale açıklamasında yazan referans kodu veya not"
                    rows={2}
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {loading ? "Gönderiliyor..." : "Ödeme Yaptım, Bildir"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-slate-400" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Çıkış Yap
          </Button>
        </div>
      </div>
    </div>
  );
}
