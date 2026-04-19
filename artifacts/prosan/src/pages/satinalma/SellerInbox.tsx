import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Inbox, Send, X, Eye } from "lucide-react";
import { useState } from "react";

async function getJson(path: string) {
  const r = await fetch(`/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
async function postJson(path: string, body?: any) {
  const r = await fetch(`/api${path}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || j?.error || `${path}: ${r.status}`);
  return j;
}

const T_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Yeni", cls: "bg-blue-100 text-blue-800" },
  viewed: { label: "Görüntülendi", cls: "bg-amber-100 text-amber-800" },
  quoted: { label: "Teklif Verildi", cls: "bg-green-100 text-green-800" },
  declined: { label: "Reddedildi", cls: "bg-slate-200 text-slate-700" },
  awarded: { label: "Kazanan", cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-400" },
};

export default function SellerInbox() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["seller-inbox"],
    queryFn: () => getJson("/seller/rfqs/inbox"),
  });
  const [openId, setOpenId] = useState<number | null>(null);

  const viewMut = useMutation({
    mutationFn: (targetId: number) => postJson(`/seller/rfqs/${targetId}/view`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller-inbox"] }),
  });

  return (
    <div className="space-y-4" data-testid="page-seller-inbox">
      <div className="flex items-center gap-2">
        <Inbox className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-semibold">Gelen Teklif Talepleri</h2>
          <p className="text-sm text-muted-foreground">Alıcılardan size yönlendirilen RFQ'ları yanıtlayın.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (data ?? []).length === 0 ? (
        <Card><CardContent className="text-center py-12 text-muted-foreground" data-testid="inbox-empty">
          Şu anda yanıt bekleyen RFQ yok.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((row: any) => {
            const st = T_STATUS[row.targetStatus] ?? { label: row.targetStatus, cls: "" };
            const opened = openId === row.targetId;
            return (
              <Card key={row.targetId} className={opened ? "ring-2 ring-blue-300" : ""} data-testid={`inbox-row-${row.targetId}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{row.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {row.buyerName ?? `Alıcı #${row.buyerCompanyId}`} • {new Date(row.createdAt).toLocaleString("tr-TR")} • {row.items?.length ?? 0} kalem
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={st.cls}>{st.label}</Badge>
                      <Button
                        size="sm"
                        variant={opened ? "secondary" : "outline"}
                        onClick={() => {
                          setOpenId(opened ? null : row.targetId);
                          if (!row.viewedAt && row.targetStatus === "pending") viewMut.mutate(row.targetId);
                        }}
                        data-testid={`btn-open-${row.targetId}`}
                      >
                        <Eye className="h-4 w-4 mr-1" /> {opened ? "Kapat" : "Görüntüle"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {opened && <InboxResponseForm row={row} onDone={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["seller-inbox"] }); }} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InboxResponseForm({ row, onDone }: { row: any; onDone: () => void }) {
  const items = (row.items ?? []) as Array<{ name: string; qty: number; unit: string; specs?: string }>;
  const [prices, setPrices] = useState<string[]>(items.map(() => ""));
  const [leadTime, setLeadTime] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isClosed = row.targetStatus === "quoted" || row.targetStatus === "declined" || row.targetStatus === "awarded";

  const total = items.reduce((sum, it, i) => {
    const p = Number(prices[i]);
    return sum + (Number.isFinite(p) ? p * Number(it.qty) : 0);
  }, 0);

  const submitMut = useMutation({
    mutationFn: () => postJson(`/seller/rfqs/${row.targetId}/quote`, {
      quoteLines: items.map((_, i) => ({
        itemIndex: i,
        unitPrice: Number(prices[i] || 0),
        leadTimeDays: leadTime ? Number(leadTime) : undefined,
      })),
      quoteCurrency: row.currency ?? "TRY",
    }),
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message ?? "Gönderim başarısız"),
  });
  const declineMut = useMutation({
    mutationFn: () => postJson(`/seller/rfqs/${row.targetId}/decline`),
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message ?? "Reddetme başarısız"),
  });

  return (
    <CardContent className="border-t pt-4 space-y-3">
      {row.description && <p className="text-sm text-muted-foreground">{row.description}</p>}
      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Ürün</th>
              <th className="text-right p-2">Miktar</th>
              <th className="p-2">Birim</th>
              <th className="text-right p-2">Birim Fiyat</th>
              <th className="text-right p-2">Satır Toplamı</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const p = Number(prices[i]);
              const lineTotal = Number.isFinite(p) ? p * Number(it.qty) : 0;
              return (
                <tr key={i} className="border-t">
                  <td className="p-2">{it.name}{it.specs && <div className="text-xs text-muted-foreground">{it.specs}</div>}</td>
                  <td className="text-right p-2 font-mono">{it.qty}</td>
                  <td className="p-2 text-center">{it.unit}</td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={prices[i]}
                      onChange={(e) => { const c = [...prices]; c[i] = e.target.value; setPrices(c); }}
                      className="w-28 text-right font-mono ml-auto"
                      placeholder="0.00"
                      disabled={isClosed}
                      data-testid={`input-price-${i}`}
                    />
                  </td>
                  <td className="text-right p-2 font-mono">{lineTotal.toLocaleString("tr-TR")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr><td colSpan={4} className="p-2 text-right">Toplam</td><td className="p-2 text-right font-mono">{total.toLocaleString("tr-TR")} {row.currency ?? "TRY"}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm">Teslim süresi (gün):</label>
        <Input type="number" min="0" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} className="w-24" placeholder="—" disabled={isClosed} data-testid="input-lead-time" />
      </div>
      {err && <p className="text-sm text-red-600" data-testid="form-error">{err}</p>}
      {isClosed ? (
        <p className="text-sm text-muted-foreground">Bu RFQ bu satıcı için kapatılmış (durum: {row.targetStatus}).</p>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={() => { setErr(null); submitMut.mutate(); }}
            disabled={submitMut.isPending || prices.some((p) => !p || Number(p) <= 0)}
            data-testid="btn-submit-quote"
          >
            {submitMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Teklif Gönder
          </Button>
          <Button variant="outline" onClick={() => { setErr(null); declineMut.mutate(); }} disabled={declineMut.isPending} data-testid="btn-decline">
            {declineMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />} Reddet
          </Button>
        </div>
      )}
    </CardContent>
  );
}
