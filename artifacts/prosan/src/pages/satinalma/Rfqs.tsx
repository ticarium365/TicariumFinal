import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, ArrowLeft, Eye, FileText, Trophy, BarChart3 } from "lucide-react";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Taslak", sent: "Gönderildi", responded: "Teklif Geldi",
  awarded: "Kabul Edildi", cancelled: "İptal", expired: "Süresi Dolmuş",
};
const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", sent: "default", responded: "default",
  awarded: "default", cancelled: "destructive", expired: "secondary",
};

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

export function RfqsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["rfqs"],
    queryFn: () => getJson("/buyer/rfqs"),
  });

  return (
    <div className="space-y-4" data-testid="page-rfqs-list">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Teklif Taleplerim</h2>
          <p className="text-sm text-muted-foreground mt-1">Gönderdiğiniz RFQ'ları ve gelen teklif sayılarını takip edin.</p>
        </div>
        <Link href="/satinalma/rfqs/new">
          <Button data-testid="btn-new-rfq"><Plus className="h-4 w-4 mr-1" /> Yeni RFQ</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (data ?? []).length === 0 ? (
        <Card><CardContent className="text-center py-12 text-muted-foreground" data-testid="empty-rfqs">
          Henüz RFQ oluşturmadınız. <Link href="/satinalma/rfqs/new" className="text-blue-600 underline">İlk talebinizi oluşturun</Link>.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((r: any) => (
            <Card key={r.id} className="hover:shadow-sm transition-shadow" data-testid={`rfq-row-${r.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <FileText className="h-8 w-8 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/satinalma/rfqs/${r.id}`} className="font-semibold hover:underline truncate">{r.title}</Link>
                    <Badge variant={STATUS_COLORS[r.status] ?? "outline"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                    <span>{new Date(r.createdAt).toLocaleDateString("tr-TR")}</span>
                    <span>{(r.items?.length ?? 0)} kalem</span>
                    <span>{r.targetCounts?.total ?? 0} satıcı</span>
                    {(r.targetCounts?.quoted ?? 0) > 0 && <span className="text-green-700 font-semibold">{r.targetCounts.quoted} teklif</span>}
                    {(r.targetCounts?.viewed ?? 0) > 0 && <span className="text-amber-700">{r.targetCounts.viewed} görüntülendi</span>}
                  </div>
                </div>
                <Link href={`/satinalma/rfqs/${r.id}`}>
                  <Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ComparisonView({ rfqId, currency, awardedTargetId, canAward }: { rfqId: number; currency: string; awardedTargetId: number | null; canAward: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["rfq-comparison", rfqId],
    queryFn: () => getJson(`/buyer/rfqs/${rfqId}/comparison`),
  });
  const [awardTarget, setAwardTarget] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const awardMut = useMutation({
    mutationFn: (targetId: number) => postJson(`/buyer/rfqs/${rfqId}/award`, { targetId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfq", rfqId] });
      qc.invalidateQueries({ queryKey: ["rfq-comparison", rfqId] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      setAwardTarget(null);
    },
    onError: (e: any) => setErr(e?.message ?? "Award başarısız"),
  });

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!data) return null;
  if (data.quotedCount === 0) {
    return (
      <Card className="bg-slate-50">
        <CardContent className="py-8 text-center text-sm text-muted-foreground" data-testid="comparison-empty">
          Henüz hiç satıcıdan teklif gelmedi. Karşılaştırma görünümü ilk teklifle aktif olacak.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="comparison-view">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold">Teklif Karşılaştırması ({data.quotedCount}/{data.targetCount} satıcı)</h3>
      </div>

      {/* Per-item matrix */}
      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Kalem</th>
              {data.totals.map((t: any) => (
                <th key={t.targetId} className="p-2 text-right whitespace-nowrap">{t.sellerName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row: any) => (
              <tr key={row.itemIndex} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{row.item.name}</div>
                  <div className="text-xs text-muted-foreground">{row.item.qty} {row.item.unit}</div>
                </td>
                {data.totals.map((t: any) => {
                  const offer = row.offers.find((o: any) => o.targetId === t.targetId);
                  if (!offer) return <td key={t.targetId} className="p-2 text-right text-muted-foreground">—</td>;
                  return (
                    <td key={t.targetId} className={`p-2 text-right font-mono ${offer.isBest ? "bg-green-50 font-semibold text-green-800" : ""}`} data-testid={`offer-${row.itemIndex}-${t.targetId}`}>
                      <div>{offer.unitPrice.toLocaleString("tr-TR")} ₺</div>
                      <div className="text-xs text-muted-foreground">= {offer.lineTotal.toLocaleString("tr-TR")}</div>
                      {offer.leadTimeDays != null && <div className="text-[10px] text-muted-foreground">{offer.leadTimeDays} gün</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="p-2">Toplam</td>
              {data.totals.map((t: any, idx: number) => (
                <td key={t.targetId} className={`p-2 text-right font-mono ${idx === 0 ? "text-green-700" : ""}`}>
                  {t.quoteTotal != null ? `${t.quoteTotal.toLocaleString("tr-TR")} ${t.quoteCurrency ?? currency}` : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Award buttons */}
      {canAward && data.totals.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Kabul edilecek teklif:</span>
          {data.totals.map((t: any) => (
            <Button
              key={t.targetId}
              size="sm"
              variant={awardTarget === t.targetId ? "default" : "outline"}
              onClick={() => { setAwardTarget(t.targetId); setErr(null); }}
              data-testid={`btn-pick-${t.targetId}`}
            >
              {t.sellerName} ({t.quoteTotal?.toLocaleString("tr-TR")} ₺)
            </Button>
          ))}
          {awardTarget && (
            <Button
              size="sm"
              className="ml-2 bg-green-600 hover:bg-green-700"
              disabled={awardMut.isPending}
              onClick={() => awardMut.mutate(awardTarget)}
              data-testid="btn-award-confirm"
            >
              {awardMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trophy className="h-4 w-4 mr-1" />}
              Onayla & Kabul Et
            </Button>
          )}
          {err && <span className="text-sm text-red-600 ml-2" data-testid="award-error">{err}</span>}
        </div>
      )}
      {awardedTargetId && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-sm" data-testid="awarded-banner">
          <Trophy className="h-4 w-4 inline mr-1 text-green-700" />
          <span className="font-semibold text-green-900">Teklif kabul edildi.</span>
          <span className="text-green-800 ml-2">Kazanan satıcıya bildirim iletildi.</span>
        </div>
      )}
    </div>
  );
}

export function RfqDetail() {
  const [, params] = useRoute("/satinalma/rfqs/:id");
  const id = Number(params?.id);
  const { data, isLoading } = useQuery({
    queryKey: ["rfq", id],
    queryFn: () => getJson(`/buyer/rfqs/${id}`),
    enabled: Number.isFinite(id),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (!data) return <div className="text-center text-muted-foreground py-12">RFQ bulunamadı</div>;

  const canAward = data.status === "responded" || data.status === "sent";
  const showComparison = ["responded", "awarded", "sent"].includes(data.status);

  return (
    <div className="space-y-4 max-w-6xl mx-auto" data-testid="page-rfq-detail">
      <Link href="/satinalma/rfqs"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Geri</Button></Link>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{data.title}</CardTitle>
            <Badge variant={STATUS_COLORS[data.status] ?? "outline"}>{STATUS_LABELS[data.status] ?? data.status}</Badge>
          </div>
          {data.description && <p className="text-sm text-muted-foreground mt-2">{data.description}</p>}
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold text-sm mb-2">Kalemler</h3>
            <div className="border rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-2">Ürün</th><th className="text-right p-2">Miktar</th><th className="p-2">Birim</th><th className="text-left p-2">Spec</th></tr>
                </thead>
                <tbody>
                  {(data.items ?? []).map((it: any, i: number) => (
                    <tr key={i} className="border-t" data-testid={`detail-item-${i}`}>
                      <td className="p-2">{it.name}</td>
                      <td className="text-right p-2 font-mono">{it.qty}</td>
                      <td className="p-2 text-center">{it.unit}</td>
                      <td className="p-2 text-muted-foreground text-xs">{it.specs ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {showComparison && (
            <ComparisonView rfqId={id} currency={data.currency} awardedTargetId={data.awardedTargetId} canAward={canAward} />
          )}

          <div>
            <h3 className="font-semibold text-sm mb-2">Hedef Satıcılar ({data.targets?.length ?? 0})</h3>
            <div className="space-y-2">
              {(data.targets ?? []).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-3 border rounded" data-testid={`detail-target-${t.id}`}>
                  <div className="flex-1">
                    <div className="font-medium">{t.sellerName ?? `Firma #${t.sellerCompanyId}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.viewedAt ? `${new Date(t.viewedAt).toLocaleString("tr-TR")} tarihinde görüntülendi` : "Henüz görüntülenmedi"}
                    </div>
                  </div>
                  <Badge variant={t.status === "quoted" ? "default" : t.status === "viewed" ? "secondary" : t.status === "awarded" ? "default" : "outline"}>
                    {t.status === "pending" ? "Beklemede" : t.status === "viewed" ? "Görüntülendi" : t.status === "quoted" ? "Teklif Verildi" : t.status === "declined" ? "Reddedildi" : t.status === "awarded" ? "Kazanan" : t.status}
                  </Badge>
                  {t.quoteTotal != null && (
                    <div className="text-right">
                      <div className="font-semibold">{Number(t.quoteTotal).toLocaleString("tr-TR")} {t.quoteCurrency ?? data.currency}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
