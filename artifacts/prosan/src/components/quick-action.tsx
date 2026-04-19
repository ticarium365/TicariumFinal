import { useLocation } from "wouter";
import { useState } from "react";
import {
  Plus,
  Package,
  ShoppingCart,
  Users,
  Wallet,
  FileText,
  PackagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "./auth-context";

type Action = {
  href: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  roles: string[];
};

const ACTIONS: Action[] = [
  { href: "/sales?new=1", label: "Satış Yap", desc: "POS / yeni satış", icon: ShoppingCart, color: "text-indigo-600 bg-indigo-50", roles: ["admin", "staff"] },
  { href: "/products/new", label: "Ürün Ekle", desc: "Yeni ürün kartı", icon: Package, color: "text-emerald-600 bg-emerald-50", roles: ["admin", "staff"] },
  { href: "/customers?new=1", label: "Müşteri Ekle", desc: "Yeni cari", icon: Users, color: "text-violet-600 bg-violet-50", roles: ["admin", "staff"] },
  { href: "/stock?new=1", label: "Stok Girişi", desc: "Stok hareketi", icon: PackagePlus, color: "text-amber-600 bg-amber-50", roles: ["admin", "staff"] },
  { href: "/finance?new=expense", label: "Gider Gir", desc: "Kasa çıkışı", icon: Wallet, color: "text-rose-600 bg-rose-50", roles: ["admin", "staff"] },
  { href: "/einvoice?new=1", label: "Fatura Kes", desc: "e-Fatura / e-Arşiv", icon: FileText, color: "text-indigo-600 bg-indigo-50", roles: ["admin", "staff"] },
];

export function QuickAction() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  if (!user) return null;
  const actions = ACTIONS.filter((a) => a.roles.includes(user.role));
  if (actions.length === 0) return null;

  const go = (href: string) => {
    setOpen(false);
    setLocation(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="h-9 gap-1.5 bg-indigo-600 px-3 text-white shadow-sm hover:bg-indigo-700"
          data-testid="button-quick-action"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Hızlı İşlem</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Hızlı İşlem
        </div>
        <div className="grid grid-cols-1 gap-0.5">
          {actions.map((a) => (
            <button
              key={a.href}
              type="button"
              onClick={() => go(a.href)}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-100"
              data-testid={`quick-action-${a.href}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.color}`}>
                <a.icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{a.label}</div>
                <div className="text-[11px] text-slate-500">{a.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
