import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_GROUPS, navItemId } from "./nav-config";
import { useAuth } from "./auth-context";
import {
  LayoutDashboard,
  LogOut,
  Bell,
  ShoppingCart,
  Package,
  UserCircle,
  PackagePlus,
  Wallet,
  FileText,
  ScanLine,
  History,
  Keyboard,
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { filterVisibleNavGroups, type AccountType } from "@/lib/nav-lock";
import { useMenuPrefs } from "@/components/use-menu-prefs";
import { readRecentPages, touchRecentPage, type RecentPageEntry } from "@/lib/command-palette-recent";

/** Klavye kısayolları + Komut paleti — Türkçe etiketler layout menüsüyle uyumludur. */
const QUICK_ACTIONS: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}[] = [
  { href: "/sales?new=1", label: "Yeni Satış", icon: ShoppingCart, roles: ["admin", "staff"] },
  { href: "/products/new", label: "Yeni Ürün", icon: Package, roles: ["admin", "staff"] },
  { href: "/customers?new=1", label: "Yeni Müşteri", icon: UserCircle, roles: ["admin", "staff", "viewer"] },
  { href: "/stock?new=1", label: "Stok Girişi", icon: PackagePlus, roles: ["admin", "staff"] },
  { href: "/finance?new=expense", label: "Gider Gir", icon: Wallet, roles: ["admin", "staff"] },
  { href: "/b2b/quotes/new", label: "Yeni Teklif", icon: FileText, roles: ["admin", "staff"] },
  { href: "/pos", label: "POS / Hızlı Satış", icon: ScanLine, roles: ["admin", "staff"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentPageEntry[]>(() =>
    typeof window !== "undefined" ? readRecentPages() : [],
  );
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const logout = useLogout();
  const { toast } = useToast();
  const { isHidden: isItemHidden } = useMenuPrefs();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setRecent(readRecentPages());
  }, [open]);

  const role = (user?.role ?? "") as string;
  const accountType = ((user as { accountType?: AccountType } | null)?.accountType ?? "seller") as AccountType;

  const visibleGroups = useMemo(() => {
    if (!user) return [];
    return filterVisibleNavGroups(NAV_GROUPS, {
      role: user.role,
      accountType,
      isItemHidden,
      navItemId,
    });
  }, [user, isItemHidden, accountType]);

  const quickFiltered = useMemo(() => QUICK_ACTIONS.filter((a) => a.roles.includes(role)), [role]);

  function go(href: string, label: string) {
    touchRecentPage(href, label);
    setOpen(false);
    setLocation(href);
  }

  async function handleLogout() {
    setOpen(false);
    try {
      await logout.mutateAsync();
      toast({ title: "Çıkış yapıldı" });
      setLocation("/login");
    } catch {
      toast({ title: "Çıkış başarısız", variant: "destructive" });
    }
  }

  if (!user) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Sayfa veya komut ara… (⌘K / Ctrl+K)" />
      <CommandList>
        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>

        {quickFiltered.length > 0 && (
          <CommandGroup heading="Hızlı işlemler">
            {quickFiltered.map((a) => {
              const Icon = a.icon;
              return (
                <CommandItem
                  key={a.href}
                  value={`${a.label} ${a.href} hızlı`}
                  onSelect={() => go(a.href, a.label)}
                >
                  <Icon />
                  <span>{a.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {recent.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Son sayfalar">
              {recent.map((r) => (
                <CommandItem
                  key={`${r.href}-${r.at}`}
                  value={`${r.label} ${r.href} son`}
                  onSelect={() => go(r.href, r.label)}
                >
                  <History />
                  <span>{r.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Kısayol">
          <CommandItem onSelect={() => go("/dashboard", "Ana Panel")} value="Ana Panel /dashboard">
            <LayoutDashboard />
            <span>Ana Panel</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          {role !== "super_admin" && (
            <CommandItem onSelect={() => go("/bildirimler", "Bildirimler")} value="Bildirimler">
              <Bell />
              <span>Bildirimler</span>
            </CommandItem>
          )}
        </CommandGroup>

        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.id}>
              <CommandSeparator />
              <CommandGroup heading={group.label}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={`${group.id}-${item.href}`}
                      onSelect={() => go(item.href, item.label)}
                      value={`${group.label} ${item.label} ${item.href}`}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <span className="hidden" aria-hidden>
                <GroupIcon />
              </span>
            </div>
          );
        })}

        <CommandSeparator />
        <CommandGroup heading="Hesap">
          <CommandItem onSelect={handleLogout}>
            <LogOut />
            <span>Çıkış Yap</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="İpucu">
          <CommandItem disabled>
            <Keyboard />
            <span>Komut paleti: ⌘K veya Ctrl+K — menüdeki tüm Türkçe sayfa adları aranır</span>
            <CommandShortcut>Ctrl K</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
