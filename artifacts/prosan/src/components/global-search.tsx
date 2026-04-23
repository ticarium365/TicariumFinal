import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Search,
  LayoutDashboard,
  ShoppingCart,
  ScanLine,
  Package,
  PackagePlus,
  Users,
  Wallet,
  Banknote,
  TrendingUp,
  FileText,
  Store,
  Radio,
  Tag,
  Settings,
  BarChart3,
  ScanBarcode,
  History,
  Calculator,
  ClipboardList,
  Truck,
  Factory,
  Megaphone,
  PieChart,
  CreditCard,
  Bell,
  Sparkles,
  PlusCircle,
  Activity,
} from "lucide-react";
import { useAuth } from "./auth-context";

type SearchEntry = {
  href: string;
  label: string;
  group: "Sayfalar" | "Hızlı İşlem";
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  roles?: string[];
};

const ENTRIES: SearchEntry[] = [
  // Hızlı işlemler — en üstte görünür, action'lar
  { href: "/products?new=1", label: "Yeni ürün ekle", group: "Hızlı İşlem", icon: PlusCircle, keywords: "urun product yeni ekle" },
  { href: "/sales?new=1", label: "Satış yap", group: "Hızlı İşlem", icon: ShoppingCart, keywords: "satis sale yeni" },
  { href: "/customers?new=1", label: "Müşteri ekle", group: "Hızlı İşlem", icon: Users, keywords: "musteri customer yeni" },
  { href: "/finance?new=expense", label: "Gider gir", group: "Hızlı İşlem", icon: Wallet, keywords: "gider expense kasa" },
  { href: "/einvoice?new=1", label: "Fatura kes", group: "Hızlı İşlem", icon: FileText, keywords: "fatura invoice e-fatura" },
  { href: "/stock?new=1", label: "Stok girişi yap", group: "Hızlı İşlem", icon: PackagePlus, keywords: "stok stock giris" },

  // Sayfalar
  { href: "/dashboard", label: "Ana Panel", group: "Sayfalar", icon: LayoutDashboard, keywords: "dashboard ana sayfa" },
  { href: "/eticarium-merkezi", label: "Online Satış Merkezi", group: "Sayfalar", icon: Sparkles, keywords: "eticarium merkezi online satis" },
  { href: "/sales", label: "Satış Ekranı", group: "Sayfalar", icon: ShoppingCart, keywords: "satis sale" },
  { href: "/pos", label: "Hızlı Satış (POS)", group: "Sayfalar", icon: ScanLine, keywords: "pos hizli satis" },
  { href: "/sales/history", label: "Satış Geçmişi", group: "Sayfalar", icon: History, keywords: "gecmis history" },
  { href: "/customers", label: "Müşteriler", group: "Sayfalar", icon: Users, keywords: "musteri cari" },
  { href: "/products", label: "Ürünler", group: "Sayfalar", icon: Package, keywords: "urun product" },
  { href: "/barcode", label: "Barkod Tarama", group: "Sayfalar", icon: ScanBarcode, keywords: "barkod tara" },
  { href: "/barcodes", label: "Etiket Merkezi", group: "Sayfalar", icon: Tag, keywords: "etiket label barkod" },
  { href: "/stock", label: "Stok Girişi", group: "Sayfalar", icon: PackagePlus, keywords: "stok giris" },
  { href: "/stock-counts", label: "Stok Sayım", group: "Sayfalar", icon: ClipboardList, keywords: "sayim count" },
  { href: "/suppliers", label: "Tedarikçiler", group: "Sayfalar", icon: Truck, keywords: "tedarikci supplier" },
  { href: "/purchases", label: "Alış Faturaları", group: "Sayfalar", icon: ClipboardList, keywords: "alis purchase" },
  { href: "/finance", label: "Kasa / Finans", group: "Sayfalar", icon: Wallet, keywords: "kasa finans" },
  { href: "/banking", label: "Bankacılık", group: "Sayfalar", icon: Banknote, keywords: "banka banking" },
  { href: "/finance-dashboard", label: "Finans Paneli", group: "Sayfalar", icon: TrendingUp, keywords: "finans panel" },
  { href: "/profit", label: "Net Kâr Merkezi", group: "Sayfalar", icon: TrendingUp, keywords: "kar profit net" },
  { href: "/gercek-kar", label: "Gerçek Kâr", group: "Sayfalar", icon: TrendingUp, keywords: "gercek kar" },
  { href: "/butce", label: "Bütçe & Tahmin", group: "Sayfalar", icon: PieChart, keywords: "butce budget" },
  { href: "/muhasebeci", label: "Mali Müşavir", group: "Sayfalar", icon: Calculator, keywords: "muhasebeci mali musavir" },
  { href: "/einvoice", label: "e-Fatura", group: "Sayfalar", icon: FileText, keywords: "efatura e-fatura invoice" },
  { href: "/documents", label: "Evrak Yönetimi", group: "Sayfalar", icon: FileText, keywords: "evrak document" },
  { href: "/marketplace", label: "Pazaryeri", group: "Sayfalar", icon: Radio, keywords: "pazaryeri trendyol" },
  { href: "/channels", label: "Satış Kanalları", group: "Sayfalar", icon: Radio, keywords: "kanal channel" },
  { href: "/magaza", label: "Hazır Mağaza", group: "Sayfalar", icon: Store, keywords: "magaza store" },
  { href: "/fiyat-motoru", label: "Fiyat Motoru", group: "Sayfalar", icon: Tag, keywords: "fiyat price" },
  { href: "/karlilik-kanal", label: "Kanal Karlılığı", group: "Sayfalar", icon: TrendingUp, keywords: "karlilik" },
  { href: "/kargo", label: "Kargo Yönetimi", group: "Sayfalar", icon: Truck, keywords: "kargo cargo" },
  { href: "/reklam-butce", label: "Reklam Bütçesi", group: "Sayfalar", icon: Megaphone, keywords: "reklam ads" },
  { href: "/campaigns", label: "Kampanyalar", group: "Sayfalar", icon: Tag, keywords: "kampanya" },
  { href: "/sadakat", label: "Sadakat & Puan", group: "Sayfalar", icon: Sparkles, keywords: "sadakat loyalty" },
  { href: "/personnel", label: "Personel", group: "Sayfalar", icon: Users, keywords: "personel staff" },
  { href: "/uretim", label: "Üretim & Reçete", group: "Sayfalar", icon: Factory, keywords: "uretim production" },
  { href: "/users", label: "Kullanıcılar", group: "Sayfalar", icon: Users, keywords: "kullanici user", roles: ["admin"] },
  { href: "/settings", label: "Genel Ayarlar", group: "Sayfalar", icon: Settings, keywords: "ayar setting", roles: ["admin"] },
  { href: "/settings/subscription", label: "Abonelik", group: "Sayfalar", icon: CreditCard, keywords: "abonelik subscription", roles: ["admin"] },
  { href: "/settings/credit-topup", label: "Ek kontör", group: "Sayfalar", icon: CreditCard, keywords: "kontor kontör topup limit einvoice ocr api sms", roles: ["admin", "super_admin"] },
  { href: "/settings/notifications", label: "Bildirim Ayarları", group: "Sayfalar", icon: Bell, keywords: "bildirim notification", roles: ["admin"] },
  { href: "/reports", label: "Raporlar", group: "Sayfalar", icon: BarChart3, keywords: "rapor report" },
  { href: "/super-admin", label: "Platform merkezi", group: "Sayfalar", icon: Activity, keywords: "super admin kiraci platform", roles: ["super_admin"] },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = ENTRIES.filter((e) => !e.roles || (user && e.roles.includes(user.role)));
  const actions = visible.filter((e) => e.group === "Hızlı İşlem");
  const pages = visible.filter((e) => e.group === "Sayfalar");

  const go = (href: string) => {
    setOpen(false);
    setLocation(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative h-9 w-full justify-start rounded-md bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700 sm:w-64 md:w-72 lg:w-80"
        data-testid="button-global-search"
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">Ara — ürün, müşteri, sipariş…</span>
        <span className="inline sm:hidden">Ara…</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-1 rounded border bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Sayfa, hızlı işlem ara…" />
        <CommandList>
          <CommandEmpty>Sonuç yok.</CommandEmpty>
          {actions.length > 0 && (
            <CommandGroup heading="Hızlı İşlem">
              {actions.map((e) => (
                <CommandItem
                  key={e.href}
                  value={`${e.label} ${e.keywords ?? ""}`}
                  onSelect={() => go(e.href)}
                  data-testid={`search-action-${e.href}`}
                >
                  <e.icon className="mr-2 h-4 w-4" />
                  {e.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Sayfalar">
            {pages.map((e) => (
              <CommandItem
                key={e.href}
                value={`${e.label} ${e.keywords ?? ""}`}
                onSelect={() => go(e.href)}
                data-testid={`search-page-${e.href}`}
              >
                <e.icon className="mr-2 h-4 w-4" />
                {e.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="İpucu">
            <CommandItem disabled>
              <kbd className="mr-2 rounded border bg-slate-100 px-1.5 text-[10px]">⌘K</kbd>
              Her yerde aramayı aç
              <CommandShortcut>Esc kapatır</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
