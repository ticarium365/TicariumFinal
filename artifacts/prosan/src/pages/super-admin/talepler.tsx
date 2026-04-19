import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Inbox, Phone, Mail, Building2, CheckCircle2, Archive, Clock } from "lucide-react";

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error((await r.text()) || `${r.status}`);
  return r.json();
}

export default function ContactRequestsAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "new" | "contacted" | "archived">("new");
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function load() {
    try { setRows(await api("/contact/admin")); } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    }
  }
  useEffect(() => { load(); }, []);

  async function update(id: number, status: string) {
    try {
      await api(`/contact/admin/${id}`, { method: "PATCH", body: JSON.stringify({ status, notes: notes[id] }) });
      toast({ title: "Güncellendi" });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: String(e.message || e) });
    }
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const counts = { all: rows.length, new: rows.filter((r) => r.status === "new").length, contacted: rows.filter((r) => r.status === "contacted").length, archived: rows.filter((r) => r.status === "archived").length };

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Inbox className="h-6 w-6" /> İletişim Talepleri</h1>
        <p className="text-sm text-muted-foreground">Landing sayfasından gelen "Sizi arayalım" talepleri.</p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="new">Yeni ({counts.new})</TabsTrigger>
          <TabsTrigger value="contacted">İletişim Kuruldu ({counts.contacted})</TabsTrigger>
          <TabsTrigger value="archived">Arşiv ({counts.archived})</TabsTrigger>
          <TabsTrigger value="all">Tümü ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader><CardTitle>{filtered.length} kayıt</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="mx-auto h-12 w-12 opacity-30 mb-2" />
              Bu kategoride talep yok.
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tarih</TableHead><TableHead>Kişi</TableHead><TableHead>Şirket</TableHead>
                <TableHead>İletişim</TableHead><TableHead>Notlar</TableHead><TableHead>Durum</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(r.createdAt).toLocaleString("tr-TR")}</div>
                    </TableCell>
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    <TableCell>
                      {r.companyName ? <span className="flex items-center gap-1 text-sm"><Building2 className="h-3 w-3" />{r.companyName}</span> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-indigo-600 hover:underline"><Phone className="h-3 w-3" />{r.phone}</a>
                        <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-indigo-600 hover:underline"><Mail className="h-3 w-3" />{r.email}</a>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <Textarea
                        placeholder="Görüşme notları..."
                        defaultValue={r.notes || ""}
                        onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                        rows={2}
                        className="text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "new" ? "default" : r.status === "contacted" ? "secondary" : "outline"}>
                        {r.status === "new" ? "Yeni" : r.status === "contacted" ? "İletişim ✓" : "Arşiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1">
                      {r.status !== "contacted" && (
                        <Button size="sm" variant="outline" onClick={() => update(r.id, "contacted")}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />Aradım
                        </Button>
                      )}
                      {r.status !== "archived" && (
                        <Button size="sm" variant="ghost" onClick={() => update(r.id, "archived")}>
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
