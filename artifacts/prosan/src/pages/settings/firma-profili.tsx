import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Save, Plus, Trash2, Loader2, Calculator, Building2,
  Users, Wallet, BarChart3, Settings2, TrendingUp, Info,
} from "lucide-react";

const SECTORS = [
  "Gıda & İçecek", "Tekstil & Konfeksiyon", "İnşaat & Yapı", "Otomotiv",
  "Mobilya & Dekorasyon", "Elektronik", "Kozmetik & Kişisel Bakım",
  "Sağlık & Medikal", "Eğitim", "Hizmet Sektörü", "Restoran & Cafe",
  "Market & Bakkal", "E-ticaret", "Toptan Ticaret", "Üretim", "Diğer",
];

type MiscLine = { label: string; amount: number };
type PayrollLine = {
  role: string;
  count: number;
  gross: number;
  net: number;
  employerCostPerPerson: number;
};

type Profile = Record<string, any>;
type SgkConfig = {
  minWageGross: number;
  incomeTaxExemption: number;
  stampDutyExemption: number;
  brackets: { upTo: number; rate: number }[];
  sgkEmployeeRate: number;
  unemploymentEmployeeRate: number;
  sgkEmployerRate: number;
  unemploymentEmployerRate: number;
  shortTermInsuranceRate: number;
  stampDutyRate: number;
};
type Totals = {
  rent: number; utilities: number; meal: number; payroll: number; misc: number;
  totalMonthlyFixedCost: number; annualFixedCost: number; dailyFixedCost: number;
  breakEvenMonthlyRevenue: number; breakEvenDailyRevenue: number;
  workingDaysPerMonth: number;
};

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0);
const fmtTL2 = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);

export default function FirmaProfili() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({});
  const [sgk, setSgk] = useState<SgkConfig | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [misc, setMisc] = useState<MiscLine[]>([]);
  const [payroll, setPayroll] = useState<PayrollLine[]>([]);

  // SGK calculator state
  const [calcMode, setCalcMode] = useState<"gross-to-net" | "net-to-gross">("net-to-gross");
  const [calcAmount, setCalcAmount] = useState<string>("");
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Load
  useEffect(() => {
    fetch("/api/firma-profili", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile ?? {});
        setSgk(d.sgkConfig ?? null);
        setTotals(d.totals ?? null);
        setMisc(Array.isArray(d.profile?.monthlyMiscExpenses) ? d.profile.monthlyMiscExpenses : []);
        setPayroll(Array.isArray(d.profile?.payrollLines) ? d.profile.payrollLines : []);
      })
      .catch(() => toast({ title: "Profil yüklenemedi", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: any) => setProfile((p) => ({ ...p, [k]: v }));
  const setSgkField = <K extends keyof SgkConfig>(k: K, v: any) =>
    setSgk((s) => ({ ...(s as SgkConfig), [k]: v }));

  // Aktif değerlerle anında özet (kaydetmeden önceki tahmini toplam)
  const liveTotals = useMemo<Totals>(() => {
    const rent = Number(profile.monthlyRent) || 0;
    const utilities = Number(profile.monthlyUtilities) || 0;
    const meal = Number(profile.monthlyMealExpense) || 0;
    const payrollSum = payroll.reduce(
      (a, p) => a + (Number(p.employerCostPerPerson) || 0) * (Number(p.count) || 0),
      0,
    );
    const miscSum = misc.reduce((a, m) => a + (Number(m.amount) || 0), 0);
    const total = rent + utilities + meal + payrollSum + miscSum;
    const wDays = (Number(profile.workingDaysPerWeek) || 6) * 4.345;
    const margin = Number(profile.targetGrossMargin) || 0;
    const breakEven = margin > 0 ? total / (margin / 100) : 0;
    return {
      rent, utilities, meal, payroll: payrollSum, misc: miscSum,
      totalMonthlyFixedCost: total,
      annualFixedCost: total * 12,
      dailyFixedCost: wDays > 0 ? total / wDays : 0,
      breakEvenMonthlyRevenue: breakEven,
      breakEvenDailyRevenue: breakEven && wDays > 0 ? breakEven / wDays : 0,
      workingDaysPerMonth: wDays,
    };
  }, [profile, payroll, misc]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payrollEmployerCostTotal = payroll.reduce(
        (a, p) => a + (Number(p.employerCostPerPerson) || 0) * (Number(p.count) || 0),
        0,
      );
      const body = {
        ...profile,
        monthlyMiscExpenses: misc,
        payrollLines: payroll,
        payrollEmployerCostTotal,
        sgkConfig: sgk,
      };
      const r = await fetch("/api/firma-profili", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("kaydedilemedi");
      const d = await r.json();
      setProfile(d.profile);
      setTotals(d.totals);
      toast({ title: "Profil kaydedildi", description: `Aylık toplam sabit gider: ${fmtTL(d.totals.totalMonthlyFixedCost)}` });
    } catch (e: any) {
      toast({ title: "Hata", description: e?.message ?? "Sunucu hatası", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const runCalc = async () => {
    const amt = Number(calcAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Geçerli bir tutar girin", variant: "destructive" });
      return;
    }
    setCalcLoading(true);
    try {
      const r = await fetch("/api/firma-profili/sgk-hesapla", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: calcMode, amount: amt, config: sgk }),
      });
      const d = await r.json();
      setCalcResult(d.result);
    } catch {
      toast({ title: "Hesaplama hatası", variant: "destructive" });
    } finally {
      setCalcLoading(false);
    }
  };

  // Hesap sonucunu personel kalemine ekle
  const addCalcAsPayrollLine = () => {
    if (!calcResult) return;
    const role = window.prompt("Bu maaş için pozisyon adı:", "Personel");
    if (!role) return;
    setPayroll((p) => [
      ...p,
      {
        role,
        count: 1,
        gross: calcResult.gross,
        net: calcResult.net,
        employerCostPerPerson: calcResult.employerCost,
      },
    ]);
    toast({ title: "Personel kalemi eklendi", description: `${role}: 1 kişi · işveren maliyeti ${fmtTL(calcResult.employerCost)}` });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-8 w-8 text-blue-700" />
            Firma Profili
          </h1>
          <p className="text-slate-600 mt-1">
            İşletmenizin künyesini ve aylık sabit giderlerini buradan yönetin.
            Bu bilgiler Gerçek Kâr, Bütçe ve Hedef Ciro hesaplamalarında otomatik kullanılır.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="lg" data-testid="button-save-profile">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Tüm Değişiklikleri Kaydet
        </Button>
      </div>

      {/* Üst özet şeritleri */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-xs text-blue-700 font-semibold uppercase">Aylık Toplam Sabit Gider</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{fmtTL(liveTotals.totalMonthlyFixedCost)}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="text-xs text-slate-600 font-semibold uppercase">Yıllık Sabit Gider</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{fmtTL(liveTotals.annualFixedCost)}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="text-xs text-emerald-700 font-semibold uppercase">Hedef Aylık Ciro (başabaş)</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">
              {liveTotals.breakEvenMonthlyRevenue > 0 ? fmtTL(liveTotals.breakEvenMonthlyRevenue) : "—"}
            </div>
            <div className="text-xs text-emerald-700 mt-1">marj girilmeli</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="text-xs text-amber-700 font-semibold uppercase">Hedef Günlük Ciro</div>
            <div className="text-2xl font-bold text-amber-900 mt-1">
              {liveTotals.breakEvenDailyRevenue > 0 ? fmtTL(liveTotals.breakEvenDailyRevenue) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="kunye" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="kunye"><Building2 className="h-4 w-4 mr-1" />Künye</TabsTrigger>
          <TabsTrigger value="operasyon"><Users className="h-4 w-4 mr-1" />Operasyon</TabsTrigger>
          <TabsTrigger value="giderler"><Wallet className="h-4 w-4 mr-1" />Sabit Giderler</TabsTrigger>
          <TabsTrigger value="performans"><BarChart3 className="h-4 w-4 mr-1" />Performans</TabsTrigger>
          <TabsTrigger value="parametreler"><Settings2 className="h-4 w-4 mr-1" />Parametreler</TabsTrigger>
        </TabsList>

        {/* KÜNYE */}
        <TabsContent value="kunye" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Firma Künyesi</CardTitle>
              <CardDescription>Vergi levhası, IBAN ve temel iletişim bilgileri.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Firma Adı / Ünvan</Label>
                <Input value={profile.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
              </div>
              <div>
                <Label>Hukuki Yapı</Label>
                <Select value={profile.legalForm ?? ""} onValueChange={(v) => set("legalForm", v)}>
                  <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sahis">Şahıs Şirketi</SelectItem>
                    <SelectItem value="ltd">Limited Şirket</SelectItem>
                    <SelectItem value="as">Anonim Şirket</SelectItem>
                    <SelectItem value="kollektif">Kollektif Şirket</SelectItem>
                    <SelectItem value="komandit">Komandit Şirket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sektör</Label>
                <Select value={profile.sector ?? ""} onValueChange={(v) => set("sector", v)}>
                  <SelectTrigger><SelectValue placeholder="Sektör seçin" /></SelectTrigger>
                  <SelectContent>
                    {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kuruluş Yılı</Label>
                <Input type="number" min={1900} max={2100} value={profile.yearFounded ?? ""} onChange={(e) => set("yearFounded", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Vergi Numarası</Label>
                <Input value={profile.taxNumber ?? ""} onChange={(e) => set("taxNumber", e.target.value)} />
              </div>
              <div>
                <Label>Vergi Dairesi</Label>
                <Input value={profile.taxOffice ?? ""} onChange={(e) => set("taxOffice", e.target.value)} />
              </div>
              <div>
                <Label>KDV Mükellefiyet Türü</Label>
                <Select value={profile.vatRegime ?? "gercek"} onValueChange={(v) => set("vatRegime", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gercek">Gerçek Usul</SelectItem>
                    <SelectItem value="basit">Basit Usul</SelectItem>
                    <SelectItem value="muaf">KDV'den Muaf</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={profile.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Adres</Label>
                <Textarea rows={2} value={profile.address ?? ""} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div>
                <Label>E-posta</Label>
                <Input type="email" value={profile.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>Web Sitesi</Label>
                <Input value={profile.website ?? ""} onChange={(e) => set("website", e.target.value)} />
              </div>
              <Separator className="md:col-span-2 my-2" />
              <div>
                <Label>IBAN</Label>
                <Input value={profile.iban ?? ""} onChange={(e) => set("iban", e.target.value)} placeholder="TR…" />
              </div>
              <div>
                <Label>Banka Adı</Label>
                <Input value={profile.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
              </div>
              <div>
                <Label>Hesap Sahibi</Label>
                <Input value={profile.accountHolder ?? ""} onChange={(e) => set("accountHolder", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPERASYON */}
        <TabsContent value="operasyon" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Personel</CardTitle>
              <CardDescription>Çalışan sayısı ve istihdam dağılımı.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Toplam Çalışan</Label>
                <Input type="number" min={0} value={profile.employeeCountTotal ?? ""} onChange={(e) => set("employeeCountTotal", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Tam Zamanlı</Label>
                <Input type="number" min={0} value={profile.employeeCountFulltime ?? ""} onChange={(e) => set("employeeCountFulltime", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Yarı Zamanlı</Label>
                <Input type="number" min={0} value={profile.employeeCountParttime ?? ""} onChange={(e) => set("employeeCountParttime", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Şube Sayısı</Label>
                <Input type="number" min={1} value={profile.branchCount ?? ""} onChange={(e) => set("branchCount", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Haftada Çalışma Günü</Label>
                <Select value={String(profile.workingDaysPerWeek ?? 6)} onValueChange={(v) => set("workingDaysPerWeek", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 gün</SelectItem>
                    <SelectItem value="6">6 gün</SelectItem>
                    <SelectItem value="7">7 gün</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>İşyeri / Mekan</CardTitle>
              <CardDescription>Dükkan/depo durumu ve kira bilgileri.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Mülkiyet Durumu</Label>
                <Select value={profile.propertyType ?? ""} onValueChange={(v) => set("propertyType", v)}>
                  <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Kendi Mülkü</SelectItem>
                    <SelectItem value="rental">Kiralık</SelectItem>
                    <SelectItem value="mixed">Karışık</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {profile.propertyType !== "owned" && (
                <>
                  <div>
                    <Label>Aylık Kira (TL)</Label>
                    <Input type="number" min={0} value={profile.monthlyRent ?? ""} onChange={(e) => set("monthlyRent", Number(e.target.value) || null)} />
                  </div>
                  <div>
                    <Label>Depozito (TL)</Label>
                    <Input type="number" min={0} value={profile.rentDeposit ?? ""} onChange={(e) => set("rentDeposit", Number(e.target.value) || null)} />
                  </div>
                  <div>
                    <Label>Kira Artış Ayı (1-12)</Label>
                    <Input type="number" min={1} max={12} value={profile.rentEscalationMonth ?? ""} onChange={(e) => set("rentEscalationMonth", Number(e.target.value) || null)} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GİDERLER + SGK CALC */}
        <TabsContent value="giderler" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Aylık Sabit Giderler</CardTitle>
              <CardDescription>12 ay baz alınır. Sadece kesin bildiğiniz değerleri girin; sistem geri kalanı otomatik hesaplar.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Aylık Faturalar (elektrik+su+gaz+internet toplamı)</Label>
                <Input type="number" min={0} value={profile.monthlyUtilities ?? ""} onChange={(e) => set("monthlyUtilities", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Aylık Yemek Gideri</Label>
                <Input type="number" min={0} value={profile.monthlyMealExpense ?? ""} onChange={(e) => set("monthlyMealExpense", Number(e.target.value) || null)} />
              </div>
            </CardContent>
          </Card>

          {/* SGK Hesaplayıcı */}
          <Card className="border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-700" /> SGK & Brüt Hesaplayıcı (2026)</CardTitle>
              <CardDescription>
                Net maaşı girip brüt + işveren maliyetini hesaplayın. Sonucu tek tıkla personel kalemi olarak ekleyebilirsiniz.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[180px]">
                  <Label>Hesap Tipi</Label>
                  <Select value={calcMode} onValueChange={(v: any) => setCalcMode(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="net-to-gross">Net → Brüt + İşveren Maliyeti</SelectItem>
                      <SelectItem value="gross-to-net">Brüt → Net + İşveren Maliyeti</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <Label>{calcMode === "net-to-gross" ? "Vermek İstediğiniz Net Maaş (TL)" : "Brüt Maaş (TL)"}</Label>
                  <Input type="number" min={0} value={calcAmount} onChange={(e) => setCalcAmount(e.target.value)} placeholder="örn. 30000" />
                </div>
                <Button onClick={runCalc} disabled={calcLoading}>
                  {calcLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  Hesapla
                </Button>
              </div>

              {calcResult && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-slate-600">Brüt Maaş</div>
                      <div className="text-xl font-bold text-slate-900">{fmtTL2(calcResult.gross)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">Net Maaş</div>
                      <div className="text-xl font-bold text-emerald-700">{fmtTL2(calcResult.net)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">Toplam İşveren Maliyeti</div>
                      <div className="text-xl font-bold text-blue-900">{fmtTL2(calcResult.employerCost)}</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div className="font-semibold text-slate-700 mt-1">İşçi Tarafı (kesintiler)</div>
                    <div className="font-semibold text-slate-700 mt-1">İşveren Tarafı (ek maliyetler)</div>
                    <div className="flex justify-between"><span>SGK İşçi Payı (%14)</span><span>{fmtTL2(calcResult.sgkEmployee)}</span></div>
                    <div className="flex justify-between"><span>SGK İşveren Payı (%15.5)</span><span>{fmtTL2(calcResult.sgkEmployer)}</span></div>
                    <div className="flex justify-between"><span>İşsizlik İşçi (%1)</span><span>{fmtTL2(calcResult.unemploymentEmployee)}</span></div>
                    <div className="flex justify-between"><span>İşsizlik İşveren (%2)</span><span>{fmtTL2(calcResult.unemploymentEmployer)}</span></div>
                    <div className="flex justify-between"><span>Gelir Vergisi (istisna sonrası)</span><span>{fmtTL2(calcResult.incomeTax)}</span></div>
                    <div className="flex justify-between"><span>Kısa Vade Sigortası (%2.25)</span><span>{fmtTL2(calcResult.shortTermInsurance)}</span></div>
                    <div className="flex justify-between"><span>Damga Vergisi (istisna sonrası)</span><span>{fmtTL2(calcResult.stampDuty)}</span></div>
                    <div></div>
                  </div>

                  <Button size="sm" variant="outline" onClick={addCalcAsPayrollLine}>
                    <Plus className="h-4 w-4 mr-1" /> Bu Sonucu Personel Kalemi Olarak Ekle
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Personel kalemleri */}
          <Card>
            <CardHeader>
              <CardTitle>Personel Maliyet Kalemleri</CardTitle>
              <CardDescription>
                Pozisyon başına satır ekleyin. Toplam aylık personel maliyeti otomatik hesaplanır.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {payroll.length === 0 && (
                <div className="text-sm text-slate-500 italic">
                  Henüz personel kalemi eklenmemiş. Üstteki SGK hesaplayıcıyı kullanın veya aşağıdan elle ekleyin.
                </div>
              )}
              {payroll.map((p, i) => (
                <div key={i} className="grid md:grid-cols-12 gap-2 items-end border-b pb-3">
                  <div className="md:col-span-3">
                    <Label className="text-xs">Pozisyon</Label>
                    <Input value={p.role} onChange={(e) => {
                      const v = [...payroll]; v[i] = { ...p, role: e.target.value }; setPayroll(v);
                    }} />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Kişi</Label>
                    <Input type="number" min={1} value={p.count} onChange={(e) => {
                      const v = [...payroll]; v[i] = { ...p, count: Number(e.target.value) || 1 }; setPayroll(v);
                    }} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Brüt (kişi başı)</Label>
                    <Input type="number" min={0} value={p.gross} onChange={(e) => {
                      const v = [...payroll]; v[i] = { ...p, gross: Number(e.target.value) || 0 }; setPayroll(v);
                    }} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Net (kişi başı)</Label>
                    <Input type="number" min={0} value={p.net} onChange={(e) => {
                      const v = [...payroll]; v[i] = { ...p, net: Number(e.target.value) || 0 }; setPayroll(v);
                    }} />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">İşveren Maliyeti (kişi başı)</Label>
                    <Input type="number" min={0} value={p.employerCostPerPerson} onChange={(e) => {
                      const v = [...payroll]; v[i] = { ...p, employerCostPerPerson: Number(e.target.value) || 0 }; setPayroll(v);
                    }} />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button size="icon" variant="ghost" onClick={() => setPayroll(payroll.filter((_, ix) => ix !== i))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  <div className="md:col-span-12 text-xs text-slate-500">
                    Bu satır toplam: <span className="font-semibold text-blue-700">{fmtTL(p.employerCostPerPerson * p.count)}</span> / ay
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPayroll([...payroll, { role: "", count: 1, gross: 0, net: 0, employerCostPerPerson: 0 }])}>
                <Plus className="h-4 w-4 mr-1" /> Boş Kalem Ekle
              </Button>
              <div className="flex justify-end pt-2 border-t">
                <div className="text-right">
                  <div className="text-xs text-slate-600">Toplam Aylık Personel Maliyeti (işveren)</div>
                  <div className="text-2xl font-bold text-blue-900">{fmtTL(liveTotals.payroll)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Diğer giderler */}
          <Card>
            <CardHeader>
              <CardTitle>Diğer Sabit Giderler</CardTitle>
              <CardDescription>Yazılım abonelikleri, muhasebeci ücreti, sigorta vb.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {misc.map((m, i) => (
                <div key={i} className="grid md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-7">
                    <Input placeholder="Gider adı (örn. Muhasebeci ücreti)" value={m.label} onChange={(e) => {
                      const v = [...misc]; v[i] = { ...m, label: e.target.value }; setMisc(v);
                    }} />
                  </div>
                  <div className="md:col-span-4">
                    <Input type="number" min={0} placeholder="Aylık tutar (TL)" value={m.amount} onChange={(e) => {
                      const v = [...misc]; v[i] = { ...m, amount: Number(e.target.value) || 0 }; setMisc(v);
                    }} />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button size="icon" variant="ghost" onClick={() => setMisc(misc.filter((_, ix) => ix !== i))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setMisc([...misc, { label: "", amount: 0 }])}>
                <Plus className="h-4 w-4 mr-1" /> Gider Ekle
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERFORMANS */}
        <TabsContent value="performans" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Geçmiş Performans (Referans)</CardTitle>
              <CardDescription>
                Sistemi kullanmaya başlamadan önceki ortalama değerler. Sistem bağlandıktan sonra
                gerçek değerler otomatik akar; bu alanlar yalnızca başlangıç referansıdır.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Aylık Ortalama Ciro (geçmiş 6 ay)</Label>
                <Input type="number" min={0} value={profile.monthlyAvgRevenue ?? ""} onChange={(e) => set("monthlyAvgRevenue", Number(e.target.value) || null)} />
              </div>
              <div>
                <Label>Hedef Brüt Kâr Marjı (%)</Label>
                <Input type="number" min={0} max={100} step={0.1} value={profile.targetGrossMargin ?? ""} onChange={(e) => set("targetGrossMargin", Number(e.target.value) || null)} />
                <p className="text-xs text-slate-500 mt-1">Başabaş ve hedef ciro hesabında kullanılır.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-700" /> Hesaplama Özeti</CardTitle>
              <CardDescription>Aşağıdaki tüm değerler Gerçek Kâr ve Bütçe modüllerinde otomatik kullanılacak.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between border-b pb-1"><span>Kira</span><span className="font-semibold">{fmtTL(liveTotals.rent)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Faturalar</span><span className="font-semibold">{fmtTL(liveTotals.utilities)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Yemek</span><span className="font-semibold">{fmtTL(liveTotals.meal)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Personel (işveren maliyeti dahil)</span><span className="font-semibold">{fmtTL(liveTotals.payroll)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Diğer giderler</span><span className="font-semibold">{fmtTL(liveTotals.misc)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Çalışma günü / ay (≈ {liveTotals.workingDaysPerMonth.toFixed(1)})</span><span className="font-semibold">{profile.workingDaysPerWeek ?? 6} gün/hafta</span></div>
              <div className="flex justify-between border-b pb-1 pt-2 col-span-full text-lg"><span className="font-semibold">Aylık Toplam Sabit Gider</span><span className="font-bold text-blue-900">{fmtTL(liveTotals.totalMonthlyFixedCost)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Yıllık Sabit Gider</span><span className="font-semibold">{fmtTL(liveTotals.annualFixedCost)}</span></div>
              <div className="flex justify-between border-b pb-1"><span>Günlük Sabit Gider</span><span className="font-semibold">{fmtTL(liveTotals.dailyFixedCost)}</span></div>
              <div className="flex justify-between border-b pb-1 col-span-full pt-2"><span>Hedef Aylık Ciro (başabaş)</span><span className="font-bold text-emerald-700">{fmtTL(liveTotals.breakEvenMonthlyRevenue)}</span></div>
              <div className="flex justify-between border-b pb-1 col-span-full"><span>Hedef Günlük Ciro</span><span className="font-bold text-emerald-700">{fmtTL(liveTotals.breakEvenDailyRevenue)}</span></div>
              {profile.monthlyAvgRevenue > 0 && liveTotals.breakEvenMonthlyRevenue > 0 && (
                <div className="col-span-full mt-2 p-3 rounded bg-white border">
                  <div className="text-xs text-slate-500">Şu anki ciroya göre durum</div>
                  <div className="font-semibold text-base">
                    {profile.monthlyAvgRevenue >= liveTotals.breakEvenMonthlyRevenue ? (
                      <span className="text-emerald-700">✓ Başabaşın üstündesiniz — aylık {fmtTL(profile.monthlyAvgRevenue - liveTotals.breakEvenMonthlyRevenue)} kâr</span>
                    ) : (
                      <span className="text-amber-700">⚠ Başabaşın altındasınız — aylık {fmtTL(liveTotals.breakEvenMonthlyRevenue - profile.monthlyAvgRevenue)} eksik</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PARAMETRELER */}
        <TabsContent value="parametreler" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>2026 Hesaplama Parametreleri</CardTitle>
              <CardDescription className="space-y-1">
                <span>Asgari ücret, vergi dilimleri ve SGK oranları. Resmi değişiklik olduğunda buradan güncelleyin — tüm hesaplar otomatik yenilenir.</span>
                <span className="block flex items-center gap-1 text-amber-700"><Info className="h-3 w-3" /> Tenant başına özelleştirilebilir.</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!sgk ? (
                <div className="text-sm text-slate-500">Yükleniyor…</div>
              ) : (
                <>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <Label>Brüt Asgari Ücret (TL/ay)</Label>
                      <Input type="number" value={sgk.minWageGross} onChange={(e) => setSgkField("minWageGross", Number(e.target.value) || 0)} />
                    </div>
                    <div>
                      <Label>Aylık Gelir Vergisi İstisnası (TL)</Label>
                      <Input type="number" value={sgk.incomeTaxExemption} onChange={(e) => setSgkField("incomeTaxExemption", Number(e.target.value) || 0)} />
                    </div>
                    <div>
                      <Label>Aylık Damga Vergisi İstisnası (TL)</Label>
                      <Input type="number" value={sgk.stampDutyExemption} onChange={(e) => setSgkField("stampDutyExemption", Number(e.target.value) || 0)} />
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label>Yıllık Kümülatif Gelir Vergisi Dilimleri</Label>
                    <div className="space-y-2 mt-2">
                      {sgk.brackets.map((b, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6">
                            <Input type="number" value={Number.isFinite(b.upTo) ? b.upTo : 0} disabled={!Number.isFinite(b.upTo)} onChange={(e) => {
                              const v = [...sgk.brackets]; v[i] = { ...b, upTo: Number(e.target.value) || 0 }; setSgkField("brackets", v);
                            }} />
                          </div>
                          <div className="col-span-1 text-center text-slate-500">→</div>
                          <div className="col-span-3">
                            <Input type="number" step={0.01} value={b.rate * 100} onChange={(e) => {
                              const v = [...sgk.brackets]; v[i] = { ...b, rate: (Number(e.target.value) || 0) / 100 }; setSgkField("brackets", v);
                            }} />
                          </div>
                          <div className="col-span-1 text-slate-500">%</div>
                          <div className="col-span-1">
                            {Number.isFinite(b.upTo) && (
                              <Button size="icon" variant="ghost" onClick={() => setSgkField("brackets", sgk.brackets.filter((_, ix) => ix !== i))}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                            {!Number.isFinite(b.upTo) && <Badge variant="secondary">Üst dilim</Badge>}
                          </div>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => {
                        const v = [...sgk.brackets];
                        // sondan bir önceye ekle (Infinity en sonda kalsın)
                        v.splice(v.length - 1, 0, { upTo: 0, rate: 0.2 });
                        setSgkField("brackets", v);
                      }}>
                        <Plus className="h-4 w-4 mr-1" /> Dilim Ekle
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <Label>SGK İşçi Payı (%)</Label>
                      <Input type="number" step={0.01} value={sgk.sgkEmployeeRate * 100} onChange={(e) => setSgkField("sgkEmployeeRate", (Number(e.target.value) || 0) / 100)} />
                    </div>
                    <div>
                      <Label>İşsizlik İşçi (%)</Label>
                      <Input type="number" step={0.01} value={sgk.unemploymentEmployeeRate * 100} onChange={(e) => setSgkField("unemploymentEmployeeRate", (Number(e.target.value) || 0) / 100)} />
                    </div>
                    <div>
                      <Label>Damga Vergisi (%)</Label>
                      <Input type="number" step={0.001} value={sgk.stampDutyRate * 100} onChange={(e) => setSgkField("stampDutyRate", (Number(e.target.value) || 0) / 100)} />
                    </div>
                    <div>
                      <Label>SGK İşveren (%) — teşvikli 15.5</Label>
                      <Input type="number" step={0.01} value={sgk.sgkEmployerRate * 100} onChange={(e) => setSgkField("sgkEmployerRate", (Number(e.target.value) || 0) / 100)} />
                    </div>
                    <div>
                      <Label>İşsizlik İşveren (%)</Label>
                      <Input type="number" step={0.01} value={sgk.unemploymentEmployerRate * 100} onChange={(e) => setSgkField("unemploymentEmployerRate", (Number(e.target.value) || 0) / 100)} />
                    </div>
                    <div>
                      <Label>Kısa Vade Sigorta (%) — sektörel ort.</Label>
                      <Input type="number" step={0.01} value={sgk.shortTermInsuranceRate * 100} onChange={(e) => setSgkField("shortTermInsuranceRate", (Number(e.target.value) || 0) / 100)} />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
