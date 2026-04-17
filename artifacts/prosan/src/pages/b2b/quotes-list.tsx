import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Inbox, Send, FileText, Clock, CheckCircle2, XCircle, Search, ChevronRight, Plus, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/api";

interface Quote {
  id: number;
  code: string;
  fromCompanyId: number;
  toCompanyId: number;
  subject: string;
  status: string;
  quotedTotalAmount: number | null;
  quotedCurrency: string | null;
  validUntil: string | null;
  createdAt: string;
  fromCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
  toCompany: { id: number; name: string; subdomain: string; primaryColor: string; logoUrl: string | null } | null;
}

interface Stats {
  inbox: { pending: number; quoted: number; accepted: number; rejected: number };
  outbox: { pending: number; quoted: number; accepted: number; rejected: number };
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Bekliyor", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Hourglass },
  quoted: { label: "Yanıtlandı", color: "bg-blue-50 text-blue-700 border-blue-200", icon: FileText },
  accepted: { label: "Kabul Edildi", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "Reddedildi", color: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
  cancelled: { label: "İptal", color: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.color}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function QuoteCard({ q, mode }: { q: Quote; mode: "inbox" | "outbox" }) {
  const counterparty = mode === "inbox" ? q.fromCompany : q.toCompany;
  return (
    <Link href={`/b2b/quotes/${q.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex items-center gap-4">
          {counterparty?.logoUrl ? (
            <img src={counterparty.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain border shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: counterparty?.primaryColor ?? "#666" }}>
              {counterparty?.name?.charAt(0) ?? "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{q.code}</code>
              <StatusBadge status={q.status} />
            </div>
            <h3 className="font-semibold mt-1 truncate">{q.subject}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {mode === "inbox" ? "Gönderen: " : "Alıcı: "}
              <span className="font-medium">{counterparty?.name ?? "—"}</span>
            </p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            {q.quotedTotalAmount != null && q.status === "quoted" ? (
              <p className="text-sm font-bold">
                {q.quotedTotalAmount.toLocaleString("tr-TR")} {q.quotedCurrency}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(q.createdAt).toLocaleDateString("tr-TR")}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

export default function QuotesListPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"inbox" | "outbox">("inbox");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Quote[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const url = `${apiBase}/b2b/quotes/${tab}${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`;
      const [list, s] = await Promise.all([
        fetch(url, { credentials: "include" }).then((r) => r.json()),
        fetch(`${apiBase}/b2b/quotes/stats`, { credentials: "include" }).then((r) => r.json()),
      ]);
      setData(list);
      setStats(s);
    } catch {
      toast({ title: "Hata", description: "Teklifler yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [tab, statusFilter]);

  const filtered = search
    ? data.filter(
        (q) =>
          q.code.toLowerCase().includes(search.toLowerCase()) ||
          q.subject.toLowerCase().includes(search.toLowerCase()) ||
          q.fromCompany?.name?.toLowerCase().includes(search.toLowerCase()) ||
          q.toCompany?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const currentStats = stats?.[tab];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            B2B Teklifler
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tedarik ağındaki firmalarla teklif alışverişi
          </p>
        </div>
        <Link href="/network">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Teklif İste
          </Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 w-full sm:w-80">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            Gelen ({(stats?.inbox.pending ?? 0) + (stats?.inbox.quoted ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="outbox" className="gap-2">
            <Send className="h-4 w-4" />
            Giden
          </TabsTrigger>
        </TabsList>

        {currentStats && (
          <div className="flex flex-wrap gap-2 mt-4">
            <StatChip label="Bekliyor" value={currentStats.pending} color="bg-amber-50 text-amber-700 border-amber-200" />
            <StatChip label="Yanıtlandı" value={currentStats.quoted} color="bg-blue-50 text-blue-700 border-blue-200" />
            <StatChip label="Kabul" value={currentStats.accepted} color="bg-emerald-50 text-emerald-700 border-emerald-200" />
            <StatChip label="Red" value={currentStats.rejected} color="bg-rose-50 text-rose-700 border-rose-200" />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Kod, konu veya firma ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", "pending", "quoted", "accepted", "rejected"].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "Tümü" : STATUS_META[s]?.label ?? s}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="inbox" className="space-y-3 mt-5">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Henüz gelen teklif yok</p>
            </div>
          ) : (
            filtered.map((q) => <QuoteCard key={q.id} q={q} mode="inbox" />)
          )}
        </TabsContent>

        <TabsContent value="outbox" className="space-y-3 mt-5">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Send className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Henüz gönderilmiş teklif yok</p>
              <Link href="/network">
                <Button size="sm" className="mt-4">Ağa Göz At →</Button>
              </Link>
            </div>
          ) : (
            filtered.map((q) => <QuoteCard key={q.id} q={q} mode="outbox" />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
