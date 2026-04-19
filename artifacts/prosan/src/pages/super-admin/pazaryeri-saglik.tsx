import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, RefreshCcw, AlertTriangle, CheckCircle2, XCircle, Loader2,
} from "lucide-react";

type AccountHealth = {
  count: number;
  healthy: number;
  results: Array<{
    accountId: number;
    name: string;
    provider: string;
    sandbox: boolean;
    ok: boolean;
    message: string;
    checkedAt: string;
  }>;
};

function cleanProviderMessage(msg: string | undefined | null, ok: boolean): string {
  if (!msg) return ok ? "Bağlantı sağlıklı." : "Bilinmeyen hata.";
  let m = String(msg);
  const httpMatch = m.match(/HTTP\s*(\d{3})/i);
  if (/<!doctype|<html|<head|<body/i.test(m)) {
    if (httpMatch) {
      const code = httpMatch[1];
      if (code === "401" || code === "403") return `Yetki reddedildi (HTTP ${code}). API anahtarlarını kontrol edin.`;
      if (code === "404") return `Sağlayıcı uç noktası bulunamadı (HTTP ${code}).`;
      if (code === "429") return `Sağlayıcı istekleri kısıtladı (HTTP ${code}).`;
      if (code.startsWith("5")) return `Sağlayıcı sunucu hatası (HTTP ${code}).`;
      return `Sağlayıcı geçersiz yanıt verdi (HTTP ${code}).`;
    }
    return "Sağlayıcıdan geçersiz yanıt alındı.";
  }
  m = m.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (m.length > 200) m = m.slice(0, 197) + "…";
  return m || (ok ? "Bağlantı sağlıklı." : "Bilinmeyen hata.");
}

export default function PazaryeriSaglikPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error } = useQuery<AccountHealth>({
    queryKey: ["marketplace-accounts-health"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace/accounts/health", { credentials: "include" });
      if (!r.ok) throw new Error(`health_check_failed_${r.status}`);
      return r.json();
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["marketplace-accounts-health"] });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
          Pazaryeri Sağlık Durumu
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tüm tenant'lara ait pazaryeri hesaplarının canlı bağlantı durumu. Yalnızca sistem yöneticileri için.
        </p>
      </div>

      <Card data-testid="provider-health-section">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-600" />
              <h3 className="font-semibold text-base text-slate-900">Bağlantı Özeti</h3>
              {data && (() => {
                const allOk = data.healthy === data.count && data.count > 0;
                const noneOk = data.count > 0 && data.healthy === 0;
                const tone = data.count === 0
                  ? "bg-slate-100 text-slate-600 border border-slate-200"
                  : allOk
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : noneOk
                      ? "bg-rose-100 text-rose-700 border border-rose-200"
                      : "bg-amber-100 text-amber-700 border border-amber-200";
                return (
                  <Badge variant="outline" className={tone}>
                    {data.healthy}/{data.count} sağlıklı
                  </Badge>
                );
              })()}
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={isFetching} data-testid="refresh-provider-health">
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />}
              Yenile
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-slate-500 py-6 text-center">Sağlık durumu kontrol ediliyor…</div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-rose-600 py-3">
              <AlertTriangle className="h-4 w-4" />
              Sağlık taraması yapılamadı.
            </div>
          ) : !data || data.count === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">
              Sistemde kayıtlı pazaryeri hesabı yok.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.results.map((r) => (
                <div
                  key={r.accountId}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${r.ok ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
                  data-testid={`provider-health-row-${r.accountId}`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-900 truncate">{r.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">{r.provider}</Badge>
                      {r.sandbox && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-amber-50 text-amber-700 border-amber-200">SANDBOX</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{cleanProviderMessage(r.message, r.ok)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
