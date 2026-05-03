import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/components/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { OnlineSalesFeatureGate } from "@/components/online-sales-feature-gate";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Truck, Plus, Loader2, Trash2, MapPin, Sparkles, Calculator, Save,
  AlertCircle, CheckCircle2, Package, CircleDot,
} from "lucide-react";

type Zone = { id: number; name: string; cities: string[]; isDefault: boolean };
type Rule = {
  id: number; zoneId: number; name: string; carrier: string;
  minDesi: number; maxDesi: number; price: number;
  freeOverCartTotal: number | null; isActive: boolean; priority: number;
};

const CARRIERS = [
  { key: "manual", label: "Manuel", eta: "—", hint: "Sabit kural / el ile" },
  { key: "yurtici", label: "Yurtiçi Kargo", eta: "1–3 iş günü", hint: "Standart gönderi" },
  { key: "aras", label: "Aras Kargo", eta: "2–4 iş günü", hint: "Geniş ağ" },
  { key: "mng", label: "MNG Kargo", eta: "1–3 iş günü", hint: "Şehir içi hızlı" },
  { key: "ptt", label: "PTT", eta: "3–6 iş günü", hint: "Ekonomik" },
  { key: "ups", label: "UPS", eta: "2–5 iş günü", hint: "Uluslararası uygun" },
  { key: "ceva", label: "Ceva", eta: "3–7 iş günü", hint: "Paleti / ağır" },
  { key: "hepsijet", label: "Hepsijet", eta: "1–2 iş günü", hint: "Entegrasyonlu" },
  { key: "trendyol_express", label: "Trendyol Express", eta: "1–3 iş günü", hint: "Pazaryeri operasyonu" },
  { key: "sendeo", label: "Sendeo", eta: "1–3 iş günü", hint: "Çoklu taşıyıcı" },
];

const TR_CITIES = [
  "İSTANBUL","ANKARA","İZMİR","BURSA","ANTALYA","ADANA","KONYA","GAZİANTEP",
  "ŞANLIURFA","KOCAELİ","MERSİN","DİYARBAKIR","HATAY","MANİSA","KAYSERİ","SAMSUN",
  "BALIKESİR","KAHRAMANMARAŞ","VAN","AYDIN","TEKİRDAĞ","SAKARYA","DENİZLİ","MUĞLA",
  "ESKİŞEHİR","MARDİN","TRABZON","ORDU","AFYONKARAHİSAR","ERZURUM","MALATYA","SİVAS",
  "EDİRNE","ELAZIĞ","ZONGULDAK","ÇORUM","KÜTAHYA","BATMAN","ADIYAMAN","GİRESUN",
  "TOKAT","ÇANAKKALE","UŞAK","ISPARTA","DÜZCE","BOLU","KIRIKKALE","KARABÜK",
  "AKSARAY","NEVŞEHİR","NİĞDE","KIRŞEHİR","KASTAMONU","RİZE","KARS","AĞRI",
  "AMASYA","BURDUR","ARDAHAN","ARTVİN","BARTIN","BAYBURT","BİLECİK","BİNGÖL",
  "BİTLİS","ÇANKIRI","ERZİNCAN","GÜMÜŞHANE","HAKKARİ","IĞDIR","KARAMAN","KİLİS",
  "MUŞ","OSMANİYE","SİİRT","SİNOP","ŞIRNAK","TUNCELİ","YALOVA","YOZGAT","KIRKLARELİ",
];

export default function KargoYonetimi() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [zones, setZones] = useState<Zone[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [zr, rr] = await Promise.all([
        fetch("/api/shipping/zones", { credentials: "include" }).then(r => r.json()),
        fetch("/api/shipping/rules", { credentials: "include" }).then(r => r.json()),
      ]);
      setZones(zr.items || []);
      setRules(rr.items || []);
    } catch { toast({ title: "Veri alınamadı", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <OnlineSalesFeatureGate title="Kargo ayarları paketinizde kapalı">
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <Link href="/eticarium-merkezi" className="hover:underline">Online Satış Merkezi</Link>
            <span>/</span>
            <span>Kargo Yönetimi</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Truck className="w-7 h-7 text-emerald-600" /> Kargo Yönetim Merkezi
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Bölge tanımla, desi/şehir bazlı kargo kuralları kur, ücretsiz kargo eşiği belirle. Test sekmesinden anında fiyat sorgula.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" /></div>
      ) : (
        <Tabs defaultValue="zones">
          <TabsList>
            <TabsTrigger value="zones">Bölgeler ({zones.length})</TabsTrigger>
            <TabsTrigger value="rules">Kurallar ({rules.length})</TabsTrigger>
            <TabsTrigger value="quote">Fiyat Sorgu</TabsTrigger>
          </TabsList>

          <TabsContent value="zones" className="mt-4">
            <ZonesPanel zones={zones} reload={load} canEdit={isAdmin} />
          </TabsContent>
          <TabsContent value="rules" className="mt-4">
            <RulesPanel rules={rules} zones={zones} reload={load} canEdit={isAdmin} />
          </TabsContent>
          <TabsContent value="quote" className="mt-4">
            <QuotePanel />
          </TabsContent>
        </Tabs>
      )}
    </div>
    </OnlineSalesFeatureGate>
  );
}

function ZonesPanel({ zones, reload, canEdit }: { zones: Zone[]; reload: () => void; canEdit: boolean }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Zone | null>(null);
  const [open, setOpen] = useState(false);

  const newZone = () => {
    setEditing({ id: 0, name: "", cities: [], isDefault: false });
    setOpen(true);
  };
  const remove = async (id: number) => {
    if (!confirm("Bölgeyi silmek istediğinize emin misiniz? Bağlı kurallar da silinir.")) return;
    await fetch(`/api/shipping/zones/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Bölge silindi" });
    reload();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Kargo Bölgeleri</CardTitle>
          <CardDescription>Şehirleri gruplara ayırın. "Varsayılan" işaretli bölge, hiçbir gruba girmeyen şehirler için kullanılır.</CardDescription>
        </div>
        {canEdit && (
          <Button onClick={newZone} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" /> Yeni Bölge
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {zones.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
            <div>Henüz bölge yok.</div>
            {canEdit && <Button variant="outline" onClick={newZone} className="mt-4"><Plus className="w-4 h-4 mr-2" /> İlk Bölgeyi Oluştur</Button>}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {zones.map(z => (
              <div key={z.id} className="border rounded-lg p-4 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => canEdit && (setEditing(z), setOpen(true))} className="font-semibold hover:text-emerald-300 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      {z.name}
                      {z.isDefault && <Badge variant="secondary">Varsayılan</Badge>}
                    </button>
                    <div className="text-xs text-muted-foreground mt-1">{z.cities.length} şehir: {z.cities.slice(0, 5).join(", ")}{z.cities.length > 5 ? `...+${z.cities.length - 5}` : ""}</div>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => remove(z.id)} className="text-red-600 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {open && editing && (
        <ZoneDialog zone={editing} onClose={() => { setOpen(false); setEditing(null); }} onSaved={() => { setOpen(false); setEditing(null); reload(); }} />
      )}
    </Card>
  );
}

function ZoneDialog({ zone, onClose, onSaved }: { zone: Zone; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(zone.name);
  const [isDefault, setIsDefault] = useState(zone.isDefault);
  const [cities, setCities] = useState<string[]>(zone.cities);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = (c: string) => {
    setCities(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);
  };

  const submit = async () => {
    if (name.trim().length < 2) { toast({ title: "Bölge adı en az 2 karakter" }); return; }
    setSaving(true);
    try {
      const url = zone.id ? `/api/shipping/zones/${zone.id}` : "/api/shipping/zones";
      const method = zone.id ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), cities, isDefault }) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message || "Kaydedilemedi");
      }
      toast({ title: zone.id ? "Bölge güncellendi" : "Bölge oluşturuldu" });
      onSaved();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const filtered = TR_CITIES.filter(c => c.includes(filter.toLocaleUpperCase("tr-TR")));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{zone.id ? "Bölgeyi Düzenle" : "Yeni Kargo Bölgesi"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Bölge Adı</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn: Marmara, İstanbul İçi, Doğu" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <span className="text-sm">Varsayılan bölge (gruplanmamış şehirler buraya düşer)</span>
            </div>
          </div>
          <div>
            <Label>Şehirler ({cities.length} seçili)</Label>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Şehir ara..." className="mb-2" />
            <div className="border rounded max-h-72 overflow-y-auto p-2 grid grid-cols-3 gap-1">
              {filtered.map(c => (
                <label key={c} className="flex items-center gap-1 text-xs hover:bg-muted/30 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={cities.includes(c)} onChange={() => toggle(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesPanel({ rules, zones, reload, canEdit }: { rules: Rule[]; zones: Zone[]; reload: () => void; canEdit: boolean }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);

  const newRule = () => {
    if (zones.length === 0) { toast({ title: "Önce bir bölge oluşturun", variant: "destructive" }); return; }
    setEditing({
      id: 0, zoneId: zones[0].id, name: "", carrier: "manual",
      minDesi: 0, maxDesi: 5, price: 50, freeOverCartTotal: null, isActive: true, priority: 100,
    });
    setOpen(true);
  };
  const remove = async (id: number) => {
    if (!confirm("Kuralı silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/shipping/rules/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Kural silindi" });
    reload();
  };
  const toggle = async (r: Rule) => {
    await fetch(`/api/shipping/rules/${r.id}`, { method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !r.isActive }) });
    reload();
  };

  const zoneName = (id: number) => zones.find(z => z.id === id)?.name || "?";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Kargo Kuralları</CardTitle>
          <CardDescription>Bölge + desi aralığı için fiyat. Düşük öncelik önce uygulanır.</CardDescription>
        </div>
        {canEdit && <Button onClick={newRule} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-2" /> Yeni Kural</Button>}
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
            <div>Henüz kural yok.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30">
                <div className="text-xs font-mono text-muted-foreground/70 w-10">#{r.priority}</div>
                <Switch checked={r.isActive} onCheckedChange={() => canEdit && toggle(r)} disabled={!canEdit} />
                <div className="flex-1 min-w-0">
                  <button onClick={() => canEdit && (setEditing(r), setOpen(true))} className="font-semibold hover:text-emerald-300">{r.name}</button>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">{zoneName(r.zoneId)}</Badge>
                    <span>{r.minDesi}–{r.maxDesi} desi</span>
                    <span>· ₺{r.price}</span>
                    <Badge variant="secondary">{CARRIERS.find(c => c.key === r.carrier)?.label}</Badge>
                    {r.freeOverCartTotal != null && <span className="text-emerald-600">· ₺{r.freeOverCartTotal} üstü ücretsiz</span>}
                  </div>
                </div>
                {canEdit && <Button variant="ghost" size="sm" onClick={() => remove(r.id)} className="text-red-600 hover:text-red-300"><Trash2 className="w-4 h-4" /></Button>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {open && editing && (
        <RuleDialog rule={editing} zones={zones} onClose={() => { setOpen(false); setEditing(null); }} onSaved={() => { setOpen(false); setEditing(null); reload(); }} />
      )}
    </Card>
  );
}

function RuleDialog({ rule, zones, onClose, onSaved }: { rule: Rule; zones: Zone[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ ...rule, freeOverCartTotal: rule.freeOverCartTotal ?? "" as any });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (f.name.trim().length < 2) { toast({ title: "Ad zorunlu" }); return; }
    if (f.maxDesi < f.minDesi) { toast({ title: "Maks desi >= min desi olmalı" }); return; }
    setSaving(true);
    try {
      const payload = {
        zoneId: f.zoneId, name: f.name.trim(), carrier: f.carrier,
        minDesi: Number(f.minDesi), maxDesi: Number(f.maxDesi),
        price: Number(f.price),
        freeOverCartTotal: f.freeOverCartTotal === "" ? null : Number(f.freeOverCartTotal),
        isActive: f.isActive, priority: Number(f.priority),
      };
      const url = rule.id ? `/api/shipping/rules/${rule.id}` : "/api/shipping/rules";
      const method = rule.id ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message || "Kaydedilemedi");
      }
      toast({ title: rule.id ? "Kural güncellendi" : "Kural oluşturuldu" });
      onSaved();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{rule.id ? "Kuralı Düzenle" : "Yeni Kargo Kuralı"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Kural Adı</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Örn: İstanbul içi 0-5 desi" /></div>
            <div><Label>Bölge</Label>
              <Select value={String(f.zoneId)} onValueChange={(v) => setF({ ...f, zoneId: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{zones.map(z => <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Kargo Firması</Label>
              <Select value={f.carrier} onValueChange={(v) => setF({ ...f, carrier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CARRIERS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Min Desi</Label>
              <Input type="number" step="0.1" value={f.minDesi} onChange={(e) => setF({ ...f, minDesi: Number(e.target.value) })} /></div>
            <div><Label>Maks Desi</Label>
              <Input type="number" step="0.1" value={f.maxDesi} onChange={(e) => setF({ ...f, maxDesi: Number(e.target.value) })} /></div>
            <div><Label>Fiyat (₺)</Label>
              <Input type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></div>
            <div><Label>Sepet ≥ X TL ise ücretsiz</Label>
              <Input type="number" step="0.01" value={f.freeOverCartTotal as any}
                     onChange={(e) => setF({ ...f, freeOverCartTotal: e.target.value as any })}
                     placeholder="opsiyonel" /></div>
            <div><Label>Öncelik</Label>
              <Input type="number" value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-2">
              <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
              <span className="text-sm">{f.isActive ? "Aktif" : "Pasif"}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuotePanel() {
  const { toast } = useToast();
  const [city, setCity] = useState("İSTANBUL");
  const [totalDesi, setTotalDesi] = useState(3);
  const [cartTotal, setCartTotal] = useState(250);
  const [carrier, setCarrier] = useState<string>("yurtici");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/shipping/quote", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, totalDesi, cartTotal, carrier }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || j?.message || "Hata");
      setResult(j);
    } catch (e: any) { toast({ title: "Sorgu hatası", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const carrierLabel = CARRIERS.find((c) => c.key === carrier)?.label ?? carrier;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Kargo Fiyat Sorgu</CardTitle>
            <CardDescription>Taşıyıcı seçin; kurallarınız bu firmaya göre eşleşir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Taşıyıcı</Label>
              <RadioGroup value={carrier} onValueChange={setCarrier} className="grid gap-2">
                {CARRIERS.map((c) => (
                  <label
                    key={c.key}
                    htmlFor={`car-${c.key}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40 ${carrier === c.key ? "border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/30" : "border-border"}`}
                  >
                    <RadioGroupItem value={c.key} id={`car-${c.key}`} className="mt-1" />
                    <div className="flex flex-1 gap-3 min-w-0">
                      <div
                        className="h-11 w-11 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold border bg-muted/50"
                        aria-hidden
                      >
                        {c.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight">{c.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{c.hint}</div>
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1 font-medium">
                          Tahmini teslim: {c.eta}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0 self-center tabular-nums">
                        Kurala göre
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div><Label>Teslimat Şehri</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {TR_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Toplam Desi</Label>
              <Input type="number" step="0.1" value={totalDesi} onChange={(e) => setTotalDesi(Number(e.target.value))} /></div>
            <div><Label>Sepet Tutarı (₺)</Label>
              <Input type="number" step="0.01" value={cartTotal} onChange={(e) => setCartTotal(Number(e.target.value))} /></div>
            <Button onClick={run} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />} Hesapla
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sonuç</CardTitle>
            <CardDescription className="font-medium text-foreground/80">{carrierLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="text-center text-muted-foreground/70 py-12">Taşıyıcı ve parametreleri seçip hesaplayın</div>
            ) : (
              <div className="space-y-3">
                <div className="text-center p-6 border rounded-lg bg-muted/30">
                  {result.price === 0 ? (
                    <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                  ) : (
                    <Truck className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                  )}
                  <div className="text-3xl font-bold">{result.price === 0 ? "ÜCRETSİZ" : `₺${result.price}`}</div>
                  <div className="text-sm text-muted-foreground mt-1">{result.reason}</div>
                </div>
                {result.ruleId != null && (
                  <div className="text-xs text-muted-foreground/70 text-center">
                    Kural #{result.ruleId} · Bölge #{result.zoneId}
                  </div>
                )}
                {result.ruleId == null && result.price !== 0 && (
                  <div className="flex items-center gap-2 text-amber-600 text-xs justify-center">
                    <AlertCircle className="w-3 h-3" /> Bu taşıyıcı için eşleşen kural bulunamadı
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ShipmentTrackingDemo />
    </div>
  );
}

const TRACK_STEPS = ["Hazırlandı", "Kargoya Verildi", "Dağıtımda", "Teslim"] as const;

function ShipmentTrackingDemo() {
  const [step, setStep] = useState(1);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Gönderi takibi (örnek akış)</CardTitle>
          <CardDescription>Müşteriye gösterilecek adımlar — entegrasyon ile gerçek durum beslenir.</CardDescription>
        </div>
        <div className="flex gap-2 text-xs">
          {TRACK_STEPS.map((_, i) => (
            <Button key={i} type="button" size="sm" variant={step === i ? "default" : "outline"} onClick={() => setStep(i)}>
              Adım {i + 1}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 md:gap-0 md:justify-between">
          {TRACK_STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={label} className="flex items-center gap-2 md:flex-1 md:min-w-0">
                <div className="flex flex-col items-center md:flex-1 min-w-0">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold shrink-0 ${
                      active
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                        : done
                          ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700"
                          : "border-muted bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : active ? <CircleDot className="h-5 w-5" /> : i + 1}
                  </div>
                  <span className={`mt-2 text-center text-xs font-medium px-1 ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </div>
                {i < TRACK_STEPS.length - 1 && (
                  <div className={`hidden md:block h-0.5 flex-1 mx-1 rounded ${done ? "bg-emerald-500/50" : "bg-border"}`} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
