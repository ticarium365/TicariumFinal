import { useEffect, useState, useMemo } from "react";
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
import { NAV_GROUPS } from "./nav-config";
import { useAuth } from "./auth-context";
import { LayoutDashboard, Sparkles, LogOut, Bell } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const logout = useLogout();
  const { toast } = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const role = (user?.role ?? "") as string;

  const filteredGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((it) => it.roles.includes(role)),
    })).filter((g) => g.items.length > 0);
  }, [role]);

  function go(href: string) {
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
      <CommandInput placeholder="Sayfa veya komut ara… (⌘K)" />
      <CommandList>
        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>

        <CommandGroup heading="Hızlı erişim">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard />
            <span>Ana Panel</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          {role !== "super_admin" && (
            <CommandItem onSelect={() => go("/eticarium-merkezi")}>
              <Sparkles />
              <span>e-Ticarium Merkezi</span>
            </CommandItem>
          )}
          {role !== "super_admin" && (
            <CommandItem onSelect={() => go("/bildirimler")}>
              <Bell />
              <span>Bildirimler</span>
            </CommandItem>
          )}
        </CommandGroup>

        {filteredGroups.map((group) => {
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
                      onSelect={() => go(item.href)}
                      value={`${group.label} ${item.label} ${item.href}`}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {/* GroupIcon kullanılmasa da type-safety korunur */}
              <span className="hidden">
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
      </CommandList>
    </CommandDialog>
  );
}
