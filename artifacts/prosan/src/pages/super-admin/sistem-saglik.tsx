import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Activity, RefreshCcw, CheckCircle2, XCircle, AlertTriangle, Database,
  HardDrive, Mail, Cpu, Clock, Loader2, MinusCircle,
} from "lucide-react";

type CheckStatus = "ok" | "degraded" | "down" | "disabled";
type Check = { status: CheckStatus; latencyMs?: number; detail?: string };

type HealthInternal = {
  status: CheckStatus;
  version: string;
  uptime: number;
  checks: { db: Check; objectStorage: Check; smtp: Check };
  timestamp: string;
  nodeVersion: string;
  memory: { rssMb: number; heapUsedMb: number };
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: "Sağlıklı",
  degraded: "Düşük performans",
  down: "Erişilemiyor",
  disabled: "Devre dışı",
};

function StatusBadge({ s }: { s: CheckStatus }) {
  if (s === "ok") return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />{STATUS_LABEL[s]}</Badge>;
  if (s === "degraded") return <Badge variant="outline" className="border-amber-500 text-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />{STATUS_LABEL[s]}</Badge>;
  if (s === "down") return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{STATUS_LABEL[s]}</Badge>;
  return <Badge variant="secondary"><MinusCircle className="h-3 w-3 mr-1" />{STATUS_LABEL[s]}</Badge>;
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60} dk`;
  const d = Math.floor(h / 24);
  return `${d} gün ${h % 24} sa`;
}

function CheckCard({
  icon: Icon, title, description, check,
}: { icon: any; title: string; description: string; check: Check }) {
  return (
    <Card data-testid={`card-check-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <StatusBadge s={check.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex items-center gap-4 text-sm">
          {check.latencyMs !== undefined && (
            <span className="text-muted-foreground">
              Yanıt: <strong className="text-foreground">{check.latencyMs} ms</strong>
            </span>
          )}
          {check.detail && (
            <span className="text-amber-700 dark:text-amber-400 truncate" title={check.detail}>
              {check.detail.length > 80 ? check.detail.slice(0, 77) + "…" : check.detail}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SistemSaglikPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, isLoading, isFetching, refetch, error } = useQuery<HealthInternal>({
    queryKey: ["super-admin", "healthz-internal"],
    queryFn: async () => {
      const res = await fetch("/api/healthz/internal", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 15_000 : false,
  });

  // Sayfa odaklanınca da yenile
  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  const overall = data?.status;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-sistem-saglik">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Sistem Sağlığı
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Veritabanı, depolama ve e-posta servislerinin canlı durumu.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              data-testid="switch-auto-refresh"
            />
            <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">15 sn otomatik yenile</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="btn-refresh"
          >
            {isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
            Yenile
          </Button>
        </div>
      </div>

      {/* Genel durum bandı */}
      {overall && (
        <Card
          className={
            overall === "ok"
              ? "border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-950/30"
              : overall === "degraded"
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/30"
              : "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/30"
          }
          data-testid="card-overall"
        >
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge s={overall} />
              <span className="text-sm text-muted-foreground">
                Sürüm <strong className="text-foreground">{data?.version}</strong> • Çalışma süresi <strong className="text-foreground">{fmtUptime(data?.uptime ?? 0)}</strong>
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Son ölçüm: {data ? new Date(data.timestamp).toLocaleString("tr-TR") : "—"}
            </span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-300 dark:border-red-700">
          <CardContent className="p-4 text-sm text-red-700 dark:text-red-400">
            Sağlık verisi alınamadı: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {isLoading && !data && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Sağlık verisi yükleniyor…
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <CheckCard
              icon={Database}
              title="Veritabanı"
              description="PostgreSQL bağlantısı ve sorgu yanıt süresi."
              check={data.checks.db}
            />
            <CheckCard
              icon={HardDrive}
              title="Nesne Depolama"
              description="Dosya yükleme/indirme servisi."
              check={data.checks.objectStorage}
            />
            <CheckCard
              icon={Mail}
              title="E-posta (SMTP)"
              description="Sistem bildirim e-postaları için SMTP bağlantısı."
              check={data.checks.smtp}
            />
          </div>

          {/* Runtime parmak izi */}
          <Card data-testid="card-runtime">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Çalışma Ortamı
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Node sürümü</dt>
                  <dd className="font-mono mt-1">{data.nodeVersion}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">RSS bellek</dt>
                  <dd className="mt-1"><strong>{data.memory.rssMb}</strong> MB</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Heap kullanılan</dt>
                  <dd className="mt-1"><strong>{data.memory.heapUsedMb}</strong> MB</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Çalışma süresi</dt>
                  <dd className="mt-1">{fmtUptime(data.uptime)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
