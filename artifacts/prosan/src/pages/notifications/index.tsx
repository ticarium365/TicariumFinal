import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Package, AlertTriangle, ShoppingCart, Sparkles, Mail, Inbox, FileText, FileX, FileCheck2, TrendingDown, Wallet } from "lucide-react";
import { Link } from "wouter";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  entityType?: string | null;
  entityId?: number | null;
  createdAt: string;
}

const ICON_MAP: Record<string, { icon: any; color: string; label: string }> = {
  low_stock: { icon: AlertTriangle, color: "text-amber-500", label: "Stok Uyarısı" },
  stock_zero: { icon: Package, color: "text-rose-500", label: "Stok Bitti" },
  product_request: { icon: Mail, color: "text-blue-500", label: "Ürün Talebi" },
  ecommerce_order: { icon: ShoppingCart, color: "text-emerald-500", label: "E-Ticaret Satış" },
  system_announcement: { icon: Sparkles, color: "text-purple-500", label: "Yenilik / Duyuru" },
  daily_summary: { icon: Bell, color: "text-cyan-500", label: "Günlük Özet" },
  // Sprint B — Bütçe alarmları
  budget_alert_critical: { icon: TrendingDown, color: "text-rose-600", label: "Bütçe — Kritik" },
  budget_alert_warning: { icon: AlertTriangle, color: "text-amber-500", label: "Bütçe — Uyarı" },
  budget_alert_info: { icon: Wallet, color: "text-sky-500", label: "Bütçe — Bilgi" },
  // Sprint B — E-Fatura olayları
  einvoice_sent: { icon: FileCheck2, color: "text-emerald-500", label: "E-Fatura Gönderildi" },
  einvoice_failed: { icon: FileX, color: "text-rose-500", label: "E-Fatura Başarısız" },
  einvoice_cancelled: { icon: FileText, color: "text-slate-500", label: "E-Fatura İptal" },
  system: { icon: Bell, color: "text-muted-foreground", label: "Sistem" },
};

function relativeTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} gün önce`;
  return d.toLocaleDateString("tr-TR");
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading } = useQuery<{ notifications: Notification[]; total: number }>({
    queryKey: ["notifications-list", filter],
    queryFn: async () => {
      const url = filter === "unread"
        ? "/api/notifications?unread=true&limit=100"
        : "/api/notifications?limit=100";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("fetch error");
      return res.json();
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-list"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await fetch(`/api/notifications/read-all`, { method: "PUT", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-list"] }),
  });

  const items = data?.notifications ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text" style={{ fontFamily: "var(--font-display)" }}>
            Bildirimler
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total ?? 0} bildirim
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            Tümü
          </Button>
          <Button
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("unread")}
          >
            Okunmamış
          </Button>
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()}>
            <CheckCheck className="h-4 w-4 mr-1" />
            Tümünü Okundu İşaretle
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Tüm Bildirimler
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-12">Yükleniyor...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Inbox className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">Bildirim yok</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((n) => {
                const meta = ICON_MAP[n.type] ?? ICON_MAP.system!;
                const Icon = meta.icon;
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 py-3 px-2 hover:bg-muted/40 transition-colors cursor-pointer ${!n.isRead ? "bg-primary/5" : ""}`}
                    onClick={() => !n.isRead && markRead.mutate(n.id)}
                  >
                    <div className={`rounded-lg p-2 bg-muted/60 shrink-0`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{meta.label}</Badge>
                        {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        <span className="text-xs text-muted-foreground ml-auto">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      {n.entityType === "product" && n.entityId && (
                        <Link href={`/products/${n.entityId}`}>
                          <span className="text-xs text-primary hover:underline mt-1 inline-block">Ürünü Görüntüle →</span>
                        </Link>
                      )}
                      {n.entityType === "einvoice_outbox" && n.entityId && (
                        <Link href={`/einvoice?outbox=${n.entityId}`}>
                          <span className="text-xs text-primary hover:underline mt-1 inline-block">Outbox Kaydını Aç →</span>
                        </Link>
                      )}
                      {n.entityType === "budget" && (
                        <Link href={`/butce`}>
                          <span className="text-xs text-primary hover:underline mt-1 inline-block">Bütçeyi Aç →</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
