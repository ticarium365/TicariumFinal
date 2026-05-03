import { useState } from "react";
import { Link } from "wouter";
import {
  Bell, AlertTriangle, PackageX, Check, CheckCheck,
  Info, Package, ChevronRight, RefreshCw, Zap,
  TrendingDown, FileText, FileX, FileMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotificationsCount, useNotifications, useMarkRead, useMarkAllRead, useGenerateNotifications } from "@/hooks/use-notifications";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  stock_zero: {
    icon: PackageX,
    color: "text-[color:var(--color-semantic-danger)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-danger)_12%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-semantic-danger)_22%,transparent)]",
  },
  low_stock: {
    icon: AlertTriangle,
    color: "text-[color:var(--color-semantic-warning)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-warning)_14%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-semantic-warning)_20%,transparent)]",
  },
  daily_summary: {
    icon: CheckCheck,
    color: "text-[color:var(--color-brand-700)]",
    bg: "bg-[color-mix(in_srgb,var(--color-brand-500)_12%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-brand-900)_22%,transparent)]",
  },
  system: {
    icon: Info,
    color: "text-muted-foreground",
    bg: "bg-[color-mix(in_srgb,var(--color-neutral-500)_6%,transparent)] dark:bg-[color-mix(in_srgb,var(--color-neutral-900)_40%,transparent)]",
  },
  budget_alert_critical: {
    icon: TrendingDown,
    color: "text-[color:var(--color-semantic-danger)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-danger)_12%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-semantic-danger)_22%,transparent)]",
  },
  budget_alert_warning: {
    icon: TrendingDown,
    color: "text-[color:var(--color-semantic-warning)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-warning)_14%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-semantic-warning)_20%,transparent)]",
  },
  budget_alert_info: {
    icon: TrendingDown,
    color: "text-[color:var(--color-brand-700)]",
    bg: "bg-[color-mix(in_srgb,var(--color-brand-500)_12%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-brand-900)_22%,transparent)]",
  },
  einvoice_sent: {
    icon: FileText,
    color: "text-[color:var(--color-semantic-success)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-success)_12%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-semantic-success)_22%,transparent)]",
  },
  einvoice_failed: {
    icon: FileX,
    color: "text-[color:var(--color-semantic-danger)]",
    bg: "bg-[color-mix(in_srgb,var(--color-semantic-danger)_12%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-semantic-danger)_22%,transparent)]",
  },
  einvoice_cancelled: {
    icon: FileMinus,
    color: "text-[color:var(--color-neutral-500)]",
    bg: "bg-[color-mix(in_srgb,var(--color-neutral-500)_8%,var(--color-surface-card))] dark:bg-[color-mix(in_srgb,var(--color-neutral-900)_35%,transparent)]",
  },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} sa önce`;
  return `${Math.floor(hour / 24)} gün önce`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { data: countData } = useNotificationsCount();
  const { data, isLoading, refetch } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const generate = useGenerateNotifications();

  const unread = countData?.unread ?? 0;
  const notifications = data?.notifications ?? [];

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o) refetch();
  };

  const handleGenerate = async () => {
    await generate.mutateAsync();
    refetch();
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 relative hover:bg-card/10 ${unread > 0 ? "text-[color:var(--color-semantic-warning)] hover:opacity-90" : "text-muted-foreground/70 hover:text-[color:var(--color-nav-text-active)]"}`}
          title={unread > 0 ? `${unread} okunmamış bildirim` : "Bildirimler"}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[var(--color-semantic-danger)] text-[color:var(--color-nav-text-active)] text-[9px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent side="right" align="end" sideOffset={8} className="w-96 p-0 shadow-xl">
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Bildirimler</span>
            {unread > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{unread}</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Stok bildirimlerini güncelle"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generate.isPending ? "animate-spin" : ""}`} />
            </Button>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Tümünü Oku
              </Button>
            )}
          </div>
        </div>

        {/* Liste */}
        <div className="divide-y max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Yükleniyor...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Henüz bildirim yok</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={handleGenerate}
                disabled={generate.isPending}
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Stok Kontrolü Yap
              </Button>
            </div>
          ) : (
            notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system!;
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors ${!n.isRead ? "bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--color-brand-900)_12%,transparent)]" : ""}`}
                  onClick={() => !n.isRead && markRead.mutate(n.id)}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!n.isRead ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                      {!n.isRead && <div className="h-2 w-2 rounded-full bg-[var(--color-brand-500)] shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Alt — Low Stock Link */}
        {notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t bg-muted/20 rounded-b-md">
            <Link href="/products?lowStock=true" onClick={() => setOpen(false)}>
              <button className="w-full flex items-center justify-between text-xs text-primary hover:underline font-medium">
                <span className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Kritik stok ürünleri görüntüle
                </span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
