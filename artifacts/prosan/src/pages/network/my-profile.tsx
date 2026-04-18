import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Building2, Eye, EyeOff, Save, Globe, MapPin, Phone, Tag, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface NetworkProfile {
  id: number;
  companyId: number;
  sector: string | null;
  city: string | null;
  district: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  isVisible: boolean;
  showStock: boolean;
  showPrice: boolean;
  showPhone: boolean;
  showLocation: boolean;
  acceptOffers: boolean;
  acceptOrders: boolean;
  isAnonymous: boolean;
  tags: string[];
  trustScore: number;
  reviewCount: number;
}

const SECTORS = [
  "Gıda ve İçecek", "Tekstil ve Hazır Giyim", "İnşaat Malzemeleri", "Elektrik ve Elektronik",
  "Makine ve Ekipman", "Kimya ve Plastik", "Metal ve Çelik", "Mobilya ve Dekorasyon",
  "Otomotiv ve Yedek Parça", "Tarım ve Hayvancılık", "Ambalaj ve Kağıt", "Baskı ve Yayıncılık",
  "Medikal ve Sağlık", "Bilişim ve Yazılım", "Lojistik ve Taşımacılık", "Temizlik ve Hijyen",
  "Güvenlik Sistemleri", "Turizm ve Konaklama", "Perakende", "Toptan Ticaret",
  "Danışmanlık ve Hizmet", "Eğitim", "Diğer",
];

const CITIES = [
  "Adana", "Ankara", "Antalya", "Balıkesir", "Bursa", "Denizli", "Diyarbakır",
  "Erzurum", "Eskişehir", "Gaziantep", "Hatay", "İstanbul", "İzmir", "Kayseri",
  "Kocaeli", "Konya", "Malatya", "Manisa", "Mersin", "Muğla", "Ordu", "Sakarya",
  "Samsun", "Şanlıurfa", "Tekirdağ", "Trabzon", "Van", "Zonguldak", "Diğer",
];

function ToggleRow({ label, description, checked, onCheckedChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function MyNetworkProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [form, setForm] = useState<Partial<NetworkProfile>>({});

  useEffect(() => {
    fetch(`${apiBase}/network/my-profile`, { credentials: "include" })
      .then((r) => r.json())
      .then((p: NetworkProfile) => {
        setProfile(p);
        setForm(p);
      })
      .catch(() => toast({ title: "Profil yüklenemedi", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof NetworkProfile>(key: K, val: NetworkProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function addTag() {
    if (!tagInput.trim()) return;
    const tags = [...(form.tags ?? [])];
    if (!tags.includes(tagInput.trim())) tags.push(tagInput.trim());
    update("tags", tags);
    setTagInput("");
  }

  function removeTag(tag: string) {
    update("tags", (form.tags ?? []).filter((t) => t !== tag));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/network/my-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("fail");
      const saved = await res.json();
      setProfile(saved);
      toast({ title: "Profil kaydedildi" });
    } catch {
      toast({ title: "Kayıt başarısız", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-40" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/network">
            <Button variant="ghost" size="sm" className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Geri
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Ağ Profilim</h1>
            <p className="text-sm text-muted-foreground">Diğer firmalara nasıl görüneceğinizi yönetin</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>

      {profile && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Güven Puanı: <strong>{profile.trustScore > 0 ? profile.trustScore.toFixed(1) : "—"}</strong>
            &nbsp;·&nbsp;
            {profile.reviewCount} Değerlendirme
          </span>
          {form.isVisible ? (
            <Badge variant="outline" className="ml-auto border-emerald-500/20 text-emerald-300">
              <Eye className="h-3 w-3 mr-1" /> Ağda Görünür
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto border-muted text-muted-foreground">
              <EyeOff className="h-3 w-3 mr-1" /> Gizli
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firma Bilgileri</CardTitle>
          <CardDescription>Diğer firmaların sizi tanıması için temel bilgiler</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sektör</Label>
              <Select value={form.sector ?? ""} onValueChange={(v) => update("sector", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sektör seçin" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Şehir</Label>
              <Select value={form.city ?? ""} onValueChange={(v) => update("city", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Şehir seçin" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>İlçe</Label>
            <Input
              placeholder="İlçe (opsiyonel)"
              value={form.district ?? ""}
              onChange={(e) => update("district", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Firma Tanıtımı</Label>
            <Textarea
              placeholder="Firmanızı ve yaptığınız işi kısaca açıklayın..."
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">{(form.description ?? "").length}/1000</p>
          </div>

          <div className="space-y-1.5">
            <Label>Adres</Label>
            <Input
              placeholder="Açık adres (opsiyonel)"
              value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Telefon
              </Label>
              <Input
                placeholder="0xxx xxx xx xx"
                value={form.phone ?? ""}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Web Sitesi
              </Label>
              <Input
                placeholder="https://..."
                value={form.website ?? ""}
                onChange={(e) => update("website", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Etiketler
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Etiket ekle (örn: rulman, vana, kablo)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {(form.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(form.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-destructive ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Görünürlük ve İzinler</CardTitle>
          <CardDescription>Diğer firmalara ne gösterileceğini kontrol edin</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleRow
            label="Ağda Görünür"
            description="Kapalıysa diğer firmalar sizi bulamaz"
            checked={form.isVisible ?? false}
            onCheckedChange={(v) => update("isVisible", v)}
          />
          <ToggleRow
            label="Anonim Görün"
            description="Firma adınız gizlenir, sadece sektör ve konum görünür"
            checked={form.isAnonymous ?? false}
            onCheckedChange={(v) => update("isAnonymous", v)}
          />
          <ToggleRow
            label="Telefonu Göster"
            description="Telefon numaranız profilde görünsün"
            checked={form.showPhone ?? false}
            onCheckedChange={(v) => update("showPhone", v)}
          />
          <ToggleRow
            label="Konumu Göster"
            description="Harita konumunuz paylaşılsın"
            checked={form.showLocation ?? false}
            onCheckedChange={(v) => update("showLocation", v)}
          />
          <ToggleRow
            label="Fiyatları Göster"
            description="Ürün fiyatlarınız görünsün"
            checked={form.showPrice ?? false}
            onCheckedChange={(v) => update("showPrice", v)}
          />
          <ToggleRow
            label="Stok Bilgisi Paylaş"
            description="Ürün stok miktarları ağda görünsün"
            checked={form.showStock ?? false}
            onCheckedChange={(v) => update("showStock", v)}
          />
          <ToggleRow
            label="Teklif Kabul Et"
            description="Diğer firmalar size teklif isteyebilsin"
            checked={form.acceptOffers ?? false}
            onCheckedChange={(v) => update("acceptOffers", v)}
          />
          <ToggleRow
            label="Sipariş Kabul Et"
            description="Diğer firmalar doğrudan sipariş oluşturabilsin"
            checked={form.acceptOrders ?? false}
            onCheckedChange={(v) => update("acceptOrders", v)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </Button>
      </div>
    </div>
  );
}
