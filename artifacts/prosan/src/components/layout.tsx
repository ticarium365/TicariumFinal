import { Outlet, Link, useLocation } from "wouter";
import { useAuth } from "./auth-context";
import { useLogout } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  Package, 
  ScanBarcode, 
  ShoppingCart, 
  History, 
  BarChart3, 
  Users, 
  Settings, 
  LogOut, 
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const logout = useLogout();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      window.location.href = "/login";
    } catch (error) {
      toast({
        title: "Hata",
        description: "Çıkış yapılamadı.",
        variant: "destructive"
      });
    }
  };

  const navItems = [
    { href: "/dashboard", label: "Ana Panel", icon: LayoutDashboard, roles: ["admin", "staff", "viewer"] },
    { href: "/products", label: "Ürünler", icon: Package, roles: ["admin", "staff", "viewer"] },
    { href: "/barcode", label: "Barkod Tarama", icon: ScanBarcode, roles: ["admin", "staff"] },
    { href: "/sales", label: "Satış Ekranı", icon: ShoppingCart, roles: ["admin", "staff"] },
    { href: "/sales/history", label: "Satış Geçmişi", icon: History, roles: ["admin", "staff", "viewer"] },
    { href: "/reports", label: "Raporlar", icon: BarChart3, roles: ["admin", "viewer"] },
    { href: "/users", label: "Kullanıcılar", icon: Users, roles: ["admin"] },
    { href: "/settings", label: "Ayarlar", icon: Settings, roles: ["admin"] },
  ];

  const filteredNav = navItems.filter(item => user && item.roles.includes(user.role));

  const NavLinks = () => (
    <div className="flex flex-col gap-1">
      {filteredNav.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="p-4 border-b text-left">
                <SheetTitle className="text-xl font-bold tracking-tight">PROSAN</SheetTitle>
                <p className="text-xs text-muted-foreground">Endüstriyel Yönetim</p>
              </SheetHeader>
              <div className="p-4 flex-1 overflow-y-auto">
                <NavLinks />
              </div>
              <div className="p-4 border-t mt-auto">
                <div className="mb-4">
                  <p className="text-sm font-medium">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                </div>
                <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Çıkış Yap
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-bold text-lg tracking-tight">PROSAN</span>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card h-screen sticky top-0">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold tracking-tight text-primary">PROSAN</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">Endüstriyel Yönetim</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <NavLinks />
        </div>

        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold truncate max-w-[140px]">{user.fullName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{user.role}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Çıkış Yap" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}