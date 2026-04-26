import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-context";
import { Loader2, Rocket, RotateCcw, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

async function autopilotApi<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api/marketplace/autopilot${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).message || (j as any).error || "Hata");
  return j as T;
}

type ProfitBundle = {
  repricingRecommendations: { mappingId: number; productName: string; suggestedPrice: number; currentChannelPrice: number }[];
  staleListings: { mappingId: number; productName: string; accountName: string }[];
  highReturnSkus: { productId: number; productName: string; returnRatio: number }[];
  priceChannelSignals: { mappingId: number; productName: string; signal: string }[];
};

type PreviewLine = {
  mappingId: number;
  productName: string;
  currentChannelPrice: number;
  suggestedPrice: number;
  estimatedMonthlyDeltaTryApprox: number;
  signal: string;
};

type HistoryRow = {
  id: number;
  actionType: string;
  status: string;
  appliedAt: string;
  estimatedImpact: Record<string, unknown> | null;
  rollbackPreview?: { canRollback: boolean; rollbackHint: string };
  roiOutcomeSummary?: {
    realizedRevenueDeltaTry: number;
    realizedProfitDeltaTry: number;
    outcomeComputedAt: string | null;
    partialWindow: boolean;
    disclaimers: string[];
  } | null;
};

type TenantRoiSummary = {
  schemaReady: boolean;
  schemaDetail: string;
  acceptance: { previews30d: number; applies30d: number; previewToApplyRatio: number | null; note: string };
  winRate: { evaluatedLogs: number; winsRevenuePositive: number; winRateRevenue: number | null; note: string };
  topPerformers: { actionType: string; score: number; evidence: string }[];
  lowValueNoisy: { actionType: string; reason: string }[];
  rollbackByActionType: { actionType: string; total: number; rolledBack: number; rollbackRate: number }[];
};

type NextBestPayload = {
  recommendedActionType: string | null;
  confidence: string;
  rationale: string;
  historical: { actionType: string; medianRealizedRevenueDeltaTry: number; n: number }[];
};

type FounderDashRow = {
  companyName: string;
  applies90d: number;
  rollbackRate: number;
  medianRealizedRevenueDeltaTry: number | null;
  previews30d: number;
  applies30d: number;
};

type FounderDashPayload = { schemaReady?: boolean; schemaDetail?: string; rows: FounderDashRow[] };

type ClosedLoopRanked = {
  rank: number;
  actionType: string;
  productName: string;
  mappingId: number | null;
  confidenceScore: number;
  confidenceNote: string;
  whySuggestedNow: string;
  fatigue: { level: string; applies14d: number; note: string };
  previewApplyHint: string | null;
  suppressedByNoisyPolicy: boolean;
};

type ClosedLoopBundle = {
  version: 1;
  disclaimers: string[];
  schema: { roi007Ready: boolean; closedLoopPrefs008Ready: boolean; closedLoopPrefsDetail: string };
  tenantSegment: { key: string; label: string; note: string };
  conversionPrompts: string[];
  ranked: ClosedLoopRanked[];
  deferredNoisy: ClosedLoopRanked[];
  autoPromotionProposal: null | { actionType: string; evidence: string; reversibilityNote: string };
  preferences: { promotedActionTypes: string[]; suppressedActionTypes: string[] };
  repeatedWinsByActionType90d: { actionType: string; wins: number; evaluated: number; winRate: number | null }[];
};

export function MarketplaceAutopilotPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canApprove = user?.role === "admin" || user?.role === "super_admin";

  const [busy, setBusy] = useState<string | null>(null);
  const [profit, setProfit] = useState<ProfitBundle | null>(null);
  const [repricingPreview, setRepricingPreview] = useState<{ lines: PreviewLine[]; totalEstimatedMonthlyDeltaTryApprox: number } | null>(null);
  const [marginPreview, setMarginPreview] = useState<{ lines: PreviewLine[]; totalEstimatedMonthlyDeltaTryApprox: number } | null>(null);
  const [lowStock, setLowStock] = useState<{ suggestions: { mappingId: number; productName: string; suggestedStockOverride: number; productStock: number }[] } | null>(null);
  const [stalePreview, setStalePreview] = useState<{ lines: { mappingId: number; note: string }[] } | null>(null);
  const [pausePreview, setPausePreview] = useState<{ lines: { mappingId: number; productName: string; note: string }[]; mappingIdsUsed?: number[] } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [tenantRoi, setTenantRoi] = useState<TenantRoiSummary | null>(null);
  const [nextBest, setNextBest] = useState<NextBestPayload | null>(null);
  const [founderDash, setFounderDash] = useState<FounderDashPayload | null>(null);
  const [closedLoop, setClosedLoop] = useState<ClosedLoopBundle | null>(null);

  const loadHistory = useCallback(async () => {
    const rows = await autopilotApi<HistoryRow[]>("/history?limit=50");
    setHistory(rows);
  }, []);

  const loadRoiBundle = useCallback(async () => {
    const [s, n, cl] = await Promise.all([
      autopilotApi<TenantRoiSummary>("/roi/tenant-summary"),
      autopilotApi<NextBestPayload>("/roi/next-best-action"),
      autopilotApi<ClosedLoopBundle>("/closed-loop/bundle").catch(() => null),
    ]);
    setTenantRoi(s);
    setNextBest(n);
    setClosedLoop(cl);
  }, []);

  const loadProfit = useCallback(async () => {
    const r = await fetch("/api/marketplace/profit-automation", { credentials: "include" });
    if (!r.ok) throw new Error("profit_bundle");
    const j = await r.json();
    setProfit(j);
  }, []);

  useEffect(() => {
    loadHistory().catch(() => {});
    loadRoiBundle().catch(() => {});
  }, [loadHistory, loadRoiBundle]);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    autopilotApi<FounderDashPayload>("/roi/founder-dashboard")
      .then((b) => setFounderDash(b))
      .catch(() => setFounderDash(null));
  }, [user?.role]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e: any) {
      toast({ title: "Autopilot", description: e?.message || "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const repricingIds = profit?.repricingRecommendations?.map((x) => x.mappingId) ?? [];
  const marginCandidateIds = [
    ...new Set([
      ...(profit?.repricingRecommendations?.map((x) => x.mappingId) ?? []),
      ...(profit?.priceChannelSignals?.filter((s) => s.signal !== "ok").map((s) => s.mappingId) ?? []),
    ]),
  ];
  const staleIds = profit?.staleListings?.map((s) => s.mappingId) ?? [];
  const highReturnProductIds = profit?.highReturnSkus?.map((h) => h.productId) ?? [];

  return (
    <div className="space-y-4 mt-4" data-testid="marketplace-autopilot-panel">
      {tenantRoi && (
        <Card className="border-emerald-500/25 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-700" /> ROI motoru — kanıta dayalı (14g satış penceresi)
            </CardTitle>
            <CardDescription>
              {tenantRoi.schemaReady
                ? "Outcome’lar sales tablosundan hesaplanır; korelasyoneldir, tek sebep iddiası taşımaz."
                : `Şema: ${tenantRoi.schemaDetail}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-3 items-center">
              <div>
                <span className="text-muted-foreground">Kazanma oranı (Δciro&gt;0):</span>{" "}
                <strong className="tabular-nums">
                  {tenantRoi.winRate.winRateRevenue != null
                    ? `${(tenantRoi.winRate.winRateRevenue * 100).toFixed(0)}%`
                    : "—"}
                </strong>
                <span className="text-xs text-muted-foreground ml-1">({tenantRoi.winRate.evaluatedLogs} log)</span>
              </div>
              <div>
                <span className="text-muted-foreground">Önizleme / uygulama (30g):</span>{" "}
                <strong>{tenantRoi.acceptance.previews30d}</strong> / <strong>{tenantRoi.acceptance.applies30d}</strong>
                {tenantRoi.acceptance.previewToApplyRatio != null && (
                  <span className="tabular-nums text-muted-foreground"> (oran {tenantRoi.acceptance.previewToApplyRatio.toFixed(2)})</span>
                )}
              </div>
              {canApprove && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy || !tenantRoi.schemaReady}
                  onClick={() => run("roi-recompute", async () => {
                    const r = await autopilotApi<{ processed: number; skipped: number; errors: number }>("/roi/recompute", {
                      method: "POST",
                      body: JSON.stringify({ force: false, limit: 80 }),
                    });
                    toast({ title: "Outcome yeniden hesaplandı", description: `${r.processed} işlendi, ${r.skipped} atlandı` });
                    await loadRoiBundle();
                    await loadHistory();
                  })}
                >
                  Outcome yeniden hesapla
                </Button>
              )}
            </div>
            {nextBest?.recommendedActionType && (
              <div className="rounded-md border bg-card/80 px-3 py-2 text-xs">
                <strong>Sonraki en iyi aksiyon türü:</strong> {nextBest.recommendedActionType}{" "}
                <Badge variant="outline" className="ml-1">{nextBest.confidence}</Badge>
                <div className="text-muted-foreground mt-1">{nextBest.rationale}</div>
              </div>
            )}
            {tenantRoi.topPerformers.length > 0 && (
              <div className="text-xs">
                <div className="font-medium mb-1">En iyi performanslı türler (medyan Δciro)</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {tenantRoi.topPerformers.map((p) => (
                    <li key={p.actionType}>{p.actionType}: {p.score.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TRY — {p.evidence}</li>
                  ))}
                </ul>
              </div>
            )}
            {tenantRoi.lowValueNoisy.length > 0 && (
              <div className="text-xs text-amber-800">
                <div className="font-medium">Düşük sinyal / gürültü adayı</div>
                <ul className="list-disc pl-4">
                  {tenantRoi.lowValueNoisy.map((x) => (
                    <li key={x.actionType}>{x.actionType}: {x.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {closedLoop && (
        <Card className="border-sky-500/25 bg-sky-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-700" />
              Closed-loop sıralama (öğrenen öneri; uygulama yok)
            </CardTitle>
            <CardDescription>
              {closedLoop.disclaimers[0]}
              {!closedLoop.schema.closedLoopPrefs008Ready && (
                <span className="block mt-1 text-amber-800">
                  Tercih kolonu: {closedLoop.schema.closedLoopPrefsDetail}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Tenant segmenti:</span>{" "}
              <strong>{closedLoop.tenantSegment.label}</strong>
              <div className="text-xs text-muted-foreground mt-0.5">{closedLoop.tenantSegment.note}</div>
            </div>
            {closedLoop.conversionPrompts.length > 0 && (
              <div className="text-xs rounded-md border bg-card/80 px-3 py-2 space-y-1">
                <div className="font-medium text-foreground">Önizleme → uygulama</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {closedLoop.conversionPrompts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {closedLoop.repeatedWinsByActionType90d.length > 0 && (
              <div className="text-xs">
                <div className="font-medium mb-1">Tekrarlayan kazanç (90g, Δciro&gt;0)</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {closedLoop.repeatedWinsByActionType90d.slice(0, 6).map((w) => (
                    <li key={w.actionType}>
                      {w.actionType}: {w.wins}/{w.evaluated}
                      {w.winRate != null ? ` (${(w.winRate * 100).toFixed(0)}%)` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {closedLoop.autoPromotionProposal && canApprove && closedLoop.schema.closedLoopPrefs008Ready && (
              <div className="flex flex-wrap items-start gap-2 rounded-md border border-sky-600/30 bg-background/80 px-3 py-2 text-xs">
                <div className="flex-1 min-w-[200px]">
                  <strong>Kanıtlanmış tür önerisi:</strong> {closedLoop.autoPromotionProposal.actionType}
                  <div className="text-muted-foreground mt-1">{closedLoop.autoPromotionProposal.evidence}</div>
                  <div className="text-muted-foreground mt-1">{closedLoop.autoPromotionProposal.reversibilityNote}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!busy || closedLoop.preferences.promotedActionTypes.includes(closedLoop.autoPromotionProposal.actionType)}
                  onClick={() => run("cl-promote", async () => {
                    const at = closedLoop.autoPromotionProposal!.actionType;
                    await autopilotApi("/closed-loop/preferences", {
                      method: "POST",
                      body: JSON.stringify({
                        confirm: true,
                        promotedActionTypes: [...new Set([...closedLoop.preferences.promotedActionTypes, at])],
                        suppressedActionTypes: closedLoop.preferences.suppressedActionTypes,
                      }),
                    });
                    toast({ title: "Tercih güncellendi", description: `${at} öne alındı (sıralama); otomatik uygulama yok.` });
                    await loadRoiBundle();
                  })}
                >
                  Öne al
                </Button>
              </div>
            )}
            {(closedLoop.preferences.promotedActionTypes.length > 0
              || closedLoop.preferences.suppressedActionTypes.length > 0) && (
              <div className="text-xs flex flex-wrap gap-2">
                {closedLoop.preferences.promotedActionTypes.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Öne alınan türler:</span>{" "}
                    {closedLoop.preferences.promotedActionTypes.join(", ")}
                  </div>
                )}
                {closedLoop.preferences.suppressedActionTypes.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Bastırılan türler:</span>{" "}
                    {closedLoop.preferences.suppressedActionTypes.join(", ")}
                  </div>
                )}
              </div>
            )}
            <div className="text-xs font-medium">En iyi 5 öneri (sıra)</div>
            <ul className="space-y-2 text-xs">
              {closedLoop.ranked.slice(0, 5).map((r, i) => (
                <li key={`cl-top-${i}-${r.rank}-${r.actionType}-${r.mappingId ?? "nomap"}`} className="rounded border border-border/70 p-2 bg-card/60">
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <span>
                      <Badge variant="outline" className="mr-1 tabular-nums">#{r.rank}</Badge>
                      <strong>{r.actionType}</strong>
                      {" — "}
                      <span className="text-muted-foreground">{r.productName}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      güven {(r.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 items-center">
                    <Badge variant={r.fatigue.level === "high" ? "destructive" : "secondary"} className="text-[10px]">
                      yorgunluk: {r.fatigue.level} ({r.fatigue.applies14d}/14g)
                    </Badge>
                    {r.mappingId != null && (
                      <span className="text-muted-foreground">mapping #{r.mappingId}</span>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground leading-snug" title={r.whySuggestedNow}>
                    {r.whySuggestedNow}
                  </p>
                  {r.previewApplyHint && (
                    <p className="mt-1 text-sky-900 dark:text-sky-200 font-medium">{r.previewApplyHint}</p>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{r.confidenceNote}</p>
                </li>
              ))}
            </ul>
            {closedLoop.deferredNoisy.length > 0 && (
              <div className="text-xs text-amber-900 dark:text-amber-200/90">
                Gürültü / düşük sinyal nedeniyle ertelenen {closedLoop.deferredNoisy.length} satır ayrı sıralandı
                (tercihte öne alınarak geri getirilebilir).
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {user?.role === "super_admin" && founderDash && ((founderDash.rows?.length ?? 0) > 0 || founderDash.schemaReady === false) && (
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Founder — Autopilot ROI dashboard (90g)
            </CardTitle>
            <CardDescription>
              {founderDash.schemaReady === false
                ? founderDash.schemaDetail || "ROI şeması eksik — migration 007."
                : "Kiracı bazında uygulama hacmi, geri alma oranı ve medyan gerçekleşen Δciro (outcome hesaplı loglar)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-2">Şirket</th>
                  <th className="py-2 pr-2">Aksiyon 90g</th>
                  <th className="py-2 pr-2">G.alma %</th>
                  <th className="py-2 pr-2">Med.Δciro</th>
                  <th className="py-2">Önz./Uyg.30g</th>
                </tr>
              </thead>
              <tbody>
                {founderDash.rows?.slice(0, 15).map((r) => (
                  <tr key={r.companyName} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 font-medium">{r.companyName}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.applies90d}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{(r.rollbackRate * 100).toFixed(0)}%</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {r.medianRealizedRevenueDeltaTry != null
                        ? r.medianRealizedRevenueDeltaTry.toLocaleString("tr-TR", { maximumFractionDigits: 0 })
                        : "—"}
                    </td>
                    <td className="py-1.5 tabular-nums text-xs">{r.previews30d} / {r.applies30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4 text-orange-600" />
            Kâr motoru → kontrollü fiyat (önizleme + onay)
          </CardTitle>
          <CardDescription>
            Önce kâr sinyalleri yüklenir; ardından tahmini aylık etki gösterilir. Uygulama yalnızca admin onayı ve JSON <code className="text-xs">"confirm": true</code> (boolean; string değil) ile çalışır.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => run("profit", async () => {
              await loadProfit();
              toast({ title: "Kâr sinyalleri", description: "Öneri listesi güncellendi." });
            })}
          >
            {busy === "profit" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kâr sinyallerini yükle
          </Button>
          <Button
            size="sm"
            disabled={!!busy || repricingIds.length === 0}
            onClick={() => run("repr-prev", async () => {
              const prev = await autopilotApi<{ lines: PreviewLine[]; totalEstimatedMonthlyDeltaTryApprox: number }>("/preview/repricing", {
                method: "POST",
                body: JSON.stringify({ mappingIds: repricingIds }),
              });
              setRepricingPreview(prev);
              toast({ title: "Önizleme hazır", description: `${prev.lines.length} satır, tahmini aylık Δ ≈ ${prev.totalEstimatedMonthlyDeltaTryApprox} TRY` });
            })}
          >
            Fiyat düzeltmesini önizle
          </Button>
          {canApprove && (
            <Button
              size="sm"
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={!!busy || repricingIds.length === 0}
              onClick={() => run("repr-apply", async () => {
                if (!window.confirm(`${repricingIds.length} önerilen mapping için fiyat override + push_price uygulanacak. Onaylıyor musunuz?`)) return;
                const r = await autopilotApi<{ logId: number; applied: number }>("/apply/profit-repricing-bulk", {
                  method: "POST",
                  body: JSON.stringify({ confirm: true }),
                });
                toast({ title: "Uygulandı", description: `Log #${r.logId}, ${r.applied} satır` });
                setRepricingPreview(null);
                await loadHistory();
              })}
            >
              Tek tık: kâr önerilerini uygula
            </Button>
          )}
        </CardContent>
        {repricingPreview && repricingPreview.lines.length > 0 && (
          <CardContent className="pt-0 border-t">
            <div className="text-sm font-medium mb-2">
              Tahmini toplam aylık etki (model):{" "}
              <span className="text-emerald-700 tabular-nums">
                {repricingPreview.totalEstimatedMonthlyDeltaTryApprox.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TRY
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto text-xs space-y-1">
              {repricingPreview.lines.slice(0, 15).map((l) => (
                <div key={l.mappingId} className="flex justify-between gap-2 border-b border-border/40 py-1">
                  <span className="truncate">{l.productName}</span>
                  <span className="tabular-nums shrink-0">{l.currentChannelPrice} → {l.suggestedPrice}</span>
                </div>
              ))}
              {repricingPreview.lines.length > 15 && <div className="text-muted-foreground">+{repricingPreview.lines.length - 15} satır…</div>}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Marj toparlama</CardTitle>
          <CardDescription>Düşük marjlı kanal fiyatlarını hedef marja çekmek için önizleme; uygulama ayrı onay ister.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || marginCandidateIds.length === 0}
            onClick={() => run("margin-prev", async () => {
              const prev = await autopilotApi<{ lines: PreviewLine[]; totalEstimatedMonthlyDeltaTryApprox: number }>("/preview/margin-recovery", {
                method: "POST",
                body: JSON.stringify({ mappingIds: marginCandidateIds, targetMarginPct: 14 }),
              });
              setMarginPreview(prev);
              toast({ title: "Marj önizleme", description: `${prev.lines.length} satır` });
            })}
          >
            Marj önizle
          </Button>
          {canApprove && (
            <Button
              size="sm"
              disabled={!!busy || marginCandidateIds.length === 0}
              onClick={() => run("margin-apply", async () => {
                if (!window.confirm("Seçili kanal eşlemeleri için marj toparlama fiyatları uygulanacak. Onaylıyor musunuz?")) return;
                await autopilotApi("/apply/margin-recovery", {
                  method: "POST",
                  body: JSON.stringify({ mappingIds: marginCandidateIds, targetMarginPct: 14, confirm: true }),
                });
                toast({ title: "Marj uygulandı" });
                setMarginPreview(null);
                await loadHistory();
              })}
            >
              Marj aksiyonunu uygula
            </Button>
          )}
        </CardContent>
        {marginPreview && marginPreview.lines.length > 0 && (
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Tahmini aylık Δ ≈ {marginPreview.totalEstimatedMonthlyDeltaTryApprox.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TRY — {marginPreview.lines.length} satır
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Düşük stok — kanal stok önerisi</CardTitle>
            <CardDescription>ERP stoğunu değiştirmez; yalnızca kanal override.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("low-prev", async () => {
              const s = await autopilotApi<{ suggestions: any[] }>("/preview/low-stock");
              setLowStock(s);
              toast({ title: "Düşük stok", description: `${s.suggestions.length} öneri` });
            })}>Önerileri yükle</Button>
            {canApprove && (
              <Button size="sm" disabled={!!busy || !(lowStock?.suggestions?.length)}
                onClick={() => run("low-app", async () => {
                  const updates = (lowStock?.suggestions ?? []).map((x) => ({ mappingId: x.mappingId, stockOverride: x.suggestedStockOverride }));
                  if (!window.confirm(`${updates.length} mapping için stok override uygulanacak.`)) return;
                  await autopilotApi("/apply/low-stock", { method: "POST", body: JSON.stringify({ updates, confirm: true }) });
                  toast({ title: "Stok override uygulandı" });
                  await loadHistory();
                })}>Önerilenleri uygula</Button>
            )}
            <div className="text-xs max-h-32 overflow-y-auto space-y-1">
              {(lowStock?.suggestions ?? []).slice(0, 8).map((s) => (
                <div key={s.mappingId} className="flex justify-between gap-2 border-b border-border/30 py-0.5">
                  <span className="truncate">{s.productName}</span>
                  <span className="shrink-0 tabular-nums">stok {s.productStock} → override {s.suggestedStockOverride}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bayat liste — push_price yeniden</CardTitle>
            <CardDescription>Kuyruğa alır; harici sonuç sağlayıcıya bağlıdır.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" variant="outline" disabled={!!busy || staleIds.length === 0}
              onClick={() => run("stale-prev", async () => {
                const p = await autopilotApi<{ lines: { mappingId: number; note: string }[] }>("/preview/stale-resync", {
                  method: "POST", body: JSON.stringify({ mappingIds: staleIds }),
                });
                setStalePreview(p);
                toast({ title: "Bayat liste", description: `${p.lines.length} satır` });
              })}>Önizle</Button>
            {canApprove && (
              <Button size="sm" disabled={!!busy || staleIds.length === 0}
                onClick={() => run("stale-app", async () => {
                  if (!window.confirm(`${staleIds.length} mapping için push_price kuyruğa alınacak.`)) return;
                  await autopilotApi("/apply/stale-resync", { method: "POST", body: JSON.stringify({ mappingIds: staleIds, confirm: true }) });
                  toast({ title: "Kuyruklandı" });
                  await loadHistory();
                })}>Uygula</Button>
            )}
            <div className="text-xs text-muted-foreground max-h-24 overflow-y-auto">
              {(stalePreview?.lines ?? []).slice(0, 6).map((l) => (
                <div key={l.mappingId}>#{l.mappingId}: {l.note}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-amber-800">Yüksek iade SKU — yayını duraklat</CardTitle>
          <CardDescription>Ürün bazlı aktif eşlemeler bulunur; yalnız çift onay (pencere + confirm) ile pasifleştirilir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" disabled={!!busy || highReturnProductIds.length === 0}
            onClick={() => run("pause-prev", async () => {
              const p = await autopilotApi<{ lines: any[]; mappingIdsUsed: number[] }>("/preview/pause-high-return", {
                method: "POST",
                body: JSON.stringify({ productIds: highReturnProductIds }),
              });
              setPausePreview(p);
              toast({ title: "Duraklatma önizleme", description: `${p.lines.length} eşleme` });
            })}>Önizle (ürün → mapping)</Button>
          {canApprove && (
            <Button size="sm" variant="destructive" disabled={!!busy || !pausePreview?.mappingIdsUsed?.length}
              onClick={() => run("pause-app", async () => {
                if (!window.confirm("İKİNCİ ONAY: Seçili kanal yayınları pasiflenecek (is_active=false). Emin misiniz?")) return;
                await autopilotApi("/apply/pause-high-return", {
                  method: "POST",
                  body: JSON.stringify({ productIds: highReturnProductIds, confirm: true }),
                });
                toast({ title: "Yayın duraklatıldı" });
                setPausePreview(null);
                await loadHistory();
              })}>Manuel onayla uygula</Button>
          )}
          <div className="text-xs max-h-28 overflow-y-auto space-y-1">
            {(pausePreview?.lines ?? []).slice(0, 10).map((l) => (
              <div key={l.mappingId} className="flex justify-between gap-2 border-b border-border/30">
                <span className="truncate">{l.productName}</span>
                <Badge variant="outline" className="shrink-0">#{l.mappingId}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Aksiyon geçmişi ve güvenli geri al
            </CardTitle>
            <CardDescription>Her kayıt için snapshot; geri al yalnız admin onayı ile.</CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { loadHistory().catch(() => {}); loadRoiBundle().catch(() => {}); }}>Yenile</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Tür</th>
                <th className="py-2 pr-2">Durum</th>
                <th className="py-2 pr-2">Tarih</th>
                <th className="py-2 pr-2 text-right">Δciro (kanıt)</th>
                <th className="py-2">Geri al</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 font-mono text-xs">{h.id}</td>
                  <td className="py-1.5 pr-2">{h.actionType}</td>
                  <td className="py-1.5 pr-2"><Badge variant="secondary">{h.status}</Badge></td>
                  <td className="py-1.5 pr-2 text-xs whitespace-nowrap">{new Date(h.appliedAt).toLocaleString("tr-TR")}</td>
                  <td className="py-1.5 pr-2 text-xs text-right tabular-nums">
                    {h.roiOutcomeSummary
                      ? `${h.roiOutcomeSummary.realizedRevenueDeltaTry.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`
                      : "—"}
                  </td>
                  <td className="py-1.5">
                    {h.rollbackPreview?.canRollback && canApprove ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={!!busy}
                        title={h.rollbackPreview.rollbackHint}
                        onClick={() => run(`rb-${h.id}`, async () => {
                          if (!window.confirm(`Log #${h.id} geri alınacak. ${h.rollbackPreview?.rollbackHint || ""}`)) return;
                          await autopilotApi("/rollback", { method: "POST", body: JSON.stringify({ logId: h.id, confirm: true }) });
                          toast({ title: "Geri alındı" });
                          await loadHistory();
                          await loadRoiBundle();
                        })}
                      >Rollback</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground truncate max-w-[140px] inline-block align-middle" title={h.rollbackPreview?.rollbackHint}>
                        {h.rollbackPreview?.rollbackHint?.slice(0, 40) || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
