import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Loader2, CheckCircle2 } from "lucide-react";

type Item = { name: string; qty: number; unit: string; specs?: string };

async function postJson(path: string, body: unknown) {
  const r = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
  return j;
}

async function getJson(path: string) {
  const r = await fetch(`/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export default function NewRfq() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([{ name: "", qty: 1, unit: "ad" }]);
  const [selected, setSelected] = useState<number[]>([]);
  const [dropLeads, setDropLeads] = useState(true);

  const { data: sellersData } = useQuery({
    queryKey: ["sellers", ""],
    queryFn: () => getJson("/buyer/sellers"),
  });

  // URL ?sellerId=X → preselect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = Number(params.get("sellerId"));
    if (Number.isFinite(sid) && sid > 0 && !selected.includes(sid)) {
      setSelected([sid]);
    }
  }, []);

  const submit = useMutation({
    mutationFn: () =>
      postJson("/buyer/rfqs", {
        title,
        description: description || undefined,
        items: items.filter((i) => i.name.trim()).map((i) => ({
          name: i.name, qty: Number(i.qty), unit: i.unit, specs: i.specs || undefined,
        })),
        targetSellerCompanyIds: selected,
        currency: "TRY",
        dropLeads,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      navigate(`/satinalma/rfqs/${data.rfq.id}`);
    },
  });

  const valid = title.trim().length >= 2 && selected.length > 0 && items.some((i) => i.name.trim() && i.qty > 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="page-new-rfq">
      <div>
        <h2 className="text-2xl font-semibold">Yeni Teklif Talebi (RFQ)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tedarikçilere tek seferde teklif gönderin. Her satıcı için bağımsız bir lead oluşturulur.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Başlık & Açıklama</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="title">Başlık *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: Endüstriyel rulman tedarik talebi" data-testid="input-rfq-title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Açıklama (opsiyonel)</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Teknik detaylar, teslimat koşulları, vb." data-testid="input-rfq-desc" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Kalemler ({items.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setItems([...items, { name: "", qty: 1, unit: "ad" }])} data-testid="btn-add-item">
            <Plus className="h-4 w-4 mr-1" /> Kalem Ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end" data-testid={`item-row-${i}`}>
              <div className="col-span-5 space-y-1">
                {i === 0 && <Label className="text-xs">Ürün/Hizmet</Label>}
                <Input value={it.name} onChange={(e) => { const c = [...items]; c[i].name = e.target.value; setItems(c); }} placeholder="Ad" />
              </div>
              <div className="col-span-2 space-y-1">
                {i === 0 && <Label className="text-xs">Miktar</Label>}
                <Input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => { const c = [...items]; c[i].qty = Number(e.target.value); setItems(c); }} />
              </div>
              <div className="col-span-2 space-y-1">
                {i === 0 && <Label className="text-xs">Birim</Label>}
                <Input value={it.unit} onChange={(e) => { const c = [...items]; c[i].unit = e.target.value; setItems(c); }} />
              </div>
              <div className="col-span-2 space-y-1">
                {i === 0 && <Label className="text-xs">Spec (ops)</Label>}
                <Input value={it.specs ?? ""} onChange={(e) => { const c = [...items]; c[i].specs = e.target.value; setItems(c); }} />
              </div>
              <div className="col-span-1">
                <Button size="icon" variant="ghost" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} data-testid={`btn-remove-item-${i}`}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Hedef Satıcılar ({selected.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-72 overflow-y-auto" data-testid="sellers-checklist">
            {(sellersData?.sellers ?? []).map((s: any) => (
              <label key={s.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer">
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(v) => {
                    setSelected((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)));
                  }}
                  data-testid={`checkbox-seller-${s.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.subdomain}.ticarium365</div>
                </div>
                {s.sector && <Badge variant="outline" className="text-[10px]">{s.sector}</Badge>}
              </label>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t flex items-center gap-3">
            <Checkbox id="dropLeads" checked={dropLeads} onCheckedChange={(v) => setDropLeads(!!v)} data-testid="checkbox-drop-leads" />
            <Label htmlFor="dropLeads" className="cursor-pointer text-sm">
              Her satıcının CRM'ine bir "yeni sorgu" (lead) düşür
            </Label>
          </div>
        </CardContent>
      </Card>

      {submit.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3" data-testid="submit-error">
          {(submit.error as Error).message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/satinalma/rfqs")}>İptal</Button>
        <Button onClick={() => submit.mutate()} disabled={!valid || submit.isPending} data-testid="btn-submit-rfq">
          {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Gönder ({selected.length} satıcı)
        </Button>
      </div>
    </div>
  );
}
