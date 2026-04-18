import React from "react";
import "./_group.css";
import { 
  LayoutDashboard, 
  PackageSearch, 
  ShoppingCart, 
  Receipt, 
  Users, 
  MonitorSmartphone, 
  Landmark, 
  TrendingUp, 
  Award, 
  Coins, 
  Network, 
  FileBarChart,
  Settings,
  LogOut,
  Building2,
  ChevronDown
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const navGroups = [
  {
    title: "ANA MENÜ",
    items: [
      { name: "Panel", icon: LayoutDashboard, active: false },
      { name: "Stok", icon: PackageSearch, active: true },
      { name: "Satış", icon: ShoppingCart, active: false },
      { name: "Fatura", icon: Receipt, active: false },
      { name: "Cari", icon: Users, active: false },
    ]
  },
  {
    title: "FİNANS",
    items: [
      { name: "Kasa", icon: MonitorSmartphone, active: false },
      { name: "Banka", icon: Landmark, active: false },
      { name: "Kâr Analizi", icon: TrendingUp, active: false },
      { name: "Döviz", icon: Coins, active: false },
    ]
  },
  {
    title: "YÖNETİM",
    items: [
      { name: "Bayiler", icon: Network, active: false },
      { name: "Sadakat", icon: Award, active: false },
      { name: "Raporlar", icon: FileBarChart, active: false },
    ]
  }
];

export function Sidebar() {
  return (
    <div className="min-h-screen bg-gray-50/50 p-8 font-sans flex items-start">
      {/* Sidebar Container */}
      <aside className="w-[320px] h-[900px] bg-card border border-border/50 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        
        {/* Brand Lockup */}
        <div className="p-6 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shadow-md shadow-primary/20">
            <span className="font-display font-bold text-lg">T<span className="text-secondary">3</span></span>
          </div>
          <span className="font-display font-bold text-2xl text-primary tracking-tight">Ticarium<span className="text-secondary font-light">365</span></span>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-6 pb-6">
            {navGroups.map((group, i) => (
              <div key={i} className="space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider px-3 mb-2">
                  {group.title}
                </h4>
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                      item.active 
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/10" 
                        : "text-foreground/80 hover:bg-muted hover:text-primary"
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${item.active ? "text-secondary" : "text-muted-foreground group-hover:text-primary"}`} />
                    <span className="font-medium text-sm">{item.name}</span>
                    {item.active && (
                      <Badge variant="secondary" className="ml-auto bg-white/20 hover:bg-white/20 text-white border-none h-5 px-1.5 text-[10px]">
                        12 Yeni
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer Tenant & User */}
        <div className="p-4 bg-muted/30 border-t border-border/50">
          <div className="flex items-center p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer">
            <Avatar className="h-10 w-10 rounded-lg border border-border bg-white shadow-sm">
              <AvatarFallback className="bg-primary/5 text-primary font-bold rounded-lg">TY</AvatarFallback>
            </Avatar>
            <div className="ml-3 flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">Talha Yılmaz</p>
              <div className="flex items-center text-xs text-muted-foreground">
                <Building2 className="w-3 h-3 mr-1" />
                <span className="truncate">PROSAN ENDÜSTRİ</span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
          
          <div className="flex items-center justify-between px-2 pt-2 mt-2 border-t border-border/40">
            <button className="text-xs flex items-center text-muted-foreground hover:text-primary transition-colors">
              <Settings className="w-4 h-4 mr-1.5" />
              Ayarlar
            </button>
            <button className="text-xs flex items-center text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4 mr-1.5" />
              Çıkış
            </button>
          </div>
        </div>

      </aside>
    </div>
  );
}
