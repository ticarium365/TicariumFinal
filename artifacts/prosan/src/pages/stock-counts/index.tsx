import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Plus, ClipboardList, CheckCircle2, Clock, XCircle,
  ChevronRight, Package2, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface StockCountSession {
  id: number;
  name: string;
  status: "open" | "closed" | "approved";
  notes?: string | null;
  totalProducts: number;
  totalDiff: number;
  openedAt: string;
  closedAt?: string | null;
  approvedAt?: string | null;
}

const STATUS_CONFIG = {
  open:     { label: "Açık",     icon: Clock,         color: "text-amber-600",  bg: "bg-amber-500/10 border-amber-500/20" },
  closed:   { label: "Kapalı",   icon: XCircle,       color: "text-indigo-600",   bg: "bg-indigo-500/10 border-indigo-500/20" },
  approved: { label: "Onaylandı",icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-500/10 border-green-500/20" },
};

export default function StockCountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery<{ sessions: StockCountSession[] }>({
    queryKey: ["stock-count-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/stock-counts", { credentials: "include" });
      if (!res.ok) throw new Error("Oturumlar yüklenemedi");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; notes?: string }) => {
      const res = await fetch("/api/stock-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Oluşturulamadı");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-count-sessions"] });
      setShowForm(false);
      setName("");
      setNotes("");
      toast({ title: "Sayım oturumu açıldı" });
    },
    onError: (e: Error) => {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    },
  });

  const sessions = data?.sessions ?? [];
  const openSession = sessions.find(s => s.status === "open");

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Stok Sayım Merkezi</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Depo sayımı yapın, sistem ile karşılaştırın, farkları düzeltin</p>
        </div>
        {!openSession && (
          <Button className="gap-2 shrink-0" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4" /> Yeni Sayım
          </Button>
        )}
        {openSession && (
          <Link href={`/stock-counts/${openSession.id}`}>
            <Button className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700">
              <Clock className="h-4 w-4" /> Devam Et
            </Button>
          </Link>
        )}
      </div>

      {/* Yeni sayım formu */}
      {showForm && (
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm">Yeni Sayım Oturumu</p>
          <Input
            placeholder="Sayım adı — örn: Nisan 2026 Sayımı"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <Input
            placeholder="Not (opsiyonel)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => createMutation.mutate({ name: name.trim(), notes: notes.trim() || undefined })}
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Açılıyor..." : "Oturumu Aç"}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setName(""); setNotes(""); }}>
              İptal
            </Button>
          </div>
        </div>
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Yükleniyor...</div>
      ) : sessions.length === 0 ? (
        <div className="py-16 text-center space-y-3 border-2 border-dashed rounded-xl">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Henüz sayım yok</p>
          <Button onClick={() => setShowForm(true)} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" /> İlk Sayımı Başlat
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.open;
            return (
              <Link key={session.id} href={`/stock-counts/${session.id}`}>
                <div className="bg-card border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer flex items-center gap-4">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${cfg.bg} ${cfg.color}`}>
                    <cfg.icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{session.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(session.openedAt), "d MMM yyyy HH:mm", { locale: tr })}
                      {session.closedAt && ` — Kapatıldı: ${format(new Date(session.closedAt), "d MMM yyyy HH:mm", { locale: tr })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-sm">
                    <div className="text-center hidden sm:block">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Package2 className="h-3.5 w-3.5" />
                        <span className="font-semibold text-foreground">{session.totalProducts}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">ürün</p>
                    </div>
                    {session.totalDiff > 0 && (
                      <div className="text-center hidden sm:block">
                        <div className="flex items-center gap-1 text-amber-600">
                          <TrendingDown className="h-3.5 w-3.5" />
                          <span className="font-semibold">{session.totalDiff}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">fark</p>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
