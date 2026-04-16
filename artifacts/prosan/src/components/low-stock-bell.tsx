import { Link } from "wouter";
import { Bell, AlertTriangle, PackageX, ChevronRight } from "lucide-react";
import { useLowStockAlerts } from "@/hooks/use-low-stock-alerts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function LowStockBell() {
  const { data } = useLowStockAlerts();

  const count = data?.count ?? 0;
  const products = data?.products ?? [];
  const preview = products.slice(0, 6);

  if (count === 0) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 relative" title="Kritik stok yok">
        <Bell className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-white/10 relative"
          title={`${count} ürün kritik stokta`}
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {count > 9 ? "9+" : count}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 p-0 shadow-xl"
      >
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/30 rounded-t-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Kritik Stok Uyarısı
            </span>
          </div>
          <Badge variant="destructive" className="text-xs">
            {count} ürün
          </Badge>
        </div>

        {/* Liste */}
        <div className="divide-y max-h-72 overflow-y-auto">
          {preview.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`}>
              <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    p.stock === 0
                      ? "bg-red-100 dark:bg-red-950/40 text-red-600"
                      : "bg-amber-100 dark:bg-amber-950/40 text-amber-600"
                  }`}
                >
                  {p.stock === 0 ? (
                    <PackageX className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.productCode}</p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      p.stock === 0 ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    {p.stock}
                  </p>
                  <p className="text-[10px] text-muted-foreground">/ min {p.minStock}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Alt link */}
        <div className="px-4 py-2.5 border-t bg-muted/30 rounded-b-md">
          <Link href="/products?lowStock=true">
            <button className="w-full flex items-center justify-between text-xs text-primary hover:underline font-medium">
              <span>Tüm kritik ürünleri görüntüle</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
