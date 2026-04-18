import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, RefreshCw } from "lucide-react";

async function api(path: string) {
  const r = await fetch(`/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });
  const [actions, setActions] = useState<string[]>([]);
  const [filter, setFilter] = useState({ action: "all", username: "", from: "", to: "" });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter.action !== "all") params.set("action", filter.action);
      if (filter.username) params.set("username", filter.username);
      if (filter.from) params.set("from", filter.from);
      if (filter.to) params.set("to", filter.to);
      const res = await api(`/audit-logs?${params}`);
      setData(res);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    api("/audit-logs/actions").then(setActions).catch(() => {});
    load();
  }, []);

  function actionBadgeVariant(action: string) {
    if (action.includes("DELETE")) return "destructive" as const;
    if (action.includes("CREATE") || action === "LOGIN") return "default" as const;
    if (action.includes("UPDATE") || action.includes("PAYMENT")) return "secondary" as const;
    return "outline" as const;
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Denetim Kayıtları
        </h1>
        <p className="text-sm text-muted-foreground">Tüm kullanıcı/sistem aksiyonları — kim, ne zaman, neyi yaptı.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Filtre</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Select value={filter.action} onValueChange={(v) => setFilter({ ...filter, action: v })}>
            <SelectTrigger><SelectValue placeholder="Aksiyon" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm aksiyonlar</SelectItem>
              {actions.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
            </SelectContent>
          </Select>
          <Input placeholder="Kullanıcı adı" value={filter.username} onChange={(e) => setFilter({ ...filter, username: e.target.value })} />
          <Input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
          <Input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
          <Button onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Filtrele
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{data.total.toLocaleString("tr-TR")} kayıt — son {data.items.length} gösteriliyor</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="whitespace-nowrap">Tarih</TableHead>
                <TableHead>Şirket</TableHead>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>Aksiyon</TableHead>
                <TableHead>Varlık</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Detay</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString("tr-TR")}</TableCell>
                    <TableCell className="text-xs">{r.companyName ?? "—"}</TableCell>
                    <TableCell className="text-xs font-medium">{r.username ?? `#${r.userId ?? "?"}`}</TableCell>
                    <TableCell><Badge variant={actionBadgeVariant(r.action)}>{r.action}</Badge></TableCell>
                    <TableCell className="text-xs">{r.entity ? `${r.entity}#${r.entityId ?? "?"}` : "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.ipAddress ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-md truncate" title={r.details ?? ""}>{r.details ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {data.items.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Kayıt yok.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
